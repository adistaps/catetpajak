import { withApi, readJsonBody, json, apiError } from '@/lib/api.server';
import pocketbaseAdmin from '@/lib/pocketbase-client.server';

/**
 * Menentukan koleksi auth mana yang memiliki email ini — `users`, `parents`,
 * atau keduanya — menggunakan akses superuser (kueri records, BUKAN percobaan
 * autentikasi, sehingga tidak mengonsumsi batas rate `*:auth` PocketBase).
 *
 * Klien kemudian melakukan tepat satu `authWithPassword` terhadap koleksi yang
 * benar, menghindari penggandaan percobaan autentikasi yang sebelumnya
 * menghabiskan batas rate bersama dan menyebabkan login pengguna perusahaan gagal.
 */
export const action = withApi(async ({ request }) => {
	const body = await readJsonBody<{ email?: unknown }>(request);
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

	if (!email || !email.includes('@')) {
		throw apiError(400, 'Email tidak valid.');
	}

	// Escape tanda kutip ganda agar filter PocketBase tetap aman.
	const escaped = email.replace(/"/g, '\\"');
	const filter = `email = "${escaped}"`;

	const found: string[] = [];
	await Promise.all([
		pocketbaseAdmin
			.listRecords('users', { filter, perPage: 1 })
			.then((result) => {
				if (result.items.length > 0) found.push('users');
			})
			.catch(() => {
				/* abaikan — koleksi tidak ditemukan atau error sementara */
			}),
		pocketbaseAdmin
			.listRecords('parents', { filter, perPage: 1 })
			.then((result) => {
				if (result.items.length > 0) found.push('parents');
			})
			.catch(() => {
				/* abaikan — koleksi tidak ditemukan atau error sementara */
			}),
	]);

	// Urutan stabil: `users` lebih dulu sehingga kasus email di kedua koleksi
	// memprioritaskan login pengguna perusahaan, dan kata sandi menentukan
	// identitas mana yang dipakai.
	const ordered = ['users', 'parents'].filter((collection) => found.includes(collection));

	return json({ collections: ordered });
});
