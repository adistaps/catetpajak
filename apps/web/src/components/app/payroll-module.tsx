import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import {
	Banknote,
	Calculator,
	CalendarRange,
	CheckCircle2,
	Clock,
	HandCoins,
	Layers,
	Palmtree,
	Printer,
	Plus,
	Receipt,
	Search,
	Settings,
	SlidersHorizontal,
	Trash2,
	Users,
	X,
	type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, todayIso, type Account, type Company } from '@/lib/accounting';
import { companyLogoUrl, fetchCompanyLogoUrl } from '@/lib/company-logo';
import {
	LOAN_STATUS_LABELS,
	RUN_STATUS_LABELS,
	computeCutoffRange,
	defaultPayrollSettings,
	grossSalary,
	loanInstallment,
	totalDeductions,
	type Employee,
	type EmployeeLoan,
	type LoanStatus,
	type PayrollRun,
	type PayrollSettings,
	type Payslip,
} from '@/lib/payroll';
import { calcDeductions, type Pph21Method, type PtkpStatus, type TaxMethod } from '@/lib/payroll-calc';
import { employeeAttendanceFactor } from '@/lib/payroll-attendance-progress';
import type { AttendanceRecord } from '@/lib/attendance';
import { PayslipDocument, printPayslipDocument } from '@/components/app/payslip-document';
import { NoCompany } from '@/components/app/no-company';
import { PayrollComponents, type PayrollComponent } from '@/components/app/payroll-components';
import { PayrollRunsList } from '@/components/app/payroll-runs-list';
import { PayrollPostConfirmation } from '@/components/app/payroll-post-confirmation';
import { PayrollPayslipConfirmation } from '@/components/app/payroll-payslip-confirmation';
import { PayrollReview, type PayrollReviewAmounts } from '@/components/app/payroll-review';
import { PayrollPayslipTable } from '@/components/app/payroll-payslip-table';
import { PayrollLoanCreate } from '@/components/app/payroll-loan-create';
import { PayrollLoanEdit } from '@/components/app/payroll-loan-edit';
import { PayrollDisbursement } from '@/components/app/payroll-disbursement';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
	OvertimeManager,
	approvedOvertimeForPeriod,
} from '@/components/app/overtime-manager';
import type { OvertimeRequest } from '@/lib/overtime';
import { LeaveManager } from '@/components/app/leave-manager';
import { ReimbursementManager } from '@/components/app/reimbursement-manager';
import { ReimbursementSettingsManager } from '@/components/app/reimbursement-settings-manager';
import { cn } from '@/lib/utils';
import type { AppOutletContext } from '@/lib/app-context';
import { payrollScopeForRole } from '@/data/user-roles';
import { ensureLoanTransaction } from '@/lib/loan-ledger';
import { payrollErrorMessage } from '@/lib/payroll-expenses';
import { nextLoanPayment } from '@/lib/loan-schedule';
import { useLanguage } from '@/hooks/use-language';

interface PayrollModuleProps {
	company: Company;
}

