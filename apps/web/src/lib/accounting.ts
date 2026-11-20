export type AccountType = 'aset' | 'liabilitas' | 'ekuitas' | 'pendapatan' | 'beban';

export interface Company {
	id: string;
	name: string;
	code: string;
	address: string;
	owner: string;
	created: string;
	/** Paket langganan perusahaan: starter, pro, atau enterprise. */
	plan?: 'starter' | 'pro' | 'enterprise';
	/** Status akses perusahaan; kosong berarti aktif. */
	access_status?: 'active' | 'suspended';
	/** Kuota karyawan kustom yang ditetapkan Admin Pusat. null = pakai batas paket. */
	employee_quota?: number | null;
	/** Batas invoice bulanan kustom yang ditetapkan Admin Pusat. null = pakai batas paket. */
	invoice_quota?: number | null;
	/**
	 * Tanggal berakhir langganan yang ditetapkan Admin Pusat (YYYY-MM-DD).
	 * Selama tanggal ini belum lewat, akses langganan perusahaan dianggap aktif.
	 */
	subscription_end?: string;
	/** Tanggal mulai pencatatan di jurnal; transaksi sebelum tanggal ini tidak memengaruhi saldo. */
	conversion_date?: string;
	/** Informasi rekening bank perusahaan untuk instruksi pembayaran manual. */
	bank_name?: string;
	account_holder?: string;
	account_number?: string;
	/** Nomor telepon perusahaan. */
	phone?: string;
	/** Email perusahaan; dipakai sebagai alamat pengirim saat mengirim invoice. */
	email?: string;
	/** Logo perusahaan (unggahan file gambar) untuk cetakan dokumen seperti payslip. */
	logo?: string;
}

export interface Account {
	id: string;
	company: string;
	code: string;
	name: string;
	type: AccountType;
	owner: string;
	opening_balance?: number;
	opening_balance_date?: string;
	/** Akun induk bila akun ini adalah sub-akun. */
	parent?: string;
	/** Akun pengelompokan (header), bukan akun posting. */
	is_header?: boolean;
	/**
	 * Pemetaan eksplisit kategori penyajian PSAK 118 (operasi, investasi,
	 * pendanaan, pajak). Kosong = pakai klasifikasi otomatis berdasarkan nama.
	 */
	psak118_category?: 'operasi' | 'investasi' | 'pendanaan' | 'pajak' | null;
}

export interface JournalEntry {
	id: string;
	company: string;
	account: string;
	date: string;
	description: string;
	debit: number;
	credit: number;
	owner: string;
	created: string;
	number?: string;
	/** Pengelompokan baris yang disimpan bersama sebagai satu transaksi jurnal. */
	group?: string;
	/** Transaksi sumber (invoice, biaya, kas) bila jurnal dibuat dari modul lain. */
	transaction?: string;
	/** Periode penggajian sumber bila jurnal dibuat dari Running Payroll. */
	payroll_run?: string;
	expand?: { account?: Account; payroll_run?: PayrollRunMeta };
}

/** Metadata minimal periode penggajian untuk expand jurnal payroll. */
export interface PayrollRunMeta {
	id: string;
	period?: string;
	pay_date?: string;
	description?: string;
	status?: string;
	total_gross?: number;
	total_deductions?: number;
	total_net?: number;
}

export interface JournalTransaction {
	id: string;
	date: string;
	number: string;
	lines: JournalEntry[];
	description: string;
	total: number;
}

function entryCreatedMs(entry: JournalEntry): number {
	const parsed = Date.parse(entry.created || '');
	return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Satu baris daftar = satu transaksi.
 * Baris baru dikelompokkan lewat `group` atau relasi `transaction`.
 * Baris lama tidak diubah: yang dibuat berdekatan pada tanggal yang sama
 * (satu simpan) digabung di tampilan saja.
 */
export function groupJournalEntries(entries: JournalEntry[]): JournalTransaction[] {
	const buckets = new Map<string, JournalEntry[]>();
	const loose: JournalEntry[] = [];

	for (const entry of entries) {
		const group = (entry.group || '').trim();
		const transaction = (entry.transaction || '').trim();
		if (group) {
			const key = `g:${group}`;
			const list = buckets.get(key) ?? [];
			list.push(entry);
			buckets.set(key, list);
		} else if (transaction) {
			const key = `t:${transaction}`;
			const list = buckets.get(key) ?? [];
			list.push(entry);
			buckets.set(key, list);
		} else {
			loose.push(entry);
		}
	}

	loose.sort((a, b) => entryCreatedMs(a) - entryCreatedMs(b) || (a.number || '').localeCompare(b.number || ''));
	let cluster: JournalEntry[] = [];
	const flush = () => {
		if (cluster.length === 0) return;
		buckets.set(`c:${cluster[0]?.id}`, cluster);
		cluster = [];
	};
	for (const entry of loose) {
		const previous = cluster[cluster.length - 1];
		const sameDate = previous && entry.date.slice(0, 10) === previous.date.slice(0, 10);
		const gap = previous ? Math.abs(entryCreatedMs(entry) - entryCreatedMs(previous)) : Number.POSITIVE_INFINITY;
		if (previous && sameDate && gap <= 4000) {
			cluster.push(entry);
		} else {
			flush();
			cluster = [entry];
		}
	}
	flush();

	const transactions = [...buckets.values()].map(lines => {
		const sorted = [...lines].sort(
			(a, b) => (a.number || '').localeCompare(b.number || '') || entryCreatedMs(a) - entryCreatedMs(b),
		);
		const debit = sorted.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
		const credit = sorted.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
		const descriptions = [
			...new Set(sorted.map(line => (line.description || '').trim()).filter(Boolean)),
		];
		const first = sorted[0];
		return {
			id: first?.id ?? '',
			date: first?.date ?? '',
			number: first?.number || '—',
			lines: sorted,
			description: descriptions.join(' · '),
			total: debit > 0 ? debit : credit,
		};
	});

	transactions.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
	return transactions;
}

/** Membuat nomor jurnal: JU-YYYY-### berdasarkan jumlah record tahun berjalan. */
export function buildJournalNumber(count: number, year = new Date().getFullYear()): string {
	const seq = String(count + 1).padStart(3, '0');
	return `JU-${year}-${seq}`;
}

export const ACCOUNT_TYPES: AccountType[] = ['aset', 'liabilitas', 'ekuitas', 'pendapatan', 'beban'];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
	aset: 'Aset',
	liabilitas: 'Liabilitas',
	ekuitas: 'Ekuitas',
	pendapatan: 'Pendapatan',
	beban: 'Beban',
};

