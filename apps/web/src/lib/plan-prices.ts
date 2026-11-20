import pb from '@/lib/pocketbase-client';

/**
 * Harga paket langganan yang dikelola Admin Pusat. Nilai tersimpan di koleksi
 * PocketBase `plan_prices` (baca publik, tulis hanya lewat rute server Admin
 * Pusat). Harga ini dipakai di halaman /plans, pembuatan nominal unik
 * pembayaran manual, instruksi pembayaran, dan verifikasi.
 */
export type PlanPriceKey = 'starter' | 'pro' | 'enterprise' | 'pencari_akuntan';

export type PlanPrice = {
	plan: PlanPriceKey;
	price: number;
	label: string;
	period: string;
};

export const PLAN_PRICE_LABELS: Record<PlanPriceKey, string> = {
	starter: 'Starter',
	pro: 'Pro',
	enterprise: 'Enterprise',
	pencari_akuntan: 'Pencari Akuntan',
};

export const PLAN_PRICE_PERIODS: Record<PlanPriceKey, string> = {
	starter: 'selamanya',
	pro: 'per bulan',
	enterprise: 'per bulan',
	pencari_akuntan: 'per bulan',
};

/** Urutan tampilan default di antarmuka Admin Pusat. */
export const PLAN_PRICE_ORDER: PlanPriceKey[] = ['starter', 'pro', 'enterprise', 'pencari_akuntan'];

/** Format Rupiah untuk ditampilkan; 0 ditampilkan sebagai "Gratis". */
export function formatPlanPrice(price: number): string {
	if (!Number.isFinite(price) || price <= 0) return 'Gratis';
	return `Rp ${price.toLocaleString('id-ID')}`;
}

/** Daftar harga paket dari PocketBase (baca publik). Untuk dipakai di klien. */
export async function fetchPlanPrices(): Promise<PlanPrice[]> {
	const records = await pb.collection('plan_prices').getFullList({ sort: 'created' });
	return records.map(record => {
		const plan = (record.plan ?? '') as PlanPriceKey;
		return {
			plan,
			price: typeof record.price === 'number' ? record.price : Number(record.price ?? 0),
			label: PLAN_PRICE_LABELS[plan] ?? record.plan ?? plan,
			period: PLAN_PRICE_PERIODS[plan] ?? '',
		};
	});
}
