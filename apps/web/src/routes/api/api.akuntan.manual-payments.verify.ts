import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { verifyManualPaymentProof } from '@/lib/proof-verification.server';
import { applyManualPlanToOwnedCompanies } from '@/lib/apply-manual-plan.server';

type ManualPaymentRecord = {
	id: string;
	seeker: string;
	plan_title: string;
	period_end: string;
	amount_formatted: string;
	expected_amount: number;
	bank: string;
	proof: string;
	status: string;
};

/**
 * POST /api/akuntan/manual-payments/verify
 *
 * Menjalankan verifikasi otomatis bukti transfer untuk pembayaran manual
 * Pencari Akuntan milik pemanggil. Hanya pemilik catatan yang boleh meminta
 * verifikasi. Jika jumlah dan nama bank pada bukti cocok, langganan
 * diaktifkan otomatis selama 30 hari; jika tidak, pembayaran tetap menunggu
 * verifikasi manual Admin Pusat.
 *
 * Berupa action (POST) agar respons per-pengguna tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	const userId = await requireUserId(request);

	const body = await readJsonBody<{ id?: string; sync?: boolean }>(request);

	// Selaraskan paket perusahaan dengan pembayaran manual yang sudah aktif,
	// termasuk pembayaran yang diverifikasi sebelum sinkronisasi paket ada.
	if (body.sync) {
		const result = await pocketbaseAdmin.listRecords<ManualPaymentRecord>(
			'pencari_manual_payments',
			{
				filter: pocketbaseAdmin.filter('seeker = {:userId} && status = "aktif"', { userId }),
				sort: '-period_end',
				perPage: 20,
			},
		);
		const today = new Date().toISOString().slice(0, 10);
		const active = result.items.find(
			item => !item.period_end || item.period_end >= today,
		);
		if (active?.plan_title) {
			await applyManualPlanToOwnedCompanies(userId, active.plan_title);
		}
		return json({ synced: Boolean(active) });
	}

	if (!body.id) {
		throw apiError(422, 'ID pembayaran wajib disertakan.');
	}

	let payment: ManualPaymentRecord;
	try {
		payment = await pocketbaseAdmin.getRecord<ManualPaymentRecord>(
			'pencari_manual_payments',
			body.id,
		);
	} catch {
		throw apiError(404, 'Pembayaran tidak ditemukan.');
	}

	if (payment.seeker !== userId) {
		throw apiError(403, 'Anda tidak memiliki akses ke pembayaran ini.');
	}

	if (payment.status === 'aktif') {
		return json({ verified: true, status: 'aktif', reason: 'Pembayaran sudah aktif.' });
	}

	const outcome = await verifyManualPaymentProof({
		id: payment.id,
		proof: payment.proof,
		expected_amount: payment.expected_amount,
		bank: payment.bank,
	});

	if (outcome.verified) {
		const today = new Date();
		const todayIso = today.toISOString().slice(0, 10);
		const end = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
		await pocketbaseAdmin.updateRecord('pencari_manual_payments', payment.id, {
			status: 'aktif',
			auto_verified: true,
			verification_notes: outcome.reason,
			period_start: todayIso,
			period_end: end.toISOString().slice(0, 10),
			verified_at: new Date().toISOString(),
		});
		await applyManualPlanToOwnedCompanies(payment.seeker, payment.plan_title);
		return json({ verified: true, status: 'aktif', reason: outcome.reason });
	}

	// Tetap menunggu verifikasi manual Admin Pusat; catat alasan kegagalan.
	await pocketbaseAdmin.updateRecord('pencari_manual_payments', payment.id, {
		auto_verified: false,
		verification_notes: outcome.reason,
	});
	return json({ verified: false, status: 'menunggu_verifikasi', reason: outcome.reason });
});
