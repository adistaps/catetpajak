/**
 * Perhitungan otomatis potongan penggajian Indonesia:
 *  - BPJS Ketenagakerjaan (JHT, JP, JK, JKK)
 *  - BPJS Kesehatan
 *  - PPh 21 (Pajak Penghasilan)
 *
 * Tarif & batas mengacu ketentuan umum berlaku (UU SJSN, UU BPJS, UU PPh).
 * Nilai dapat disesuaikan bila regulasi / kebijakan perusahaan berbeda.
 */

/** Tarif BPJS Ketenagakerjaan. */
export const BPJS_TK_RATES = {
	jhtEmployee: 0.02, // 2% — ditanggung karyawan
	jhtEmployer: 0.037, // 3,7% — ditanggung perusahaan
	jpEmployee: 0.01, // 1% — ditanggung karyawan
	jpEmployer: 0.02, // 2% — ditanggung perusahaan
	jkEmployer: 0.003, // 0,30% — Jaminan Kematian, perusahaan
	jkkEmployer: 0.0024, // 0,24% — Jaminan Kecelakaan Kerja, perusahaan (risiko rendah)
};

/** Batas atas upah untuk iuran Jaminan Pensiun (JP). */
export const JP_SALARY_CAP = 10_547_400;

/** Tarif & batas BPJS Kesehatan. */
export const BPJS_KES_RATES = {
	employee: 0.01, // 1% — ditanggung karyawan
	employer: 0.04, // 4% — ditanggung perusahaan
	salaryCap: 12_000_000, // batas atas upah
};

/** Nilai PTKP setahun (Penghasilan Tidak Kena Pajak) sesuai PP 55/2022. */
export const PTKP_VALUES: Record<PtkpStatus, number> = {
	TK0: 54_000_000,
	TK1: 58_500_000,
	TK2: 63_000_000,
	TK3: 67_500_000,
	K0: 58_500_000,
	K1: 63_000_000,
	K2: 67_500_000,
	K3: 72_000_000,
};

export const PTKP_LABELS: Record<PtkpStatus, string> = {
	TK0: 'TK/0 — Tidak kawin, 0 tanggungan',
	TK1: 'TK/1 — Tidak kawin, 1 tanggungan',
	TK2: 'TK/2 — Tidak kawin, 2 tanggungan',
	TK3: 'TK/3 — Tidak kawin, 3 tanggungan',
	K0: 'K/0 — Kawin, 0 tanggungan',
	K1: 'K/1 — Kawin, 1 tanggungan',
	K2: 'K/2 — Kawin, 2 tanggungan',
	K3: 'K/3 — Kawin, 3 tanggungan',
};

export const PTKP_OPTIONS = Object.keys(PTKP_VALUES) as PtkpStatus[];

export type PtkpStatus = 'TK0' | 'TK1' | 'TK2' | 'TK3' | 'K0' | 'K1' | 'K2' | 'K3';

/**
 * Metode perhitungan PPh 21.
 *  - "annual": metode tahunan (Pasal 17 progresif) — metode lama.
 *  - "ter": Tarif Estimasi Rata-rata (PMK 168/2023, berlaku sejak 2024).
 */
export type Pph21Method = 'annual' | 'ter';

export const PPH21_METHOD_LABELS: Record<Pph21Method, string> = {
	annual: 'Tahunan (Pasal 17)',
	ter: 'TER (PMK 168/2023)',
};

export const PPH21_METHOD_OPTIONS = Object.keys(PPH21_METHOD_LABELS) as Pph21Method[];

/**
 * Skema pemotongan pajak penghasilan (tax method):
 *  - "gross": PPh 21 dihitung atas bruto dan dipotong dari karyawan.
 *  - "gross_up": Perusahaan menambah tunjangan pajak sebesar PPh 21 yang
 *    terutang, sehingga karyawan menerima bruto penuh. PPh 21 dihitung atas
 *    (bruto + tunjangan pajak) secara iteratif (gross-up).
 *  - "netto": PPh 21 ditanggung perusahaan dan tidak mengurangi penerimaan
 *    karyawan. PPh 21 dihitung atas bruto untuk pelaporan perusahaan.
 */
