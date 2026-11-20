import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import {
	getCompanyFeatureFlags,
	getFeatureFlags,
	isFeatureEnabledServer,
	isValidFeatureKey,
	resetCompanyFeatureFlag,
	setCompanyFeatureEnabled,
	setFeatureEnabled,
} from '@/lib/feature-flags.server';
import { FEATURE_CATALOG, FEATURE_LABELS, type FeatureKey } from '@/lib/feature-flags';

/**
 * POST /api/central-admin/feature-flags — daftar seluruh fitur beserta status.
 *   Body { company?: string } — bila diisi, kembalikan status yang sudah
 *   diselesaikan untuk perusahaan tersebut (override menang atas default
 *   global). Tanpa `company`, kembalikan default global.
 *
 * PATCH /api/central-admin/feature-flags — aktifkan/nonaktifkan satu fitur.
 *   Body { feature, enabled, company? } — bila `company` diisi, ubah override
 *   per perusahaan; tanpa `company`, ubah default global.
 *   Body { feature, company, reset: true } — hapus override per perusahaan
 *   sehingga fitur kembali memakai default global.
 *
 * Non-GET agar respons per-admin tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const body = await readJsonBody<{ company?: string }>(request).catch(() => ({} as { company?: string }));
		const companyId = body.company?.trim();

		if (companyId) {
			const flags = await getCompanyFeatureFlags(companyId);
			const byKey = new Map(flags.map(flag => [flag.feature, flag]));
			return json({
				company: companyId,
				features: FEATURE_CATALOG.map(descriptor => {
					const flag = byKey.get(descriptor.key);
					return {
						feature: descriptor.key,
						label: descriptor.label,
						description: descriptor.description,
						category: descriptor.category,
						enabled: flag?.enabled ?? true,
						customized: flag?.customized ?? false,
					};
				}),
			});
		}

		const flags = await getFeatureFlags();
		const byKey = new Map(flags.map(flag => [flag.feature, flag.enabled]));
		return json({
			features: FEATURE_CATALOG.map(descriptor => ({
				feature: descriptor.key,
				label: descriptor.label,
				description: descriptor.description,
				category: descriptor.category,
				enabled: byKey.get(descriptor.key) ?? true,
				customized: false,
			})),
		});
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{
			feature?: string;
			enabled?: boolean;
			company?: string;
			reset?: boolean;
		}>(request);
		const feature = (body.feature ?? '') as FeatureKey;
		if (!isValidFeatureKey(feature)) {
			throw apiError(422, 'Fitur tidak valid.');
		}
		const companyId = body.company?.trim();

		if (companyId && body.reset) {
			await resetCompanyFeatureFlag(companyId, feature);
			// Setelah override dihapus, kembalikan status default global yang
			// sebenarnya — bukan selalu `true`.
			const enabled = await isFeatureEnabledServer(feature);
			return json({
				feature: {
					feature,
					label: FEATURE_LABELS[feature],
					enabled,
					customized: false,
				},
			});
		}

		if (companyId) {
			const updated = await setCompanyFeatureEnabled(companyId, feature, Boolean(body.enabled));
			return json({
				feature: {
					feature: updated.feature,
					label: FEATURE_LABELS[updated.feature],
					enabled: updated.enabled,
					customized: true,
				},
			});
		}

		const updated = await setFeatureEnabled(feature, Boolean(body.enabled));
		return json({
			feature: {
				feature: updated.feature,
				label: FEATURE_LABELS[updated.feature],
				enabled: updated.enabled,
				customized: false,
			},
		});
	}

	throw apiError(405, 'Metode tidak didukung.');
});
