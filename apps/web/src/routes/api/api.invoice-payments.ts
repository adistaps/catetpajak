import { withApi, apiError, json, readJsonBody, readFormData } from '@/lib/api.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { applyInvoicePaymentServer } from '@/lib/apply-parent-payment.server';
import { verifyManualPaymentProof } from '@/lib/proof-verification.server';
import { todayIso, formatRupiah } from '@/lib/accounting';
import {
	getLatePenaltySettingsServer,
	computeLatePenaltyServer,
} from '@/lib/late-penalty-settings.server';
import logger from '@/lib/logger.server';

const MAX_PROOF_SIZE = 5 * 1024 * 1024;

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
	owner: string;
};

type InvoicePaymentRecord = {
	id: string;
	company: string;
	invoice: string;
	contact: string;
	amount: number;
	expected_amount?: number;
	expected_amount_formatted?: string;
	auto_verified?: boolean;
	payment_method: string;
	bank: string;
	proof: string;
	payer_name: string;
	payment_date: string;
	notes: string;
	status: string;
	submitted_by: string;
	verifier: string;
	verified_at: string;
	rejection_reason: string;
	verification_notes: string;
	created: string;
	updated: string;
	expand?: {
		invoice?: { id: string; number: string; total: number; paid_amount: number; partner: string };
		contact?: { id: string; name: string };
		submitted_by?: { id: string; name: string; email: string };
		verifier?: { id: string; name: string; email: string };
	};
};

const PUBLIC_PB_PREFIX = '/hcgi/platform';

function proofUrl(record: InvoicePaymentRecord, token: string): string {
	if (!record.proof) return '';
	return `${PUBLIC_PB_PREFIX}/api/files/invoice_payments/${record.id}/${record.proof}?token=${encodeURIComponent(token)}`;
}

function toListItem(record: InvoicePaymentRecord, token: string) {
	const invoice = record.expand?.invoice;
	const contact = record.expand?.contact;
	return {
		id: record.id,
		company: record.company,
		invoice: {
			id: invoice?.id ?? record.invoice,
			number: invoice?.number ?? '',
			total: Number(invoice?.total ?? 0),
			paid_amount: Number(invoice?.paid_amount ?? 0),
			partner: invoice?.partner ?? '',
		},
		contact: contact
			? { id: contact.id, name: contact.name }
			: { id: record.contact ?? '', name: '' },
		amount: Number(record.amount) || 0,
		expected_amount: Number(record.expected_amount) || 0,
		expected_amount_formatted: record.expected_amount_formatted ?? '',
		auto_verified: Boolean(record.auto_verified),
		verification_notes: record.verification_notes ?? '',
		payment_method: record.payment_method,
		bank: record.bank,
		proof_url: proofUrl(record, token),
		payer_name: record.payer_name,
		payment_date: record.payment_date,
		notes: record.notes,
		status: record.status,
		submitted_by: record.expand?.submitted_by
			? {
					id: record.expand.submitted_by.id,
					name: record.expand.submitted_by.name ?? '',
					email: record.expand.submitted_by.email ?? '',
				}
			: { id: record.submitted_by, name: '', email: '' },
		verifier: record.expand?.verifier
			? {
					id: record.expand.verifier.id,
					name: record.expand.verifier.name ?? '',
					email: record.expand.verifier.email ?? '',
				}
			: null,
		verified_at: record.verified_at,
		rejection_reason: record.rejection_reason,
		created: record.created,
	};
}

/**
 * Memverifikasi bahwa user adalah anggota aktif company (atau pemilik) dan
 * mengembalikan keanggotaannya. Untuk approve/reject, juga memeriksa izin
 * penjualan/kas_bank. Lempar respons 403 bila tidak berwenang.
 */