export type TaxMethod = 'gross' | 'gross_up' | 'netto';

export const TAX_METHOD_LABELS: Record<TaxMethod, string> = {
	gross: 'Gross',
	gross_up: 'Gross Up',
	netto: 'Netto',
};

export const TAX_METHOD_DESCRIPTIONS: Record<TaxMethod, string> = {
	gross: 'PPh 21 dihitung dari penghasilan bruto dan dipotong dari gaji karyawan.',
	gross_up: 'Perusahaan menambah tunjangan pajak sebesar PPh 21, karyawan menerima bruto penuh.',
	netto: 'PPh 21 ditanggung perusahaan, tidak mengurangi take-home pay karyawan.',
};

export const TAX_METHOD_OPTIONS = Object.keys(TAX_METHOD_LABELS) as TaxMethod[];

/**
 * Kategori TER Bulanan ditentukan oleh status PTKP (Lampiran I PMK 168/2023):
 *  - A: TK/0, TK/1, K/0
 *  - B: TK/2, TK/3, K/1, K/2
 *  - C: K/3
 */
export type TerCategory = 'A' | 'B' | 'C';

export const TER_CATEGORY_LABELS: Record<TerCategory, string> = {
	A: 'TER A — TK/0, TK/1, K/0',
	B: 'TER B — TK/2, TK/3, K/1, K/2',
	C: 'TER C — K/3',
};

/** Pemetaan status PTKP ke kategori TER Bulanan (PMK 168/2023). */
export const PTKP_TO_TER_CATEGORY: Record<PtkpStatus, TerCategory> = {
	TK0: 'A',
	TK1: 'A',
	TK2: 'B',
	TK3: 'B',
	K0: 'A',
	K1: 'B',
	K2: 'B',
	K3: 'C',
};

