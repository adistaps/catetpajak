import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { applyManualPlanToOwnedCompanies } from '@/lib/apply-manual-plan.server';

type ManualPaymentRecord = {
	id: string;
	seeker: string;
	plan_title: string;
	variant_id: string;
	amount_formatted: string;
	expected_amount: number;
	expected_amount_formatted: string;
	payment_method: string;
	bank: string;
	proof: string;
	payer_name: string;
	payer_email: string;
	payment_date: string;
	notes: string;
	status: string;
	period_start: string;
	period_end: string;
	verifier: string;
	verified_at: string;
	rejection_reason: string;
	auto_verified: boolean;
	verification_notes: string;
	created: string;
	updated: string;
	expand?: {
		seeker?: { id: string; name: string; email: string };
		verifier?: { id: string; name: string; email: string };
	};
};

type ManualPaymentListItem = {
	id: string;
	seeker: { id: string; name: string; email: string };
	plan_title: string;
	amount_formatted: string;
	expected_amount: number;
	expected_amount_formatted: string;
	payment_method: string;
	bank: string;
	proof_url: string;
	payer_name: string;
	payer_email: string;
	payment_date: string;
	notes: string;
	status: string;
	period_start: string;
	period_end: string;
	verifier: { id: string; name: string; email: string } | null;
	verified_at: string;
	rejection_reason: string;
	auto_verified: boolean;
	verification_notes: string;
	created: string;
};

const PUBLIC_PB_PREFIX = '/hcgi/platform';

function proofUrl(record: ManualPaymentRecord, token: string): string {
	if (!record.proof) return '';
	return `${PUBLIC_PB_PREFIX}/api/files/pencari_manual_payments/${record.id}/${record.proof}?token=${encodeURIComponent(token)}`;
}

function toListItem(record: ManualPaymentRecord, token: string): ManualPaymentListItem {
	const seeker = record.expand?.seeker;
	return {
		id: record.id,
		seeker: {
			id: seeker?.id ?? record.seeker,
			name: seeker?.name ?? record.payer_name ?? '',
			email: seeker?.email ?? record.payer_email ?? '',
		},
		plan_title: record.plan_title,
		amount_formatted: record.amount_formatted,
		expected_amount: record.expected_amount ?? 0,
		expected_amount_formatted: record.expected_amount_formatted ?? '',
		payment_method: record.payment_method,
		bank: record.bank,
		proof_url: proofUrl(record, token),
		payer_name: record.payer_name,
		payer_email: record.payer_email,
		payment_date: record.payment_date,
		notes: record.notes,
		status: record.status,
		period_start: record.period_start,
		period_end: record.period_end,
		verifier: record.expand?.verifier
			? {
					id: record.expand.verifier.id,
					name: record.expand.verifier.name ?? '',
					email: record.expand.verifier.email ?? '',
				}
			: null,
		verified_at: record.verified_at,
		rejection_reason: record.rejection_reason,
		auto_verified: record.auto_verified,
		verification_notes: record.verification_notes,
		created: record.created,
	};
}

/**
 * POST /api/central-admin/manual-payments — daftar seluruh pembayaran manual
 * Pencari Akuntan untuk diverifikasi admin pusat.
 * PATCH /api/central-admin/manual-payments/:id — verifikasi (aktifkan) atau
 * tolak pembayaran manual.
 *
 * Keduanya action (non-GET) agar respons per-admin tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const result = await pocketbaseAdmin.listRecords<ManualPaymentRecord>(
			'pencari_manual_payments',
			{
				page: 1,
				perPage: 500,
				sort: '-created',
				expand: 'seeker,verifier',
			},
		);
		const token = await pocketbaseAdmin.getFileToken();
		return json({ payments: result.items.map(item => toListItem(item, token)) });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{
			id: string;
			action: 'verify' | 'reject';
			rejection_reason?: string;
			period_days?: number;
		}>(request);

		if (!body.id) {
			throw apiError(422, 'ID pembayaran wajib disertakan.');
		}
		if (body.action !== 'verify' && body.action !== 'reject') {
			throw apiError(422, 'Aksi tidak valid. Gunakan "verify" atau "reject".');
		}

		const adminId = await requireCentralAdmin(request);
		const today = new Date();
		const todayIso = today.toISOString().slice(0, 10);

		if (body.action === 'verify') {
			const days = Number(body.period_days ?? 30);
			const end = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
			const updated = await pocketbaseAdmin.updateRecord<ManualPaymentRecord>(
				'pencari_manual_payments',
				body.id,
				{
					status: 'aktif',
					period_start: todayIso,
					period_end: end.toISOString().slice(0, 10),
					verifier: adminId,
					verified_at: new Date().toISOString(),
					rejection_reason: '',
				},
			);
			await applyManualPlanToOwnedCompanies(updated.seeker, updated.plan_title);
			const token = await pocketbaseAdmin.getFileToken();
			return json({ payment: toListItem(updated, token) });
		}

		const reason = (body.rejection_reason ?? '').trim();
		const updated = await pocketbaseAdmin.updateRecord<ManualPaymentRecord>(
			'pencari_manual_payments',
			body.id,
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
