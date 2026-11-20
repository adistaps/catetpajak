import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { getPlanPrices, setPlanPrice } from '@/lib/plan-prices.server';
import {
	PLAN_PRICE_LABELS,
	PLAN_PRICE_PERIODS,
	type PlanPriceKey,
} from '@/lib/plan-prices';

const VALID_PLANS: PlanPriceKey[] = ['starter', 'pro', 'enterprise', 'pencari_akuntan'];

/**
 * POST /api/central-admin/plan-prices — daftar harga paket langganan.
 * PATCH /api/central-admin/plan-prices — perbarui harga satu paket.
 *
 * Non-GET agar respons per-admin tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const prices = await getPlanPrices();
		return json({ prices });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{ plan?: string; price?: number }>(request);
		const plan = (body.plan ?? '') as PlanPriceKey;
		if (!VALID_PLANS.includes(plan)) {
			throw apiError(422, 'Paket tidak valid. Pilih Starter, Pro, Enterprise, atau Pencari Akuntan.');
		}
		const price = Number(body.price);
		if (!Number.isFinite(price) || price < 0 || price > 100000000) {
			throw apiError(422, 'Harga harus antara 0 dan 100.000.000.');
		}

		const updated = await setPlanPrice(plan, Math.floor(price));
		return json({
			price: {
				plan: updated.plan,
				price: updated.price,
				label: PLAN_PRICE_LABELS[updated.plan] ?? updated.label,
				period: PLAN_PRICE_PERIODS[updated.plan] ?? updated.period,
			},
		});
	}

	throw apiError(405, 'Metode tidak didukung.');
});