/** Tarif TER Bulanan untuk pemegang NPWP (Lampiran II PMK 168/2023). */
const TER_BRACKETS_NPWP: Record<TerCategory, Array<{ upTo: number; rate: number }>> = {
	A: [
		{ upTo: 5_400_000, rate: 0 },
		{ upTo: 5_650_000, rate: 0.0025 },
		{ upTo: 5_950_000, rate: 0.005 },
		{ upTo: 6_300_000, rate: 0.0075 },
		{ upTo: 6_750_000, rate: 0.01 },
		{ upTo: 7_500_000, rate: 0.0125 },
		{ upTo: 8_550_000, rate: 0.015 },
		{ upTo: 9_650_000, rate: 0.0175 },
		{ upTo: 10_050_000, rate: 0.02 },
		{ upTo: 10_350_000, rate: 0.0225 },
		{ upTo: 10_700_000, rate: 0.025 },
		{ upTo: 11_050_000, rate: 0.03 },
		{ upTo: 11_600_000, rate: 0.035 },
		{ upTo: 12_500_000, rate: 0.04 },
		{ upTo: 13_750_000, rate: 0.05 },
		{ upTo: 15_100_000, rate: 0.06 },
		{ upTo: 16_950_000, rate: 0.07 },
		{ upTo: 19_750_000, rate: 0.08 },
		{ upTo: 24_150_000, rate: 0.09 },
		{ upTo: 26_450_000, rate: 0.1 },
		{ upTo: 28_000_000, rate: 0.11 },
		{ upTo: 30_050_000, rate: 0.12 },
		{ upTo: 32_400_000, rate: 0.13 },
		{ upTo: 35_400_000, rate: 0.14 },
		{ upTo: 39_100_000, rate: 0.15 },
		{ upTo: 43_850_000, rate: 0.16 },
		{ upTo: 47_800_000, rate: 0.17 },
		{ upTo: 51_400_000, rate: 0.18 },
		{ upTo: 56_300_000, rate: 0.19 },
		{ upTo: 62_200_000, rate: 0.2 },
		{ upTo: 68_600_000, rate: 0.21 },
		{ upTo: 77_500_000, rate: 0.22 },
		{ upTo: 89_000_000, rate: 0.23 },
		{ upTo: 103_000_000, rate: 0.24 },
		{ upTo: 125_000_000, rate: 0.25 },
		{ upTo: 157_000_000, rate: 0.26 },
		{ upTo: 206_000_000, rate: 0.27 },
		{ upTo: 337_000_000, rate: 0.28 },
		{ upTo: 454_000_000, rate: 0.29 },
		{ upTo: 550_000_000, rate: 0.3 },
		{ upTo: 695_000_000, rate: 0.31 },
		{ upTo: 910_000_000, rate: 0.32 },
		{ upTo: 1_400_000_000, rate: 0.33 },
		{ upTo: Infinity, rate: 0.34 },
	],
	B: [
		{ upTo: 6_200_000, rate: 0 },
		{ upTo: 6_500_000, rate: 0.0025 },
		{ upTo: 6_850_000, rate: 0.005 },
		{ upTo: 7_300_000, rate: 0.0075 },
		{ upTo: 9_200_000, rate: 0.01 },
		{ upTo: 10_750_000, rate: 0.015 },
		{ upTo: 11_250_000, rate: 0.02 },
		{ upTo: 11_600_000, rate: 0.025 },
		{ upTo: 12_600_000, rate: 0.03 },
		{ upTo: 13_600_000, rate: 0.04 },
		{ upTo: 14_950_000, rate: 0.05 },
		{ upTo: 16_400_000, rate: 0.06 },
		{ upTo: 18_450_000, rate: 0.07 },
		{ upTo: 21_850_000, rate: 0.08 },
		{ upTo: 26_000_000, rate: 0.09 },
		{ upTo: 27_700_000, rate: 0.1 },
		{ upTo: 29_350_000, rate: 0.11 },
		{ upTo: 31_450_000, rate: 0.12 },
		{ upTo: 33_950_000, rate: 0.13 },
		{ upTo: 37_100_000, rate: 0.14 },
		{ upTo: 41_100_000, rate: 0.15 },
		{ upTo: 45_800_000, rate: 0.16 },
		{ upTo: 49_500_000, rate: 0.17 },
		{ upTo: 53_800_000, rate: 0.18 },
		{ upTo: 58_500_000, rate: 0.19 },
		{ upTo: 64_000_000, rate: 0.2 },
		{ upTo: 71_000_000, rate: 0.21 },
		{ upTo: 80_000_000, rate: 0.22 },
		{ upTo: 93_000_000, rate: 0.23 },
		{ upTo: 109_000_000, rate: 0.24 },
		{ upTo: 129_000_000, rate: 0.25 },
		{ upTo: 163_000_000, rate: 0.26 },
		{ upTo: 211_000_000, rate: 0.27 },
		{ upTo: 374_000_000, rate: 0.28 },
		{ upTo: 459_000_000, rate: 0.29 },
		{ upTo: 555_000_000, rate: 0.3 },
		{ upTo: 704_000_000, rate: 0.31 },
		{ upTo: 957_000_000, rate: 0.32 },
		{ upTo: 1_405_000_000, rate: 0.33 },
		{ upTo: Infinity, rate: 0.34 },
	],
	C: [
		{ upTo: 6_600_000, rate: 0 },
		{ upTo: 6_950_000, rate: 0.0025 },
		{ upTo: 7_350_000, rate: 0.005 },
		{ upTo: 7_800_000, rate: 0.0075 },
		{ upTo: 8_850_000, rate: 0.01 },
		{ upTo: 9_800_000, rate: 0.0125 },
		{ upTo: 10_950_000, rate: 0.015 },
		{ upTo: 11_200_000, rate: 0.0175 },
		{ upTo: 12_050_000, rate: 0.02 },
		{ upTo: 12_950_000, rate: 0.03 },
		{ upTo: 14_150_000, rate: 0.04 },
		{ upTo: 15_550_000, rate: 0.05 },
		{ upTo: 17_050_000, rate: 0.06 },
		{ upTo: 19_500_000, rate: 0.07 },
		{ upTo: 22_700_000, rate: 0.08 },
		{ upTo: 26_600_000, rate: 0.09 },
		{ upTo: 28_100_000, rate: 0.1 },
		{ upTo: 30_100_000, rate: 0.11 },
		{ upTo: 32_600_000, rate: 0.12 },
		{ upTo: 35_400_000, rate: 0.13 },
		{ upTo: 38_900_000, rate: 0.14 },
		{ upTo: 43_000_000, rate: 0.15 },
		{ upTo: 47_400_000, rate: 0.16 },
		{ upTo: 51_200_000, rate: 0.17 },
		{ upTo: 55_800_000, rate: 0.18 },
		{ upTo: 60_400_000, rate: 0.19 },
		{ upTo: 66_700_000, rate: 0.2 },
		{ upTo: 74_500_000, rate: 0.21 },
		{ upTo: 83_200_000, rate: 0.22 },
		{ upTo: 95_600_000, rate: 0.23 },
		{ upTo: 110_000_000, rate: 0.24 },
		{ upTo: 134_000_000, rate: 0.25 },
		{ upTo: 170_000_000, rate: 0.26 },
		{ upTo: 221_000_000, rate: 0.27 },
		{ upTo: 390_000_000, rate: 0.28 },
		{ upTo: 463_000_000, rate: 0.29 },
		{ upTo: 561_000_000, rate: 0.3 },
		{ upTo: 709_000_000, rate: 0.31 },
		{ upTo: 965_000_000, rate: 0.32 },
		{ upTo: 1_419_000_000, rate: 0.33 },
		{ upTo: Infinity, rate: 0.34 },
	],
};

