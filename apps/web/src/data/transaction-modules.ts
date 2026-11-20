import type { AccountType } from '@/lib/accounting';
import type { ContactType } from '@/lib/contacts';
import type { TransactionCategory } from '@/lib/transactions';

export interface TransactionModuleConfig {
	key: TransactionCategory;
	title: string;
	subtitle: string;
	/** Label kolom mitra bebas, atau null bila modul tidak memerlukan mitra. */
	partnerLabel: string | null;
	/** Tipe kontak yang bisa dipilih, atau null bila modul memakai teks bebas. */
	contactType: ContactType | null;
	/** Bila true, kontak tidak wajib dipilih sebelum menyimpan. */
	contactOptional?: boolean;
	/** Tampilkan pilihan produk, kuantitas, diskon, dan pajak. */
	allowProduct: boolean;
	debitLabel: string;
	creditLabel: string;
	/** Urutan tipe akun yang dipakai sebagai default akun debit. */
	debitPref: AccountType[];
	/** Urutan tipe akun yang dipakai sebagai default akun kredit. */
	creditPref: AccountType[];
}

export const TRANSACTION_MODULES: Record<TransactionCategory, TransactionModuleConfig> = {
	penjualan: {
		key: 'penjualan',
		title: 'Penjualan',
		subtitle: 'Catat penjualan ke pelanggan — kas/piutang didebit, pendapatan dikredit.',
		partnerLabel: null,
		contactType: 'customer',
		allowProduct: true,
		debitLabel: 'Akun Debit (Kas/Piutang)',
		creditLabel: 'Akun Kredit (Pendapatan)',
		debitPref: ['aset'],
		creditPref: ['pendapatan'],
	},
	pembelian: {
		key: 'pembelian',
		title: 'Pembelian',
		subtitle: 'Catat pembelian dari pemasok — aset/beban didebit, kas/utang dikredit.',
		partnerLabel: null,
		contactType: 'supplier',
		allowProduct: true,
		debitLabel: 'Akun Debit (Pembelian)',
		creditLabel: 'Akun Kredit (Kas/Utang)',
		debitPref: ['aset', 'beban'],
		creditPref: ['liabilitas', 'aset'],
	},
	kas_bank: {
		key: 'kas_bank',
		title: 'Kas & Bank',
		subtitle: 'Catat penerimaan, pengeluaran, atau pemindahan dana antar akun kas/bank.',
		partnerLabel: null,
		contactType: null,
		allowProduct: false,
		debitLabel: 'Akun Debit',
		creditLabel: 'Akun Kredit',
		debitPref: ['aset'],
		creditPref: ['aset'],
	},
	aset: {
		key: 'aset',
		title: 'Aset',
		subtitle: 'Catat perolehan aset — aset didebit, kas/utang dikredit.',
		partnerLabel: 'Pemasok',
		contactType: null,
		allowProduct: false,
		debitLabel: 'Akun Aset (Debit)',
		creditLabel: 'Sumber Dana (Kredit)',
		debitPref: ['aset'],
		creditPref: ['aset', 'liabilitas'],
	},
	biaya: {
		key: 'biaya',
		title: 'Biaya',
		subtitle: 'Catat pengeluaran biaya operasional — beban didebit, kas/utang dikredit.',
		partnerLabel: null,
		contactType: 'supplier',
		contactOptional: true,
		allowProduct: false,
		debitLabel: 'Akun Beban (Debit)',
		creditLabel: 'Sumber Dana (Kredit)',
		debitPref: ['beban'],
		creditPref: ['aset', 'liabilitas'],
	},
};
