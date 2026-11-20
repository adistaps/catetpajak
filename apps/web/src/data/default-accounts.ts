import type { AccountType } from '@/lib/accounting';

export interface DefaultAccount {
	code: string;
	name: string;
	type: AccountType;
}

/** Bagan akun standar yang otomatis dibuat untuk setiap perusahaan baru. */
export const DEFAULT_ACCOUNTS: DefaultAccount[] = [
	{ code: '101', name: 'Kas', type: 'aset' },
	{ code: '102', name: 'Bank', type: 'aset' },
	{ code: '103', name: 'Piutang Usaha', type: 'aset' },
	{ code: '104', name: 'Persediaan', type: 'aset' },
	{ code: '105', name: 'Peralatan', type: 'aset' },
	{ code: '106', name: 'Akumulasi Penyusutan', type: 'aset' },
	{ code: '201', name: 'Utang Usaha', type: 'liabilitas' },
	{ code: '202', name: 'Utang Bank', type: 'liabilitas' },
	{ code: '203', name: 'Utang Gaji', type: 'liabilitas' },
	{ code: '204', name: 'Utang BPJS', type: 'liabilitas' },
	{ code: '205', name: 'Utang PPh 21', type: 'liabilitas' },
	{ code: '207', name: 'PPN Keluaran', type: 'liabilitas' },
	{ code: '208', name: 'PPN Masukan', type: 'aset' },
	{ code: '301', name: 'Modal Pemilik', type: 'ekuitas' },
	{ code: '302', name: 'Laba Ditahan', type: 'ekuitas' },
	{ code: '303', name: 'Selisih Revaluasi Aset', type: 'ekuitas' },
	{ code: '401', name: 'Pendapatan Penjualan', type: 'pendapatan' },
	{ code: '402', name: 'Pendapatan Jasa', type: 'pendapatan' },
	{ code: '403', name: 'Potongan Penjualan', type: 'pendapatan' },
	{ code: '404', name: 'Pendapatan Denda', type: 'pendapatan' },
	{ code: '501', name: 'Beban Gaji', type: 'beban' },
	{ code: '502', name: 'Beban Sewa', type: 'beban' },
	{ code: '503', name: 'Beban Operasional', type: 'beban' },
	{ code: '504', name: 'Beban Penyusutan', type: 'beban' },
];
