import { withApi, apiError, json } from '@/lib/api.server';
import { listValidAkuntanProfiles } from '@/lib/akuntan-profiles.server';

/**
 * POST /api/akuntan/profiles — daftar profil akuntan yang akun pemiliknya
 * masih aktif, untuk direktori publik /akuntan. POST agar respons tidak
 * di-cache edge dan selalu memuat data terbaru (profil yang akunnya baru
 * dihapus langsung hilang).
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') {
		throw apiError(405, 'Metode tidak didukung.');
	}

	const profiles = await listValidAkuntanProfiles();
	return json({ profiles });
});
