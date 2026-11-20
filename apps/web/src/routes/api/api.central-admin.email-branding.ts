import { withApi, apiError, json, readFormData } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { siteOrigin } from '@/lib/site-origin.server';

/**
 * Public PocketBase reverse-proxy prefix on the published site. File URLs must
 * be absolute and publicly resolvable so email clients can load the logo
 * without authentication.
 */
const PB_PUBLIC_PREFIX = '/hcgi/platform';

interface BrandingRecord {
	id: string;
	logo: string;
	alt_text: string;
	updated: string;
}

export interface EmailBrandingSummary {
	logoUrl: string;
	altText: string;
	updated: string;
}

const logoUrl = (origin: string, record: { id: string; logo: string }): string =>
	`${origin}${PB_PUBLIC_PREFIX}/api/files/email_branding/${record.id}/${record.logo}`;

const listBranding = async (): Promise<BrandingRecord | null> => {
	const result = await pocketbaseAdmin.listRecords<BrandingRecord>('email_branding', {
		sort: '-updated',
		perPage: 1,
	});
	return result.items[0] ?? null;
};

/**
 * POST /api/central-admin/email-branding — baca gambar profil email saat ini.
 * PATCH /api/central-admin/email-branding — unggah/ganti gambar (multipart).
 * DELETE /api/central-admin/email-branding — hapus gambar.
 *
 * Non-GET agar respons per-admin tidak di-cache edge. Hanya admin pusat.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);
	const origin = siteOrigin(request);

	if (request.method === 'POST') {
		const rec = await listBranding();
		if (!rec || !rec.logo) return json({ branding: null });
		return json({
			branding: {
				logoUrl: logoUrl(origin, rec),
				altText: rec.alt_text ?? '',
				updated: rec.updated,
			} satisfies EmailBrandingSummary,
		});
	}

	if (request.method === 'DELETE') {
		const rec = await listBranding();
		if (rec) {
			await pocketbaseAdmin.deleteRecord('email_branding', rec.id);
		}
		return json({ ok: true });
	}

	if (request.method === 'PATCH') {
		const form = await readFormData(request);
		const file = form.get('logo');
		const altText = (form.get('altText') as string | null)?.trim() ?? '';

		if (!file || !(file instanceof File)) {
			throw apiError(422, 'File gambar wajib diunggah.');
		}
		if (file.size > 2 * 1024 * 1024) {
			throw apiError(422, 'Ukuran gambar maksimal 2MB.');
		}
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			throw apiError(422, 'Format gambar harus JPG, PNG, atau WEBP.');
		}

		const payload = new FormData();
		payload.append('logo', file, file.name);
		payload.append('alt_text', altText);

		const existing = await listBranding();
		const rec = existing
			? await pocketbaseAdmin.updateRecord<BrandingRecord>('email_branding', existing.id, payload)
			: await pocketbaseAdmin.createRecord<BrandingRecord>('email_branding', payload);

		return json({
			branding: {
				logoUrl: logoUrl(origin, rec),
				altText: rec.alt_text ?? '',
				updated: rec.updated,
			} satisfies EmailBrandingSummary,
		});
	}

	throw apiError(405, 'Metode tidak didukung.');
});