/** Kategori TER untuk status PTKP tertentu. */
export function terCategoryForPtkp(status: PtkpStatus): TerCategory {
	return PTKP_TO_TER_CATEGORY[status] ?? 'A';
}

/** Tarif efektif TER Bulanan untuk dasar pengenaan & kategori tertentu. */
export function terRateFor(dasar: number, category: TerCategory, hasNpwp: boolean): number {
	const brackets = TER_BRACKETS_NPWP[category] ?? TER_BRACKETS_NPWP.A;
	const bracket = brackets.find(b => dasar <= b.upTo) ?? brackets[brackets.length - 1];
	let rate = bracket.rate;
	if (!hasNpwp) rate = rate * 1.2; // tanpa NPWP: tarif 20% lebih tinggi
	return rate;
}

/** Bracket pajak progresif PPh 21 (setahun). */
export const PPH21_BRACKETS = [
	{ upTo: 60_000_000, rate: 0.05 },
	{ upTo: 250_000_000, rate: 0.15 },
	{ upTo: 500_000_000, rate: 0.25 },
	{ upTo: 5_000_000_000, rate: 0.3 },
	{ upTo: Infinity, rate: 0.35 },
];

/** Biaya jabatan: 5% bruto, maks Rp 6.000.000/tahun. */
const BIAYA_JABATAN_RATE = 0.05;
const BIAYA_JABATAN_CAP = 6_000_000;

function round(value: number): number {
	return Math.round(value);
}

/** Rincian iuran BPJS Ketenagakerjaan berdasarkan upah. */
export interface BpjsTkBreakdown {
	/** Upah dasar yang dipakai sebagai basis iuran. */
	base: number;
	jhtEmployee: number;
	jhtEmployer: number;
	jpEmployee: number;
	jpEmployer: number;
	jkEmployer: number;
	jkkEmployer: number;
	/** Total potongan karyawan (JHT + JP). */
	employeeTotal: number;
	/** Total beban perusahaan. */
	employerTotal: number;
}

export function calcBpjsTk(upah: number): BpjsTkBreakdown {
	const base = Math.max(0, upah);
	const jpBase = Math.min(base, JP_SALARY_CAP);
	const jhtEmployee = round(base * BPJS_TK_RATES.jhtEmployee);
	const jhtEmployer = round(base * BPJS_TK_RATES.jhtEmployer);
	const jpEmployee = round(jpBase * BPJS_TK_RATES.jpEmployee);
	const jpEmployer = round(jpBase * BPJS_TK_RATES.jpEmployer);
	const jkEmployer = round(base * BPJS_TK_RATES.jkEmployer);
	const jkkEmployer = round(base * BPJS_TK_RATES.jkkEmployer);
	return {
		base,
		jhtEmployee,
		jhtEmployer,
		jpEmployee,
		jpEmployer,
		jkEmployer,
		jkkEmployer,
		employeeTotal: jhtEmployee + jpEmployee,
		employerTotal: jhtEmployer + jpEmployer + jkEmployer + jkkEmployer,
	};
}

