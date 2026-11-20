import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { getPlanPrice } from '@/lib/plan-prices.server';
import { formatPlanPrice } from '@/lib/plan-prices';

type PencariUser = {
	id: string;
	email: string;
	name?: string;
	created: string;
};

type ManualPaymentRecord = {
	id: string;
	seeker: string;
	status: string;
	period_start: string;
	period_end: string;
	plan_title: string;
	amount_formatted: string;
	created: string;
};

const PLAN_TITLE = 'Pencari Akuntan';

function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Harga terformat paket Pencari Akuntan dari pengaturan Admin Pusat. */
async function pencariAmountFormatted(): Promise<string> {
	const price = await getPlanPrice('pencari_akuntan');
	return price ? formatPlanPrice(price.price) : 'Rp 49.000';
}

function isPaymentActive(payment: ManualPaymentRecord): boolean {
	if (payment.status !== 'aktif') return false;
	if (!payment.period_end) return true;
	const end = new Date(`${payment.period_end}T23:59:59`);
	if (Number.isNaN(end.getTime())) return true;
	return end.getTime() >= Date.now();
}

/**
 * POST /api/central-admin/subscriptions — every Pencari Akuntan user with
 * their subscription status (manual payment + store subscription).
 * PATCH /api/central-admin/subscriptions — extend a Pencari Akuntan's
 * subscription duration, or grant a fresh trial/access period.
 *
 * Non-GET so per-admin responses are never edge-cached.
 */
export const action = withApi(async ({ request }) => {
	const adminId = await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const [usersResult, paymentsResult] = await Promise.all([
			pocketbaseAdmin.listRecords<PencariUser>('users', {
				page: 1,
				perPage: 500,
				filter: "akuntan_role = 'pencari'",
				sort: '-created',
			}),
			pocketbaseAdmin.listRecords<ManualPaymentRecord>('pencari_manual_payments', {
				page: 1,
				perPage: 1000,
				sort: '-created',
			}),
		]);

		const paymentsBySeeker = new Map<string, ManualPaymentRecord[]>();
		for (const payment of paymentsResult.items) {
			if (!payment.seeker) continue;
			const list = paymentsBySeeker.get(payment.seeker) ?? [];
			list.push(payment);
			paymentsBySeeker.set(payment.seeker, list);
		}

		const users = usersResult.items.map(user => {
			const payments = paymentsBySeeker.get(user.id) ?? [];
			const active = payments.find(isPaymentActive) ?? null;
			const pending = payments.find(p => p.status === 'menunggu_verifikasi') ?? null;
			return {
				id: user.id,
				email: user.email,
				name: user.name ?? '',
				created: user.created,
				subscription: active
					? {
							status: 'aktif' as const,
							period_start: active.period_start,
							period_end: active.period_end,
							method: 'manual' as const,
						}
					: pending
						? { status: 'menunggu_verifikasi' as const, period_start: '', period_end: '', method: 'manual' as const }
						: null,
			};
		});

		return json({ users });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{
			userId?: string;
			days?: number;
			action?: 'extend' | 'grant_trial';
		}>(request);

		const userId = (body.userId ?? '').trim();
		const days = Number(body.days ?? 0);
		if (!userId) throw apiError(422, 'ID pengguna wajib disertakan.');
		if (!Number.isFinite(days) || days <= 0 || days > 3650) {
			throw apiError(422, 'Jumlah hari harus antara 1 dan 3650.');
		}

		// Verify the user exists.
		try {
			await pocketbaseAdmin.getRecord('users', userId);
		} catch {
			throw apiError(404, 'Pengguna tidak ditemukan.');
		}

		const today = new Date();
		const todayIso = isoDate(today);
		const nowIso = new Date().toISOString();

		// Find the user's active manual payment.
		const payments = await pocketbaseAdmin.listRecords<ManualPaymentRecord>(
			'pencari_manual_payments',
			{ page: 1, perPage: 50, filter: pocketbaseAdmin.filter('seeker = {:userId}', { userId }), sort: '-created' },
		);
		const active = payments.items.find(isPaymentActive) ?? null;

		if (active) {
			// Extend from the current period_end (or today if already past).
			const currentEnd = active.period_end
				? new Date(`${active.period_end}T00:00:00`)
				: today;
			const base = currentEnd.getTime() >= today.getTime() ? currentEnd : today;
			const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
			const updated = await pocketbaseAdmin.updateRecord<ManualPaymentRecord>(
				'pencari_manual_payments',
				active.id,
				{
					status: 'aktif',
					period_end: isoDate(newEnd),
					verifier: adminId,
					verified_at: nowIso,
					rejection_reason: '',
				},
			);
			return json({
				subscription: {
					status: 'aktif',
					period_start: updated.period_start || active.period_start,
					period_end: updated.period_end,
				},
			});
		}

		// No active subscription — create a fresh access period (trial/extension).
		const end = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
		const amountFormatted = await pencariAmountFormatted();
		const created = await pocketbaseAdmin.createRecord<ManualPaymentRecord>(
			'pencari_manual_payments',
			{
				seeker: userId,
				plan_title: PLAN_TITLE,
				variant_id: '',
				amount_formatted: amountFormatted,
				payment_method: 'transfer_bank',
				payment_date: todayIso,
				notes:
					body.action === 'grant_trial'
						? 'Masa trial diberikan oleh admin pusat.'
						: 'Jangka waktu langganan ditambah oleh admin pusat.',
				status: 'aktif',
				period_start: todayIso,
				period_end: isoDate(end),
				verifier: adminId,
				verified_at: nowIso,
			},
		);

		return json({
			subscription: {
				status: 'aktif',
				period_start: created.period_start,
				period_end: created.period_end,
			},
		});
	}

	throw apiError(405, 'Metode tidak didukung.');
});
