import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { getPlanPrice } from '@/lib/plan-prices.server';
import { formatPlanPrice, type PlanPriceKey } from '@/lib/plan-prices';

type ExistingPayment = {
	expected_amount?: number;
	status: string;
};

function parseBaseAmount(formatted: string): number | null {
	if (!formatted) return null;
	const digits = formatted.replace(/[^\d]/g, '');
	if (!digits) return null;
	const value = Number(digits);
	return Number.isFinite(value) ? value : null;
}

const MAX_ATTEMPTS = 60;

/**
 * POST /api/akuntan/manual-payments/expected-amount
 *
 * Menghasilkan nominal unik untuk pembayaran manual: harga paket dasar (dari
 * pengaturan harga Admin Pusat) + tiga digit acak di akhir (cth. 49000 + 145 =
 * 49145). Nominal dijamin tidak benturan dengan pembayaran lain yang masih
 * aktif atau menunggu verifikasi, sehingga verifikasi otomatis dapat memakainya
 * sebagai acuan tunggal. Berupa action (POST) agar respons per-pengguna tidak
 * di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	await requireUserId(request);

	const body = await readJsonBody<{ plan?: string; amount_formatted?: string }>(request);
	const planKey = (body.plan ?? '') as PlanPriceKey;

	// Harga dasar diambil dari pengaturan harga paket Admin Pusat. Jika paket
	// tidak ditemukan, jatuh kembali ke nominal terformat yang dikirim klien.
	let base: number | null = null;
	if (planKey) {
		const planPrice = await getPlanPrice(planKey);
		base = planPrice?.price ?? null;
	}
	if (base === null) {
		base = parseBaseAmount(body.amount_formatted ?? '');
	}
	if (base === null || base <= 0) {
		throw apiError(422, 'Nominal paket tidak valid.');
	}

	let expectedAmount = 0;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		// Tiga digit acak 1..999 ditambahkan ke harga paket dasar.
		const suffix = Math.floor(Math.random() * 999) + 1;
		const candidate = base + suffix;

		// Cek benturan dengan pembayaran yang masih aktif atau menunggu verifikasi.
		const existing = await pocketbaseAdmin.listRecords<ExistingPayment>(
			'pencari_manual_payments',
			{
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter("expected_amount = {:candidate} && (status = 'menunggu_verifikasi' || status = 'aktif')", { candidate }),
			},
		);

		if (existing.items.length === 0) {
			expectedAmount = candidate;
			break;
		}
	}

	if (expectedAmount === 0) {
		throw apiError(409, 'Tidak dapat menemukan nominal unik yang tersedia. Coba lagi sebentar.');
	}

	return json({
		expected_amount: expectedAmount,
		expected_amount_formatted: formatPlanPrice(expectedAmount),
	});
});