/** Rincian iuran BPJS Kesehatan. */
export interface BpjsKesBreakdown {
	base: number;
	employee: number;
	employer: number;
}

export function calcBpjsKes(upah: number): BpjsKesBreakdown {
	const base = Math.min(Math.max(0, upah), BPJS_KES_RATES.salaryCap);
	return {
		base,
		employee: round(base * BPJS_KES_RATES.employee),
		employer: round(base * BPJS_KES_RATES.employer),
	};
}

/** Pajak progresif atas PKP setahun. */
function progressiveTax(pkp: number): number {
	let tax = 0;
	let lower = 0;
	for (const bracket of PPH21_BRACKETS) {
		if (pkp <= lower) break;
		const slice = Math.min(pkp, bracket.upTo) - lower;
		tax += slice * bracket.rate;
		lower = bracket.upTo;
	}
	return round(tax);
}

export interface Pph21Input {
	/** Bruto bulanan (gaji pokok + tunjangan). */
	monthlyBruto: number;
	ptkpStatus: PtkpStatus;
	/** Apakah karyawan memiliki NPWP (berlaku tarif 20% lebih tinggi jika tidak). */
	hasNpwp: boolean;
	/** Iuran JHT + JP karyawan setahun (dipotong dari penghasilan neto). */
	annualPensionContribution: number;
}

export interface Pph21Result {
	monthlyBruto: number;
	annualBruto: number;
	biayaJabatan: number;
	pensionContribution: number;
	annualNetto: number;
	ptkp: number;
	annualPkp: number;
	annualTax: number;
	monthlyTax: number;
}

/**
 * PPh 21 bulanan dengan metode tahunan (annualized).
 * neto = bruto setahun - biaya jabatan - iuran pensiun
 * pkp = max(0, neto - PTKP)
 * pajak = progresif atas pkp; tanpa NPWP dinaikkan 20%.
 */
export function calcPph21(input: Pph21Input): Pph21Result {
	const annualBruto = Math.max(0, input.monthlyBruto) * 12;
	const biayaJabatan = Math.min(annualBruto * BIAYA_JABATAN_RATE, BIAYA_JABATAN_CAP);
	const pensionContribution = Math.max(0, input.annualPensionContribution);
	const annualNetto = Math.max(0, annualBruto - biayaJabatan - pensionContribution);
	const ptkp = PTKP_VALUES[input.ptkpStatus] ?? PTKP_VALUES.TK0;
	const annualPkp = Math.max(0, annualNetto - ptkp);
	let annualTax = progressiveTax(annualPkp);
	if (!input.hasNpwp) annualTax = round(annualTax * 1.2);
	return {
		monthlyBruto: input.monthlyBruto,
		annualBruto,
		biayaJabatan,
		pensionContribution,
		annualNetto,
		ptkp,
		annualPkp,
		annualTax,
		monthlyTax: round(annualTax / 12),
	};
}

/** Hasil agregat semua potongan otomatis untuk seorang karyawan. */
export interface PayrollDeduction {
	bpjsTk: BpjsTkBreakdown;
	bpjsKes: BpjsKesBreakdown;
	pph21: Pph21Result;
	/** Skema pajak yang diterapkan. */
	taxMethod: TaxMethod;
	/** Tunjangan pajak yang ditambahkan ke penghasilan (gross_up/netto). */
	taxAllowance: number;
	/** True bila PPh 21 ditanggung perusahaan (netto). */
	companyBorne: boolean;
	/** Total potongan karyawan (BPJS TK + BPJS Kes + PPh 21). */
	employeeTotal: number;
}

export interface TerPph21Result {
	/** Metode yang dipakai. */
	method: 'ter';
	/** Kategori TER (A/B/C) berdasarkan PTKP. */
	category: TerCategory;
	/** Bruto bulanan. */
	monthlyBruto: number;
	/** Iuran JHT + JP karyawan yang dikurangkan dari bruto. */
	pensionContribution: number;
	/** Dasar pengenaan = bruto - iuran pensiun/JHT karyawan. */
	dasar: number;
	/** Tarif efektif bulanan yang dipakai (sudah termasuk penalti non-NPWP). */
	rate: number;
	/** PPh 21 terutang sebulan. */
	monthlyTax: number;
}

