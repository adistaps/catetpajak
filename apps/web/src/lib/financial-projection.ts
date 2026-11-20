import { computeBalances, type Account, type JournalEntry } from '@/lib/accounting';
import {
	isCashEquivalent,
	isReceivable,
	isInventory,
	isCurrentLiability,
	isFixedAsset,
	isCostOfGoodsSold,
	type RatioFigures,
} from '@/lib/financial-ratios';

/**
 * Proyeksi rasio keuangan 3 tahun ke depan.
 *
 * Metode (transparan, tanpa angka rekaan):
 * 1. Kumpulkan figur aktual per tahun kalender dari entri jurnal (posisi neraca
 *    per akhir tahun, arus laba rugi sepanjang tahun).
 * 2. Hitung rasio pertumbuhan tahun-ke-tahun (YoY) untuk tiap figur dari tahun
 *    berurutan yang nilainya bukan nol. Ambil rata-rata YoY sebagai asumsi
 *    pertumbuhan.
 * 3. Proyeksikan 3 tahun ke depan dengan menggandakan asumsi pertumbuhan.
 *    Figur yang pertumbuhannya tak terhitung (selalu nol / tak ada pasangan
 *    YoY) ditahan tetap (asumsi 0%) dan ditandai.
 * 4. Hitung ulang rasio keuangan untuk tiap tahun proyeksi dari figur
 *    terproyeksi.
 *
 * Proyeksi hanya dihasilkan bila tersedia minimal 2 tahun data historis.
 * Jika tidak cukup, hasil ditandai belum tersedia beserta data yang
 * diperlukan — tidak ada angka yang diarang.
 */

export interface YearlyFigures {
	year: number;
	isActual: boolean;
	figures: RatioFigures;
}

export type GrowthKey =
	| 'revenue'
	| 'expenses'
	| 'cogs'
	| 'totalAssets'
	| 'totalLiabilities'
	| 'totalEquity'
	| 'currentAssets'
	| 'currentLiabilities'
	| 'cash'
	| 'receivables'
	| 'inventory'
	| 'fixedAssets';

export type ProjectionGrowth = Partial<Record<GrowthKey, number | null>>;

export interface ProjectionResult {
	/** Tahun aktual berurutan (paling lama → terbaru). */
	history: YearlyFigures[];
	/** 3 tahun proyeksi setelah tahun dasar. */
	projected: YearlyFigures[];
	/** Asumsi pertumbuhan rata-rata YoY per figur (null = ditahan tetap). */
	growth: ProjectionGrowth;
	/** Tahun dasar proyeksi (tahun aktual terakhir). */
	baseYear: number | null;
	/** Apakah data historis cukup untuk memproyeksikan. */
	canProject: boolean;
	/** Alasan proyeksi belum tersedia (bila canProject false). */
	reason: string | null;
}

const GROWTH_KEYS: GrowthKey[] = [
	'revenue',
	'expenses',
	'cogs',
	'totalAssets',
	'totalLiabilities',
	'totalEquity',
	'currentAssets',
	'currentLiabilities',
	'cash',
	'receivables',
	'inventory',
	'fixedAssets',
];

/** Label figur untuk catatan transparansi asumsi pertumbuhan. */
export const GROWTH_LABELS: Record<GrowthKey, string> = {
	revenue: 'Pendapatan',
	expenses: 'Beban',
	cogs: 'HPP',
	totalAssets: 'Total Aset',
	totalLiabilities: 'Total Liabilitas',
	totalEquity: 'Total Ekuitas',
	currentAssets: 'Aset Lancar',
	currentLiabilities: 'Liabilitas Lancar',
	cash: 'Kas & Bank',
	receivables: 'Piutang',
	inventory: 'Persediaan',
	fixedAssets: 'Aset Tetap',
};

/**
 * Menghitung figur keuangan (posisi neraca per akhir tahun + arus laba rugi
 * sepanjang tahun) untuk satu tahun kalender.
 */
function figuresForYear(
	accounts: Account[],
	entries: JournalEntry[],
	conversionDate: string | null,
	year: number,
): RatioFigures {
	const cut = conversionDate ? conversionDate.slice(0, 10) : null;
	const yearStart = `${year}-01-01`;
	const yearEnd = `${year}-12-31`;

	// Posisi neraca kumulatif s.d. akhir tahun (point-in-time).
	const balanceEntries = entries.filter(entry => {
		const d = (entry.date || '').slice(0, 10);
		if (cut && d < cut) return false;
		return d <= yearEnd;
	});
	const balances = computeBalances(accounts, balanceEntries, conversionDate);

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
				if (isFixedAsset(account)) fixedAssets += value;
				else currentAssets += value;
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

	// Arus laba rugi sepanjang tahun.
	let revenue = 0;
	let expenses = 0;
	let cogs = 0;

	for (const entry of entries) {
		const d = (entry.date || '').slice(0, 10);
		if (cut && d < cut) continue;
		if (d < yearStart || d > yearEnd) continue;
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
		netIncome: revenue - expenses,
	};
}