/** Saldo normal: aset & beban bertambah di debit, lainnya di kredit. */
export function accountBalance(type: AccountType, debit: number, credit: number): number {
	return type === 'aset' || type === 'beban' ? debit - credit : credit - debit;
}

export function formatRupiah(value: number): string {
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		maximumFractionDigits: 0,
	}).format(value);
}

export function formatDate(value: string): string {
	const [year, month, day] = value.slice(0, 10).split('-');
	if (!year || !month || !day) return value;
	return `${day}/${month}/${year}`;
}

export function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Satu hari sebelum tanggal konversi — titik acuan saldo awal. */
export function dayBeforeIso(isoDate: string): string {
	const parts = isoDate.slice(0, 10).split('-').map(Number);
	const year = parts[0] ?? 1970;
	const month = parts[1] ?? 1;
	const day = parts[2] ?? 1;
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() - 1);
	return date.toISOString().slice(0, 10);
}

/**
 * Transaksi dengan tanggal sebelum tanggal konversi diabaikan untuk saldo berjalan.
 * Tanpa tanggal konversi, semua entri dihitung.
 */
export function filterEntriesByConversion(
	entries: JournalEntry[],
	conversionDate?: string | null,
): JournalEntry[] {
	if (!conversionDate) return entries;
	const cut = conversionDate.slice(0, 10);
	return entries.filter(entry => (entry.date || '').slice(0, 10) >= cut);
}

export interface AccountBalance {
	account: Account;
	debit: number;
	credit: number;
	balance: number;
}

/**
 * Akumulasi debit/kredit per akun + saldo awal.
 * Entri sebelum tanggal konversi tidak dihitung (cut-off saldo awal).
 */
export function computeBalances(
	accounts: Account[],
	entries: JournalEntry[],
	conversionDate?: string | null,
): AccountBalance[] {
	const relevant = filterEntriesByConversion(entries, conversionDate);
	const totals = new Map<string, { debit: number; credit: number }>();
	for (const entry of relevant) {
		const total = totals.get(entry.account) ?? { debit: 0, credit: 0 };
		total.debit += entry.debit || 0;
		total.credit += entry.credit || 0;
		totals.set(entry.account, total);
	}
	return accounts.map(account => {
		const total = totals.get(account.id) ?? { debit: 0, credit: 0 };
		const opening = account.opening_balance || 0;
		return {
			account,
			debit: total.debit,
			credit: total.credit,
			balance: opening + accountBalance(account.type, total.debit, total.credit),
		};
	});
}

/** Akun kas/setara kas (Kas, Bank) — dasar laporan arus kas & saldo kas. */
export function isCashAccount(account: Account): boolean {
	return account.type === 'aset' && /kas|bank/i.test(account.name);
}

/** Aset lancar = kas, piutang, persediaan; sisanya (peralatan dsb.) = aset tetap. */
export function isCurrentAsset(account: Account): boolean {
	if (account.type !== 'aset') return false;
	if (isCashAccount(account)) return true;
	return !/peralatan|tanah|bangunan|kendaraan|inventaris|aset tetap|akumulasi/i.test(account.name);
}

/** Format akuntansi: nilai negatif ditulis dalam tanda kurung, mis. (Rp 1.000). */
export function formatAccounting(value: number): string {
	const abs = Math.abs(value);
	const formatted = new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		maximumFractionDigits: 0,
	}).format(abs);
	return value < 0 ? `(${formatted})` : formatted;
}
