/**
 * Server-only helpers for reading and updating plan prices. Uses the superuser
 * PocketBase client so loaders and Admin Pusat routes can read/write the
 * `plan_prices` collection regardless of caller auth state.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	PLAN_PRICE_LABELS,
	PLAN_PRICE_PERIODS,
	type PlanPrice,
	type PlanPriceKey,
} from '@/lib/plan-prices';

type PlanPriceRecord = {
	id: string;
	plan: string;
	price: number;
	updated: string;
};

function toPlanPrice(record: PlanPriceRecord): PlanPrice {
	const plan = (record.plan ?? '') as PlanPriceKey;
	return {
		plan,
		price: typeof record.price === 'number' ? record.price : Number(record.price ?? 0),
		label: PLAN_PRICE_LABELS[plan] ?? record.plan ?? plan,
		period: PLAN_PRICE_PERIODS[plan] ?? '',
	};
}

/** Seluruh harga paket, terurut berdasarkan waktu pembuatan. */
export async function getPlanPrices(): Promise<PlanPrice[]> {
	const result = await pocketbaseAdmin.listRecords<PlanPriceRecord>('plan_prices', {
		page: 1,
		perPage: 100,
		sort: 'created',
	});
	return result.items.map(toPlanPrice);
}

/** Harga satu paket berdasarkan kunci plan; null bila tidak ditemukan. */
export async function getPlanPrice(plan: PlanPriceKey): Promise<PlanPrice | null> {
	const result = await pocketbaseAdmin.listRecords<PlanPriceRecord>('plan_prices', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('plan = {:plan}', { plan }),
	});
	if (result.items.length === 0) return null;
	return toPlanPrice(result.items[0]);
}

/**
 * Memperbarui harga sebuah paket. Membuat catatan baru bila belum ada (mis.
 * paket baru ditambahkan ke daftar di masa depan).
 */
export async function setPlanPrice(plan: PlanPriceKey, price: number): Promise<PlanPrice> {
	const result = await pocketbaseAdmin.listRecords<PlanPriceRecord>('plan_prices', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('plan = {:plan}', { plan }),
	});

	if (result.items.length > 0) {
		const updated = await pocketbaseAdmin.updateRecord<PlanPriceRecord>(
			'plan_prices',
			result.items[0].id,
			{ price },
		);
		return toPlanPrice(updated);
	}

	const created = await pocketbaseAdmin.createRecord<PlanPriceRecord>('plan_prices', {
		plan,
		price,
	});
	return toPlanPrice(created);
}
