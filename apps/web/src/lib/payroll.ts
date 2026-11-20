import { todayIso, type Account } from '@/lib/accounting';
import type { Pph21Method, PtkpStatus, TaxMethod } from '@/lib/payroll-calc';

export interface Employee {
	id: string;
	company: string;
	name: string;
	position: string;
	npwp: string;
	bank_account: string;
	basic_salary: number;
	meal_allowance: number;
	transport_allowance: number;
	other_allowance: number;
	bpjs_tk: number;
	bpjs_kes: number;
	pph21: number;
	status: 'aktif' | 'nonaktif';
	/** Status PTKP untuk perhitungan PPh 21 otomatis. */
	ptkp_status: PtkpStatus;
	/** Metode perhitungan PPh 21: "annual" (Pasal 17) atau "ter" (PMK 168/2023). */
	pph21_method: Pph21Method;
	/** Skema pemotongan pajak: "gross", "gross_up", atau "netto". */
	tax_method: TaxMethod;
	/** Hitung potongan BPJS & PPh 21 otomatis dari upah & PTKP. */
	auto_calc: boolean;
	/** Akun user yang ditautkan untuk self-service karyawan (opsional). */
	user: string;
	/** Atasan langsung (direct report). Relasi ke karyawan lain di perusahaan yang sama. */
	manager: string;
	/** Jalur persetujuan yang dipakai untuk karyawan ini. */
	approval_line: string;
	/** Nomor induk karyawan (opsional, diisi otomatis saat transfer). */
	employee_code?: string;
	/** Tanggal bergabung; dipakai untuk perhitungan masa probation reimbursement. */
	join_date?: string;
	/** Tingkat/jabatan karyawan (mis. Manager, Staff); dipakai untuk batas nominal reimbursement per level. */
	level?: string;
	/** Jenis karyawan: probation, kontrak, permanent, magang, freelance. */
	employee_type?: EmployeeType;
	/** Foto profil karyawan (nama file di koleksi employees). */
	photo?: string;
	owner: string;
	created: string;
}

export type PayrollRunStatus = 'draft' | 'posted';

export interface PayrollRun {
	id: string;
	company: string;
	period: string;
	pay_date: string;
	description: string;
	total_gross: number;
	total_deductions: number;
	total_net: number;
	status: PayrollRunStatus;
	/** Slip gaji sudah diterbitkan ke aplikasi karyawan. */
	payslips_published?: boolean;
	cash_account: string;
	/** Tanggal mulai periode cut-off (inklusif). */
	cutoff_start?: string;
	/** Tanggal akhir periode cut-off (inklusif). */
	cutoff_end?: string;
	owner: string;
	created: string;
	updated?: string;
	expand?: { cash_account?: Account };
}

export interface Payslip {
	id: string;
	company: string;
	run: string;
	employee: string;
	basic_salary: number;
	meal_allowance: number;
	transport_allowance: number;
	other_allowance: number;
	gross: number;
	bpjs_tk: number;
	bpjs_kes: number;
	pph21: number;
	/** Angsuran pinjaman karyawan yang dipotong pada periode ini, termasuk bunga. */
	loan_deduction: number;
	/** Bagian bunga dari potongan pinjaman; data lama bernilai nol. */
	loan_interest?: number;
	loan?: string;
	total_deductions: number;
	net_pay: number;
	/** Tambahan tunjangan dari komponen payroll aktif pada periode ini. */
	component_allowance: number;
	/** Potongan tambahan dari komponen payroll aktif pada periode ini. */
	component_deduction: number;
	/** Skema pajak yang diterapkan pada slip ini. */
	tax_method?: TaxMethod;
	/** Tunjangan pajak (gross_up/netto) yang ditambahkan ke penghasilan. */
	tax_allowance?: number;
	/** Sudah diterbitkan ke aplikasi karyawan (tersembunyi sampai diterbitkan). */
	published?: boolean;
	/** Status pencairan gaji: "pending" (belum dicairkan) atau "paid" (sudah dicairkan). */
	disbursement_status?: DisbursementStatus;
	/** Tanggal pencairan/pembayaran gaji ke karyawan. */
	disbursement_date?: string;
	/** Catatan pembayaran pencairan. */
	disbursement_notes?: string;
	/** Metode pencairan gaji ke karyawan. */
	disbursement_method?: DisbursementMethod;
	/** Nomor referensi transfer dari bank (mis. Neo Bank). */
	disbursement_reference?: string;
	/** Pengguna yang menandai pencairan. */
	disbursed_by?: string;
	owner: string;
	created: string;
	/** Metadata periode terbatas yang diberikan kepada karyawan untuk slipnya yang terbit. */
	payroll_period_info?: Pick<PayrollRun, 'period' | 'pay_date' | 'cutoff_start' | 'cutoff_end'>;
	expand?: { employee?: Employee; run?: PayrollRun };
}

