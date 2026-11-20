import {
	computeBalances,
	isCashAccount,
	isCurrentAsset,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';

/**
 * Klasifikasi akun untuk analisis rasio keuangan. Mengandalkan nama akun karena
 * bagan akun sederhana (tipe: aset/liabilitas/ekuitas/pendapatan/beban) tidak
 * membedakan aset lancar vs tetap, atau liabilitas lancar vs jangka panjang.
 */

/** Kas & setara kas (Kas, Bank). */
export function isCashEquivalent(account: Account): boolean {
	return isCashAccount(account);
}

/** Piutang: akun aset yang namanya mengandung "piutang". */
export function isReceivable(account: Account): boolean {
	return account.type === 'aset' && /piutang/i.test(account.name);
}

/** Persediaan: akun aset yang namanya mengandung persediaan/inventory/stok/barang dagang. */
export function isInventory(account: Account): boolean {
	return (
		account.type === 'aset' &&
		/persediaan|inventory|stok|barang dagang/i.test(account.name)
	);
}

/** Liabilitas jangka panjang: namanya menyebut "jangka panjang". */
export function isLongTermLiability(account: Account): boolean {
	return account.type === 'liabilitas' && /jangka\s*panjang/i.test(account.name);
}

/** Liabilitas lancar: liabilitas selain jangka panjang. */
export function isCurrentLiability(account: Account): boolean {
	return account.type === 'liabilitas' && !isLongTermLiability(account);
}

/** Aset tetap: aset non-lancar (peralatan, bangunan, kendaraan, dll). */
export function isFixedAsset(account: Account): boolean {
	return account.type === 'aset' && !isCurrentAsset(account);
}

/** Harga Pokok Penjualan (HPP): beban dengan nama HPP/harga pokok/pokok penjualan. */
export function isCostOfGoodsSold(account: Account): boolean {
	return (
		account.type === 'beban' &&
		/hpp|harga\s*pokok|pokok\s*penjualan|cogs/i.test(account.name)
	);
}

export interface RatioFigures {
	/** Saldo akun per tipe (kumulatif sejak tanggal konversi — posisi neraca). */
	totalAssets: number;
	totalLiabilities: number;
	totalEquity: number;
	currentAssets: number;
	currentLiabilities: number;
	cash: number;
	receivables: number;
	inventory: number;
	fixedAssets: number;
	/** Arus periode (laba rugi). */
	revenue: number;
	expenses: number;
	cogs: number;
	netIncome: number;
}

export interface RatioResult {
	id: string;
	name: string;
	/** Rumus singkat yang ditampilkan ke pengguna. */
	formula: string;
	/** Nilai terformat, mis. "1,50x", "150%", "12,3%". Kosong bila tidak tersedia. */
	value: string | null;
	/** Angka mentah untuk pewarnaan/penilaian. */
	numeric: number | null;
	/** Satuan tampilan: 'ratio' (x), 'percent' (%). */
	unit: 'ratio' | 'percent';
	description: string;
	/** Cara membaca hasil. */
	interpretation: string;
	/** Apakah data cukup untuk menghitung. */
	available: boolean;
	/** Alasan data belum mencukupi. */
	reason: string | null;
}

export interface RatioCategory {
	id: string;
	title: string;
	description: string;
	ratios: RatioResult[];
}

/** Format angka Indonesia dengan 2 desimal. */
function formatDecimal(value: number, decimals = 2): string {
	return new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(value);
}

function ratioValue(numeric: number | null, unit: 'ratio' | 'percent'): string | null {
	if (numeric === null || !Number.isFinite(numeric)) return null;
	if (unit === 'percent') return `${formatDecimal(numeric * 100)}%`;
	return `${formatDecimal(numeric)}x`;
}

function buildRatio(
	id: string,
	name: string,
	formula: string,
	numeric: number | null,
	unit: 'ratio' | 'percent',
	description: string,
	interpretation: string,
	reason: string | null = null,
): RatioResult {
	const available = numeric !== null && Number.isFinite(numeric);
	return {
		id,
		name,
		formula,
		value: ratioValue(numeric, unit),
		numeric,
		unit,
		description,
		interpretation,
		available,
		reason: available ? null : reason,
	};
}

export interface RatioPeriod {
	start: string | null;
	end: string | null;
	label: string;
}

/**
 * Menghitung seluruh figur dasar dari akun & entri jurnal.
 * Posisi neraca (aset, liabilitas, ekuitas, kas, piutang, persediaan) dihitung
 * kumulatif sejak tanggal konversi (point-in-time). Arus laba rugi (pendapatan,
 * beban, HPP) dihitung untuk `period` yang dipilih.
 */
export function computeRatioFigures(
	accounts: Account[],
	entries: JournalEntry[],
	conversionDate?: string | null,
	period: RatioPeriod = { start: null, end: null, label: 'Semua periode' },
): RatioFigures {
	const balances = computeBalances(accounts, entries, conversionDate);

	let totalAssets = 0;
	let totalLiabilities = 0;
	let totalEquity = 0;
	let currentAssets = 0;
	let currentLiabilities = 0;
	let cash = 0;
	let receivables = 0;
	let inventory = 0;
	let fixedAssets = 0;

	for (const row of balances) {
		const { account, balance } = row;
		const value = balance || 0;
		switch (account.type) {
			case 'aset':
				totalAssets += value;
				if (isCashEquivalent(account)) cash += value;
				if (isReceivable(account)) receivables += value;
				if (isInventory(account)) inventory += value;
				if (isCurrentAsset(account)) currentAssets += value;
				else fixedAssets += value;
				break;
			case 'liabilitas':
				totalLiabilities += value;
				if (isCurrentLiability(account)) currentLiabilities += value;
				break;
			case 'ekuitas':
				totalEquity += value;
				break;
			default:
				break;
		}
	}

	// Arus laba rugi untuk periode terpilih (dihormati cut-off konversi).
	const cut = conversionDate ? conversionDate.slice(0, 10) : null;
	const start = period.start ? period.start.slice(0, 10) : null;
	const end = period.end ? period.end.slice(0, 10) : null;

	let revenue = 0;
	let expenses = 0;
	let cogs = 0;

	for (const entry of entries) {
		const d = (entry.date || '').slice(0, 10);
		if (cut && d < cut) continue;
		if (start && d < start) continue;
		if (end && d > end) continue;
		const account = accounts.find(a => a.id === entry.account);
		if (!account) continue;
		const debit = entry.debit || 0;
		const credit = entry.credit || 0;
		if (account.type === 'pendapatan') {
			revenue += credit - debit;
		} else if (account.type === 'beban') {
			const amount = debit - credit;
			expenses += amount;
			if (isCostOfGoodsSold(account)) cogs += amount;
		}
	}

	const netIncome = revenue - expenses;

	return {
		totalAssets,
		totalLiabilities,
		totalEquity,
		currentAssets,
		currentLiabilities,
		cash,
		receivables,
		inventory,
		fixedAssets,
		revenue,
		expenses,
		cogs,
		netIncome,
	};
}

/**
 * Membangun seluruh kategori rasio keuangan dari figur dasar.
 * Bila data pembagi nol atau belum tersedia, rasio ditandai tidak tersedia
 * dengan alasan yang jelas — tidak ada angka rekaan.
 */
export function buildRatioCategories(figures: RatioFigures): RatioCategory[] {
	const f = figures;

	const likuiditas: RatioResult[] = [
		buildRatio(
			'rasio-lancar',
			'Rasio Lancar (Current Ratio)',
			'Aset Lancar ÷ Liabilitas Lancar',
			f.currentLiabilities > 0 ? f.currentAssets / f.currentLiabilities : null,
			'ratio',
			'Mengukur kemampuan perusahaan membayar liabilitas jangka pendek dengan aset lancar.',
			'Nilai > 1x berarti aset lancar cukup menutup utang jangka pendek. Semakin tinggi semakin likuid, namun terlalu tinggi dapat menandakan aset menganggur.',
			f.currentLiabilities > 0
				? null
				: 'Belum ada liabilitas lancar (utang jangka pendek) tercatat.',
		),
		buildRatio(
			'rasio-cepat',
			'Rasio Cepat (Quick Ratio)',
			'(Aset Lancar − Persediaan) ÷ Liabilitas Lancar',
			f.currentLiabilities > 0 ? (f.currentAssets - f.inventory) / f.currentLiabilities : null,
			'ratio',
			'Mengukur likuiditas tanpa mengandalkan persediaan (aset paling sulit dicairkan).',
			'Nilai ≥ 1x menunjukkan likuiditas sehat tanpa menjual persediaan. Di bawah 1x berarti perusahaan bergantung pada penjualan persediaan untuk membayar utang jangka pendek.',
			f.currentLiabilities > 0
				? null
				: 'Belum ada liabilitas lancar (utang jangka pendek) tercatat.',
		),
		buildRatio(
			'rasio-kas',
			'Rasio Kas (Cash Ratio)',
			'(Kas + Bank) ÷ Liabilitas Lancar',
			f.currentLiabilities > 0 ? f.cash / f.currentLiabilities : null,
			'ratio',
			'Mengukur kemampuan membayar utang jangka pendek murni dengan kas & setara kas.',
			'Nilai tinggi berarti posisi kas sangat kuat untuk immediately membayar kewajiban jangka pendek. Terlalu rendah berisiko kesulitan kas.',
			f.currentLiabilities > 0
				? null
				: 'Belum ada liabilitas lancar (utang jangka pendek) tercatat.',
		),
	];

	const solvabilitas: RatioResult[] = [
		buildRatio(
			'debt-to-asset',
			'Debt to Asset Ratio (DAR)',
			'Total Liabilitas ÷ Total Aset',
			f.totalAssets > 0 ? f.totalLiabilities / f.totalAssets : null,
			'percent',
			'Mengukur persentase aset yang dibiayai utang (tingkat utang).',
			'Semakin rendah semakin aman. Di atas 50% menandakan ketergantungan tinggi pada utang; di bawah 30% umumnya dianggap sehat.',
			f.totalAssets > 0 ? null : 'Belum ada aset tercatat.',
		),
		buildRatio(
			'debt-to-equity',
			'Debt to Equity Ratio (DER)',
			'Total Liabilitas ÷ Total Ekuitas',
			f.totalEquity > 0 ? f.totalLiabilities / f.totalEquity : null,
			'ratio',
			'Mengukur perbandingan utang terhadap modal pemilik.',
			'Semakin tinggi semakin berisiko. Di atas 2x menandakan utang jauh melebihi modal; di bawah 1x umumnya dianggap konservatif.',
			f.totalEquity > 0 ? null : 'Belum ada ekuitas (modal) tercatat.',
		),
		buildRatio(
			'equity-ratio',
			'Rasio Pendanaan Sendiri (Equity Ratio)',
			'Total Ekuitas ÷ Total Aset',
			f.totalAssets > 0 ? f.totalEquity / f.totalAssets : null,
			'percent',
			'Mengukur persentase aset yang dibiayai modal sendiri.',
			'Semakin tinggi semakin mandiri secara pendanaan. Di atas 50% menunjukkan struktur modal yang kuat dan rendah utang.',
			f.totalAssets > 0 ? null : 'Belum ada aset tercatat.',
		),
	];

	const profitabilitas: RatioResult[] = [
		buildRatio(
			'net-profit-margin',
			'Margin Laba Bersih (NPM)',
			'Laba Bersih ÷ Pendapatan',
			f.revenue > 0 ? f.netIncome / f.revenue : null,
			'percent',
			'Mengukur persentase laba bersih dari setiap rupiah pendapatan.',
			'Semakin tinggi semakin efisien menghasilkan laba. Nilai negatif berarti perusahaan merugi pada periode ini.',
			f.revenue > 0 ? null : 'Belum ada pendapatan tercatat pada periode ini.',
		),
		buildRatio(
			'roa',
			'Return on Assets (ROA)',
			'Laba Bersih ÷ Total Aset',
			f.totalAssets > 0 ? f.netIncome / f.totalAssets : null,
			'percent',
			'Mengukur efisiensi aset dalam menghasilkan laba.',
			'Semakin tinggi semakin efisien pemanfaatan aset. Nilai negatif menandakan aset tidak menghasilkan laba pada periode ini.',
			f.totalAssets > 0 ? null : 'Belum ada aset tercatat.',
		),
		buildRatio(
			'roe',
			'Return on Equity (ROE)',
			'Laba Bersih ÷ Total Ekuitas',
			f.totalEquity > 0 ? f.netIncome / f.totalEquity : null,
			'percent',
			'Mengukur tingkat pengembalian atas modal pemilik.',
			'Semakin tinggi semakin baik bagi pemilik. Nilai negatif berarti modal pemilik berkurang akibat kerugian.',
			f.totalEquity > 0 ? null : 'Belum ada ekuitas (modal) tercatat.',
		),
	];

	const aktivitas: RatioResult[] = [
		buildRatio(
			'perputaran-persediaan',
			'Perputaran Persediaan (Inventory Turnover)',
			'HPP ÷ Persediaan',
			f.inventory > 0 && f.cogs > 0 ? f.cogs / f.inventory : null,
			'ratio',
			'Mengukur berapa kali persediaan terjual/digunakan dalam periode ini.',
			'Semakin tinggi semakin cepat persediaan berputar. Membutuhkan akun beban HPP (Harga Pokok Penjualan); bila belum tersedia, rasio tidak dapat dihitung.',
			f.inventory <= 0
				? 'Belum ada saldo persediaan tercatat.'
				: f.cogs <= 0
					? 'Belum ada akun beban HPP (Harga Pokok Penjualan) pada periode ini.'
					: null,
		),
		buildRatio(
			'perputaran-piutang',
			'Perputaran Piutang (Receivable Turnover)',
			'Pendapatan ÷ Piutang',
			f.receivables > 0 && f.revenue > 0 ? f.revenue / f.receivables : null,
			'ratio',
			'Mengukur berapa kali piutang berputar menjadi kas dalam periode ini.',
			'Semakin tinggi semakin cepat penagihan piutang. Rendah menandakan penagihan lambat atau piutang menumpuk.',
			f.receivables <= 0
				? 'Belum ada saldo piutang tercatat.'
				: 'Belum ada pendapatan tercatat pada periode ini.',
		),
		buildRatio(
			'perputaran-aset',
			'Perputaran Total Aset (Total Asset Turnover)',
			'Pendapatan ÷ Total Aset',
			f.totalAssets > 0 && f.revenue > 0 ? f.revenue / f.totalAssets : null,
			'ratio',
			'Mengukur efisiensi seluruh aset dalam menghasilkan pendapatan.',
			'Semakin tinggi semakin efisien aset menghasilkan penjualan. Rendah menandakan aset belum dimanfaatkan secara optimal.',
			f.totalAssets <= 0
				? 'Belum ada aset tercatat.'
				: 'Belum ada pendapatan tercatat pada periode ini.',
		),
	];

	return [
		{
			id: 'likuiditas',
			title: 'Rasio Likuiditas',
			description: 'Kemampuan membayar kewajiban jangka pendek.',
			ratios: likuiditas,
		},
		{
			id: 'solvabilitas',
			title: 'Rasio Solvabilitas',
			description: 'Struktur pendanaan & kemampuan membayar utang jangka panjang.',
			ratios: solvabilitas,
		},
		{
			id: 'profitabilitas',
			title: 'Rasio Profitabilitas',
			description: 'Kemampuan menghasilkan laba.',
			ratios: profitabilitas,
		},
		{
			id: 'aktivitas',
			title: 'Rasio Aktivitas',
			description: 'Efisiensi pemanfaatan aset dalam operasi.',
			ratios: aktivitas,
		},
	];
}
