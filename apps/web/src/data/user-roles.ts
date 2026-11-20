export type AppPermission =
	| 'dasbor'
	| 'penjualan'
	| 'pembelian'
	| 'kas_bank'
	| 'aset'
	| 'biaya'
	| 'kontak'
	| 'produk'
	| 'perusahaan'
	| 'akun'
	| 'jurnal'
	| 'laporan'
	| 'pengguna'
	| 'payroll'
	| 'pajak'
	| 'karyawan'
	| 'pengaturan'
	| 'management'
	| 'chat';

export type MemberRole =
	| 'pemilik'
	| 'admin'
	| 'akuntan'
	| 'finance'
	| 'hr'
	| 'pembaca'
	| 'karyawan'
	| 'kasir'
	| 'custom';

export const ALL_PERMISSIONS: AppPermission[] = [
	'dasbor',
	'penjualan',
	'pembelian',
	'kas_bank',
	'aset',
	'biaya',
	'kontak',
	'produk',
	'perusahaan',
	'akun',
	'jurnal',
	'laporan',
	'pengguna',
	'payroll',
	'pajak',
	'karyawan',
	'pengaturan',
	'management',
	'chat',
];

export const PERMISSION_LABELS: Record<AppPermission, string> = {
	dasbor: 'Dasbor',
	penjualan: 'Penjualan',
	pembelian: 'Pembelian',
	kas_bank: 'Kas & Bank',
	aset: 'Aset',
	biaya: 'Biaya',
	kontak: 'Kontak',
	produk: 'Produk',
	perusahaan: 'Perusahaan',
	akun: 'Bagan Akun',
	jurnal: 'Jurnal',
	laporan: 'Laporan',
	pengguna: 'Pengguna',
	payroll: 'Penggajian',
	pajak: 'Pajak',
	karyawan: 'Karyawan (Self-service)',
	pengaturan: 'Pengaturan',
	management: 'Management',
	chat: 'Chat',
};

export const ROLE_DEFINITIONS: Record<
	Exclude<MemberRole, 'custom'>,
	{
		label: string;
		description: string[];
		permissions: AppPermission[];
		canEdit: boolean;
	}
> = {
	pemilik: {
		label: 'Pemilik',
		description: [
			'Mengakses semua menu dan fitur tanpa batasan.',
			'Mengelola pengguna, perusahaan, dan langganan.',
		],
		permissions: [...ALL_PERMISSIONS],
		canEdit: true,
	},
	admin: {
		label: 'Admin',
		description: [
			'Mengakses semua menu dan fitur tanpa batasan.',
			'Mengelola pengguna dan seluruh data perusahaan.',
		],
		permissions: [...ALL_PERMISSIONS],
		canEdit: true,
	},
	akuntan: {
		label: 'Akuntan',
		description: [
			'Mengakses semua menu, kecuali Penggajian.',
			'Mencatat transaksi, mengelola akun, dan melihat laporan.',
		],
		permissions: ALL_PERMISSIONS.filter(p => p !== 'payroll'),
		canEdit: true,
	},
	finance: {
		label: 'Finance',
		description: [
			'Hanya dapat mengakses menu Penggajian dan data karyawan.',
			'Menghitung gaji, komponen payroll, pinjaman, dan pengaturan gaji.',
		],
		permissions: ['dasbor', 'payroll', 'kontak', 'chat'],
		canEdit: true,
	},
	hr: {
		label: 'HR',
		description: [
			'Hanya dapat mengakses employee directory, attendance, overtime, dan cuti.',
			'Mengelola data karyawan, kehadiran, lembur, dan permintaan cuti.',
		],
		permissions: ['dasbor', 'payroll', 'kontak', 'management', 'chat'],
		canEdit: true,
	},
	pembaca: {
		label: 'Pembaca Laporan',
		description: ['Melihat semua laporan.'],
		permissions: ['dasbor', 'laporan', 'chat'],
		canEdit: false,
	},
	karyawan: {
		label: 'Karyawan',
		description: [
			'Akses self-service: live attendance (clock in/out).',
			'Mengajukan permintaan overtime.',
			'Mengajukan permintaan pinjaman.',
		],
		permissions: ['dasbor', 'karyawan'],
		canEdit: false,
	},
	kasir: {
		label: 'Kasir',
		description: [
			'Hanya dapat mengakses Point of Sales (POS).',
			'Mencatat penjualan kasir, menerima pembayaran, menahan pesanan, dan mengelola meja dine-in.',
		],
		permissions: ['dasbor', 'penjualan'],
		canEdit: true,
	},
};

