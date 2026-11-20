/**
 * Katalog dan penegakan fitur aplikasi (feature flags).
 *
 * Admin Pusat dapat mengaktifkan/menonaktifkan modul aplikasi dari panel
 * `/admin-pusat`. Status fitur tersimpan di koleksi PocketBase `feature_flags`
 * (baca publik, tulis hanya lewat rute server Admin Pusat). Klien membaca
 * sekali dan menyimpan cache di memori; `app.tsx` memuatnya di `clientLoader`
 * lalu menyaring menu sidebar dan menjaga rute yang dinonaktifkan.
 *
 * Fitur inti (dasbor, perusahaan, pengaturan, pengguna) selalu aktif dan tidak
 * dapat dinonaktifkan — tidak ada di katalog ini.
 */
import pb from '@/lib/pocketbase-client';
import { redirect } from 'react-router';
import type { AppPermission } from '@/data/user-roles';

export type FeatureKey =
	| 'penjualan'
	| 'pembelian'
	| 'kas_bank'
	| 'aset'
	| 'biaya'
	| 'kontak'
	| 'produk'
	| 'akun'
	| 'jurnal'
	| 'laporan'
	| 'payroll'
	| 'payroll_disbursement'
	| 'karyawan'
	| 'pajak'
	| 'chat'
	| 'parent';

export type FeatureCategory = 'Operasional' | 'Akuntansi' | 'SDM' | 'Lainnya';

export interface FeatureDescriptor {
	key: FeatureKey;
	label: string;
	description: string;
	category: FeatureCategory;
}

/** Katalog fitur yang dapat diaktifkan/dinonaktifkan Admin Pusat. */
export const FEATURE_CATALOG: FeatureDescriptor[] = [
	{
		key: 'penjualan',
		label: 'Penjualan & POS',
		description: 'Catat penjualan, invoice, dan Point of Sales (POS) kasir.',
		category: 'Operasional',
	},
	{
		key: 'pembelian',
		label: 'Pembelian',
		description: 'Catat pembelian dari pemasok dan kelola hutang.',
		category: 'Operasional',
	},
	{
		key: 'kas_bank',
		label: 'Kas & Bank',
		description: 'Kelola transaksi kas, bank, dan rekonsiliasi.',
		category: 'Operasional',
	},
	{
		key: 'aset',
		label: 'Aset',
		description: 'Kelola aset tetap, depresiasi, dan daftar aset.',
		category: 'Operasional',
	},
	{
		key: 'biaya',
		label: 'Biaya',
		description: 'Catat pengeluaran biaya operasional perusahaan.',
		category: 'Operasional',
	},
	{
		key: 'kontak',
		label: 'Kontak',
		description: 'Kelola data pelanggan, pemasok, dan direktori karyawan.',
		category: 'Operasional',
	},
	{
		key: 'produk',
		label: 'Produk',
		description: 'Kelola produk, gudang, stok, dan stock opname.',
		category: 'Operasional',
	},
	{
		key: 'akun',
		label: 'Bagan Akun',
		description: 'Kelola bagan akun perusahaan.',
		category: 'Akuntansi',
	},
	{
		key: 'jurnal',
		label: 'Jurnal',
		description: 'Catat dan kelola jurnal umum perusahaan.',
		category: 'Akuntansi',
	},
	{
		key: 'laporan',
		label: 'Laporan',
		description: 'Lihat laporan keuangan perusahaan.',
		category: 'Akuntansi',
	},
	{
		key: 'payroll',
		label: 'Penggajian',
		description: 'Kelola penggajian, komponen gaji, pinjaman, dan slip gaji.',
		category: 'SDM',
	},
	{
		key: 'payroll_disbursement',
		label: 'Pencairan Gaji',
		description:
			'Aktifkan alur pencairan gaji (disbursement) pada menu Penggajian. Riwayat pencairan tetap tersimpan saat fitur dinonaktifkan.',
		category: 'SDM',
	},
	{
		key: 'karyawan',
		label: 'Karyawan (Self-service)',
		description: 'Portal self-service karyawan: absensi, lembur, cuti, dan pinjaman.',
		category: 'SDM',
	},
	{
		key: 'pajak',
		label: 'Pajak',
		description: 'Simulasi dan pengaturan pajak (PPh 21, e-Bupot).',
		category: 'Lainnya',
	},
	{
		key: 'chat',
		label: 'Chat',
		description: 'Pesan langsung dan grup antar anggota perusahaan dan Parent.',
		category: 'Lainnya',
	},
	{
		key: 'parent',
		label: 'Portal Parent',
		description: 'Portal orang tua siswa untuk melihat dan membayar tagihan invoice.',
		category: 'Lainnya',
	},
];

export const FEATURE_KEYS: FeatureKey[] = FEATURE_CATALOG.map(feature => feature.key);

export const FEATURE_LABELS: Record<FeatureKey, string> = Object.fromEntries(
	FEATURE_CATALOG.map(feature => [feature.key, feature.label]),
) as Record<FeatureKey, string>;

export const FEATURE_DESCRIPTIONS: Record<FeatureKey, string> = Object.fromEntries(
	FEATURE_CATALOG.map(feature => [feature.key, feature.description]),
) as Record<FeatureKey, string>;

/**
 * Memetakan izin menu (AppPermission) ke kunci fitur. Izin inti
 * (dasbor, perusahaan, pengaturan, pengguna) tidak dipetakan — selalu aktif.
 * POS memakai izin `penjualan`, jadi fitur `penjualan` mengatur keduanya.
 */