export interface TerPph21Input {
	/** Bruto bulanan (gaji pokok + tunjangan). */
	monthlyBruto: number;
	ptkpStatus: PtkpStatus;
	hasNpwp: boolean;
	/** Iuran JHT + JP karyawan sebulan (dipotong dari bruto). */
	pensionContribution: number;
}

/**
 * PPh 21 dengan metode TER Bulanan (PMK 168/2023).
 * dasar = bruto sebulan - iuran JHT/JP karyawan
 * tarif = tarif efektif sesuai kategori TER (A/B/C) & bracket dasar
 * pajak = dasar x tarif; tanpa NPWP dinaikkan 20%.
 */
export function calcPph21Ter(input: TerPph21Input): TerPph21Result {
	const category = terCategoryForPtkp(input.ptkpStatus);
	const bruto = Math.max(0, input.monthlyBruto);
	const pension = Math.max(0, input.pensionContribution);
	const dasar = Math.max(0, bruto - pension);
	const rate = terRateFor(dasar, category, input.hasNpwp);
	const monthlyTax = round(dasar * rate);
	return {
		method: 'ter',
		category,
		monthlyBruto: bruto,
		pensionContribution: pension,
		dasar,
		rate,
		monthlyTax,
	};
}

export interface DeductionInput {
	/** Upah dasar untuk iuran BPJS (umumnya gaji pokok). */
	bpjsBase: number;
	/** Bruto bulanan untuk PPh 21 (gaji pokok + tunjangan). */
	monthlyBruto: number;
	ptkpStatus: PtkpStatus;
	hasNpwp: boolean;
	/** Metode perhitungan PPh 21; default "annual". */
	pph21Method?: Pph21Method;
	/** Skema pemotongan pajak; default "gross". */
	taxMethod?: TaxMethod;
	/** Jenis karyawan; "freelance" memakai perhitungan PPh 21 pekerja bebas. */
	employeeType?: string;
}

/**
 * Hitung PPh 21 bulanan dengan menerapkan skema pajak (gross/gross_up/netto).
 * Mengembalikan PPh 21 terutang serta tunjangan pajak yang ditambahkan ke
 * penghasilan karyawan untuk gross_up dan netto.
 */
function computePph21WithTaxMethod(input: {
	monthlyBruto: number;
	ptkpStatus: PtkpStatus;
	hasNpwp: boolean;
	pensionContribution: number;
	pph21Method: Pph21Method;
	taxMethod: TaxMethod;
}): { monthlyTax: number; taxAllowance: number; companyBorne: boolean } {
	const bruto = Math.max(0, input.monthlyBruto);
	const pension = Math.max(0, input.pensionContribution);
	const isGrossUp = input.taxMethod === 'gross_up';
	const companyBorne = input.taxMethod === 'netto';

	if (input.pph21Method === 'ter') {
		const category = terCategoryForPtkp(input.ptkpStatus);
		if (isGrossUp) {
			// Gross-up: dasar = (bruto + tunjangan pajak) - iuran pensiun.
			let pph21 = 0;
			for (let i = 0; i < 30; i++) {
				const dasar = Math.max(0, bruto + pph21 - pension);
				const rate = terRateFor(dasar, category, input.hasNpwp);
				const next = round(dasar * rate);
				if (next === pph21) break;
				pph21 = next;
			}
			return { monthlyTax: pph21, taxAllowance: pph21, companyBorne: false };
		}
		// Gross & netto: dasar = bruto - iuran pensiun.
		const dasar = Math.max(0, bruto - pension);
		const rate = terRateFor(dasar, category, input.hasNpwp);
		const pph21 = round(dasar * rate);
		return { monthlyTax: pph21, taxAllowance: companyBorne ? pph21 : 0, companyBorne };
	}

	// Metode tahunan (Pasal 17).
	const ptkp = PTKP_VALUES[input.ptkpStatus] ?? PTKP_VALUES.TK0;
	if (isGrossUp) {
		let pph21 = 0;
		for (let i = 0; i < 30; i++) {
			const annualBruto = (bruto + pph21) * 12;
			const biayaJabatan = Math.min(annualBruto * BIAYA_JABATAN_RATE, BIAYA_JABATAN_CAP);
			const annualNetto = Math.max(0, annualBruto - biayaJabatan - pension * 12);
			const annualPkp = Math.max(0, annualNetto - ptkp);
			let annualTax = progressiveTax(annualPkp);
			if (!input.hasNpwp) annualTax = round(annualTax * 1.2);
			const next = round(annualTax / 12);
			if (next === pph21) break;
			pph21 = next;
		}
		return { monthlyTax: pph21, taxAllowance: pph21, companyBorne: false };
	}
	const annualBruto = bruto * 12;
	const biayaJabatan = Math.min(annualBruto * BIAYA_JABATAN_RATE, BIAYA_JABATAN_CAP);
	const annualNetto = Math.max(0, annualBruto - biayaJabatan - pension * 12);
	const annualPkp = Math.max(0, annualNetto - ptkp);
	let annualTax = progressiveTax(annualPkp);
	if (!input.hasNpwp) annualTax = round(annualTax * 1.2);
	const pph21 = round(annualTax / 12);
	return { monthlyTax: pph21, taxAllowance: companyBorne ? pph21 : 0, companyBorne };
}