export interface ApprovalLine {
	id: string;
	company: string;
	name: string;
	approvers: string[];
	owner: string;
	created: string;
}

export type EmployeeType = 'probation' | 'kontrak' | 'permanent' | 'magang' | 'freelance';

export const EMPLOYEE_TYPE_LABELS: Record<EmployeeType, string> = {
	probation: 'Probation',
	kontrak: 'Kontrak',
	permanent: 'Permanent',
	magang: 'Magang',
	freelance: 'Freelance',
};

export const EMPLOYEE_TYPE_OPTIONS: EmployeeType[] = [
	'probation',
	'kontrak',
	'permanent',
	'magang',
	'freelance',
];

export const EMPLOYEE_STATUS_LABELS: Record<Employee['status'], string> = {
	aktif: 'Aktif',
	nonaktif: 'Nonaktif',
};

export const RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = {
	draft: 'Draf',
	posted: 'Terbit',
};

export type DisbursementStatus = 'pending' | 'paid';

export const DISBURSEMENT_STATUS_LABELS: Record<DisbursementStatus, string> = {
	pending: 'Belum dicairkan',
	paid: 'Dicairkan',
};

/** Metode pencairan gaji ke karyawan. */
export type DisbursementMethod = 'transfer_bank' | 'tunai' | 'cek_giro' | 'lainnya' | 'neo_bank';

export const DISBURSEMENT_METHOD_VALUES: DisbursementMethod[] = [
	'transfer_bank',
	'tunai',
	'cek_giro',
	'lainnya',
	'neo_bank',
];

/** Total tunjangan seorang karyawan. */
export function totalAllowance(emp: Pick<Employee, 'meal_allowance' | 'transport_allowance' | 'other_allowance'>): number {
	return (emp.meal_allowance || 0) + (emp.transport_allowance || 0) + (emp.other_allowance || 0);
}

/** Bruto = gaji pokok + tunjangan. */
export function grossSalary(emp: Pick<Employee, 'basic_salary' | 'meal_allowance' | 'transport_allowance' | 'other_allowance'>): number {
	return (emp.basic_salary || 0) + totalAllowance(emp);
}

/** Total potongan seorang karyawan. */
export function totalDeductions(emp: Pick<Employee, 'bpjs_tk' | 'bpjs_kes' | 'pph21'>): number {
	return (emp.bpjs_tk || 0) + (emp.bpjs_kes || 0) + (emp.pph21 || 0);
}

/** Gaji bersih = bruto - potongan. */
export function netSalary(emp: Employee): number {
	return Math.max(0, grossSalary(emp) - totalDeductions(emp));
}

/** Kode akun standar untuk jurnal penggajian. */
export const PAYROLL_ACCOUNT_CODES = {
	bebanGaji: '501',
	utangGaji: '203',
	utangBpjs: '204',
	utangPph: '205',
	piutangPinjaman: '206',
};

export type LoanStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
	pending: 'Menunggu',
	active: 'Aktif',
	completed: 'Lunas',
	cancelled: 'Dibatalkan',
};

export interface LoanScheduleRow {
	number: number;
	date: string;
	principal: number;
	interest: number;
}

export interface EmployeeLoan {
	id: string;
	company: string;
	employee: string;
	principal: number;
	installments: number;
	installment_amount: number;
	disbursed_date: string;
	paid_installments: number;
	paid_amount: number;
	/** Jadwal tersimpan; baris yang sudah dipotong dipertahankan saat pembaruan. */
	installment_schedule?: LoanScheduleRow[] | null;
	status: LoanStatus;
	description: string;
	owner: string;
	created: string;
	updated?: string;
	expand?: { employee?: Employee };
}

/** Sisa pokok pinjaman yang belum dilunasi. */
export function loanBalance(loan: Pick<EmployeeLoan, 'principal' | 'paid_amount'>): number {
	return Math.max(0, (loan.principal || 0) - (loan.paid_amount || 0));
}

/** Angsuran per bulan: pakai installment_amount bila diisi, jika tidak dibagi rata. */
export function loanInstallment(loan: Pick<EmployeeLoan, 'installment_amount' | 'principal' | 'installments'>): number {
	if (loan.installment_amount && loan.installment_amount > 0) return loan.installment_amount;
	const terms = Math.max(1, loan.installments || 1);
	return Math.round((loan.principal || 0) / terms);
}