export function featureKeyForPermission(permission: AppPermission): FeatureKey | null {
	if (
		permission === 'dasbor' ||
		permission === 'perusahaan' ||
		permission === 'pengaturan' ||
		permission === 'pengguna'
	) {
		return null;
	}
	return permission as FeatureKey;
}

// ─── Cache sisi klien ────────────────────────────────────────────────────────

let cachedFlags: Record<FeatureKey, boolean> | null = null;
let loadPromise: Promise<Record<FeatureKey, boolean>> | null = null;

// Cache hasil resolusi fitur per perusahaan (override per perusahaan
// menang atas default global). `currentCompanyId` menandai perusahaan aktif
// yang dipakai oleh `getFeatureFlags()` / `isFeatureEnabled()`.
let cachedCompanyFlags: Map<string, Record<FeatureKey, boolean>> = new Map();
let currentCompanyId: string | null = null;

function defaultFlags(): Record<FeatureKey, boolean> {
	// Default aman: bila belum dimuat, anggap semua fitur aktif agar fungsi
	// saat ini tidak terputus saat cache belum terisi.
	return Object.fromEntries(FEATURE_KEYS.map(key => [key, true])) as Record<FeatureKey, boolean>;
}

function normalizeFlags(records: { feature: string; enabled: unknown }[]): Record<FeatureKey, boolean> {
	const flags = defaultFlags();
	for (const record of records) {
		const key = record.feature as FeatureKey;
		if (FEATURE_KEYS.includes(key)) {
			flags[key] = Boolean(record.enabled);
		}
	}
	return flags;
}

/**
 * Memuat status fitur dari PocketBase dan menyimpannya di cache. Aman dipanggil
 * berulang — pemanggilan paralel berbagi satu promise.
 */
export async function loadFeatureFlags(): Promise<Record<FeatureKey, boolean>> {
	if (cachedFlags) return cachedFlags;
	if (loadPromise) return loadPromise;

	loadPromise = pb
		.collection('feature_flags')
		.getFullList({ sort: 'created' })
		.then(records => {
			cachedFlags = normalizeFlags(
				records.map(record => ({
					feature: String(record.feature ?? ''),
					enabled: record.enabled,
				})),
			);
			return cachedFlags;
		})
		.catch(() => {
			// Jika gagal memuat, pakai default (semua aktif) agar aplikasi tetap
			// berfungsi. Cache tidak diisi agar percobaan berikutnya bisa berhasil.
			cachedFlags = defaultFlags();
			return cachedFlags;
		});

	return loadPromise;
}

/** Status fitur saat ini dari cache (default semua aktif bila belum dimuat). */
export function getFeatureFlags(): Record<FeatureKey, boolean> {
	if (currentCompanyId && cachedCompanyFlags.has(currentCompanyId)) {
		return cachedCompanyFlags.get(currentCompanyId)!;
	}
	return cachedFlags ?? defaultFlags();
}

/** Apakah sebuah fitur sedang aktif. */
export function isFeatureEnabled(feature: FeatureKey): boolean {
	return getFeatureFlags()[feature] ?? true;
}

/**
 * Apakah sebuah izin menu diizinkan oleh status fitur global. Izin inti
 * selalu diizinkan.
 */
export function featureAllowsPermission(permission: AppPermission): boolean {
	const key = featureKeyForPermission(permission);
	if (!key) return true;
	return isFeatureEnabled(key);
}

/**
 * Memuat status fitur per perusahaan dari PocketBase dan menyimpannya di
 * cache. Override per perusahaan menang atas default global. Aman dipanggil
 * berulang untuk perusahaan yang sama — mengembalikan cache yang sudah ada.
 */
export async function loadCompanyFeatureFlags(
	companyId: string,
): Promise<Record<FeatureKey, boolean>> {
	currentCompanyId = companyId;
	if (cachedCompanyFlags.has(companyId)) return cachedCompanyFlags.get(companyId)!;

	// Pastikan default global sudah dimuat sebelum menggabungkan override.
	await loadFeatureFlags();

	try {
		const records = await pb.collection('company_feature_flags').getFullList({
			filter: pb.filter('company = {:id}', { id: companyId }),
			sort: 'created',
		});
		const resolved: Record<FeatureKey, boolean> = { ...getFeatureFlags() };
		for (const record of records) {
			const key = record.feature as FeatureKey;
			if (FEATURE_KEYS.includes(key)) resolved[key] = Boolean(record.enabled);
		}
		cachedCompanyFlags.set(companyId, resolved);
		return resolved;
	} catch {
		// Jika gagal memuat override, pakai default global agar aplikasi tetap
		// berfungsi.
		const resolved = getFeatureFlags();
		cachedCompanyFlags.set(companyId, resolved);
		return resolved;
	}
}

/** Reset cache (untuk pengujian atau setelah perubahan admin). */
export function resetFeatureFlagsCache(): void {
	cachedFlags = null;
	loadPromise = null;
	cachedCompanyFlags = new Map();
	currentCompanyId = null;
}

/**
 * Memastikan fitur Portal Parent aktif untuk perusahaan tempat Parent
 * terdaftar. Dipanggil di `clientLoader` rute parent; melempar redirect ke
 * beranda bila Admin Pusat menonaktifkan fitur tersebut untuk perusahaan itu.
 */
export async function requireParentFeatureEnabled(): Promise<void> {
	const parent = pb.authStore.record as { company?: string } | null;
	const companyId = parent?.company;
	if (companyId) {
		await loadCompanyFeatureFlags(companyId);
	} else {
		await loadFeatureFlags();
	}
	if (!isFeatureEnabled('parent')) {
		throw redirect('/');
	}
}
