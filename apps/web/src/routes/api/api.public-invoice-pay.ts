import { withApi, apiError, json, readFormData, readJsonBody } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { formatRupiah, todayIso } from '@/lib/accounting';
import { verifyInvoicePayToken } from '@/lib/invoice-pay-link.server';
import { applyInvoicePaymentServer } from '@/lib/apply-parent-payment.server';
import { verifyManualPaymentProof } from '@/lib/proof-verification.server';
import {
	computeLatePenaltyServer,
	getLatePenaltySettingsServer,
} from '@/lib/late-penalty-settings.server';
import logger from '@/lib/logger.server';

const MAX_PROOF_SIZE = 5 * 1024 * 1024;
const MAX_ATTEMPTS = 60;

type InvoiceRecord = {
	id: string;
	company: string;
	contact: string;
	partner: string;
	total: number;
	paid_amount: number;
	number: string;
	date: string;
	payment_terms?: string;
	status: string;
	stage: string;
	direction: string;
};

async function loadOpenInvoice(token: string) {
	const invoiceId = verifyInvoicePayToken(token);
	if (!invoiceId) throw apiError(404, 'Tautan pembayaran tidak valid.');
	const invoice = await pocketbaseAdmin
		.getRecord<InvoiceRecord>('documents', invoiceId)
		.catch(() => null);
	if (!invoice || invoice.stage !== 'invoice' || invoice.direction !== 'penjualan') {
		throw apiError(404, 'Invoice tidak ditemukan.');
	}
	if (invoice.status === 'cancelled') throw apiError(422, 'Invoice telah dibatalkan.');
	return invoice;
}

async function remainingOf(invoice: InvoiceRecord, paymentDate: string) {
	const total = Number(invoice.total) || 0;
	const directPaid = Number(invoice.paid_amount) || 0;
	const linked = await pocketbaseAdmin.listRecords<{ paid_amount: number; total: number }>(
		'documents',
		{
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('source_document = {:invoiceId} && stage = "pembayaran" && status != "cancelled"', { invoiceId: invoice.id }),
		},
	);
	const linkedPaid = linked.items.reduce(
		(sum, payment) => sum + (Number(payment.paid_amount) || Number(payment.total) || 0),
		0,
	);
	const alreadyPaid = Math.max(directPaid, linkedPaid);
	const settings = await getLatePenaltySettingsServer(invoice.company);
	const penalty =
		alreadyPaid < total
			? computeLatePenaltyServer(
					settings,
					{
						total,
						payment_terms: invoice.payment_terms,
						date: invoice.date,
						paid_amount: alreadyPaid,
					},
					paymentDate || todayIso(),
				)
			: 0;
	return {
		remaining: Math.max(0, total + penalty - alreadyPaid),
		penalty,
		alreadyPaid,
		total,
	};
}

async function uniqueExpected(baseAmount: number) {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		const candidate = baseAmount + Math.floor(Math.random() * 999) + 1;
		const [parentExisting, companyExisting] = await Promise.all([
			pocketbaseAdmin.listRecords('parent_invoice_payments', {
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter("expected_amount = {:candidate} && (status = 'menunggu_verifikasi' || status = 'aktif')", { candidate }),
			}),
			pocketbaseAdmin.listRecords('invoice_payments', {
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter("expected_amount = {:candidate} && (status = 'menunggu_verifikasi' || status = 'aktif')", { candidate }),
			}),
		]);
		if (parentExisting.items.length === 0 && companyExisting.items.length === 0) return candidate;
	}
	throw apiError(409, 'Tidak dapat menyiapkan nominal unik. Coba lagi sebentar.');
}

