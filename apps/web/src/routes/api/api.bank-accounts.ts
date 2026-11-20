import { withApi, apiError, json } from '@/lib/api.server';
import { getActiveBankAccounts } from '@/lib/bank-accounts.server';

/**
 * POST /api/bank-accounts — rekening bank aktif untuk instruksi pembayaran
 * manual. Data diambil dari pengaturan Admin Pusat (bukan contoh). POST agar
 * respons tidak di-cache edge dan selalu mengikuti rekening yang baru disimpan.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') {
		throw apiError(405, 'Metode tidak didukung.');
	}

	const accounts = await getActiveBankAccounts();
	return json({ accounts });
});