/**
 * Rata-rata rasio pertumbuhan tahun-ke-tahun dari deret nilai tahunan.
 * Hanya pasangan berurutan dengan nilai dasar bukan nol yang dihitung.
 */
function averageYoYGrowth(yearlyValues: number[]): number | null {
	if (yearlyValues.length < 2) return null;
	const growths: number[] = [];
	for (let i = 1; i < yearlyValues.length; i++) {
		const prev = yearlyValues[i - 1];
		const cur = yearlyValues[i];
		if (Math.abs(prev) >= 1) {
			growths.push((cur - prev) / Math.abs(prev));
		}
	}
	if (growths.length === 0) return null;
	const sum = growths.reduce((acc, g) => acc + g, 0);
	return sum / growths.length;
}

function projectFigure(base: number, growth: number | null, periods: number): number {
	if (growth === null) return base;
	return base * Math.pow(1 + growth, periods);
}

/**
 * Membangun proyeksi 3 tahun ke depan dari akun & entri jurnal perusahaan.
 */
export function buildProjection(
	accounts: Account[],
	entries: JournalEntry[],
	conversionDate?: string | null,
): ProjectionResult {
	const cut = conversionDate ? conversionDate.slice(0, 10) : null;

	// Tahun-tahun yang memiliki entri (setelah cut-off konversi).
	const yearSet = new Set<number>();
	for (const entry of entries) {
		const d = (entry.date || '').slice(0, 10);
		if (!d) continue;
		if (cut && d < cut) continue;
		const year = Number(d.slice(0, 4));
		if (Number.isFinite(year)) yearSet.add(year);
	}
	const years = Array.from(yearSet).sort((a, b) => a - b);

	if (years.length === 0) {
		return {
			history: [],
			projected: [],
			growth: {},
			baseYear: null,
			canProject: false,
			reason:
				'Belum ada transaksi tercatat. Catat transaksi pada minimal 2 tahun berbeda agar proyeksi dapat dihitung.',
		};
	}

	const history: YearlyFigures[] = years.map(year => ({
		year,
		isActual: true,
		figures: figuresForYear(accounts, entries, cut, year),
	}));

	if (years.length < 2) {
		return {
			history,
			projected: [],
			growth: {},
			baseYear: years[years.length - 1] ?? null,
			canProject: false,
			reason: `Diperlukan minimal 2 tahun data historis untuk menurunkan tren pertumbuhan. Saat ini baru ${years.length} tahun tercatat (${years[0]}).`,
		};
	}

	// Asumsi pertumbuhan rata-rata YoY per figur.
	const growth: ProjectionGrowth = {};
	for (const key of GROWTH_KEYS) {
		const series = history.map(hf => hf.figures[key] as number);
		growth[key] = averageYoYGrowth(series);
	}

	const baseYear = years[years.length - 1];
	const baseFigures = history[history.length - 1].figures;

	// Proyeksi 3 tahun ke depan.
	const projected: YearlyFigures[] = [];
	for (let n = 1; n <= 3; n++) {
		const year = baseYear + n;
		const revenue = projectFigure(baseFigures.revenue, growth.revenue ?? null, n);
		const expenses = projectFigure(baseFigures.expenses, growth.expenses ?? null, n);
		const cogs = projectFigure(baseFigures.cogs, growth.cogs ?? null, n);
		const totalAssets = projectFigure(baseFigures.totalAssets, growth.totalAssets ?? null, n);
		const totalLiabilities = projectFigure(
			baseFigures.totalLiabilities,
			growth.totalLiabilities ?? null,
			n,
		);
		const totalEquity = projectFigure(baseFigures.totalEquity, growth.totalEquity ?? null, n);
		const currentAssets = projectFigure(
			baseFigures.currentAssets,
			growth.currentAssets ?? null,
			n,
		);
		const currentLiabilities = projectFigure(
			baseFigures.currentLiabilities,
			growth.currentLiabilities ?? null,
			n,
		);
		const cash = projectFigure(baseFigures.cash, growth.cash ?? null, n);
		const receivables = projectFigure(baseFigures.receivables, growth.receivables ?? null, n);
		const inventory = projectFigure(baseFigures.inventory, growth.inventory ?? null, n);
		const fixedAssets = projectFigure(baseFigures.fixedAssets, growth.fixedAssets ?? null, n);

		projected.push({
			year,
			isActual: false,
			figures: {
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
				netIncome: revenue - expenses,
			},
		});
	}

	return {
		history,
		projected,
		growth,
		baseYear,
		canProject: true,
		reason: null,
	};
}