/** Label untuk skema pajak pekerja bebas (bukan pegawai). */
export const FREELANCE_TAX_LABEL = 'Pekerja Bebas (Pasal 17)';

/** Hasil perhitungan PPh 21 untuk pekerja bebas (bukan pegawai). */
export interface FreelancePph21Result {
	/** Metode: pekerja bebas (bukan pegawai). */
	method: 'freelance';
	/** Bruto bulanan. */
	monthlyBruto: number;
	/** Biaya penghasilan 50% bruto (setahun). */
	biayaPenghasilan: number;
	/** Dasar pengenaan pajak setahun = bruto setahun - biaya penghasilan. */
	annualDpp: number;
	/** PTKP setahun. */
	ptkp: number;
	/** PKP setahun. */
	annualPkp: number;
	/** PPh 21 setahun. */
	annualTax: number;
	/** PPh 21 sebulan. */
	monthlyTax: number;
}

export interface FreelancePph21Input {
	/** Bruto bulanan (gaji pokok + tunjangan). */
	monthlyBruto: number;
	ptkpStatus: PtkpStatus;
	hasNpwp: boolean;
	/** Skema pemotongan pajak; default "gross". */
	taxMethod?: TaxMethod;
}

/** Hitung PPh 21 setahun untuk pekerja bebas (DPP 50%, tarif Pasal 17). */
function freelanceAnnualTax(annualBruto: number, ptkp: number, hasNpwp: boolean) {
	const biaya = annualBruto * 0.5;
	const dpp = Math.max(0, annualBruto - biaya);
	const pkp = Math.max(0, dpp - ptkp);
	let tax = progressiveTax(pkp);
	if (!hasNpwp) tax = round(tax * 1.2);
	return { biaya, dpp, pkp, tax };
}

/** Hitung PPh 21 pekerja bebas dengan skema gross/gross_up/netto. */
function computeFreelancePph21WithTaxMethod(input: {
	monthlyBruto: number;
	ptkpStatus: PtkpStatus;
	hasNpwp: boolean;
	taxMethod: TaxMethod;
}): { result: FreelancePph21Result; taxAllowance: number; companyBorne: boolean } {
	const bruto = Math.max(0, input.monthlyBruto);
	const ptkp = PTKP_VALUES[input.ptkpStatus] ?? PTKP_VALUES.TK0;
	const isGrossUp = input.taxMethod === 'gross_up';
	const companyBorne = input.taxMethod === 'netto';

	if (isGrossUp) {
		let pph21 = 0;
		let calc = freelanceAnnualTax(bruto * 12, ptkp, input.hasNpwp);
		for (let i = 0; i < 30; i++) {
			const next = round(calc.tax / 12);
			if (next === pph21) break;
			pph21 = next;
			calc = freelanceAnnualTax((bruto + pph21) * 12, ptkp, input.hasNpwp);
		}
		const result: FreelancePph21Result = {
			method: 'freelance',
			monthlyBruto: bruto,
			biayaPenghasilan: round(calc.biaya),
			annualDpp: round(calc.dpp),
			ptkp,
			annualPkp: calc.pkp,
			annualTax: round(calc.tax),
			monthlyTax: pph21,
		};
		return { result, taxAllowance: pph21, companyBorne: false };
	}

	const calc = freelanceAnnualTax(bruto * 12, ptkp, input.hasNpwp);
	const pph21 = round(calc.tax / 12);
	const result: FreelancePph21Result = {
		method: 'freelance',
		monthlyBruto: bruto,
		biayaPenghasilan: round(calc.biaya),
		annualDpp: round(calc.dpp),
		ptkp,
		annualPkp: calc.pkp,
		annualTax: round(calc.tax),
		monthlyTax: pph21,
	};
	return { result, taxAllowance: companyBorne ? pph21 : 0, companyBorne };
}

