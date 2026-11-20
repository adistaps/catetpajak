import { withApi, apiError, readJsonBody, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { siteOrigin } from '@/lib/site-origin.server';
import { signInvoicePayToken } from '@/lib/invoice-pay-link.server';
import type { BusinessDocument } from '@/lib/documents';

type Body = {
	docId?: string;
};

/**
 * POST /api/invoice-pay-link — mengembalikan tautan pembayaran manual publik
 * untuk sebuah invoice (ditandatangani server). Tautan ini BUKAN bukti
 * pembayaran; membukanya tidak melunasi invoice. Dipakai oleh alur Kirim via
 * WhatsApp agar pesan berisi tautan valid tanpa membuka kredensial penandatangan
 * ke klien.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') throw apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const docId = body.docId?.trim();
	if (!docId) throw apiError(422, 'docId wajib diisi.');

	// Pastikan dokumen ada; akses ke daftar invoice tetap dibatasi oleh aturan
	// koleksi PocketBase. Tautan pembayaran sendiri bersifat publik.
	await pocketbaseAdmin.getRecord<BusinessDocument>('documents', docId);

	const origin = siteOrigin(request);
	const payToken = signInvoicePayToken(docId);
	const payUrl = `${origin}/bayar/${payToken}`;

	return json({ ok: true, payUrl });
});