function lastDayOfMonth(period: string): string {
	const [yearStr, monthStr] = period.split('-');
	const year = Number(yearStr);
	const month = Number(monthStr);
	if (!year || !month) return todayIso();
	const date = new Date(year, month, 0);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function firstDayOfMonth(period: string): string {
	return `${period}-01`;
}

/** Komponen payroll aktif yang berlaku pada periode (YYYY-MM). Salary dikecualikan karena sudah memperbarui gaji pokok. */
function componentsForPeriod(
	components: PayrollComponent[],
	period: string,
	rangeStart?: string,
	rangeEnd?: string,
): PayrollComponent[] {
	const periodStart = rangeStart ?? firstDayOfMonth(period);
	const periodEnd = rangeEnd ?? lastDayOfMonth(period);
	return components.filter(c => {
		if (c.status !== 'Active') return false;
		if (c.type === 'Salary') return false;
		const eff = c.effective_date || '';
		const end = c.end_date || '';
		if (!eff) return false;
		if (eff > periodEnd) return false;
		if (end && end < periodStart) return false;
		return true;
	});
}

/** Total tunjangan & potongan tambahan dari komponen yang ditugaskan ke karyawan pada periode ini. */
function empComponentTotals(
	periodComponents: PayrollComponent[],
	employeeId: string,
): { allowance: number; deduction: number } {
	let allowance = 0;
	let deduction = 0;
	for (const c of periodComponents) {
		const assigned = Array.isArray(c.employees) && c.employees.includes(employeeId);
		if (!assigned) continue;
		const amt = c.amount || 0;
		if (c.type === 'Deduction') deduction += amt;
		else allowance += amt; // Allowance, Overtime, Adjustment
	}
	return { allowance, deduction };
}

function findAccountByCode(accounts: Account[], code: string): Account | undefined {
	return accounts.find(account => account.code === code);
}

/** Hitung potongan karyawan: otomatis (BPJS & PPh 21) bila auto_calc, jika tidak pakai nilai manual. */
function computeEmpDeductions(emp: Employee): {
	bpjs_tk: number;
	bpjs_kes: number;
	pph21: number;
	tax_allowance: number;
	total: number;
} {
	if (emp.auto_calc) {
		const ded = calcDeductions({
			bpjsBase: emp.basic_salary || 0,
			monthlyBruto: grossSalary(emp),
			ptkpStatus: (emp.ptkp_status ?? 'TK0') as PtkpStatus,
			hasNpwp: Boolean((emp.npwp ?? '').trim()),
			pph21Method: (emp.pph21_method ?? 'annual') as Pph21Method,
			taxMethod: (emp.tax_method ?? 'gross') as TaxMethod,
			employeeType: emp.employee_type,
		});
		return {
			bpjs_tk: ded.bpjsTk.employeeTotal,
			bpjs_kes: ded.bpjsKes.employee,
			pph21: ded.pph21.monthlyTax,
			tax_allowance: ded.taxAllowance,
			total: ded.employeeTotal,
		};
	}
	return {
		bpjs_tk: emp.bpjs_tk || 0,
		bpjs_kes: emp.bpjs_kes || 0,
		pph21: emp.pph21 || 0,
		tax_allowance: 0,
		total: totalDeductions(emp),
	};
}


export function PayrollModule({ company }: PayrollModuleProps) {
	const { memberRole, canAccessMenu } = useOutletContext<AppOutletContext>();
	const { t } = useLanguage();
	const payrollScope = payrollScopeForRole(memberRole, canAccessMenu('payroll') ? ['payroll'] : []);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [runs, setRuns] = useState<PayrollRun[]>([]);
	const [runsLoading, setRunsLoading] = useState(true);
	const [runsError, setRunsError] = useState(false);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [loans, setLoans] = useState<EmployeeLoan[]>([]);
	const [components, setComponents] = useState<PayrollComponent[]>([]);
	const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
	const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
	const [sourcesLoading, setSourcesLoading] = useState(true);
	const [sourcesError, setSourcesError] = useState(false);
	const [loanSourcesError, setLoanSourcesError] = useState(false);
	const [sourcesRetry, setSourcesRetry] = useState(0);

	const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
	const [payslips, setPayslips] = useState<Payslip[]>([]);
	const [payslipDraft, setPayslipDraft] = useState<Record<string, Partial<Payslip>>>({});
	const [payslipSaving, setPayslipSaving] = useState(false);
	const [posting, setPosting] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [showPostConfirmation, setShowPostConfirmation] = useState(false);
	const [pendingPayslipPublish, setPendingPayslipPublish] = useState<{ ids: string[]; runId: string; period: string } | null>(null);
	const [otherDeductionAccount, setOtherDeductionAccount] = useState('');
	const [loanInterestAccount, setLoanInterestAccount] = useState('');
	const [previewSlip, setPreviewSlip] = useState<Payslip | null>(null);

	const [runForm, setRunForm] = useState({
		period: todayIso().slice(0, 7),
		pay_date: todayIso(),
		description: '',
		cash_account: '',
	});
	const [showRunForm, setShowRunForm] = useState(false);
	const [showRunReview, setShowRunReview] = useState(false);
	const [reviewOverrides, setReviewOverrides] = useState<Record<string, PayrollReviewAmounts>>({});
	const [runSaving, setRunSaving] = useState(false);
	const [runSaveUncertain, setRunSaveUncertain] = useState(false);
	/** true = semua karyawan aktif; false = hanya selectedEmployeeIds */
	const [selectAllEmployees, setSelectAllEmployees] = useState(true);
	const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
	const [showEmployeePicker, setShowEmployeePicker] = useState(false);
	const [employeePickerQuery, setEmployeePickerQuery] = useState('');
	const [payrollTab, setPayrollTab] = useState<'runs' | 'disbursement' | 'components' | 'overtime' | 'loans' | 'leave' | 'reimbursement' | 'reimb_settings' | 'settings'>('runs');
	const [showLoanForm, setShowLoanForm] = useState(false);
	const [editingLoan, setEditingLoan] = useState<EmployeeLoan | null>(null);

	// Fitur pencairan gaji dapat diaktifkan/dinonaktifkan Admin Pusat. Saat
	// dinonaktifkan, tab Pencairan Gaji disembunyikan; riwayat pencairan yang
	// tersimpan tetap dipertahankan dan tidak dihapus.
	const disbursementEnabled = isFeatureEnabled('payroll_disbursement');

	// HR hanya boleh membuka tab Overtime dan Cuti.
	useEffect(() => {
		if (payrollScope === 'hr' && payrollTab !== 'overtime' && payrollTab !== 'leave') {
			setPayrollTab('overtime');
		}
	}, [payrollScope, payrollTab]);

	// Saat fitur pencairan gaji dinonaktifkan, pastikan tab aktif bukan
	// 'disbursement' agar pengguna tidak terjebak di tab yang tidak tersedia.
	useEffect(() => {
		if (!disbursementEnabled && payrollTab === 'disbursement') {
			setPayrollTab('runs');
		}
	}, [disbursementEnabled, payrollTab]);

	const [payrollSettings, setPayrollSettings] = useState<PayrollSettings | null>(null);
	const [settingsForm, setSettingsForm] = useState(defaultPayrollSettings());
	const [settingsSaving, setSettingsSaving] = useState(false);

	const ownerId = pb.authStore.record?.id ?? '';
	// Logo perusahaan aktif untuk pratinjau & cetak payslip. Dimuat segar dari
	// PocketBase agar selalu memakai logo terbaru (termasuk setelah unggah) dan
	// tidak bergantung pada metadata koleksi yang mungkin hilang dari state app.
	const [companyLogo, setCompanyLogo] = useState<string | undefined>(() =>
		companyLogoUrl(company),
	);
	useEffect(() => {
		let cancelled = false;
		setCompanyLogo(companyLogoUrl(company));
		fetchCompanyLogoUrl(company.id)
			.then(url => {
				if (!cancelled) setCompanyLogo(url);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [company.id, company.logo]);

	const refreshEmployees = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('employees').getFullList<Employee>({
			filter,
			sort: 'name',
			requestKey: null,
		});
		setEmployees(list);
	}, [company.id]);

	const refreshRuns = useCallback(async () => {
		setRunsLoading(true);
		try {
			const filter = pb.filter('company = {:company}', { company: company.id });
			const list = await pb
				.collection('payroll_runs')
				.getFullList<PayrollRun>({ filter, sort: '-period,-created', requestKey: null });
			setRuns(list);
			setRunsError(false);
		} catch (error) {
			setRunsError(true);
			throw error;
		} finally {
			setRunsLoading(false);
		}
	}, [company.id]);

	const refreshAccounts = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('accounts').getFullList<Account>({
			filter,
			sort: 'code',
			requestKey: null,
		});
		setAccounts(list);
		setRunForm(prev => {
			if (prev.cash_account && list.some(a => a.id === prev.cash_account)) return prev;
			const bank = findAccountByCode(list, '102') ?? findAccountByCode(list, '101');
			return { ...prev, cash_account: bank?.id ?? '' };
		});
	}, [company.id]);

	const refreshLoans = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('employee_loans').getFullList<EmployeeLoan>({
			filter,
			sort: '-created',
			requestKey: null,
		});
		setLoans(list);
	}, [company.id]);

	const refreshComponents = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb
			.collection('payroll_components')
			.getFullList<PayrollComponent>({ filter, sort: '-created', requestKey: null });
		setComponents(list);
	}, [company.id]);

	const refreshOvertime = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('overtime_requests').getFullList<OvertimeRequest>({
			filter,
			sort: '-overtime_date',
			requestKey: null,
		});
		setOvertimeRequests(list);
	}, [company.id]);

	const refreshPayrollSettings = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb
			.collection('payroll_settings')
			.getFullList<PayrollSettings>({ filter, requestKey: null });
		const s = list[0] ?? null;
		setPayrollSettings(s);
		if (s) {
			setSettingsForm({
				use_cutoff: Boolean(s.use_cutoff),
				cutoff_start_day: s.cutoff_start_day ?? 21,
				cutoff_end_day: s.cutoff_end_day ?? 20,
				pay_day: s.pay_day ?? 25,
				meal_allowance_method: s.meal_allowance_method || 'flat',
				transport_allowance_method: s.transport_allowance_method || 'flat',
			});
		}
	}, [company.id]);

	useEffect(() => {
		refreshRuns().catch(() => toast.error('Gagal memuat data penggajian.'));
	}, [refreshRuns]);

	useEffect(() => {
		let cancelled = false;
		setShowRunReview(false);
		setShowRunForm(false);
		setReviewOverrides({});
		setSourcesLoading(true);
		setSourcesError(false);
		setLoanSourcesError(false);
		const reads = payrollScope === 'full'
			? [refreshEmployees(), refreshAccounts(), refreshLoans(), refreshComponents(), refreshOvertime(), refreshPayrollSettings()]
			: [refreshEmployees(), refreshOvertime()];
		Promise.allSettled(reads).then(results => {
			if (cancelled) return;
			setSourcesLoading(false);
			setSourcesError(results.some(result => result.status === 'rejected'));
			setLoanSourcesError(results[0]?.status === 'rejected' || (payrollScope === 'full' && results[2]?.status === 'rejected'));
		});
		return () => { cancelled = true; };
	}, [refreshEmployees, refreshAccounts, refreshLoans, refreshComponents, refreshOvertime, refreshPayrollSettings, sourcesRetry, payrollScope]);

	// Muat data kehadiran untuk perhitungan tunjangan berbasis kehadiran.
	// Tidak memblokir sumber lain: bila gagal, tunjangan kembali ke nominal flat.
	useEffect(() => {
		if (payrollScope !== 'full') return;
		let cancelled = false;
		const filter = pb.filter('company = {:company}', { company: company.id });
		pb.collection('attendance_records')
			.getFullList<AttendanceRecord>({ filter, sort: 'date', requestKey: null })
			.then(list => { if (!cancelled) setAttendanceRecords(list); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, [company.id, payrollScope, sourcesRetry]);

	const cashAccounts = useMemo(
		() => accounts.filter(account => account.type === 'aset' && /kas|bank/i.test(account.name)),
		[accounts],
	);

	const activeEmployees = useMemo(() => employees.filter(emp => emp.status === 'aktif'), [employees]);

	/** Karyawan resign yang masih punya tunjangan ex-employee aktif — tetap dibayar pada run payroll. */
	const exAllowanceEmployees = useMemo(() => {
		const ids = new Set<string>();
		for (const c of components) {
			if (c.status !== 'Active' || c.type !== 'Allowance') continue;
			if (!Array.isArray(c.employees)) continue;
			for (const id of c.employees) ids.add(id);
		}
		return employees.filter(emp => emp.status !== 'aktif' && ids.has(emp.id));
	}, [employees, components]);

	/** Kandidat penggajian: karyawan aktif + ex-employee dengan tunjangan aktif. */
	const payrollCandidates = useMemo(
		() => [...activeEmployees, ...exAllowanceEmployees],
		[activeEmployees, exAllowanceEmployees],
	);

	const runEmployees = useMemo(() => {
		if (selectAllEmployees) return payrollCandidates;
		const idSet = new Set(selectedEmployeeIds);
		return payrollCandidates.filter(emp => idSet.has(emp.id));
	}, [payrollCandidates, selectAllEmployees, selectedEmployeeIds]);

	const filteredPickerEmployees = useMemo(() => {
		const q = employeePickerQuery.trim().toLowerCase();
		if (!q) return payrollCandidates;
		return payrollCandidates.filter(
			emp =>
				emp.name.toLowerCase().includes(q) ||
				(emp.position || '').toLowerCase().includes(q),
		);
	}, [payrollCandidates, employeePickerQuery]);

	// --- Periode penggajian -------------------------------------------------
	const cutoffPreview = useMemo(
		() => computeCutoffRange(runForm.period, payrollSettings),
		[runForm.period, payrollSettings],
	);

	// Pratinjau dan pembuatan slip menggunakan data dan rumus yang sama.
	const reviewRows = useMemo(() => {
		const range = computeCutoffRange(runForm.period, payrollSettings);
		const periodComponents = componentsForPeriod(components, runForm.period, range.start, range.end);
		const mealMethod = payrollSettings?.meal_allowance_method || 'flat';
		const transportMethod = payrollSettings?.transport_allowance_method || 'flat';
		const today = todayIso();
		const attendanceByEmployee = new Map<string, AttendanceRecord[]>();
		if (mealMethod === 'attendance' || transportMethod === 'attendance') {
			for (const rec of attendanceRecords) {
				const day = rec.date?.slice(0, 10);
				if (!day || day < range.start || day > range.end) continue;
				const list = attendanceByEmployee.get(rec.employee);
				if (list) list.push(rec);
				else attendanceByEmployee.set(rec.employee, [rec]);
			}
		}
		return runEmployees.map(emp => {
			const isEx = emp.status !== 'aktif';
			const ded = isEx ? { bpjs_tk: 0, bpjs_kes: 0, pph21: 0, tax_allowance: 0, total: 0 } : computeEmpDeductions(emp);
			const loan = isEx ? undefined : loans.find(l => l.employee === emp.id && l.status === 'active');
			const loanPayment = loan ? nextLoanPayment(loan) : { principal: 0, interest: 0, valid: true };
			const loanDed = loanPayment.principal + loanPayment.interest;
			const comp = empComponentTotals(periodComponents, emp.id);
			const otPay = isEx ? 0 : approvedOvertimeForPeriod(overtimeRequests, emp.id, runForm.period, range.start, range.end);
			// Tunjangan makan & transportasi: flat per bulan, atau proporsional terhadap
			// hari masuk kerja (clock-in) dibanding hari terjadwal pada periode cut-off.
			const mealBase = emp.meal_allowance || 0;
			const transportBase = emp.transport_allowance || 0;
			let mealAmount = mealBase;
			let transportAmount = transportBase;
			if (!isEx && (mealMethod === 'attendance' || transportMethod === 'attendance')) {
				const factor = employeeAttendanceFactor(
					{ start: range.start, end: range.end },
					today,
					attendanceByEmployee.get(emp.id) ?? [],
				);
				if (mealMethod === 'attendance' && factor.scheduledDays > 0) {
					mealAmount = Math.round((mealBase * factor.attendedDays) / factor.scheduledDays);
				}
				if (transportMethod === 'attendance' && factor.scheduledDays > 0) {
					transportAmount = Math.round((transportBase * factor.attendedDays) / factor.scheduledDays);
				}
			}
			const defaults: PayrollReviewAmounts = {
				basic_salary: isEx ? 0 : emp.basic_salary || 0,
				meal_allowance: isEx ? 0 : mealAmount,
				transport_allowance: isEx ? 0 : transportAmount,
				other_allowance: isEx ? 0 : emp.other_allowance || 0,
				bpjs_tk: ded.bpjs_tk,
				bpjs_kes: ded.bpjs_kes,
				pph21: ded.pph21,
			};
			const amounts = isEx ? defaults : (reviewOverrides[emp.id] ?? defaults);
			const taxAllowance = ded.tax_allowance || 0;
			const compAllowance = comp.allowance + otPay;
			const compDeduction = comp.deduction;
			const gross = amounts.basic_salary + amounts.meal_allowance + amounts.transport_allowance + amounts.other_allowance + compAllowance + taxAllowance;
			const deduction = amounts.bpjs_tk + amounts.bpjs_kes + amounts.pph21 + loanDed + compDeduction;
			return { emp, isEx, defaults, amounts, loan, loanDed, loanPayment, compAllowance, compDeduction, taxAllowance, gross, deduction, net: Math.max(0, gross - deduction) };
		});
	}, [runEmployees, runForm.period, payrollSettings, components, loans, overtimeRequests, reviewOverrides, attendanceRecords]);

	const openCreateRun = () => {
		const period = todayIso().slice(0, 7);
		const range = computeCutoffRange(period, payrollSettings);
		setRunForm(prev => ({
			...prev,
			period,
			pay_date: range.payDate,
			description: '',
		}));
		setSelectAllEmployees(true);
		setSelectedEmployeeIds([]);
		setShowEmployeePicker(false);
		setEmployeePickerQuery('');
		setReviewOverrides({});
		setRunSaveUncertain(false);
		setShowRunReview(false);
		setShowRunForm(true);
	};

	const toggleEmployeeSelection = (id: string) => {
		setReviewOverrides({});
		setSelectAllEmployees(false);
		setSelectedEmployeeIds(prev =>
			prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
		);
	};

	const submitRun = async () => {
		if (runSaving || runSaveUncertain) return;
		if (sourcesLoading || sourcesError) {
			toast.error('Data payroll belum lengkap. Muat ulang data sebelum menjalankan payroll.');
			return;
		}
		if (!runForm.period) {
			toast.error('Periode wajib diisi.');
			return;
		}
		if (!runForm.cash_account) {
			toast.error('Pilih akun kas/bank untuk pembayaran gaji.');
			return;
		}
		if (payrollCandidates.length === 0) {
			toast.error('Belum ada karyawan aktif maupun tunjangan ex-employee. Tambahkan karyawan terlebih dahulu.');
			return;
		}
		if (runEmployees.length === 0) {
			toast.error('Pilih minimal satu karyawan untuk digaji pada periode ini.');
			return;
		}
		if (reviewRows.some(row => !row.loanPayment.valid)) {
			toast.error('Jadwal cicilan pinjaman tidak sesuai dengan sisa pinjaman. Perbarui jadwal sebelum menjalankan payroll.');
			return;
		}
		const totalGross = reviewRows.reduce((sum, row) => sum + row.gross, 0);
		const totalDed = reviewRows.reduce((sum, row) => sum + row.deduction, 0);
		if (reviewRows.some(row => row.deduction > row.gross)) {
			toast.error('Potongan seorang karyawan melebihi bruto. Periksa kembali komponen gaji.');
			return;
		}
		if (totalDed > totalGross) {
			toast.error('Total potongan melebihi total bruto. Periksa kembali komponen gaji.');
			return;
		}
		setRunSaving(true);
		let createdRun: PayrollRun | null = null;
		let slipsCreated = false;
		let atomicRunAttempt = false;
		try {
			const range = computeCutoffRange(runForm.period, payrollSettings);
			const periodComponents = componentsForPeriod(components, runForm.period, range.start, range.end);
			const perEmp = reviewRows;
			const affectedLoans = perEmp.filter(row => row.loan);
			if (affectedLoans.length > 0) {
				atomicRunAttempt = true;
				// Server membandingkan versi dan mencatat potongan beserta slip dalam satu transaksi.
				const result = await pb.send<{ runId: string }>('/api/loan-schedule/run', {
					method: 'POST', requestKey: null,
					body: {
						company: company.id,
						run: { period: runForm.period, pay_date: runForm.pay_date, description: runForm.description, cash_account: runForm.cash_account, cutoff_start: range.start, cutoff_end: range.end, total_gross: totalGross, total_deductions: totalDed, total_net: totalGross - totalDed },
						slips: perEmp.map(({ emp, amounts, gross, deduction, loan, loanDed, loanPayment, compAllowance, compDeduction, taxAllowance }) => ({
							employee: emp.id, ...amounts, gross, total_deductions: deduction, net_pay: Math.max(0, gross - deduction), loan: loan?.id ?? '', loan_updated: loan?.updated ?? '', loan_deduction: loanDed, loan_interest: loanPayment.interest, component_allowance: compAllowance, component_deduction: compDeduction, tax_method: (emp.tax_method ?? 'gross') as TaxMethod, tax_allowance: taxAllowance,
						})),
					},
				});
				if (!result.runId) throw new Error('Hasil payroll tidak tersedia.');
				setShowRunReview(false);
				setShowRunForm(false);
				setRunSaveUncertain(false);
				setShowEmployeePicker(false);
				setReviewOverrides({});
				await Promise.allSettled([refreshRuns(), refreshLoans()]);
				toast.success(`Periode ${runForm.period} dibuat dengan ${runEmployees.length} slip gaji.`);
				return;
			}
			const run = await pb.collection('payroll_runs').create<PayrollRun>({
				company: company.id,
				period: runForm.period,
				pay_date: runForm.pay_date,
				description: runForm.description,
				total_gross: totalGross,
				total_deductions: totalDed,
				total_net: totalGross - totalDed,
				status: 'draft',
				cash_account: runForm.cash_account,
				cutoff_start: range.start,
				cutoff_end: range.end,
				owner: ownerId,
			});
			createdRun = run;
			const slipResults = await Promise.allSettled(
				perEmp.map(({ emp, amounts, gross, deduction, loan, loanDed, loanPayment, compAllowance, compDeduction, taxAllowance }, index) =>
					pb.collection('payslips').create<Payslip>(
						{
							company: company.id,
							run: run.id,
							employee: emp.id,
							...amounts,
							gross,
							loan_deduction: loanDed,
							loan_interest: loanPayment.interest,
							loan: loan?.id ?? '',
							component_allowance: compAllowance,
							component_deduction: compDeduction,
							tax_method: (emp.tax_method ?? 'gross') as TaxMethod,
							tax_allowance: taxAllowance,
							total_deductions: deduction,
							net_pay: Math.max(0, gross - deduction),
							owner: ownerId,
						},
						{ requestKey: `seed-payslip-${run.id}-${index}` },
					),
				),
			);
			if (slipResults.some(result => result.status === 'rejected')) throw new Error('Gagal membuat sebagian slip gaji.');
			slipsCreated = true;
			// Tidak ada pinjaman pada cabang ini; pinjaman diproses atomik di server.
			setShowRunReview(false);
			setShowRunForm(false);
			setRunSaveUncertain(false);
			setShowEmployeePicker(false);
			setReviewOverrides({});
			await Promise.allSettled([refreshRuns(), refreshLoans()]);
			const compCount = periodComponents.length;
			toast.success(
				`Periode ${runForm.period} dibuat dengan ${runEmployees.length} slip gaji${compCount ? ` · ${compCount} komponen payroll diterapkan` : ''}.`,
			);
		} catch (error) {
			if (atomicRunAttempt) {
				const status = (error as { status?: number })?.status;
				if (status && status >= 400 && status < 500) {
					const message = payrollErrorMessage(error, 'Payroll tidak dapat disimpan. Periksa data dan coba lagi.');
					toast.error(message);
					if (message.includes('Pinjaman berubah') || message.includes('Potongan pinjaman berubah')) setRunSaveUncertain(true);
					await Promise.allSettled([refreshRuns(), refreshLoans()]);
				} else {
					setRunSaveUncertain(true);
					toast.error('Hasil penyimpanan belum dapat dipastikan. Kembali ke daftar dan periksa periode sebelum mencoba lagi.');
					await Promise.allSettled([refreshRuns(), refreshLoans()]);
				}
			} else if (createdRun && !slipsCreated) {
				try {
					await pb.collection('payroll_runs').delete(createdRun.id);
					toast.error('Gagal membuat slip gaji. Periode yang belum lengkap dibatalkan; silakan coba lagi.');
				} catch {
					setRunSaveUncertain(true);
					toast.error('Periode mungkin tersimpan sebagian. Kembali ke daftar dan periksa sebelum mencoba lagi.');
					await refreshRuns().catch(() => {});
				}
			} else {
				// Setelah slip dibuat, jangan ulangi operasi yang mungkin sudah memperbarui pinjaman.
				setRunSaveUncertain(true);
				toast.error('Hasil penyimpanan belum dapat dipastikan. Kembali ke daftar dan periksa periode serta pinjaman sebelum mencoba lagi.');
				await Promise.allSettled([refreshRuns(), refreshLoans()]);
			}
		} finally {
			setRunSaving(false);
		}
	};

	const openRun = async (run: PayrollRun) => {
		const filter = pb.filter('run = {:run} && company = {:company}', { run: run.id, company: company.id });
		const list = await pb
			.collection('payslips')
			.getFullList<Payslip>({ filter, sort: 'created', expand: 'employee', requestKey: null });
		setOtherDeductionAccount('');
		setLoanInterestAccount('');
		setPayslipDraft({});
		setPayslips(list);
		setSelectedRun(run);
	};

	const closeRun = () => {
		setShowPostConfirmation(false);
		setPendingPayslipPublish(null);
		setOtherDeductionAccount('');
		setLoanInterestAccount('');
		setSelectedRun(null);
		setPayslips([]);
		setPayslipDraft({});
	};

	const deleteRun = async (run: PayrollRun) => {
		if (run.status === 'posted') {
			if (
				!window.confirm(
					`Periode ${run.period} sudah diterbitkan. Menghapus juga akan menghapus jurnal dan transaksi payroll yang terkait. Lanjut?`,
				)
			) {
				return;
			}
		} else if (!window.confirm(`Hapus periode penggajian ${run.period}?`)) {
			return;
		}
		try {
			await pb.collection('payroll_runs').delete(run.id);
			if (selectedRun?.id === run.id) closeRun();
			await refreshRuns();
			toast.success('Periode penggajian dihapus.');
		} catch (error) {
			toast.error(payrollErrorMessage(error, 'Gagal menghapus periode penggajian.'));
		}
	};

	const patchPayslipDraft = (id: string, field: keyof Payslip, value: string) => {
		setPayslipDraft(prev => {
			const current = prev[id] ?? payslips.find(p => p.id === id) ?? {};
			return { ...prev, [id]: { ...current, [field]: Number(value) || 0 } };
		});
	};

	const recomputeFromDraft = (
		draft: Partial<Payslip>,
		loanDeduction = 0,
		compAllowance = 0,
		compDeduction = 0,
	): { gross: number; ded: number; net: number } => {
		const gross =
			(draft.basic_salary ?? 0) +
			(draft.meal_allowance ?? 0) +
			(draft.transport_allowance ?? 0) +
			(draft.other_allowance ?? 0) +
			compAllowance;
		const ded =
			(draft.bpjs_tk ?? 0) + (draft.bpjs_kes ?? 0) + (draft.pph21 ?? 0) + loanDeduction + compDeduction;
		return { gross, ded, net: Math.max(0, gross - ded) };
	};

	const savePayslips = async () => {
		const ids = Object.keys(payslipDraft);
		if (ids.length === 0) {
			toast.info('Tidak ada perubahan.');
			return;
		}
		setPayslipSaving(true);
		try {
			await Promise.all(
				ids.map(id => {
					const draft = payslipDraft[id];
					const slip = payslips.find(p => p.id === id);
					const loanDed = slip?.loan_deduction ?? 0;
					const compAllow = (slip?.component_allowance ?? 0) + (slip?.tax_allowance ?? 0);
					const compDed = slip?.component_deduction ?? 0;
					const { gross, ded, net } = recomputeFromDraft(draft, loanDed, compAllow, compDed);
					return pb.collection('payslips').update(id, {
						basic_salary: draft.basic_salary ?? 0,
						meal_allowance: draft.meal_allowance ?? 0,
						transport_allowance: draft.transport_allowance ?? 0,
						other_allowance: draft.other_allowance ?? 0,
						gross,
						bpjs_tk: draft.bpjs_tk ?? 0,
						bpjs_kes: draft.bpjs_kes ?? 0,
						pph21: draft.pph21 ?? 0,
						total_deductions: ded,
						net_pay: net,
					}, { requestKey: `save-payslip-${id}` });
				}),
			);
			const totalGross = payslips.reduce(
				(sum, p) =>
					sum +
					(payslipDraft[p.id]
						? recomputeFromDraft(
								payslipDraft[p.id],
								p.loan_deduction ?? 0,
								(p.component_allowance ?? 0) + (p.tax_allowance ?? 0),
								p.component_deduction ?? 0,
							).gross
						: p.gross),
				0,
			);
			const totalDed = payslips.reduce(
				(sum, p) =>
					sum +
					(payslipDraft[p.id]
						? recomputeFromDraft(
								payslipDraft[p.id],
								p.loan_deduction ?? 0,
								(p.component_allowance ?? 0) + (p.tax_allowance ?? 0),
								p.component_deduction ?? 0,
							).ded
						: p.total_deductions),
				0,
			);
			if (selectedRun) {
				await pb.collection('payroll_runs').update(selectedRun.id, {
					total_gross: totalGross,
					total_deductions: totalDed,
					total_net: totalGross - totalDed,
				});
			}
			setPayslipDraft({});
			setPayslipSaving(false);
			await refreshRuns();
			if (selectedRun) {
				const updated = await pb.collection('payroll_runs').getOne<PayrollRun>(selectedRun.id);
				setSelectedRun(updated);
				await openRun(updated);
			}
			toast.success('Slip gaji disimpan.');
		} catch {
			setPayslipSaving(false);
			toast.error('Gagal menyimpan slip gaji.');
		}
	};

	const postRun = async (confirmed = false) => {
		if (!selectedRun || posting || selectedRun.status !== 'draft') return;
		if (Object.keys(payslipDraft).length > 0) {
			toast.error('Simpan perubahan slip gaji sebelum menerbitkan jurnal.');
			return;
		}
		const otherTotal = payslips.reduce((sum, slip) => sum + (slip.component_deduction || 0), 0);
		if (otherTotal > 0 && !otherDeductionAccount) {
			toast.error('Pilih akun kredit untuk potongan komponen lain sebelum menerbitkan.');
			return;
		}
		if (payslips.some(slip => (slip.loan_interest || 0) > 0) && !loanInterestAccount) {
			toast.error('Pilih akun pendapatan bunga pinjaman sebelum menerbitkan.');
			return;
		}
		if (!confirmed) {
			setShowPostConfirmation(true);
			return;
		}
		setPosting(true);
		try {
			await pb.send('/api/payroll-expense/publish', {
				method: 'POST', body: { company: company.id, run: selectedRun.id, otherAccount: otherDeductionAccount, interestAccount: loanInterestAccount },
				requestKey: `payroll-publish-${selectedRun.id}`,
			});
			setSelectedRun({ ...selectedRun, status: 'posted' });
			await refreshRuns();
			toast.success('Jurnal penggajian diterbitkan dan tersedia di Biaya → Payroll.');
		} catch (error) {
			toast.error(payrollErrorMessage(error, 'Gagal menerbitkan jurnal penggajian. Periksa koneksi dan coba lagi.'));
		} finally {
			setPosting(false);
		}
	};

	const requestPayslipPublish = (ids: string[]) => {
		if (!selectedRun || publishing) return;
		const chosen = payslips.filter(slip => ids.includes(slip.id) && !slip.published);
		if (chosen.length === 0) {
			toast.info('Payslip yang dipilih sudah diterbitkan.');
			return;
		}
		if (chosen.some(slip => payslipDraft[slip.id])) {
			toast.error('Simpan perubahan slip gaji yang dipilih sebelum menerbitkan payslip.');
			return;
		}
		setPendingPayslipPublish({ ids: chosen.map(slip => slip.id), runId: selectedRun.id, period: selectedRun.period });
	};

	const publishPayslips = async (pending: { ids: string[]; runId: string; period: string }) => {
		if (!selectedRun || selectedRun.id !== pending.runId || publishing) return;
		const chosen = payslips.filter(slip => pending.ids.includes(slip.id) && !slip.published);
		if (chosen.length !== pending.ids.length || chosen.some(slip => payslipDraft[slip.id])) {
			toast.error('Pilihan atau data slip gaji berubah. Periksa kembali sebelum menerbitkan payslip.');
			return;
		}
		setPublishing(true);
		try {
			const results = await Promise.allSettled(chosen.map(slip =>
				pb.collection('payslips').update(slip.id, { published: true }, { requestKey: `publish-payslip-${slip.id}` }),
			));
			const list = await pb.collection('payslips').getFullList<Payslip>({
				filter: pb.filter('run = {:run} && company = {:company}', { run: selectedRun.id, company: company.id }),
				sort: 'created', expand: 'employee', requestKey: null,
			});
			setPayslips(list);
			const allPublished = list.length > 0 && list.every(slip => slip.published);
			try {
				const updated = await pb.collection('payroll_runs').update<PayrollRun>(selectedRun.id, { payslips_published: allPublished });
				setSelectedRun(updated);
				await refreshRuns();
			} catch {
				toast.error('Status periode belum dapat diperbarui. Periksa kembali setelah memuat ulang.');
			}
			const failed = results.filter(result => result.status === 'rejected').length;
			if (failed) toast.error(`${chosen.length - failed} payslip diterbitkan, ${failed} gagal. Periksa status lalu coba lagi.`);
			else toast.success(`${chosen.length} payslip terpilih diterbitkan ke aplikasi karyawan.`);
		} catch {
			toast.error('Hasil penerbitan belum dapat dipastikan. Muat ulang periode untuk memeriksa status payslip.');
		} finally {
			setPublishing(false);
		}
	};

	const printPayslip = (slip: Payslip) => {
		if (!printPayslipDocument({ slip, companyName: company.name, companyLogo: companyLogo, run: selectedRun })) {
			toast.error('Popup diblokir. Izinkan popup untuk mencetak slip gaji.');
		}
	};

	const savePayrollSettings = async (event: React.FormEvent) => {
		event.preventDefault();
		const startDay = Math.min(31, Math.max(1, Number(settingsForm.cutoff_start_day) || 1));
		const endDay = Math.min(31, Math.max(1, Number(settingsForm.cutoff_end_day) || 31));
		const payDay = Math.min(31, Math.max(1, Number(settingsForm.pay_day) || 25));
		setSettingsSaving(true);
		try {
			const payload = {
				company: company.id,
				use_cutoff: Boolean(settingsForm.use_cutoff),
				cutoff_start_day: startDay,
				cutoff_end_day: endDay,
				pay_day: payDay,
				meal_allowance_method: settingsForm.meal_allowance_method,
				transport_allowance_method: settingsForm.transport_allowance_method,
				owner: ownerId,
			};
			if (payrollSettings?.id) {
				const updated = await pb
					.collection('payroll_settings')
					.update<PayrollSettings>(payrollSettings.id, payload);
				setPayrollSettings(updated);
			} else {
				try {
					const created = await pb
						.collection('payroll_settings')
						.create<PayrollSettings>(payload);
					setPayrollSettings(created);
				} catch {
					const existing = await pb
						.collection('payroll_settings')
						.getFirstListItem<PayrollSettings>(
							pb.filter('company = {:company}', { company: company.id }),
						);
					const updated = await pb
						.collection('payroll_settings')
						.update<PayrollSettings>(existing.id, payload);
					setPayrollSettings(updated);
				}
			}
			// Perbarui tanggal bayar pada form buat periode agar sesuai pengaturan baru.
			setRunForm(prev => ({
				...prev,
				pay_date: computeCutoffRange(prev.period, {
					...settingsForm,
					cutoff_start_day: startDay,
					cutoff_end_day: endDay,
					pay_day: payDay,
				}).payDate,
			}));
			toast.success('Pengaturan cut-off penggajian disimpan.');
		} catch {
			toast.error('Gagal menyimpan pengaturan cut-off.');
		} finally {
			setSettingsSaving(false);
		}
	};

	// --- Render -------------------------------------------------------------
	if (!company) return <NoCompany />;

	if (showLoanForm && payrollScope === 'full') {
		return (
			<PayrollLoanCreate
				company={company}
				employees={employees}
				loans={loans}
				onCancel={() => setShowLoanForm(false)}
				onCreated={refreshLoans}
			/>
		);
	}

	if (editingLoan && payrollScope === 'full') {
		return (
			<PayrollLoanEdit
				company={company}
				loan={editingLoan}
				employees={employees}
				onCancel={() => setEditingLoan(null)}
				onSaved={refreshLoans}
			/>
		);
	}

	if (showRunReview) {
		return (
			<PayrollReview
				period={runForm.period}
				payDate={runForm.pay_date}
				cutoffStart={cutoffPreview.start}
				cutoffEnd={cutoffPreview.end}
				mealMethod={payrollSettings?.meal_allowance_method || 'flat'}
				transportMethod={payrollSettings?.transport_allowance_method || 'flat'}
				rows={reviewRows}
				overrides={reviewOverrides}
				onChangeOverrides={setReviewOverrides}
				saving={runSaving}
				runBlocked={runSaveUncertain || sourcesLoading || sourcesError}
				onBack={() => {
					setShowRunReview(false);
					if (runSaveUncertain) setShowRunForm(false);
				}}
				onRun={() => { void submitRun(); }}
			/>
		);
	}

	return (
		<div className="mx-auto max-w-7xl space-y-6">
			<PayrollPayslipConfirmation
				open={pendingPayslipPublish !== null}
				count={pendingPayslipPublish?.ids.length ?? 0}
				period={pendingPayslipPublish?.period ?? ''}
				onOpenChange={open => { if (!open) setPendingPayslipPublish(null); }}
				onConfirm={() => { if (pendingPayslipPublish) void publishPayslips(pendingPayslipPublish); }}
			/>
			<PayrollPostConfirmation
				open={showPostConfirmation}
				onOpenChange={setShowPostConfirmation}
				onConfirm={() => { void postRun(true); }}
				period={selectedRun?.period ?? ''}
				gross={payslips.reduce((sum, p) => sum + (p.gross || 0), 0)}
				otherDeductions={payslips.reduce((sum, p) => sum + (p.component_deduction || 0), 0)}
				otherAccountName={accounts.find(account => account.id === otherDeductionAccount)?.name}
				loanInterest={payslips.reduce((sum, p) => sum + (p.loan_interest || 0), 0)}
				loanInterestAccountName={accounts.find(account => account.id === loanInterestAccount)?.name}
			/>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t('payroll.title')}</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{payrollScope === 'hr'
						? t('payroll.subtitle_hr')
						: t('payroll.subtitle_full')}
					</p>
				</div>
				{payrollTab === 'runs' && !selectedRun && !showRunForm ? (
					<button
						type="button"
						onClick={openCreateRun}
						disabled={sourcesLoading || sourcesError}
						className="inline-flex items-center gap-2 rounded-md border border-emerald-600 bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{t('payroll.create_period')}
					</button>
				) : null}
			</div>

			<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
			<div className="min-w-0 flex-1 space-y-6">

			{payrollTab === 'disbursement' ? <PayrollDisbursement company={company} runs={runs} onRefreshRuns={refreshRuns} /> : null}
			{payrollTab === 'components' ? <PayrollComponents company={company} /> : null}
			{payrollTab === 'overtime' ? <OvertimeManager company={company} /> : null}
			{payrollTab === 'leave' ? <LeaveManager company={company} /> : null}
			{payrollTab === 'loans' ? (
				<LoanAdmin
					company={company}
					loans={loans}
					employees={employees}
					loading={sourcesLoading}
					error={loanSourcesError}
					onRetry={() => setSourcesRetry(value => value + 1)}
					onCreate={() => setShowLoanForm(true)}
					onEdit={loan => setEditingLoan(loan)}
					onChanged={refreshLoans}
				/>
			) : null}
			{payrollTab === 'reimbursement' ? <ReimbursementManager company={company} /> : null}
			{payrollTab === 'reimb_settings' ? <ReimbursementSettingsManager company={company} /> : null}
			{payrollTab === 'settings' ? (
				<CutoffSettings
					settingsForm={settingsForm}
					setSettingsForm={setSettingsForm}
					payrollSettings={payrollSettings}
					saving={settingsSaving}
					onSave={savePayrollSettings}
				/>
			) : null}

			{payrollTab === 'runs' && !selectedRun && (sourcesLoading || sourcesError) ? (
				<div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
					{sourcesLoading ? 'Memuat data payroll…' : <>Data payroll belum lengkap. <button type="button" onClick={() => setSourcesRetry(value => value + 1)} className="font-semibold text-primary hover:underline">Coba lagi</button></>}
				</div>
			) : null}


			{/* ---------------- Daftar Periode ---------------- */}
			{payrollTab === 'runs' && !selectedRun ? (
				<div className="space-y-6">
					{showRunForm ? (
						<form
							onSubmit={event => {
								event.preventDefault();
								setShowRunReview(true);
							}}
							className="rounded-md bg-transparent px-5 py-7 text-[#202938] sm:px-8 sm:py-8"
						>
							<div className="mx-auto w-full max-w-[492px] space-y-6">
								<div>
									<h2 className="text-lg font-medium">Pengaturan awal payroll</h2>
									<p className="mt-1 text-sm text-slate-500">Atur periode dan pilih karyawan untuk penggajian ini.</p>
								</div>
								<div className="flex gap-3 rounded-md bg-[#fcf3df] p-4 text-sm leading-relaxed">
									<CalendarRange className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
									<div>
										<p className="font-semibold">Periode cut-off</p>
										<p className="mt-1">{cutoffPreview.label} · Pembayaran: {formatDate(cutoffPreview.payDate)}</p>
									</div>
								</div>
							<div className="space-y-1.5">
								<label htmlFor="run-period" className="block text-sm font-semibold">
									Periode <span className="text-destructive">*</span>
								</label>
								<input
									id="run-period"
									type="month"
									required
									value={runForm.period}
									onChange={e => {
										const period = e.target.value;
										setReviewOverrides({});
										const range = computeCutoffRange(period, payrollSettings);
										setRunForm(f => ({
											...f,
											period,
											pay_date: period ? range.payDate : f.pay_date,
										}));
									}}
									className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4b63df] focus:ring-2 focus:ring-blue-100"
								/>
							</div>
							<div className="space-y-1.5">
								<label htmlFor="run-paydate" className="block text-sm font-semibold">
									Tanggal bayar <span className="text-destructive">*</span>
								</label>
								<input
									id="run-paydate"
									type="date"
									required
									value={runForm.pay_date}
									onChange={e => setRunForm(f => ({ ...f, pay_date: e.target.value }))}
									className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4b63df] focus:ring-2 focus:ring-blue-100"
								/>
							</div>
							<div className="space-y-1.5">
								<label htmlFor="run-cash" className="block text-sm font-semibold">
									Akun kas/bank pembayaran <span className="text-destructive">*</span>
								</label>
								<select
									id="run-cash"
									required
									value={runForm.cash_account}
									onChange={e => setRunForm(f => ({ ...f, cash_account: e.target.value }))}
									className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4b63df] focus:ring-2 focus:ring-blue-100"
								>
									<option value="">Pilih akun</option>
									{cashAccounts.map(acc => (
										<option key={acc.id} value={acc.id}>
											{acc.code} — {acc.name}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-1.5">
								<label htmlFor="run-desc" className="block text-sm font-semibold">
									Keterangan
								</label>
								<input
									id="run-desc"
									value={runForm.description}
									onChange={e => setRunForm(f => ({ ...f, description: e.target.value }))}
									placeholder="Penggajian bulan …"
									className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-[#4b63df] focus:ring-2 focus:ring-blue-100"
								/>
							</div>

							{/* Siapa yang diproses */}
							<div className="space-y-3">
								<p className="text-sm font-semibold">
									Siapa yang akan diproses pada periode penggajian ini?
								</p>
								<div className="flex flex-wrap items-center gap-3">
									<button
										type="button"
										onClick={() => {
											setSelectAllEmployees(false);
											setShowEmployeePicker(v => !v);
										}}
										className={cn(
											'inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-semibold text-emerald-700 transition-colors',
											!selectAllEmployees || showEmployeePicker
												? 'border-emerald-600 bg-emerald-50'
												: 'border-slate-300 bg-white hover:bg-emerald-50',
										)}
									>
										<Users className="size-4" />
										Pilih karyawan
										{!selectAllEmployees && selectedEmployeeIds.length > 0
											? ` (${selectedEmployeeIds.length})`
											: ''}
									</button>
									<label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[#202938]">
										<input
											type="checkbox"
											checked={selectAllEmployees}
											onChange={e => {
												const on = e.target.checked;
												setReviewOverrides({});
												setSelectAllEmployees(on);
												if (on) {
													setSelectedEmployeeIds([]);
													setShowEmployeePicker(false);
													setEmployeePickerQuery('');
												} else {
													setShowEmployeePicker(true);
												}
											}}
											className="size-4 rounded border-slate-300 accent-emerald-600"
										/>
										Pilih semua karyawan ({payrollCandidates.length})
									</label>
								</div>

								{showEmployeePicker && !selectAllEmployees ? (
									<div className="rounded-xl border border-border bg-background p-3 shadow-soft-sm">
										<div className="mb-3 flex items-center gap-2">
											<div className="relative flex-1">
												<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
												<input
													type="search"
													value={employeePickerQuery}
													onChange={e => setEmployeePickerQuery(e.target.value)}
													placeholder="Cari nama atau jabatan…"
													className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
												/>
											</div>
											<button
												type="button"
												onClick={() => {
													setReviewOverrides({});
													if (selectedEmployeeIds.length === payrollCandidates.length) {
														setSelectedEmployeeIds([]);
													} else {
														setSelectedEmployeeIds(payrollCandidates.map(e => e.id));
													}
												}}
												className="shrink-0 text-xs font-semibold text-primary hover:underline"
											>
												{selectedEmployeeIds.length === payrollCandidates.length
													? 'Hapus semua'
													: 'Centang semua'}
											</button>
											<button
												type="button"
												onClick={() => setShowEmployeePicker(false)}
												aria-label="Tutup"
												className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
											>
												<X className="size-3.5" />
											</button>
										</div>
										<div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
											{filteredPickerEmployees.length === 0 ? (
												<p className="px-3 py-6 text-center text-sm text-muted-foreground">
													Tidak ada karyawan yang cocok.
												</p>
											) : (
												filteredPickerEmployees.map(emp => {
													const checked = selectedEmployeeIds.includes(emp.id);
													return (
														<label
															key={emp.id}
															className={cn(
																'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40',
																checked && 'bg-primary/5',
															)}
														>
															<input
																type="checkbox"
																checked={checked}
																onChange={() => toggleEmployeeSelection(emp.id)}
																className="size-4 rounded border-border text-primary accent-primary"
															/>
															<span className="min-w-0 flex-1">
																<span className="flex items-center gap-2">
																	<span className="font-medium text-foreground">{emp.name}</span>
																	{emp.status !== 'aktif' ? (
																		<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
																			Ex-employee
																		</span>
																	) : null}
																</span>
																{emp.position ? (
																	<span className="block text-xs text-muted-foreground">{emp.position}</span>
																) : null}
															</span>
															<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
																{emp.status !== 'aktif'
																	? formatRupiah(
																		components
																			.filter(
																				c =>
																					c.status === 'Active' &&
																					c.type === 'Allowance' &&
																					Array.isArray(c.employees) &&
																					c.employees.includes(emp.id),
																			)
																			.reduce((s, c) => s + (c.amount || 0), 0),
																		)
																	: formatRupiah(grossSalary(emp))}
															</span>
														</label>
													);
												})
											)}
										</div>
										<p className="mt-2 text-xs text-muted-foreground">
											{selectedEmployeeIds.length} dari {payrollCandidates.length} karyawan dipilih.
										</p>
									</div>
								) : null}

								<p className="text-sm leading-relaxed text-slate-500">
									Slip gaji akan dibuat untuk{' '}
									<span className="font-semibold text-foreground">{runEmployees.length}</span>{' '}
									karyawan
									{selectAllEmployees
										? ' aktif + ex-employee dengan tunjangan aktif (semua).'
										: ' yang dipilih.'}
								</p>
							</div>

							<div className="flex flex-wrap flex-row-reverse items-center gap-3">
								<button
									type="submit"
									disabled={runSaving || sourcesLoading || sourcesError || runEmployees.length === 0}
									className="min-h-11 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
								>
									Lanjutkan ke tinjauan
								</button>
								<button
									type="button"
									onClick={() => {
										setShowRunForm(false);
										setShowEmployeePicker(false);
									}}
									className="min-h-11 px-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
								>
									Batal
								</button>
							</div>
							</div>
						</form>
					) : null}

					{!showRunForm ? (
						<PayrollRunsList
							companyId={company.id}
							runs={runs}
							runsLoading={runsLoading}
							runsError={runsError}
							onRetry={() => { void refreshRuns().catch(() => toast.error('Gagal memuat data penggajian.')); }}
							onOpen={run => { void openRun(run).catch(() => toast.error('Gagal memuat slip gaji untuk periode ini.')); }}
							onDelete={run => { void deleteRun(run); }}
						/>
					) : null}
				</div>
			) : null}

			{/* ---------------- Detail Periode ---------------- */}
			{payrollTab === 'runs' && selectedRun ? (
				<div className="min-w-0 space-y-6">
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
						<div>
							<button
								type="button"
								onClick={closeRun}
								className="text-xs font-semibold text-primary transition-colors hover:text-primary/80"
							>
								← Kembali
							</button>
							<h2 className="mt-1 text-xl font-bold tracking-tight">
								Penggajian {selectedRun.period}
							</h2>
							<p className="text-sm text-muted-foreground">
								{selectedRun.cutoff_start && selectedRun.cutoff_end
									? `Cut-off ${formatDate(selectedRun.cutoff_start)} – ${formatDate(selectedRun.cutoff_end)} · `
									: ''}
								Tanggal bayar {formatDate(selectedRun.pay_date)}
								{selectedRun.description ? ` · ${selectedRun.description}` : ''}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<span
								className={cn(
									'rounded-full px-3 py-1 text-xs font-bold',
									selectedRun.status === 'posted'
										? 'bg-emerald-100 text-emerald-800'
										: 'bg-amber-100 text-amber-800',
								)}
							>
								{RUN_STATUS_LABELS[selectedRun.status]}
							</span>
							<span
								className={cn(
									'rounded-full px-3 py-1 text-xs font-bold',
									(payslips.length > 0 && payslips.every(p => p.published))
										? 'bg-emerald-100 text-emerald-800'
										: 'bg-amber-100 text-amber-800',
								)}
							>
								{payslips.length > 0 && payslips.every(p => p.published)
									? 'Slip Diterbitkan'
									: `${payslips.filter(p => p.published).length} dari ${payslips.length} slip diterbitkan`}
							</span>
							{selectedRun.status === 'draft' ? (
								<>
									<button
										type="button"
										onClick={savePayslips}
										disabled={payslipSaving || Object.keys(payslipDraft).length === 0}
										className="rounded-full border border-primary/40 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
									>
										{payslipSaving ? 'Menyimpan…' : 'Simpan Perubahan'}
									</button>
									<button
										type="button"
										onClick={() => { void postRun(); }}
										disabled={posting || payslips.length === 0}
										className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
									>
										<CheckCircle2 className="size-4" />
										{posting ? 'Memproses…' : 'Terbitkan Jurnal'}
									</button>
								</>
							) : (
								<button
									type="button"
									onClick={() => deleteRun(selectedRun)}
									className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
								>
									<Trash2 className="size-4" /> Hapus & Batalkan Jurnal
								</button>
							)}
						</div>
					</div>

					<PayrollPayslipTable
						key={selectedRun.id}
						run={selectedRun}
						payslips={payslips}
						drafts={payslipDraft}
						onEdit={patchPayslipDraft}
						onPreview={setPreviewSlip}
						onPrint={printPayslip}
						onPublish={requestPayslipPublish}
						publishing={publishing}
						recompute={recomputeFromDraft}
					/>

					{selectedRun.status === 'draft' && payslips.some(slip => (slip.component_deduction || 0) > 0) ? (
						<div className="rounded-xl border border-border bg-card p-4 text-sm">
							<label htmlFor="payroll-other-account" className="font-semibold">Akun kredit untuk potongan komponen lain ({formatRupiah(payslips.reduce((sum, slip) => sum + (slip.component_deduction || 0), 0))})</label>
							<select id="payroll-other-account" value={otherDeductionAccount} onChange={event => setOtherDeductionAccount(event.target.value)} className="mt-2 block w-full max-w-md rounded-lg border border-border bg-background px-3 py-2">
								<option value="">Pilih akun sesuai jenis potongan</option>
								{accounts.filter(account => !account.is_header && !accounts.some(child => child.parent === account.id)).map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
							</select>
							<p className="mt-2 text-xs text-muted-foreground">Seluruh potongan komponen lain akan digabung pada akun ini. Pilih akun sesuai kebijakan pembukuan perusahaan.</p>
						</div>
					) : null}
					{selectedRun.status === 'draft' && payslips.some(slip => (slip.loan_interest || 0) > 0) ? (
						<div className="rounded-xl border border-border bg-card p-4 text-sm">
							<label htmlFor="payroll-interest-account" className="font-semibold">Akun kredit untuk bunga pinjaman ({formatRupiah(payslips.reduce((sum, slip) => sum + (slip.loan_interest || 0), 0))})</label>
							<select id="payroll-interest-account" value={loanInterestAccount} onChange={event => setLoanInterestAccount(event.target.value)} className="mt-2 block w-full max-w-md rounded-lg border border-border bg-background px-3 py-2">
								<option value="">Pilih akun pendapatan bunga</option>
								{accounts.filter(account => account.type === 'pendapatan' && !account.is_header && !accounts.some(child => child.parent === account.id)).map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
							</select>
							<p className="mt-2 text-xs text-muted-foreground">Bunga dikreditkan terpisah dari pokok pinjaman sesuai akun yang dipilih.</p>
						</div>
					) : null}
					{selectedRun.status === 'posted' ? (
						<p className="text-xs text-muted-foreground">
							Jurnal penggajian telah diterbitkan: Debit Beban Gaji (501), Kredit Kas/Bank, Utang BPJS
							(204), Utang PPh 21 (205), Piutang Pinjaman Karyawan (206), dan akun pendapatan bunga yang dipilih bila ada bunga. Menghapus periode ini akan menghapus juga baris jurnalnya.
						</p>
					) : (
						<p className="text-xs text-muted-foreground">
							Sesuaikan nilai slip gaji bila perlu, lalu klik &quot;Terbitkan Jurnal&quot; untuk mencatat
							jurnal akuntansi otomatis.
						</p>
					)}
					{payslips.length > 0 && payslips.every(p => p.published) ? (
						<p className="text-xs text-muted-foreground">
							Slip gaji telah diterbitkan dan dapat dilihat karyawan di aplikasi karyawan.
						</p>
					) : (
						<p className="text-xs text-muted-foreground">
							Pilih karyawan pada tabel, lalu gunakan &quot;Publish payslip&quot; agar karyawan terpilih dapat melihat slip gajinya di aplikasi karyawan.
						</p>
					)}
					{previewSlip ? (
						<PayslipPreview
							slip={previewSlip}
							run={selectedRun}
							company={company}
							onClose={() => setPreviewSlip(null)}
							onPrint={() => printPayslip(previewSlip)}
						/>
					) : null}
				</div>
			) : null}
			</div>

			<nav
				aria-label="Menu penggajian"
				className="order-first flex w-full shrink-0 flex-col gap-1 bg-transparent py-1 lg:sticky lg:top-4 lg:order-first lg:w-64"
			>
				{(payrollScope === 'hr'
					? ([
							{ key: 'overtime' as const, label: t('payroll.tab.overtime'), icon: Clock },
							{ key: 'leave' as const, label: t('payroll.tab.leave'), icon: Palmtree },
						])
					: ([
							{ key: 'runs' as const, label: t('payroll.tab.runs'), icon: CalendarRange },
							...(disbursementEnabled
								? [{ key: 'disbursement' as const, label: t('payroll.tab.disbursement'), icon: Banknote }]
								: []),
							{ key: 'components' as const, label: t('payroll.tab.components'), icon: Layers },
							{ key: 'overtime' as const, label: t('payroll.tab.overtime'), icon: Clock },
							{ key: 'leave' as const, label: t('payroll.tab.leave'), icon: Palmtree },
							{ key: 'loans' as const, label: t('payroll.tab.loans'), icon: HandCoins },
							{ key: 'reimbursement' as const, label: t('payroll.tab.reimbursement'), icon: Receipt },
							{ key: 'reimb_settings' as const, label: t('payroll.tab.reimb_settings'), icon: SlidersHorizontal },
							{ key: 'settings' as const, label: t('payroll.tab.settings'), icon: Settings },
						])
				).map(item => {
					const Icon = item.icon as LucideIcon;
					const active = payrollTab === item.key;
					return (
						<button
							key={item.key}
							type="button"
							onClick={() => {
								setPayrollTab(item.key);
								closeRun();
								setShowRunForm(false);
								if (item.key === 'overtime') refreshOvertime().catch(() => {});
								if (item.key === 'loans') refreshLoans().catch(() => {});
							}}
							className={cn(
								'relative flex w-full items-center gap-3.5 border-l-[3px] px-4 py-3.5 text-left text-[15px] font-semibold leading-snug transition-colors',
								active
									? 'border-emerald-600 bg-emerald-50 text-emerald-600'
									: 'border-transparent text-[#5f7d72] hover:bg-emerald-50/60 hover:text-emerald-700',
							)}
						>
							<Icon className="size-5 shrink-0" strokeWidth={1.75} />
							<span>{item.label}</span>
						</button>
					);
				})}
			</nav>
			</div>
		</div>
	);
}

function PayslipPreview({
	slip,
	run,
	company,
	onClose,
	onPrint,
}: {
	slip: Payslip;
	run: PayrollRun;
	company: Company;
	onClose: () => void;
	onPrint: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			onClick={onClose}
			onKeyDown={e => e.key === 'Escape' && onClose()}
			role="presentation"
		>
			<div
				className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
				onClick={e => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="payslip-preview-title"
			>
				<div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
					<h3 id="payslip-preview-title" className="text-base font-bold text-slate-900">Pratinjau slip gaji</h3>
					<button type="button" onClick={onClose} aria-label="Tutup pratinjau" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
				</div>
				<div className="min-h-0 overflow-y-auto bg-slate-100 p-3 sm:p-6">
					<PayslipDocument slip={slip} run={run} companyName={company.name} companyLogo={companyLogoUrl(company)} />
					<p className="mt-3 text-xs text-slate-600">Pratinjau ini tidak mengubah status publikasi slip.</p>
				</div>
				<div className="flex justify-end gap-2 border-t border-border px-6 py-3">
					<button type="button" onClick={onPrint} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-muted">
						<Printer className="size-4" /> Cetak
					</button>
					<button type="button" onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
						Tutup
					</button>
				</div>
			</div>
		</div>
	);
}

function LoanAdmin({
	company,
	loans,
	employees,
	loading,
	error,
	onRetry,
	onCreate,
	onEdit,
	onChanged,
}: {
	company: Company;
	loans: EmployeeLoan[];
	employees: Employee[];
	loading: boolean;
	error: boolean;
	onRetry: () => void;
	onCreate: () => void;
	onEdit: (loan: EmployeeLoan) => void;
	onChanged: () => Promise<void>;
}) {
	const [busy, setBusy] = useState<string | null>(null);
	const empMap = useMemo(() => {
		const m = new Map<string, Employee>();
		for (const e of employees) m.set(e.id, e);
		return m;
	}, [employees]);

	const setStatus = async (loan: EmployeeLoan, status: LoanStatus) => {
		setBusy(loan.id);
		try {
			await pb.collection('employee_loans').update(loan.id, { status });
			// Saat disetujui, pastikan pengajuan muncul di menu Biaya sebagai
			// transaksi siap dipetakan akuntan — idempoten, tanpa jurnal otomatis.
			if (status === 'active') {
				try {
					await ensureLoanTransaction(
						company,
						{ ...loan, status },
						empMap.get(loan.employee)?.name || 'Karyawan',
					);
				} catch {
					// Halaman Biaya akan melengkapi transaksi saat dibuka.
				}
			}
			toast.success(`Pinjaman ${status === 'active' ? 'disetujui' : status === 'cancelled' ? 'ditolak' : 'diperbarui'}.`);
			await onChanged().catch(() => toast.warning('Status tersimpan, tetapi daftar belum dapat diperbarui. Muat ulang halaman.'));
		} catch (error) {
			toast.error(payrollErrorMessage(error, 'Gagal memperbarui pinjaman.'));
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-bold tracking-tight text-slate-900">Pinjaman Karyawan</h2>
					<p className="text-sm text-muted-foreground">
						Setujui pengajuan pinjaman karyawan. Pinjaman Aktif dipotong otomatis saat periode gaji dibuat.
					</p>
				</div>
				<button type="button" onClick={onCreate} disabled={loading || error} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
					<Plus className="size-4" /> Tambah Pinjaman
				</button>
			</div>
			{error && !loading ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Data payroll belum lengkap. <button type="button" onClick={onRetry} className="font-semibold underline">Coba lagi</button></p> : null}
			<div className="loan-table-container overflow-hidden rounded-2xl border border-border">
				{loading ? (
					<p role="status" className="px-5 py-10 text-center text-sm text-muted-foreground">Memuat data pinjaman…</p>
				) : error ? (
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">Data pinjaman belum dapat ditampilkan.</p>
				) : loans.length === 0 ? (
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">Belum ada pinjaman.</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[820px] text-left text-sm">
							<thead>
								<tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
									<th className="px-4 py-3 font-semibold">Karyawan</th>
									<th className="px-4 py-3 font-semibold">Tanggal</th>
									<th className="px-4 py-3 text-right font-semibold">Pokok</th>
									<th className="px-4 py-3 text-right font-semibold">Angsuran</th>
									<th className="px-4 py-3 text-right font-semibold">Cicilan/bln</th>
									<th className="px-4 py-3 font-semibold">Status</th>
									<th className="px-4 py-3 text-right font-semibold">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{loans.map(l => {
									const emp = empMap.get(l.employee);
									const nextPayment = nextLoanPayment(l);
									return (
										<tr key={l.id}>
											<td className="px-4 py-3 font-medium">{emp?.name ?? '—'}</td>
											<td className="px-4 py-3 text-muted-foreground">{formatDate(l.disbursed_date)}</td>
											<td className="px-4 py-3 text-right">{formatRupiah(l.principal || 0)}</td>
											<td className="px-4 py-3 text-right">{l.installments || 0}x</td>
											<td className="px-4 py-3 text-right">{l.status === 'completed' ? '—' : formatRupiah(Array.isArray(l.installment_schedule) && l.installment_schedule.length ? nextPayment.principal + nextPayment.interest : loanInstallment(l))}</td>
											<td className="px-4 py-3">
												<span className={cn(
													'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
													l.status === 'pending' && 'bg-amber-100 text-amber-700',
													l.status === 'active' && 'bg-emerald-100 text-emerald-800',
													l.status === 'completed' && 'bg-emerald-100 text-emerald-800',
													l.status === 'cancelled' && 'bg-slate-100 text-slate-600',
												)}>
												{LOAN_STATUS_LABELS[l.status] ?? l.status}
												</span>
											</td>
											<td className="px-4 py-3 text-right">
												<div className="flex flex-wrap justify-end gap-1">
												{l.status === 'pending' ? (
													<>
														<button
															type="button"
															disabled={busy === l.id}
															onClick={() => setStatus(l, 'active')}
															className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
														>
															Setujui
														</button>
														<button
															type="button"
															disabled={busy === l.id}
															onClick={() => setStatus(l, 'cancelled')}
															className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
														>
															Tolak
														</button>
													</>
												) : null}
												<button
													type="button"
													disabled={busy === l.id}
													onClick={() => onEdit(l)}
													className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
												>
													Perbarui
												</button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

function CutoffSettings({
	settingsForm,
	setSettingsForm,
	payrollSettings,
	saving,
	onSave,
}: {
	settingsForm: ReturnType<typeof defaultPayrollSettings>;
	setSettingsForm: React.Dispatch<React.SetStateAction<ReturnType<typeof defaultPayrollSettings>>>;
	payrollSettings: PayrollSettings | null;
	saving: boolean;
	onSave: (event: React.FormEvent) => void;
}) {
	const preview = computeCutoffRange(todayIso().slice(0, 7), settingsForm);
	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-xl font-bold tracking-tight">Pengaturan Penggajian</h2>
				<p className="text-sm text-muted-foreground">
					Atur rentang periode penggajian, tanggal pembayaran, serta cara hitung tunjangan
					makan dan transportasi (flat bulanan atau berdasarkan kehadiran). Contoh: cut-off
					21–20 berarti periode berjalan dari tanggal 21 bulan sebelumnya sampai tanggal 20
					bulan ini, dan gaji dibayarkan pada tanggal yang Anda tentukan (mis. tanggal 25).
				</p>
			</div>
			<form
				onSubmit={onSave}
				className="max-w-2xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft-sm"
			>
				<label className="flex items-center gap-2 text-sm font-semibold">
					<input
						type="checkbox"
						checked={settingsForm.use_cutoff}
						onChange={e =>
							setSettingsForm(s => ({ ...s, use_cutoff: e.target.checked }))
						}
						className="size-4 rounded border-slate-300"
					/>
					Aktifkan periode cut-off kustom
				</label>
				<p className="-mt-3 text-xs text-muted-foreground">
					Jika tidak aktif, periode mengikuti bulan kalender penuh (tanggal 1 sampai akhir bulan).
				</p>
				<div className="grid gap-4 sm:grid-cols-3">
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Tanggal mulai cut-off (1–31)</span>
						<input
							type="number"
							min={1}
							max={31}
							disabled={!settingsForm.use_cutoff}
							value={settingsForm.cutoff_start_day}
							onChange={e =>
								setSettingsForm(s => ({
									...s,
									cutoff_start_day: Number(e.target.value),
								}))
							}
							className="h-10 w-full rounded-lg border border-input bg-background px-3 disabled:opacity-60"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Tanggal akhir cut-off (1–31)</span>
						<input
							type="number"
							min={1}
							max={31}
							disabled={!settingsForm.use_cutoff}
							value={settingsForm.cutoff_end_day}
							onChange={e =>
								setSettingsForm(s => ({
									...s,
									cutoff_end_day: Number(e.target.value),
								}))
							}
							className="h-10 w-full rounded-lg border border-input bg-background px-3 disabled:opacity-60"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Tanggal bayar gaji (1–31)</span>
						<input
							type="number"
							min={1}
							max={31}
							value={settingsForm.pay_day}
							onChange={e =>
								setSettingsForm(s => ({ ...s, pay_day: Number(e.target.value) }))
							}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
				</div>
				<div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
					<div className="mb-3 flex items-center gap-2">
						<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Tunjangan</span>
						<h3 className="text-sm font-bold text-emerald-900">Metode tunjangan makan &amp; transportasi</h3>
					</div>
					<p className="mb-4 text-xs text-emerald-800/80">
						Pilih apakah tunjangan dihitung flat per bulan atau berdasarkan hari masuk kerja
						(clock-in) karyawan pada periode cut-off. Nominal tunjangan karyawan tetap diambil
						dari direktori karyawan.
					</p>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">Cara hitung tunjangan makan</span>
							<select
								value={settingsForm.meal_allowance_method}
								onChange={e =>
									setSettingsForm(s => ({ ...s, meal_allowance_method: e.target.value as 'flat' | 'attendance' }))
								}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							>
								<option value="flat">Nominal flat per bulan</option>
								<option value="attendance">Berdasarkan kehadiran (hari masuk kerja)</option>
							</select>
						</label>
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">Cara hitung tunjangan transportasi</span>
							<select
								value={settingsForm.transport_allowance_method}
								onChange={e =>
									setSettingsForm(s => ({ ...s, transport_allowance_method: e.target.value as 'flat' | 'attendance' }))
								}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							>
								<option value="flat">Nominal flat per bulan</option>
								<option value="attendance">Berdasarkan kehadiran (hari masuk kerja)</option>
							</select>
						</label>
					</div>
				</div>
				<div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm">
					<p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
						Pratinjau periode bulan ini
					</p>
					<p className="mt-1 font-semibold text-emerald-900">{preview.label}</p>
					<p className="text-xs text-emerald-800/80">
						Pembayaran: {formatDate(preview.payDate)}
					</p>
				</div>
				<div className="flex items-center gap-3">
					<button
						type="submit"
						disabled={saving}
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
					>
						{saving ? 'Menyimpan…' : 'Simpan pengaturan'}
					</button>
					{payrollSettings?.id ? (
						<span className="text-xs text-muted-foreground">Pengaturan tersimpan.</span>
					) : null}
				</div>
			</form>
		</div>
	);
}