async function requireCompanyAccess(
	userId: string,
	companyId: string,
	requireApprovePermission: boolean,
) {
	const company = await pocketbaseAdmin
		.getRecord<{ id: string; owner: string }>('companies', companyId)
		.catch(() => null);
	if (!company) throw apiError(404, 'Perusahaan tidak ditemukan.');

	if (company.owner === userId) {
		return { isOwner: true, role: 'pemilik' as const };
	}

	const members = await pocketbaseAdmin.listRecords<{
		id: string;
		user: string;
		role: string;
		permissions: string[];
		status: string;
	}>('company_members', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('company = {:companyId} && user = {:userId} && status = "active"', { companyId, userId }),
	});
	const member = members.items[0];
	if (!member) {
		throw apiError(403, 'Anda tidak memiliki akses ke perusahaan ini.');
	}

	if (requireApprovePermission) {
		const role = member.role;
		const perms = Array.isArray(member.permissions) ? member.permissions : [];
		const allowedRoles = ['pemilik', 'admin', 'akuntan', 'finance'];
		const hasPerm = perms.includes('penjualan') || perms.includes('kas_bank');
		if (!allowedRoles.includes(role) && !hasPerm) {
			throw apiError(
				403,
				'Anda tidak berwenang menyetujui pembayaran. Hubungi admin perusahaan.',
			);
		}
	}

	return { isOwner: false, role: member.role };
}

