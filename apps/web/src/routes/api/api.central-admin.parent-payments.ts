import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { applyParentInvoicePayment } from '@/lib/apply-parent-payment.server';
import logger from '@/lib/logger.server';

type ParentPaymentRecord = {
	id: string;
	parent: string;
	student: string;
	invoice: string;
	company: string;
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
	verifier: string;
	verified_at: string;
	rejection_reason: string;
	verification_notes: string;
	created: string;
	updated: string;
	expand?: {
		parent?: { id: string; name: string; email: string };
		student?: { id: string; student_name: string };
		invoice?: { id: string; number: string; total: number; paid_amount: number };
		verifier?: { id: string; name: string; email: string };
	};
};

type ParentPaymentListItem = {
	id: string;
	parent: { id: string; name: string; email: string };
	student: { id: string; student_name: string };
	invoice: { id: string; number: string; total: number; paid_amount: number };
	company: string;
	amount: number;
	expected_amount: number;
	expected_amount_formatted: string;
	auto_verified: boolean;
	payment_method: string;
	bank: string;
	proof_url: string;
	payer_name: string;
	payment_date: string;
	notes: string;
	status: string;
	verifier: { id: string; name: string; email: string } | null;
	verified_at: string;
	rejection_reason: string;
	verification_notes: string;
	created: string;
};

const PUBLIC_PB_PREFIX = '/hcgi/platform';

function proofUrl(record: ParentPaymentRecord, token: string): string {
	if (!record.proof) return '';
	return `${PUBLIC_PB_PREFIX}/api/files/parent_invoice_payments/${record.id}/${record.proof}?token=${encodeURIComponent(token)}`;
}

function toListItem(record: ParentPaymentRecord, token: string): ParentPaymentListItem {
	const parent = record.expand?.parent;
	const student = record.expand?.student;
	const invoice = record.expand?.invoice;
	return {
		id: record.id,
		parent: {
			id: parent?.id ?? record.parent,
			name: parent?.name ?? record.payer_name ?? '',
			email: parent?.email ?? '',
		},
		student: {
			id: student?.id ?? record.student,
			student_name: student?.student_name ?? '',
		},
		invoice: {
			id: invoice?.id ?? record.invoice,
			number: invoice?.number ?? '',
			total: Number(invoice?.total ?? 0),
			paid_amount: Number(invoice?.paid_amount ?? 0),
		},
		company: record.company,
		amount: Number(record.amount) || 0,
		expected_amount: Number(record.expected_amount) || 0,
		expected_amount_formatted: record.expected_amount_formatted ?? '',
		auto_verified: Boolean(record.auto_verified),
		payment_method: record.payment_method,
		bank: record.bank,
		proof_url: proofUrl(record, token),
		payer_name: record.payer_name,
		payment_date: record.payment_date,
		notes: record.notes,
		status: record.status,
		verifier: record.expand?.verifier
			? {
					id: record.expand.verifier.id,
					name: record.expand.verifier.name ?? '',
					email: record.expand.verifier.email ?? '',
				}
			: null,
		verified_at: record.verified_at,
		rejection_reason: record.rejection_reason,
		verification_notes: record.verification_notes,
		created: record.created,
	};
}

/**
 * POST /api/central-admin/parent-payments — daftar pembayaran manual invoice
 * oleh Parent untuk diverifikasi Admin Pusat.
 * PATCH /api/central-admin/parent-payments/:id — verifikasi (terapkan ke
 * invoice: buat dokumen pembayaran + transaksi + jurnal + perbarui paid_amount)
 * atau tolak.
 *
 * Keduanya action (non-GET) agar respons per-admin tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const result = await pocketbaseAdmin.listRecords<ParentPaymentRecord>(
			'parent_invoice_payments',
			{
				page: 1,
				perPage: 500,
				sort: '-created',
				expand: 'parent,student,invoice,verifier',
			},
		);
		const token = await pocketbaseAdmin.getFileToken();
		return json({ payments: result.items.map((item) => toListItem(item, token)) });
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

		const adminId = await requireCentralAdmin(request);

		const payment = await pocketbaseAdmin
			.getRecord<ParentPaymentRecord>('parent_invoice_payments', body.id, {
				expand: 'parent,student,invoice,verifier',
			})
			.catch(() => null);
		if (!payment) throw apiError(404, 'Pembayaran tidak ditemukan.');

		if (body.action === 'verify') {
			if (payment.status === 'aktif') {
				throw apiError(422, 'Pembayaran sudah diverifikasi sebelumnya.');
			}
			try {
				await applyParentInvoicePayment({
					id: payment.id,
					parent: payment.parent,
					student: payment.student,
					invoice: payment.invoice,
					company: payment.company,
					amount: payment.amount,
					bank: payment.bank,
					payer_name: payment.payer_name,
					payment_date: payment.payment_date,
				});
			} catch (error) {
				logger.error(
					{ error, paymentId: payment.id },
					'parent payment verification: failed to apply payment',
				);
				throw apiError(
					422,
					error instanceof Error
						? error.message
						: 'Gagal menerapkan pembayaran ke invoice.',
				);
			}

			const updated = await pocketbaseAdmin.updateRecord<ParentPaymentRecord>(
				'parent_invoice_payments',
				payment.id,
				{
					status: 'aktif',
					verifier: adminId,
					verified_at: new Date().toISOString(),
					rejection_reason: '',
				},
			);
			const token = await pocketbaseAdmin.getFileToken();
			return json({ payment: toListItem(updated, token) });
		}

		// reject
		const reason = (body.rejection_reason ?? '').trim();
		const updated = await pocketbaseAdmin.updateRecord<ParentPaymentRecord>(
			'parent_invoice_payments',
			payment.id,
			{
				status: 'ditolak',
				rejection_reason: reason,
				verifier: adminId,
				verified_at: new Date().toISOString(),
			},
		);
		const token = await pocketbaseAdmin.getFileToken();
		return json({ payment: toListItem(updated, token) });
	}

	throw apiError(405, 'Metode tidak didukung.');
});