/**
 * POST /api/public-invoice-pay — pembayaran manual dari tautan email.
 * Tidak menandai lunas kecuali bukti lolos verifikasi otomatis yang sudah ada.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') throw apiError(405, 'Metode tidak didukung.');

	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		const body = await readJsonBody<{ token?: string; baseAmount?: number }>(request);
		const invoice = await loadOpenInvoice((body.token ?? '').trim());
		const baseAmount = Math.round(Number(body.baseAmount) || 0);
		if (baseAmount <= 0) throw apiError(422, 'Nominal dasar pembayaran tidak valid.');
		const expected = await uniqueExpected(baseAmount);
		return json({
			expected_amount: expected,
			expected_amount_formatted: formatRupiah(expected),
			invoiceId: invoice.id,
		});
	}

	const form = await readFormData(request);
	const token = (form.get('token') as string | null)?.trim() ?? '';
	const invoice = await loadOpenInvoice(token);
	const amount = Math.round(Number(form.get('amount')) || 0);
	const expectedAmount = Math.round(Number(form.get('expectedAmount')) || 0);
	const bank = (form.get('bank') as string | null)?.trim() ?? '';
	const paymentDate = (form.get('paymentDate') as string | null)?.trim() || todayIso();
	const payerName = (form.get('payerName') as string | null)?.trim() ?? '';
	const notes = (form.get('notes') as string | null)?.trim() ?? '';
	const proof = form.get('proof');

	if (amount <= 0) throw apiError(422, 'Nominal pembayaran harus lebih dari 0.');
	if (expectedAmount <= 0) throw apiError(422, 'Nominal unik transfer belum siap. Muat ulang halaman.');
	if (!bank) throw apiError(422, 'Bank tujuan transfer wajib diisi.');
	if (!proof || !(proof instanceof File) || proof.size === 0) {
		throw apiError(422, 'Bukti pembayaran wajib diunggah.');
	}
	if (proof.size > MAX_PROOF_SIZE) throw apiError(422, 'Berkas bukti terlalu besar (maksimal 5 MB).');

	const balance = await remainingOf(invoice, paymentDate);
	if (balance.remaining <= 0) throw apiError(422, 'Invoice ini sudah lunas.');
	if (amount > balance.remaining + 1) {
		throw apiError(422, `Nominal melebihi sisa tagihan (${formatRupiah(balance.remaining)}).`);
	}

	const pending = await pocketbaseAdmin.listRecords('invoice_payments', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('invoice = {:invoiceId} && status = "menunggu_verifikasi"', { invoiceId: invoice.id }),
	});
	if (pending.totalItems > 0) {
		throw apiError(422, 'Masih ada pembayaran menunggu verifikasi untuk invoice ini.');
	}

	const pbForm = new FormData();
	pbForm.append('company', invoice.company);
	pbForm.append('invoice', invoice.id);
	if (invoice.contact) pbForm.append('contact', invoice.contact);
	pbForm.append('amount', String(amount));
	pbForm.append('expected_amount', String(expectedAmount));
	pbForm.append('expected_amount_formatted', formatRupiah(expectedAmount));
	pbForm.append('payment_method', 'transfer_bank');
	pbForm.append('bank', bank);
	pbForm.append('payer_name', payerName);
	pbForm.append('payment_date', paymentDate);
	pbForm.append('notes', notes || 'Diajukan dari tautan pembayaran email.');
	pbForm.append('status', 'menunggu_verifikasi');
	pbForm.append('auto_verified', 'false');
	pbForm.append('proof', proof, proof.name);

	const record = await pocketbaseAdmin.createRecord<{ id: string; proof: string }>(
		'invoice_payments',
		pbForm,
	);

	let verified = false;
	let reason = '';
	try {
		const outcome = await verifyManualPaymentProof(
			{ id: record.id, proof: record.proof, expected_amount: expectedAmount, bank },
			'invoice_payments',
		);
		reason = outcome.reason;
		if (outcome.verified) {
			await applyInvoicePaymentServer({
				invoiceId: invoice.id,
				amount,
				paymentDate,
				payerName,
				bank,
				label: 'pelanggan',
			});
			await pocketbaseAdmin.updateRecord('invoice_payments', record.id, {
				status: 'aktif',
				auto_verified: true,
				verification_notes: reason,
				verified_at: new Date().toISOString(),
			});
			verified = true;
		} else {
			await pocketbaseAdmin.updateRecord('invoice_payments', record.id, {
				auto_verified: false,
				verification_notes: reason,
			});
		}
	} catch (error) {
		logger.error({ error, paymentId: record.id }, 'public invoice payment auto-verify failed');
	}

	return json({ ok: true, verified, reason });
});
