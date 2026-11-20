import { withApi, apiError, readFormData, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { requireParentId } from '@/lib/parent-auth.server';
import { todayIso, formatRupiah } from '@/lib/accounting';
import {
	getLatePenaltySettingsServer,
	computeLatePenaltyServer,
} from '@/lib/late-penalty-settings.server';
import { verifyManualPaymentProof } from '@/lib/proof-verification.server';
import { applyParentInvoicePayment } from '@/lib/apply-parent-payment.server';
import logger from '@/lib/logger.server';

const MAX_PROOF_SIZE = 5 * 1024 * 1024;

type InvoiceRecord = {
	id: string;
	company: string;
	student: string;
	total: number;
	paid_amount: number;
	number: string;
	date: string;
	payment_terms?: string;
	status: string;
	stage: string;
	direction: string;
	expand?: { student?: { parent?: string } };
};

/**
 * POST /api/parent/pay-invoice — Parent mengunggah bukti transfer bank untuk
 * sebuah invoice. Server memverifikasi bahwa invoice benar-benar milik siswa
 * yang terhubung dengan parent ini, lalu membuat catatan
 * `parent_invoice_payments` berstatus `menunggu_verifikasi`. Pembayaran TIDAK
 * diaktifkan otomatis; Admin Pusat memverifikasi melalui route terpisah.
 *
 * Berupa action (POST) + multipart agar bukti file dapat diunggah dan respons
 * per-parent tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	const parentId = await requireParentId(request);
	const form = await readFormData(request);

	const invoiceId = (form.get('invoiceId') as string | null)?.trim() ?? '';
	const amountRaw = (form.get('amount') as string | null)?.trim() ?? '';
	const expectedAmountRaw = (form.get('expectedAmount') as string | null)?.trim() ?? '';
	const bank = (form.get('bank') as string | null)?.trim() ?? '';
	const paymentDate = (form.get('paymentDate') as string | null)?.trim() ?? '';
	const payerName = (form.get('payerName') as string | null)?.trim() ?? '';
	const notes = (form.get('notes') as string | null)?.trim() ?? '';
	const proof = form.get('proof');

	if (!invoiceId) throw apiError(422, 'ID invoice wajib diisi.');
	const amount = Math.round(Number(amountRaw) || 0);
	if (amount <= 0) throw apiError(422, 'Nominal pembayaran harus lebih dari 0.');
	const expectedAmount = Math.round(Number(expectedAmountRaw) || 0);
	if (expectedAmount <= 0) {
		throw apiError(422, 'Nominal unik transfer belum siap. Muat ulang halaman lalu coba lagi.');
	}
	if (!bank) throw apiError(422, 'Bank tujuan transfer wajib dipilih.');
	if (!paymentDate) throw apiError(422, 'Tanggal pembayaran wajib diisi.');
	if (!proof || !(proof instanceof File) || proof.size === 0) {
		throw apiError(422, 'Bukti pembayaran wajib diunggah.');
	}
	if (proof.size > MAX_PROOF_SIZE) {
		throw apiError(422, 'Berkas bukti terlalu besar (maksimal 5 MB).');
	}

	const invoice = await pocketbaseAdmin
		.getRecord<InvoiceRecord>('documents', invoiceId, { expand: 'student' })
		.catch(() => null);

	if (!invoice) throw apiError(404, 'Invoice tidak ditemukan.');
	if (invoice.stage !== 'invoice' || invoice.direction !== 'penjualan') {
		throw apiError(422, 'Dokumen ini bukan invoice penjualan.');
	}
	if (invoice.status === 'cancelled') {
		throw apiError(422, 'Invoice telah dibatalkan.');
	}

	// Verifikasi relasi: siswa pada invoice harus terhubung dengan parent ini.
	const studentParent = invoice.expand?.student?.parent;
	if (!invoice.student || studentParent !== parentId) {
		throw apiError(403, 'Anda tidak memiliki akses ke invoice ini.');
	}

	// Hitung sisa tagihan berdasarkan paid_amount + pembayaran terkait.
	const total = Number(invoice.total) || 0;
	const directPaid = Number(invoice.paid_amount) || 0;
	const linked = await pocketbaseAdmin.listRecords<{ paid_amount: number; total: number }>(
		'documents',
		{
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('source_document = {:invoiceId} && stage = "pembayaran" && status != "cancelled"', { invoiceId }),
		},
	);
	const linkedPaid = linked.items.reduce(
		(sum, p) => sum + (Number(p.paid_amount) || Number(p.total) || 0),
		0,
	);
	const alreadyPaid = Math.max(directPaid, linkedPaid);
	const penaltySettings = await getLatePenaltySettingsServer(invoice.company);
	const penalty =
		alreadyPaid < total
			? computeLatePenaltyServer(
					penaltySettings,
					{
						total,
						payment_terms: invoice.payment_terms,
						date: invoice.date,
						paid_amount: alreadyPaid,
					},
					paymentDate || todayIso(),
				)
			: 0;
	const settlementTotal = total + penalty;
	const remaining = Math.max(0, settlementTotal - alreadyPaid);

	if (amount > remaining + 1) {
		throw apiError(422, `Nominal melebihi sisa tagihan (Rp${remaining.toLocaleString('id-ID')}).`);
	}

	// Tolak jika masih ada pembayaran menunggu verifikasi untuk invoice yang sama,
	// agar tidak menumpuk duplikat sebelum admin memproses.
	const pending = await pocketbaseAdmin.listRecords('parent_invoice_payments', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('invoice = {:invoiceId} && status = "menunggu_verifikasi"', { invoiceId }),
	});
	if (pending.totalItems > 0) {
		throw apiError(
			422,
			'Masih ada pembayaran menunggu verifikasi untuk invoice ini. Tunggu hingga diverifikasi admin.',
		);
	}

	// Bangun FormData baru untuk PocketBase (file + field).
	const pbForm = new FormData();
	pbForm.append('parent', parentId);
	pbForm.append('student', invoice.student);
	pbForm.append('invoice', invoice.id);
	pbForm.append('company', invoice.company);
	pbForm.append('amount', String(amount));
	pbForm.append('expected_amount', String(expectedAmount));
	pbForm.append('expected_amount_formatted', formatRupiah(expectedAmount));
	pbForm.append('payment_method', 'transfer_bank');
	pbForm.append('bank', bank);
	pbForm.append('payer_name', payerName);
	pbForm.append('payment_date', paymentDate || todayIso());
	pbForm.append('notes', notes);
	pbForm.append('status', 'menunggu_verifikasi');
	pbForm.append('auto_verified', 'false');
	pbForm.append('proof', proof, proof.name);

	const record = await pocketbaseAdmin.createRecord<{ id: string; proof: string }>(
		'parent_invoice_payments',
		pbForm,
	);

	logger.info(
		{ paymentId: record.id, invoiceId, parentId, amount, expectedAmount },
		'parent invoice payment submitted (pending verification)',
	);

	// Verifikasi otomatis bukti transfer (pola sama dengan pembelian paket):
	// jika jumlah dan bank pada bukti cocok dengan nominal unik dan bank tujuan,
	// pembayaran diterapkan ke invoice secara otomatis. Jika tidak cocok atau
	// keyakinan kurang, pembayaran tetap menunggu verifikasi manual Admin Pusat.
	let verified = false;
	let verifyReason = '';
	try {
		const outcome = await verifyManualPaymentProof(
			{
				id: record.id,
				proof: record.proof,
				expected_amount: expectedAmount,
				bank,
			},
			'parent_invoice_payments',
		);
		verifyReason = outcome.reason;
		if (outcome.verified) {
			await applyParentInvoicePayment({
				id: record.id,
				parent: parentId,
				student: invoice.student,
				invoice: invoice.id,
				company: invoice.company,
				amount,
				bank,
				payer_name: payerName,
				payment_date: paymentDate || todayIso(),
			});
			await pocketbaseAdmin.updateRecord('parent_invoice_payments', record.id, {
				status: 'aktif',
				auto_verified: true,
				verification_notes: verifyReason,
				verified_at: new Date().toISOString(),
			});
			verified = true;
			logger.info(
				{ paymentId: record.id, invoiceId },
				'parent invoice payment auto-verified and applied',
			);
		} else {
			await pocketbaseAdmin.updateRecord('parent_invoice_payments', record.id, {
				auto_verified: false,
				verification_notes: verifyReason,
			});
		}
	} catch (error) {
		logger.error(
			{ error, paymentId: record.id },
			'parent invoice payment auto-verification failed',
		);
	}

	return json({ ok: true, paymentId: record.id, verified, reason: verifyReason });
});