// --- Pengaturan cut-off penggajian -----------------------------------------

/** Cara menghitung tunjangan: flat per bulan atau berdasarkan kehadiran. */
export type AllowanceMethod = 'flat' | 'attendance';

export interface PayrollSettings {
	id: string;
	company: string;
	/** Aktifkan periode cut-off kustom (bukan bulan kalender). */
	use_cutoff: boolean;
	/** Tanggal mulai cut-off (1–31). */
	cutoff_start_day: number;
	/** Tanggal akhir cut-off (1–31). */
	cutoff_end_day: number;
	/** Tanggal pembayaran gaji (1–31). */
	pay_day: number;
	/** Cara hitung tunjangan makan: flat per bulan atau berdasarkan kehadiran. */
	meal_allowance_method: AllowanceMethod;
	/** Cara hitung tunjangan transportasi: flat per bulan atau berdasarkan kehadiran. */
	transport_allowance_method: AllowanceMethod;
	owner: string;
}

export function defaultPayrollSettings(): Omit<PayrollSettings, 'id' | 'company' | 'owner'> {
	return {
		use_cutoff: false,
		cutoff_start_day: 21,
		cutoff_end_day: 20,
		pay_day: 25,
		meal_allowance_method: 'flat',
		transport_allowance_method: 'flat',
	};
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function dateInMonth(year: number, month: number, day: number): string {
	// Clamp day to last day of the month.
	const lastDay = new Date(year, month, 0).getDate();
	const d = Math.min(Math.max(1, day), lastDay);
	return `${year}-${pad2(month)}-${pad2(d)}`;
}

export interface CutoffRange {
	/** Tanggal mulai periode (ISO). */
	start: string;
	/** Tanggal akhir periode (ISO). */
	end: string;
	/** Tanggal pembayaran gaji (ISO). */
	payDate: string;
	/** Label ringkas untuk ditampilkan, mis. "21 Agu – 20 Sep". */
	label: string;
}

/**
 * Hitung rentang periode penggajian untuk "bulan bayar" (YYYY-MM) tertentu.
 *
 * Contoh: cut-off 21–20, bayar tanggal 25.
 *  - period "2026-09" → start 2026-08-21, end 2026-09-20, payDate 2026-09-25.
 *
 * Jika use_cutoff false, gunakan bulan kalender penuh dan pay_day sebagai
 * tanggal bayar (dibatasi ke hari terakhir bulan).
 */
export function computeCutoffRange(
	period: string,
	settings: Pick<PayrollSettings, 'use_cutoff' | 'cutoff_start_day' | 'cutoff_end_day' | 'pay_day'> | null | undefined,
): CutoffRange {
	const [y, m] = period.split('-').map(Number);
	const year = y ?? new Date().getFullYear();
	const month = m ?? new Date().getMonth() + 1;
	const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

	if (!settings?.use_cutoff) {
		const start = dateInMonth(year, month, 1);
		const end = dateInMonth(year, month, 31);
		const lastDayNum = new Date(year, month, 0).getDate();
		const payDayNum = settings?.pay_day && settings.pay_day > 0 ? settings.pay_day : lastDayNum;
		const payDate = dateInMonth(year, month, payDayNum);
		return { start, end, payDate, label: `01 ${monthNames[month - 1]} – ${end.slice(8, 10)} ${monthNames[month - 1]}` };
	}

	const startDay = settings.cutoff_start_day || 1;
	const endDay = settings.cutoff_end_day || 31;
	const payDay = settings.pay_day || endDay;

	let startYear = year;
	let startMonth = month;
	// Jika tanggal mulai lebih besar dari tanggal akhir, periode dimulai di bulan sebelumnya.
	if (startDay > endDay) {
		startMonth = month - 1;
		if (startMonth < 1) {
			startMonth = 12;
			startYear = year - 1;
		}
	}
	const start = dateInMonth(startYear, startMonth, startDay);
	const end = dateInMonth(year, month, endDay);
	const payDate = dateInMonth(year, month, payDay);
	const startLabel = `${pad2(startDay)} ${monthNames[startMonth - 1]}`;
	const endLabel = `${pad2(endDay)} ${monthNames[month - 1]}`;
	return { start, end, payDate, label: `${startLabel} – ${endLabel}` };
}

/** Hari terakhir bulan dari periode YYYY-MM. */
export function lastDayOfMonth(period: string): string {
	const [yearStr, monthStr] = period.split('-');
	const year = Number(yearStr);
	const month = Number(monthStr);
	if (!year || !month) return todayIso();
	const date = new Date(year, month, 0);
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

