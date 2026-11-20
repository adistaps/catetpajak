import { withApi, apiError, json, readFormData, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { siteOrigin } from '@/lib/site-origin.server';

/**
 * Public PocketBase reverse-proxy prefix on the published site. File URLs must
 * be absolute so the admin panel can preview uploaded promo images.
 */
const PB_PUBLIC_PREFIX = '/hcgi/platform';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PromoRecord {
	id: string;
	image: string;
	banner_url: string;
	link: string;
	published: boolean;
	sort: number;
	created: string;
	updated: string;
}

export interface PromoSummary {
	id: string;
	imageUrl: string;
	link: string;
	published: boolean;
	sort: number;
	created: string;
}

function imageUrl(origin: string, rec: PromoRecord): string {
	if (rec.image) {
		return `${origin}${PB_PUBLIC_PREFIX}/api/files/promos/${rec.id}/${rec.image}`;
	}
	if (rec.banner_url) {
		return rec.banner_url;
	}
	return '';
}

function toSummary(origin: string, rec: PromoRecord): PromoSummary {
	return {
		id: rec.id,
		imageUrl: imageUrl(origin, rec),
		// Promos are always published — Admin Pusat only uploads images, and
		// every uploaded image must appear on the dashboard immediately.
		published: true,
		sort: typeof rec.sort === 'number' ? rec.sort : Number(rec.sort ?? 0),
		created: rec.created ?? '',
		link: rec.link ?? '',
	};
}

function validateImage(file: File) {
	if (file.size > MAX_IMAGE_BYTES) {
		throw apiError(422, 'Ukuran gambar maksimal 5MB.');
	}
	if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
		throw apiError(422, 'Format gambar harus JPG, PNG, atau WEBP.');
	}
}

/**
 * POST   /api/central-admin/promos — daftar seluruh promo.
 * PATCH  /api/central-admin/promos — unggah gambar baru (create) atau ganti
 *                                   gambar promo (update). Body multipart.
 *                                   Setiap promo otomatis terbit (published).
 * DELETE /api/central-admin/promos — hapus promo berdasarkan id.
 *
 * Non-GET agar respons per-admin tidak di-cache di edge. Hanya admin pusat.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);
	const origin = siteOrigin(request);

	if (request.method === 'POST') {
		const result = await pocketbaseAdmin.listRecords<PromoRecord>('promos', {
			sort: '-created',
			perPage: 200,
		});
		return json({ promos: result.items.map((rec) => toSummary(origin, rec)) });
	}

	if (request.method === 'DELETE') {
		const body = await readJsonBody<{ id?: string }>(request);
		const id = (body.id ?? '').trim();
		if (!id) throw apiError(422, 'ID promo wajib disertakan.');
		await pocketbaseAdmin.deleteRecord('promos', id);
		return json({ ok: true, id });
	}

	if (request.method === 'PATCH') {
		const form = await readFormData(request);
		const action = (form.get('action') as string | null)?.trim() ?? '';
		const sort = Number(form.get('sort') ?? 0) || 0;
		const file = form.get('image');

		if (action === 'create') {
			if (!file || !(file instanceof File)) {
				throw apiError(422, 'File gambar wajib diunggah.');
			}
			validateImage(file);

			const payload = new FormData();
			payload.append('image', file, file.name);
			// `title` wajib diisi pada koleksi promos. Karena Admin Pusat hanya
			// mengunggah gambar, isi dengan nama file (tanpa ekstensi) agar
			// rekaman benar-benar tersimpan — tanpa ini PocketBase menjawab 200
			// dengan body kosong dan tidak membuat rekaman apa pun.
			const title = file.name.replace(/\.[^.]+$/, '').slice(0, 200) || 'Promo';
			payload.append('title', title);
			// Selalu terbit agar langsung tampil di dashboard.
			payload.append('published', 'true');
			payload.append('sort', String(sort));
			const link = (form.get('link') as string | null)?.trim() ?? '';
			payload.append('link', link);

			const rec = await pocketbaseAdmin.createRecord<PromoRecord>('promos', payload);
			return json({ promo: toSummary(origin, rec) });
		}

		if (action === 'update') {
			const id = (form.get('id') as string | null)?.trim() ?? '';
			if (!id) throw apiError(422, 'ID promo wajib disertakan.');

			const payload = new FormData();
			if (file && file instanceof File) {
				validateImage(file);
				payload.append('image', file, file.name);
			}
			// Tetap terbit setelah penggantian gambar — jangan diam-diam jadi Draft.
			payload.append('published', 'true');
			payload.append('sort', String(sort));
			const link = form.get('link');
			if (typeof link === 'string') {
				payload.append('link', link.trim());
			}

			const rec = await pocketbaseAdmin.updateRecord<PromoRecord>('promos', id, payload);
			return json({ promo: toSummary(origin, rec) });
		}

		throw apiError(422, 'Aksi tidak valid. Gunakan "create" atau "update".');
	}

	throw apiError(405, 'Metode tidak didukung.');
});
