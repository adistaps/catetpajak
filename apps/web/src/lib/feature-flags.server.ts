/**
 * Helper server-only untuk membaca dan memperbarui status fitur. Memakai klien
 * superuser PocketBase sehingga rute Admin Pusat dapat membaca/menulis koleksi
 * `feature_flags` tanpa bergantung pada aturan koleksi.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { FEATURE_KEYS, type FeatureKey } from '@/lib/feature-flags';

type FeatureFlagRecord = {
	id: string;
	feature: string;
	enabled: boolean;
	updated: string;
};

export type FeatureFlag = {
	feature: FeatureKey;
	enabled: boolean;
};

function toFeatureFlag(record: FeatureFlagRecord): FeatureFlag {
	return {
		feature: (record.feature ?? '') as FeatureKey,
		enabled: Boolean(record.enabled),
	};
}

/** Seluruh status fitur. */
export async function getFeatureFlags(): Promise<FeatureFlag[]> {
	const result = await pocketbaseAdmin.listRecords<FeatureFlagRecord>('feature_flags', {
		page: 1,
		perPage: 100,
		sort: 'created',
	});
	return result.items.map(toFeatureFlag);
}

/** Status satu fitur; null bila tidak ditemukan. */
export async function getFeatureFlag(feature: FeatureKey): Promise<FeatureFlag | null> {
	const result = await pocketbaseAdmin.listRecords<FeatureFlagRecord>('feature_flags', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('feature = {:feature}', { feature }),
	});
	if (result.items.length === 0) return null;
	return toFeatureFlag(result.items[0]);
}

/** Memperbarui status aktif sebuah fitur. */
export async function setFeatureEnabled(
	feature: FeatureKey,
	enabled: boolean,
): Promise<FeatureFlag> {
	const result = await pocketbaseAdmin.listRecords<FeatureFlagRecord>('feature_flags', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('feature = {:feature}', { feature }),
	});

	if (result.items.length > 0) {
		const updated = await pocketbaseAdmin.updateRecord<FeatureFlagRecord>(
			'feature_flags',
			result.items[0].id,
			{ enabled },
		);
		return toFeatureFlag(updated);
	}

	const created = await pocketbaseAdmin.createRecord<FeatureFlagRecord>('feature_flags', {
		feature,
		enabled,
	});
	return toFeatureFlag(created);
}

/**
 * Apakah sebuah fitur sedang aktif menurut basis data. Dipakai rute server
 * untuk menegakkan akses fitur yang dinonaktifkan.
 */
export async function isFeatureEnabledServer(feature: FeatureKey): Promise<boolean> {
	const flag = await getFeatureFlag(feature);
	return flag?.enabled ?? true;
}

// ─── Fitur per perusahaan ────────────────────────────────────────────────────

type CompanyFeatureFlagRecord = {
	id: string;
	feature: string;
	enabled: boolean;
};

export type CompanyFeatureFlag = FeatureFlag & {
	/** True bila perusahaan ini menetapkan override sendiri (bukan default global). */
	customized: boolean;
};

/**
 * Daftar status fitur yang sudah diselesaikan untuk sebuah perusahaan:
 * override per perusahaan menang atas default global. Fitur tanpa override
 * memakai default global.
 */
export async function getCompanyFeatureFlags(companyId: string): Promise<CompanyFeatureFlag[]> {
	const globalFlags = await getFeatureFlags();
	const globalByFeature = new Map(globalFlags.map(flag => [flag.feature, flag.enabled]));

	let overrides: CompanyFeatureFlagRecord[] = [];
	if (companyId) {
		try {
			const result = await pocketbaseAdmin.listRecords<CompanyFeatureFlagRecord>(
				'company_feature_flags',
				{ filter: pocketbaseAdmin.filter('company = {:companyId}', { companyId }), perPage: 100, sort: 'feature' },
			);
			overrides = result.items;
		} catch {
			overrides = [];
		}
	}

	const overrideMap = new Map(overrides.map(item => [item.feature, Boolean(item.enabled)]));

	return FEATURE_KEYS.map(feature => ({
		feature,
		enabled: overrideMap.has(feature)
			? overrideMap.get(feature)!
			: (globalByFeature.get(feature) ?? true),
		customized: overrideMap.has(feature),
	}));
}

/** Upsert status aktif fitur untuk sebuah perusahaan. */
export async function setCompanyFeatureEnabled(
	companyId: string,
	feature: FeatureKey,
	enabled: boolean,
): Promise<FeatureFlag> {
	const result = await pocketbaseAdmin.listRecords<CompanyFeatureFlagRecord>(
		'company_feature_flags',
		{ filter: pocketbaseAdmin.filter('company = {:companyId} && feature = {:feature}', { companyId, feature }), perPage: 1 },
	);

	if (result.items.length > 0) {
		const updated = await pocketbaseAdmin.updateRecord<CompanyFeatureFlagRecord>(
			'company_feature_flags',
			result.items[0].id,
			{ enabled },
		);
		return { feature: (updated.feature ?? '') as FeatureKey, enabled: Boolean(updated.enabled) };
	}

	const created = await pocketbaseAdmin.createRecord<CompanyFeatureFlagRecord>(
		'company_feature_flags',
		{ company: companyId, feature, enabled },
	);
	return { feature: (created.feature ?? '') as FeatureKey, enabled: Boolean(created.enabled) };
}

/**
 * Menghapus override per perusahaan sehingga fitur kembali memakai default
 * global.
 */
export async function resetCompanyFeatureFlag(
	companyId: string,
	feature: FeatureKey,
): Promise<void> {
	const result = await pocketbaseAdmin.listRecords<CompanyFeatureFlagRecord>(
		'company_feature_flags',
		{ filter: pocketbaseAdmin.filter('company = {:companyId} && feature = {:feature}', { companyId, feature }), perPage: 1 },
	);
	for (const item of result.items) {
		await pocketbaseAdmin.deleteRecord('company_feature_flags', item.id);
	}
}

/**
 * Apakah sebuah fitur aktif untuk perusahaan tertentu. Override per perusahaan
 * menang atas default global. Dipakai rute server untuk menegakkan akses fitur
 * per perusahaan.
 */
export async function isCompanyFeatureEnabledServer(
	companyId: string,
	feature: FeatureKey,
): Promise<boolean> {
	if (!companyId) return isFeatureEnabledServer(feature);

	try {
		const result = await pocketbaseAdmin.listRecords<CompanyFeatureFlagRecord>(
			'company_feature_flags',
			{ filter: pocketbaseAdmin.filter('company = {:companyId} && feature = {:feature}', { companyId, feature }), perPage: 1 },
		);
		if (result.items.length > 0) return Boolean(result.items[0].enabled);
	} catch {
		// jatuh ke default global
	}
	return isFeatureEnabledServer(feature);
}

/** Validasi bahwa kunci fitur dikenal. */
export function isValidFeatureKey(feature: string): feature is FeatureKey {
	return (FEATURE_KEYS as string[]).includes(feature);
}