/**
 * PPh 21 untuk pekerja bebas (bukan pegawai) sesuai PMK 168/2023.
 *
 * Dasar pengenaan pajak = 50% x penghasilan bruto (biaya penghasilan),
 * lalu dikurangi PTKP, dan dikenai tarif progresif Pasal 17.
 * Tidak memakai TER Bulanan. Tanpa NPWP, tarif dinaikkan 20%.
 */
export function calcFreelancePph21(input: FreelancePph21Input): FreelancePph21Result {
	return computeFreelancePph21WithTaxMethod({
		monthlyBruto: input.monthlyBruto,
		ptkpStatus: input.ptkpStatus,
		hasNpwp: input.hasNpwp,
		taxMethod: input.taxMethod ?? 'gross',
	}).result;
}

/** Hitung seluruh potongan otomatis (BPJS TK, BPJS Kesehatan, PPh 21). */
export function calcDeductions(input: DeductionInput): PayrollDeduction {
	const taxMethod = input.taxMethod ?? 'gross';

	// Freelance (pekerja bebas): tanpa BPJS, PPh 21 memakai DPP 50% + Pasal 17.
	if (input.employeeType === 'freelance') {
		const bpjsTk = calcBpjsTk(0);
		const bpjsKes = calcBpjsKes(0);
		const { result, taxAllowance, companyBorne } = computeFreelancePph21WithTaxMethod({
			monthlyBruto: input.monthlyBruto,
			ptkpStatus: input.ptkpStatus,
			hasNpwp: input.hasNpwp,
			taxMethod,
		});
		const pph21: Pph21Result = {
			monthlyBruto: input.monthlyBruto,
			annualBruto: input.monthlyBruto * 12,
			biayaJabatan: 0,
			pensionContribution: 0,
			annualNetto: 0,
			ptkp: 0,
			annualPkp: 0,
			annualTax: result.annualTax,
			monthlyTax: result.monthlyTax,
		};
		return {
			bpjsTk,
			bpjsKes,
			pph21,
			taxMethod,
			taxAllowance,
			companyBorne,
			employeeTotal: result.monthlyTax,
		};
	}

	const bpjsTk = calcBpjsTk(input.bpjsBase);
	const bpjsKes = calcBpjsKes(input.bpjsBase);
	const method = input.pph21Method ?? 'annual';
	const { monthlyTax, taxAllowance, companyBorne } = computePph21WithTaxMethod({
		monthlyBruto: input.monthlyBruto,
		ptkpStatus: input.ptkpStatus,
		hasNpwp: input.hasNpwp,
		pensionContribution: bpjsTk.employeeTotal,
		pph21Method: method,
		taxMethod,
	});
	const pph21: Pph21Result = {
		monthlyBruto: input.monthlyBruto,
		annualBruto: input.monthlyBruto * 12,
		biayaJabatan: 0,
		pensionContribution: bpjsTk.employeeTotal * 12,
		annualNetto: 0,
		ptkp: 0,
		annualPkp: 0,
		annualTax: monthlyTax * 12,
		monthlyTax,
	};
	return {
		bpjsTk,
		bpjsKes,
		pph21,
		taxMethod,
		taxAllowance,
		companyBorne,
		employeeTotal: bpjsTk.employeeTotal + bpjsKes.employee + monthlyTax,
	};
}