/**
 * POST /api/invoice-payments — company user mencatat pembayaran manual transfer
 * bank atas nama customer untuk sebuah invoice. Server memverifikasi invoice
 * milik company user, memeriksa sisa tagihan, dan membuat catatan
 * `invoice_payments` berstatus `menunggu_verifikasi`. Pembayaran TIDAK langsung
 * lunas; pengguna berwenang menyetujui/menolak via PATCH.
 *
 * PATCH /api/invoice-payments — menyetujui (menerapkan ke invoice: dokumen
 * pembayaran + transaksi + jurnal + paid_amount) atau menolak (dengan alasan).
 *
 * Keduanya action (non-GET) agar respons per-user tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	const userId = await requireUserId(request);

	if (request.method === 'POST') {
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
			.getRecord<InvoiceRecord>('documents', invoiceId)
			.catch(() => null);
		if (!invoice) throw apiError(404, 'Invoice tidak ditemukan.');
		if (invoice.stage !== 'invoice' || invoice.direction !== 'penjualan') {
			throw apiError(422, 'Dokumen ini bukan invoice penjualan.');
		}
		if (invoice.status === 'cancelled') {
			throw apiError(422, 'Invoice telah dibatalkan.');
		}

		await requireCompanyAccess(userId, invoice.company, false);

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
			throw apiError(
				422,
				`Nominal melebihi sisa tagihan (Rp${remaining.toLocaleString('id-ID')}).`,
			);
		}

		const pending = await pocketbaseAdmin.listRecords('invoice_payments', {
			page: 1,
			perPage: 1,
			filter: pocketbaseAdmin.filter('invoice = {:invoiceId} && status = "menunggu_verifikasi"', { invoiceId }),
		});
		if (pending.totalItems > 0) {
			throw apiError(
				422,
				'Masih ada pembayaran menunggu verifikasi untuk invoice ini. Tunggu hingga diproses.',
			);
		}

		const pbForm = new FormData();
		pbForm.append('company', invoice.company);
		pbForm.append('invoice', invoice.id);
		pbForm.append('contact', invoice.contact || '');
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
		pbForm.append('submitted_by', userId);
		pbForm.append('proof', proof, proof.name);

		const record = await pocketbaseAdmin.createRecord<{ id: string; proof: string }>(
			'invoice_payments',
			pbForm,
		);

		logger.info(
			{ paymentId: record.id, invoiceId, userId, amount, expectedAmount },
			'invoice payment submitted (pending approval)',
		);

		// Verifikasi otomatis bukti transfer (pola sama dengan pembelian paket):
		// jika jumlah dan bank pada bukti cocok dengan nominal unik dan bank tujuan,
		// pembayaran diterapkan ke invoice secara otomatis. Jika tidak cocok atau
		// keyakinan kurang, pembayaran tetap menunggu persetujuan manual pengguna
		// berwenang.
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
				'invoice_payments',
			);
			verifyReason = outcome.reason;
			if (outcome.verified) {
				await applyInvoicePaymentServer({
					invoiceId: invoice.id,
					amount,
					paymentDate: paymentDate || todayIso(),
					payerName,
					bank,
					label: 'customer',
				});
				await pocketbaseAdmin.updateRecord('invoice_payments', record.id, {
					status: 'aktif',
					auto_verified: true,
					verification_notes: verifyReason,
					verifier: userId,
					verified_at: new Date().toISOString(),
				});
				verified = true;
				logger.info(
					{ paymentId: record.id, invoiceId },
					'invoice payment auto-verified and applied',
				);
			} else {
				await pocketbaseAdmin.updateRecord('invoice_payments', record.id, {
					auto_verified: false,
					verification_notes: verifyReason,
				});
			}
		} catch (error) {
			logger.error(
				{ error, paymentId: record.id },
				'invoice payment auto-verification failed',
			);
		}

		return json({ ok: true, paymentId: record.id, verified, reason: verifyReason });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{
			id: string;
			action: 'verify' | 'reject';
			rejection_reason?: string;
		}>(request);

		if (!body.id) throw apiError(422, 'ID pembayaran wajib disertakan.');
		if (body.action !== 'verify' && body.action !== 'reject') {
			throw apiError(422, 'Aksi tidak valid. Gunakan "verify" atau "reject".');
		}

		const payment = await pocketbaseAdmin
			.getRecord<InvoicePaymentRecord>('invoice_payments', body.id, {
				expand: 'invoice,contact,submitted_by,verifier',
			})
			.catch(() => null);
		if (!payment) throw apiError(404, 'Pembayaran tidak ditemukan.');

		await requireCompanyAccess(userId, payment.company, true);

		if (body.action === 'verify') {
			if (payment.status === 'aktif') {
				throw apiError(422, 'Pembayaran sudah disetujui sebelumnya.');
			}
			if (payment.status === 'ditolak') {
				throw apiError(422, 'Pembayaran sudah ditolak dan tidak dapat disetujui.');
			}
			try {
				await applyInvoicePaymentServer({
					invoiceId: payment.invoice,
					amount: payment.amount,
					paymentDate: payment.payment_date,
					payerName: payment.payer_name,
					bank: payment.bank,
					label: 'customer',
				});
			} catch (error) {
				logger.error(
					{ error, paymentId: payment.id },
					'invoice payment approval: failed to apply payment',
				);
				throw apiError(
					422,
					error instanceof Error ? error.message : 'Gagal menerapkan pembayaran ke invoice.',
				);
			}

			await pocketbaseAdmin.updateRecord(
				'invoice_payments',
				payment.id,
				{
					status: 'aktif',
					verifier: userId,
					verified_at: new Date().toISOString(),
					rejection_reason: '',
				},
			);
			const verified = await pocketbaseAdmin.getRecord<InvoicePaymentRecord>(
				'invoice_payments',
				payment.id,
				{ expand: 'invoice,contact,submitted_by,verifier' },
			);
			const token = await pocketbaseAdmin.getFileToken();
			return json({ payment: toListItem(verified, token) });
		}

		// reject
		const reason = (body.rejection_reason ?? '').trim();
		await pocketbaseAdmin.updateRecord(
			'invoice_payments',
			payment.id,
			{
				status: 'ditolak',
				rejection_reason: reason,
				verifier: userId,
				verified_at: new Date().toISOString(),
			},
		);
		const rejected = await pocketbaseAdmin.getRecord<InvoicePaymentRecord>(
			'invoice_payments',
			payment.id,
			{ expand: 'invoice,contact,submitted_by,verifier' },
		);
		const token = await pocketbaseAdmin.getFileToken();
		return json({ payment: toListItem(rejected, token) });
	}

	throw apiError(405, 'Metode tidak didukung.');
});
