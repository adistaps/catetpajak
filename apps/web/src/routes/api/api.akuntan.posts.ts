import { withApi, apiError, json } from '@/lib/api.server';
import { listPublicAccountantPosts } from '@/lib/akuntan-profiles.server';

/**
 * POST /api/akuntan/posts — daftar posting Aktivitas yang benar-benar publik
 * untuk feed /akuntan/activity. POST agar respons tidak di-cache edge dan
 * selalu memuat data terbaru. Hanya posting `kind != hl_store` milik Akuntan
 * aktif yang profilnya masih ada yang dikembalikan, sehingga feed publik
 * konsisten untuk semua pengunjung dan tidak membocorkan posting yang
 * sebenarnya tidak publik.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') {
		throw apiError(405, 'Metode tidak didukung.');
	}

	const posts = await listPublicAccountantPosts();
	return json({ posts });
});
