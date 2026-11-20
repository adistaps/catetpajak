import { withApi, apiError, json, readFormData } from '@/lib/api.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PUBLIC_PB_PREFIX = '/hcgi/platform';

type EmployeeRecord = {
	id: string;
	photo?: string;
};

/**
 * POST /api/karyawan/photo — karyawan mengunggah/mengganti foto profilnya.
 *
 * Route memakai superuser PocketBase karena aturan update koleksi `employees`
 * adalah owner-only (pemilik perusahaan). Karyawan hanya boleh mengubah foto
 * miliknya sendiri: server mencari record `employees` yang `user`-nya sama
 * dengan akun yang masuk, lalu memperbarui HANYA field `photo`. Karyawan tidak
 * dapat mengubah field lain (gaji, status, dll) melalui route ini.
 *
 * Berupa POST (bukan GET) agar respons per-user tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	const userId = await requireUserId(request);

	const form = await readFormData(request);
	const photo = form.get('photo');

	if (!photo || !(photo instanceof File) || photo.size === 0) {
		throw apiError(422, 'Berkas foto wajib diunggah.');
	}
	if (!ALLOWED_MIME.has(photo.type)) {
		throw apiError(422, 'Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.');
	}
	if (photo.size > MAX_PHOTO_SIZE) {
		throw apiError(422, 'Ukuran foto terlalu besar (maksimal 5 MB).');
	}

	// Cari record karyawan yang ditautkan ke akun ini. Hanya foto milik
	// karyawan yang sedang masuk yang dapat diubah.
	const list = await pocketbaseAdmin.listRecords<EmployeeRecord>('employees', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('user = {:userId}', { userId }),
	});
	const employee = list.items[0];
	if (!employee) {
		throw apiError(404, 'Data karyawan tidak ditemukan untuk akun ini.');
	}

	const pbForm = new FormData();
	pbForm.append('photo', photo, photo.name);

	const updated = await pocketbaseAdmin.updateRecord<EmployeeRecord>(
		'employees',
		employee.id,
		pbForm,
	);

	const photoUrl = updated.photo
		? `${PUBLIC_PB_PREFIX}/api/files/employees/${updated.id}/${updated.photo}`
		: '';

	return json({ ok: true, photoUrl });
});