export const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
	{ value: 'pemilik', label: 'Pemilik' },
	{ value: 'admin', label: 'Admin' },
	{ value: 'akuntan', label: 'Akuntan' },
	{ value: 'finance', label: 'Finance' },
	{ value: 'hr', label: 'HR' },
	{ value: 'kasir', label: 'Kasir' },
	{ value: 'custom', label: 'Custom' },
];

export function permissionsForRole(role: MemberRole, custom?: AppPermission[]): AppPermission[] {
	if (role === 'custom') return custom?.length ? custom : ['dasbor', 'laporan'];
	return [...ROLE_DEFINITIONS[role].permissions];
}

export function canEditForRole(role: MemberRole, canEdit?: boolean): boolean {
	if (role === 'custom') return Boolean(canEdit);
	if (role === 'pembaca' || role === 'karyawan') return false;
	return true;
}

/** Roles that always imply full menu access regardless of stored permissions. */
export function isFullAccessRole(role: MemberRole | null | undefined): boolean {
	return role === 'pemilik' || role === 'admin';
}

/** True when the role is restricted to the POS module (kasir). */
export function isKasirRole(role: MemberRole | null | undefined): boolean {
	return role === 'kasir';
}

/**
 * Which tabs of the Penggajian module the role may use.
 * - full: semua tab (pemilik, admin, finance, custom dengan izin payroll)
 * - hr: hanya Overtime dan Cuti
 * - none: tidak boleh membuka menu Penggajian
 */
export type PayrollScope = 'full' | 'hr' | 'none';

export function payrollScopeForRole(
	role: MemberRole | null | undefined,
	permissions?: AppPermission[],
): PayrollScope {
	if (isFullAccessRole(role)) return 'full';
	if (role === 'finance') return 'full';
	if (role === 'hr') return 'hr';
	if (role === 'custom') return permissions?.includes('payroll') ? 'full' : 'none';
	return 'none';
}

/** True when the Kontak module is limited to the employee directory tab. */
export function kontakDirectoryOnly(role: MemberRole | null | undefined): boolean {
	return role === 'finance' || role === 'hr';
}

/**
 * Which side sections of the employee directory the role may use.
 * - full: semua (list, transfer, resignation, import/export, PTKP, attendance)
 * - hr: employee list + seluruh menu attendance
 * - finance: hanya employee list
 */
export type EmployeeDirectoryScope = 'full' | 'hr' | 'finance';

export function employeeDirectoryScopeForRole(
	role: MemberRole | null | undefined,
): EmployeeDirectoryScope {
	if (role === 'hr') return 'hr';
	if (role === 'finance') return 'finance';
	return 'full';
}

/** Map route path segment under /app to permission key */
export const ROUTE_PERMISSION: Record<string, AppPermission> = {
	'': 'dasbor',
	dasbor: 'dasbor',
	penjualan: 'penjualan',
	pos: 'penjualan',
	pembelian: 'pembelian',
	'kas-bank': 'kas_bank',
	aset: 'aset',
	biaya: 'biaya',
	kontak: 'kontak',
	produk: 'produk',
	perusahaan: 'perusahaan',
	akun: 'akun',
	jurnal: 'jurnal',
	laporan: 'laporan',
	pengguna: 'pengguna',
	payroll: 'payroll',
	pajak: 'pajak',
	karyawan: 'karyawan',
	pengaturan: 'pengaturan',
	management: 'management',
	chat: 'chat',
};
