import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ArrowLeft,
	CalendarDays,
	Clock,
	Plus,
	ReceiptText,
	Users,
	Wallet,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { companyLogoUrl } from '@/lib/company-logo';
import { useAuth } from '@/hooks/use-auth';
import { formatRupiah, todayIso, type Company } from '@/lib/accounting';
import {
	ATTENDANCE_CODE_LABELS,
	type AttendanceCode,
	type AttendanceRecord,
	formatAttendanceDate,
	toDateInputValue,
} from '@/lib/attendance';
import {
	getAttendanceSettings,
	probeGeofence,
	type AttendanceSettings,
} from '@/lib/attendance-settings';
import {
	OVERTIME_COMPENSATION_LABELS,
	OVERTIME_COMPENSATION_OPTIONS,
	OVERTIME_STATUS_LABELS,
	calcOvertimeAmount,
	emptyOvertimeRequest,
	formatDuration,
	formatOvertimeDate,
	type OvertimeCompensation,
	type OvertimeRequest,
	type OvertimeStatus,
} from '@/lib/overtime';
import {
	LOAN_STATUS_LABELS,
	loanInstallment,
	type Employee,
	type EmployeeLoan,
	type LoanStatus,
} from '@/lib/payroll';
import {
	LEAVE_TYPE_LABELS,
	LEAVE_TYPE_OPTIONS,
	calcLeaveDays,
	emptyLeaveRequest,
	formatLeaveRange,
	type LeaveBalance,
	type LeaveRequest,
	type LeaveStatus,
	type LeaveType,
} from '@/lib/leave';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';
import { ensureLoanTransaction } from '@/lib/loan-ledger';
import type { Reimbursement } from '@/lib/reimbursements';
import {
	checkEligibility,
	eligibilityLabel,
	indexSaldos,
	type ReimbursementSaldo,
	type ReimbursementSetting,
} from '@/lib/reimbursement-settings';
import type { MemberRole } from '@/data/user-roles';
import { EmployeeApprovals } from '@/components/app/employee-approvals';
import { LeaveBalancePanel } from '@/components/app/leave-balance-panel';
import { LeaveHistory } from '@/components/app/leave-history';
import { loadReimbursementActorNames } from '@/components/app/reimbursement-approval-details';
import { ReimbursementHistory } from '@/components/app/reimbursement-history';
import { LiveAttendancePage } from '@/components/app/live-attendance-page';
import { getEmployeeSchedule, type ResolvedSchedule } from '@/lib/work-schedules';
import { EmployeeCalendar } from '@/components/app/employee-calendar';
import { PayrollAttendanceProgressBar } from '@/components/app/payroll-attendance-progress';
import {
	AccountPanel,
	AnnouncementList,
	AnnouncementStrip,
	EmployeeDirectory,
	EssAppGrid,
	EssGreeting,
	EssTabBar,
	PayslipList,
	formatShiftHeading,
	type EssNav,
} from '@/components/app/karyawan-ess-chrome';


interface KaryawanPortalProps {
	company: Company;
	memberRole: MemberRole | null;
}

type Panel = 'home' | 'attendance' | 'list' | 'correction' | 'duty' | 'leave' | 'overtime' | 'loan' | 'reimbursement';

const SHORTCUTS: { key: Exclude<Panel, 'home'>; labelKey: string; kind: 'list' | 'correction' | 'duty' | 'leave' | 'overtime' | 'loan' | 'reimbursement' }[] = [
	{ key: 'list', labelKey: 'ess.shortcut.list', kind: 'list' },
	{ key: 'correction', labelKey: 'ess.shortcut.correction', kind: 'correction' },
	{ key: 'duty', labelKey: 'ess.shortcut.duty', kind: 'duty' },
	{ key: 'leave', labelKey: 'ess.shortcut.leave', kind: 'leave' },
	{ key: 'overtime', labelKey: 'ess.shortcut.overtime', kind: 'overtime' },
	{ key: 'reimbursement', labelKey: 'ess.shortcut.reimbursement', kind: 'reimbursement' },
];

function formatNowTime(d: Date): string {
	// Always HH:mm with colon — id-ID locale often yields dots (01.55) which
	// break comparisons and can fail validation against schedule times.
	const h = String(d.getHours()).padStart(2, '0');
	const m = String(d.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

function normalizeTime(value: string): string {
	const v = (value ?? '').trim();
	if (!v) return '';
	const m = v.match(/^(\d{1,2})[:.](\d{2})$/);
	if (m) {
		const h = Math.min(23, Math.max(0, Number(m[1])));
		const min = Math.min(59, Math.max(0, Number(m[2])));
		return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
	}
	const m2 = v.match(/^(\d{2})(\d{2})$/);
	if (m2) {
		const h = Math.min(23, Number(m2[1]));
		const min = Math.min(59, Number(m2[2]));
		return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
	}
	return v;
}

function userIdFromToken(token: string): string {
	const raw = token.replace(/^Bearer\s+/i, '').trim();
	const part = raw.split('.')[1];
	if (!part) return '';
	try {
		const padded = part.replace(/-/g, '+').replace(/_/g, '/');
		const json = JSON.parse(atob(padded)) as { id?: unknown; exp?: unknown };
		if (typeof json.exp === 'number' && json.exp * 1000 <= Date.now()) return '';
		return typeof json.id === 'string' ? json.id : '';
	} catch {
		return '';
	}
}

async function resolveActorId(): Promise<string> {
	const live = pb.authStore.record?.id ?? '';
	if (live) return live;
	const token = pb.authStore.token ?? '';
	if (!token || !pb.authStore.isValid) return '';
	const fromToken = userIdFromToken(token);
	if (!fromToken) return '';
	try {
		const refreshed = await pb.collection('users').authRefresh({ requestKey: null });
		return refreshed.record?.id || fromToken;
	} catch (err) {
		const status = (err as { status?: number }).status;
		if (status === 401) {
			pb.authStore.clear();
			return '';
		}
		return fromToken;
	}
}

function notifyExpiredSession() {
	toast.error('Sesi berakhir. Silakan masuk ulang.');
	window.setTimeout(() => {
		window.location.assign('/login');
	}, 900);
}

export function KaryawanPortal({ company, memberRole }: KaryawanPortalProps) {
	const { user } = useAuth();
	const [panel, setPanel] = useState<Panel>('home');
	const [nav, setNav] = useState<EssNav>('home');
	const [overlay, setOverlay] = useState<'payslip' | 'announcements' | 'calendar' | null>(null);
	const [employee, setEmployee] = useState<Employee | null>(null);
	const [loadingEmp, setLoadingEmp] = useState(true);
	const attendance = useLiveAttendance(employee, company);
	const loadEmployee = useCallback(async () => {
		if (!user?.id) return;
		setLoadingEmp(true);
		try {
			const list = await pb.collection('employees').getFullList<Employee>({
				filter: pb.filter('company = {:company} && user = {:user}', {
					company: company.id,
					user: user.id,
				}),
			});
			setEmployee(list[0] ?? null);
		} catch {
			setEmployee(null);
		} finally {
			setLoadingEmp(false);
		}
	}, [company.id, user?.id]);

	useEffect(() => {
		loadEmployee().catch(() => {});
	}, [loadEmployee]);

	const photoUrl = employee?.photo
		? pb.files.getURL(employee, employee.photo, { thumb: '200x200' })
		: '';

	const displayName = employee?.name || user?.email || 'Karyawan';

	const openApp = (key: string) => {
		if (key === 'payslip') {
			setOverlay('payslip');
			setPanel('home');
			setNav('home');
			return;
		}
		if (key === 'calendar') {
			setOverlay('calendar');
			setPanel('home');
			setNav('home');
			document.querySelector('main')?.scrollTo({ top: 0 });
			return;
		}
		if (key === 'attendance') {
			setOverlay(null);
			setPanel('attendance');
			setNav('home');
			document.querySelector('main')?.scrollTo({ top: 0 });
			return;
		}
		const map: Record<string, Panel> = {
			reimbursement: 'reimbursement',
			leave: 'leave',
			list: 'list',
			correction: 'correction',
			duty: 'duty',
			overtime: 'overtime',
		};
		const next = map[key];
		if (!next) return;
		setOverlay(null);
		setPanel(next);
		setNav('home');
	};

	const goNav = (next: EssNav) => {
		setNav(next);
		setPanel('home');
		setOverlay(null);
	};

	if (loadingEmp) {
		return (
			<div className="mx-auto max-w-[430px] px-4 py-8">
				<p className="text-sm text-slate-500">Memuat data karyawan…</p>
			</div>
		);
	}

	const featureOpen = Boolean(employee) && panel !== 'home';
	const homeOpen = Boolean(employee) && panel === 'home' && nav === 'home' && !overlay;
	const tabBar = (
		<EssTabBar
			homeBack={featureOpen || Boolean(overlay) || nav !== 'home'}
			nav={featureOpen || overlay ? 'home' : nav}
			onNav={goNav}
			clockedIn={attendance.canClockOut}
			clockDisabled={!employee || attendance.loading || attendance.failed || attendance.busy !== null || attendance.done || (!attendance.canClockIn && !attendance.canClockOut)}
			clockBusy={attendance.busy !== null}
			clockDone={attendance.done}
			onClock={() => {
				if (attendance.failed) {
					toast.error('Gagal memuat absensi. Mencoba lagi…');
					void attendance.refresh();
				} else {
					void attendance.upsert(attendance.canClockOut ? 'clock_out' : 'clock_in');
				}
			}}
		/>
	);

	if (employee && overlay === 'calendar') {
		return (
			<>
				<div className="mx-auto min-h-dvh w-full max-w-[430px] bg-white pb-24 text-slate-900">
					<EssGreeting name={displayName} companyName={company.name} photoUrl={photoUrl} onGift={() => openApp('payslip')} />
					<EmployeeCalendar
						companyId={company.id}
						employeeId={employee.id}
						onBack={() => {
							setOverlay(null);
							document.querySelector('main')?.scrollTo({ top: 0 });
						}}
					/>
				</div>
				{tabBar}
			</>
		);
	}

	if (employee && panel === 'attendance') {
		return (
			<>
				<LiveAttendancePage
					attendance={attendance}
					companyId={company.id}
					employeeId={employee.id}
					companyName={company.name}
					name={displayName}
					photoUrl={photoUrl}
					onGift={() => openApp('payslip')}
					onBack={() => {
						setPanel('home');
						document.querySelector('main')?.scrollTo({ top: 0 });
					}}
					onViewLog={() => {
						setPanel('list');
						document.querySelector('main')?.scrollTo({ top: 0 });
					}}
				/>
				{tabBar}
			</>
		);
	}

	return (
		<div
			className={cn(
				'mx-auto min-h-dvh w-full min-w-0 bg-[#f4f5f7] pb-24 text-slate-900',
				'max-w-[430px]',
			)}
		>
			{homeOpen ? (
				<section aria-label="Informasi karyawan dan jadwal shift" className="ess-shift-hero mx-4 mt-4 overflow-hidden rounded-2xl text-white shadow-[0_10px_24px_rgba(5,150,105,0.18)]">
					<EssGreeting name={displayName} companyName={company.name} photoUrl={photoUrl} onGift={() => openApp('payslip')} lightText />
					<LiveAttendance attendance={attendance} companyId={company.id} employee={employee} userId={user?.id ?? ''} />
				</section>
			) : (
				<EssGreeting name={displayName} companyName={company.name} photoUrl={photoUrl} onGift={() => openApp('payslip')} />
			)}
			{featureOpen || overlay || nav !== 'home' ? (
				<div className="sticky top-0 z-20 flex items-center gap-2 bg-[#f4f5f7] px-3 py-3">
					<button
						type="button"
						onClick={() => {
							setPanel('home');
							setOverlay(null);
							setNav('home');
							document.querySelector('main')?.scrollTo({ top: 0 });
						}}
						aria-label="Kembali ke Beranda"
						className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
					>
						<ArrowLeft className="size-6" strokeWidth={1.8} aria-hidden="true" />
					</button>
					<p className={cn('truncate text-sm font-bold text-slate-800', panel === 'reimbursement' && 'flex-1 text-center text-base')}>
						{overlay === 'payslip'
							? 'Slip Gaji'
							: overlay === 'announcements'
								? 'Pengumuman'
								: nav === 'employees'
									? 'Karyawan'
									: nav === 'approvals'
											? 'Persetujuan'
											: nav === 'account'
												? 'Akun'
												: panel === 'list'
													? 'Log Absensi'
													: panel === 'leave'
														? 'Cuti'
														: panel === 'reimbursement'
															? 'Pengajuan Reimbursement'
															: panel === 'loan'
																? 'Pinjaman'
																: panel === 'overtime'
																	? 'Lembur'
																	: panel === 'correction'
																		? 'Koreksi absensi'
																		: panel === 'duty'
																			? 'On duty'
																			: ''}
					</p>
					{panel === 'reimbursement' ? <span aria-hidden="true" className="size-11 shrink-0" /> : null}
				</div>
			) : null}

			{!employee ? (
				<div className="mx-4 rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
					<p className="text-base font-semibold">Belum terhubung ke data karyawan</p>
					<p className="mt-2 text-sm text-slate-500">
						Akun Anda belum ditautkan ke profil karyawan di {company.name}. Minta admin
						mengaitkan akun Anda pada data karyawan agar clock in, cuti, dan pengajuan tetap berjalan.
					</p>
				</div>
			) : featureOpen ? (
				<div className="px-3 pb-6">
					{panel === 'list' ? <AttendanceListPanel employee={employee} company={company} /> : null}
					{panel === 'correction' ? <AttendanceCorrectionPanel employee={employee} company={company} /> : null}
					{panel === 'duty' ? <OnDutyPanel employee={employee} company={company} /> : null}
					{panel === 'leave' ? <LeaveRequests employee={employee} company={company} /> : null}
					{panel === 'overtime' ? <OvertimeRequests employee={employee} company={company} /> : null}
					{panel === 'loan' ? <LoanRequests employee={employee} company={company} /> : null}
					{panel === 'reimbursement' ? (
						<ReimbursementRequests employee={employee} company={company} memberRole={memberRole} />
					) : null}
				</div>
			) : overlay === 'payslip' ? (
				<PayslipList employee={employee} companyId={company.id} companyName={company.name} companyLogo={companyLogoUrl(company)} />
			) : overlay === 'announcements' ? (
				<AnnouncementList companyId={company.id} />
			) : nav === 'employees' ? (
				<EmployeeDirectory companyId={company.id} />
			) : nav === 'approvals' ? (
				<EmployeeApprovals companyId={company.id} employeeId={employee.id} onOpen={openApp} />
			) : nav === 'account' ? (
				<AccountPanel
					employee={employee}
					email={user?.email ?? ''}
					photoUrl={photoUrl}
					companyName={company.name}
				/>
			) : homeOpen ? (
				<>
					<EssAppGrid onOpen={openApp} />
					<AnnouncementStrip companyId={company.id} onViewAll={() => setOverlay('announcements')} />
				</>
			) : null}

			{tabBar}
		</div>
	);
}

/* ----------------------------- Leave Requests ----------------------------- */

function LeaveRequests({ employee, company }: { employee: Employee; company: Company }) {
	const { t } = useLanguage();
	const [requests, setRequests] = useState<LeaveRequest[]>([]);
	const [balance, setBalance] = useState<LeaveBalance | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [balanceError, setBalanceError] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState<Partial<LeaveRequest>>(emptyLeaveRequest(todayIso()));
	const formRef = useRef<HTMLFormElement>(null);
	const year = String(new Date().getFullYear());

	useEffect(() => {
		if (showForm) formRef.current?.scrollIntoView({ block: 'start' });
	}, [showForm]);

	const refresh = useCallback(async () => {
		setLoading(true);
		const [list, bals] = await Promise.allSettled([
			pb.collection('leave_requests').getFullList<LeaveRequest>({
				filter: pb.filter('company = {:company} && employee = {:emp}', { company: company.id, emp: employee.id }),
				sort: '-start_date,-created',
				requestKey: null,
			}),
			pb.collection('leave_balances').getFullList<LeaveBalance>({
				filter: pb.filter('company = {:company} && employee = {:emp} && year = {:year}', { company: company.id, emp: employee.id, year }),
				requestKey: null,
			}),
		]);
		if (list.status === 'fulfilled') setRequests(list.value);
		if (bals.status === 'fulfilled') setBalance(bals.value[0] ?? null);
		setLoadError(list.status === 'rejected');
		setBalanceError(bals.status === 'rejected');
		setLoading(false);
	}, [company.id, employee.id, year]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	const days = useMemo(
		() => calcLeaveDays(form.start_date, form.end_date),
		[form.start_date, form.end_date],
	);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.start_date || !form.end_date) {
			toast.error(t('ess.leave.start_required'));
			return;
		}
		if ((form.end_date || '').slice(0, 10) < (form.start_date || '').slice(0, 10)) {
			toast.error(t('ess.leave.end_before'));
			return;
		}
		const actorId = await resolveActorId();
		if (!actorId) {
			notifyExpiredSession();
			return;
		}
		setSaving(true);
		try {
			await pb.collection('leave_requests').create({
				company: company.id,
				employee: employee.id,
				requested_date: (form.requested_date || todayIso()).slice(0, 10),
				start_date: (form.start_date || todayIso()).slice(0, 10),
				end_date: (form.end_date || todayIso()).slice(0, 10),
				days,
				leave_type: (form.leave_type as LeaveType) || 'annual',
				status: 'awaiting_approval' as LeaveStatus,
				reason: form.reason || '',
				owner: actorId,
			});
			toast.success(t('ess.leave.sent'));
			setShowForm(false);
			setForm(emptyLeaveRequest(todayIso()));
			await refresh();
		} catch {
			toast.error(t('ess.leave.failed'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="space-y-4">
			<div className="border-b border-slate-200 pb-3">
				<h2 className="text-center text-lg font-bold text-slate-900">{t('ess.leave.title')}</h2>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
					<p className="w-fit border-b-2 border-emerald-600 px-3 pb-2 text-sm font-semibold text-emerald-700">{t('ess.leave.mine')}</p>
					{!showForm ? (
						<button type="button" onClick={() => setShowForm(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-700 active:scale-[0.98]">
							<Plus className="size-5" strokeWidth={1.8} /> {t('ess.leave.apply')}
						</button>
					) : null}
				</div>
			</div>

			<LeaveBalancePanel balance={balance} requests={requests} employeeId={employee.id} year={year} loading={loading} unavailable={loadError || balanceError} />
			{balanceError && !loadError ? <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><span>Saldo cuti gagal dimuat.</span><button type="button" onClick={() => void refresh()} className="font-semibold underline">Coba lagi</button></div> : null}

			{showForm ? (
				<form ref={formRef} onSubmit={submit} className="scroll-mt-16 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
					<div className="flex items-center justify-between">
						<h3 className="text-base font-bold">{t('ess.leave.form_title')}</h3>
						<button type="button" onClick={() => setShowForm(false)} aria-label="Tutup formulir cuti" className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground">
							<X className="size-4" />
						</button>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">{t('ess.leave.type')}</span>
							<select
								value={form.leave_type || 'annual'}
								onChange={e => setForm(f => ({ ...f, leave_type: e.target.value as LeaveType }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							>
								{LEAVE_TYPE_OPTIONS.map(t => (
									<option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
								))}
							</select>
						</label>
						<div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
							<p className="text-xs font-medium text-emerald-800">{t('ess.leave.duration')}</p>
							<p className="mt-1 text-lg font-bold text-emerald-900">{t('ess.leave.days', { count: days })}</p>
						</div>
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">{t('ess.leave.start')}</span>
							<input
								type="date"
								required
								value={(form.start_date || '').slice(0, 10)}
								onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							/>
						</label>
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">{t('ess.leave.end')}</span>
							<input
								type="date"
								required
								value={(form.end_date || '').slice(0, 10)}
								onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							/>
						</label>
					</div>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">{t('ess.leave.reason')}</span>
						<textarea
							rows={3}
							value={form.reason || ''}
							onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
							placeholder={t('ess.leave.reason_placeholder')}
							className="w-full rounded-lg border border-input bg-background px-3 py-2"
						/>
					</label>
					<p className="text-xs text-muted-foreground">
						{t('ess.leave.note')}
					</p>
					<div className="flex justify-end gap-2">
						<button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-medium">Batal</button>
						<button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
							{saving ? 'Mengirim…' : 'Kirim pengajuan'}
						</button>
					</div>
				</form>
			) : null}

			<LeaveHistory requests={requests} loading={loading} loadError={loadError} onRetry={() => void refresh()} />
		</section>
	);
}

/* ----------------------------- Leave Directory ----------------------------- */

function addDaysIso(iso: string, days: number): string {
	const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	d.setDate(d.getDate() + days);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function formatLeaveDateShort(iso: string): string {
	if (!iso) return '—';
	const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
	return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function leaveDateKey(iso: string | undefined): string {
	if (!iso) return '';
	const head = iso.slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : '';
}

/** Cuti disetujui yang rentangnya mencakup hari kalender ini (inklusif). */
function leaveCoversDay(start: string | undefined, end: string | undefined, day: string): boolean {
	const s = leaveDateKey(start);
	const e = leaveDateKey(end);
	if (!s || !e || !day) return false;
	return s <= day && e >= day;
}

function isCancelledRequest(err: unknown): boolean {
	const status = (err as { status?: number }).status;
	return status === 0 || (err as { isAbort?: boolean }).isAbort === true;
}

function LeaveDirectory({ employee, company }: { employee: Employee; company: Company }) {
	const today = todayIso().slice(0, 10);
	const [rows, setRows] = useState<LeaveRequest[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		const dayStart = `${today} 00:00:00.000Z`;
		const dayEnd = `${today} 23:59:59.999Z`;
		try {
			// PocketBase menyimpan tanggal sebagai datetime UTC. Membandingkan
			// dengan "YYYY-MM-DD" saja membuat start_date hari ini gagal lolos
			// (atau ditolak), sehingga direktori selalu kosong.
			const list = await pb.collection('leave_requests').getFullList<LeaveRequest>({
				filter: pb.filter(
					'company = {:company} && status = "approved" && start_date <= {:dayEnd} && end_date >= {:dayStart}',
					{ company: company.id, dayStart, dayEnd },
				),
				expand: 'employee',
				sort: 'end_date',
				requestKey: null,
			});
			setRows(list.filter(r => leaveCoversDay(r.start_date, r.end_date, today)));
		} catch (err) {
			if (isCancelledRequest(err)) return;
			try {
				const list = await pb.collection('leave_requests').getFullList<LeaveRequest>({
					filter: pb.filter('company = {:company} && status = "approved"', {
						company: company.id,
					}),
					expand: 'employee',
					sort: 'end_date',
					requestKey: null,
				});
				setRows(list.filter(r => leaveCoversDay(r.start_date, r.end_date, today)));
			} catch (fallbackErr) {
				if (!isCancelledRequest(fallbackErr)) setRows([]);
			}
		} finally {
			setLoading(false);
		}
	}, [company.id, today]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	// Perbarui daftar secara realtime mengikuti perubahan pengajuan cuti.
	useEffect(() => {
		void pb
			.collection('leave_requests')
			.subscribe('*', (e) => {
				if (e.action === 'create' || e.action === 'update' || e.action === 'delete') {
					refresh().catch(() => {});
				}
			})
			.catch((error) => console.error('leave dir subscribe failed', error));
		return () => {
			void pb.collection('leave_requests').unsubscribe('*').catch(() => {});
		};
	}, [refresh]);

	return (
		<section className="hidden rounded-[22px] border border-border bg-white px-5 py-6 shadow-[0_12px_32px_rgba(15,23,42,0.07)] sm:px-8 sm:py-8">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Siapa yang Cuti Hari Ini</h2>
					<p className="text-xs text-muted-foreground">
						Karyawan {company.name} yang sedang cuti hari ini.
					</p>
				</div>
				{rows.length > 0 ? (
					<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
						<span className="inline-flex size-1.5 animate-pulse rounded-full bg-emerald-500" />
						Hari ini
					</span>
				) : null}
			</div>

			{loading ? (
				<p className="py-8 text-center text-sm text-muted-foreground">Memuat…</p>
			) : rows.length === 0 ? (
				<div className="py-8 text-center">
					<Users className="mx-auto size-8 text-muted-foreground/50" strokeWidth={1.5} />
					<p className="mt-2 text-sm text-muted-foreground">
						Tidak ada karyawan yang sedang cuti hari ini.
					</p>
				</div>
			) : (
				<ul className="mt-6 flex flex-wrap gap-x-8 gap-y-6 sm:mt-8">
						{rows.map(r => {
							const emp = r.expand?.employee;
							const photoUrl = emp?.photo
								? pb.files.getURL(emp, emp.photo, { thumb: '200x200' })
								: '';
							const isSelf = emp?.id === employee.id;
							return (
								<li
									key={r.id}
									className="flex w-20 flex-col items-center gap-2.5 sm:w-24"
									title={`${LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type} · ${formatLeaveRange(r.start_date, r.end_date)} · kembali ${formatLeaveDateShort(addDaysIso(r.end_date, 1))}`}
								>
									<div className="size-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-emerald-100 to-indigo-100 sm:size-24">
										{photoUrl ? (
											<img
												src={photoUrl}
												alt={emp?.name ?? 'Karyawan'}
												className="size-full object-cover"
											/>
										) : (
											<div className="flex size-full items-center justify-center text-lg font-bold text-emerald-600">
												{(emp?.name ?? '?').trim().charAt(0).toUpperCase()}
											</div>
										)
									}
									</div>
									<p className="w-full truncate text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
										{emp?.name ?? 'Karyawan'}
										{isSelf ? ' (Anda)' : ''}
									</p>
								</li>
							);
						})}
				</ul>
			)}
		</section>
	);
}

/* ----------------------------- Live Attendance ----------------------------- */

function ShortcutGlyph({ kind }: { kind: (typeof SHORTCUTS)[number]['kind'] }) {
	if (kind === 'list') {
		return (
			<svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
				<rect x="8" y="6" width="14" height="18" rx="2.5" fill="#22c55e" />
				<rect x="11" y="4" width="8" height="3.5" rx="1.2" fill="#16a34a" />
				<path d="M12 13h6M12 16.5h4" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
				<circle cx="21.5" cy="21.5" r="6" fill="#4ade80" />
				<circle cx="21.5" cy="21.5" r="4.2" fill="white" />
				<path d="M21.5 19.2v2.5l1.6 1" stroke="#16a34a" strokeWidth="1.3" strokeLinecap="round" />
			</svg>
		);
	}
	if (kind === 'correction') {
		return (
			<svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
				<circle cx="14" cy="16" r="8" fill="#2563eb" />
				<circle cx="14" cy="16" r="5.2" fill="white" />
				<path d="M14 13.2v3.2l2 1.2" stroke="#2563eb" strokeWidth="1.4" strokeLinecap="round" />
				<path d="M20 18.5l5.2 5.2" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" />
				<path d="M23.2 16.2l3.2 1.2-1.1 3.1-3.1-1.2z" fill="#60a5fa" />
			</svg>
		);
	}
	if (kind === 'duty') {
		return (
			<svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
				<path d="M6 18.5l16.5-8.2c.7-.3 1.4.4 1.1 1.1L16.2 24.2c-.2.6-.9.7-1.3.3l-2.4-2.2-3.2 1.2c-.6.2-1.1-.4-.8-.9l1.5-3.1-3.6-1.2c-.6-.2-.7-1 0-1.3z" fill="#f59e0b" />
			</svg>
		);
	}
	if (kind === 'leave') {
		return (
			<svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
				<circle cx="13" cy="11" r="4" fill="#f97316" />
				<path d="M7.5 23.5c.8-3.6 3.2-5.4 5.5-5.4s4.7 1.8 5.5 5.4" fill="#f97316" />
				<path d="M20 15.5h7M23.5 12v7" stroke="#fb923c" strokeWidth="1.8" strokeLinecap="round" />
			</svg>
		);
	}
	if (kind === 'overtime') return <Clock className="size-7 text-indigo-500" strokeWidth={2.1} />;
	if (kind === 'loan') return <Wallet className="size-7 text-sky-500" strokeWidth={2.1} />;
	return <ReceiptText className="size-7 text-teal-600" strokeWidth={2.1} />;
}

function AttendanceShortcutCard({
	panel,
	onPanel,
	hideAttendanceMenus = false,
}: {
	panel: Panel;
	onPanel: (panel: Panel) => void;
	hideAttendanceMenus?: boolean;
}) {
	const { t } = useLanguage();
	const primary = SHORTCUTS.filter(s => ['list', 'correction', 'duty', 'leave'].includes(s.key));
	const more = SHORTCUTS.filter(s => !['list', 'correction', 'duty', 'leave'].includes(s.key));
	return (
		<div className="space-y-3">
			{hideAttendanceMenus ? null : (
			<div className="rounded-[22px] border border-slate-100 bg-white px-3 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.07)] sm:px-6">
				<div className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-4">
					{primary.map(item => {
						const active = panel === item.key;
						return (
							<button
								key={item.key}
								type="button"
								aria-current={active ? 'page' : undefined}
								onClick={() => onPanel(active ? 'home' : item.key)}
								className={cn(
									'flex min-h-11 min-w-0 flex-col items-center gap-2.5 rounded-2xl px-1 py-2 text-center transition-transform active:scale-[0.97]',
									active && 'bg-slate-50',
								)}
							>
								<ShortcutGlyph kind={item.kind} />
								<span className="text-xs font-medium leading-snug text-slate-500">
									{t(item.labelKey)}
								</span>
							</button>
						);
					})}
				</div>
			</div>
			)}
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{more.map(item => {
					const active = panel === item.key;
					return (
						<button
							key={item.key}
							type="button"
							aria-current={active ? 'page' : undefined}
							onClick={() => onPanel(active ? 'home' : item.key)}
							className={cn(
								'flex min-h-11 min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-black/5 bg-white px-2 py-3 text-center shadow-[0_6px_16px_rgba(15,23,42,0.05)]',
								active && 'ring-2 ring-emerald-200',
							)}
						>
							<ShortcutGlyph kind={item.kind} />
							<span className="text-[11px] font-medium leading-tight text-slate-600">{t(item.labelKey)}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/*
function formatChatTime(iso: string): string {
	try {
		return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
	} catch {
		return '';
	}
}

function KaryawanChat({ company }: { company: Company }) {
	const { user } = useAuth();
	const myId = user?.id ?? pb.authStore.record?.id ?? '';
	const me: ChatActor = useMemo(() => ({ id: myId, type: 'user' }), [myId]);

	const [peers, setPeers] = useState<ChatPeer[]>([]);
	const [selected, setSelected] = useState<ChatPeer | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState('');
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [unread, setUnread] = useState<Record<string, number>>({});
	const [search, setSearch] = useState('');
	const [loadingPeers, setLoadingPeers] = useState(true);
	const [sending, setSending] = useState(false);
	const [onLeaveUserIds, setOnLeaveUserIds] = useState<Set<string>>(new Set());
	const endRef = useRef<HTMLDivElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!myId) return;
		let cancelled = false;
		setLoadingPeers(true);
		listChatPeers(company.id, myId)
			.then(list => {
				if (!cancelled) setPeers(list);
			})
			.catch(() => {
				if (!cancelled) setPeers([]);
			})
			.finally(() => {
				if (!cancelled) setLoadingPeers(false);
			});
		return () => {
			cancelled = true;
		};
	}, [company.id, myId]);

	// Menandai anggota (user) yang sedang cuti hari ini di perusahaan aktif,
	// untuk menampilkan label singkat di bawah nama pada daftar percakapan.
	useEffect(() => {
		let cancelled = false;
		const today = todayIso().slice(0, 10);
		(async () => {
			try {
				const dayStart = `${today} 00:00:00.000Z`;
				const dayEnd = `${today} 23:59:59.999Z`;
				const [employees, leaves] = await Promise.all([
					pb.collection('employees').getFullList<Employee>({
						filter: pb.filter('company = {:company}', { company: company.id }),
						requestKey: null,
					}),
					pb
						.collection('leave_requests')
						.getFullList<LeaveRequest>({
							filter: pb.filter(
								'company = {:company} && status = "approved" && start_date <= {:dayEnd} && end_date >= {:dayStart}',
								{ company: company.id, dayStart, dayEnd },
							),
							requestKey: null,
						})
						.catch(() => [] as LeaveRequest[]),
				]);
				if (cancelled) return;
				const onLeaveEmployeeIds = new Set(leaves.map(l => l.employee));
				const userIds = new Set<string>();
				for (const emp of employees) {
					if (onLeaveEmployeeIds.has(emp.id) && emp.user) {
						userIds.add(emp.user);
					}
				}
				if (!cancelled) setOnLeaveUserIds(userIds);
			} catch {
				if (!cancelled) setOnLeaveUserIds(new Set());
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [company.id]);

	const refreshUnread = useCallback(() => {
		if (!myId) return;
		loadUnreadCounts(me)
			.then(setUnread)
			.catch(() => {});
	}, [me, myId]);

	useEffect(() => {
		refreshUnread();
	}, [refreshUnread]);

	useEffect(() => {
		if (!selected || !myId) {
			setMessages([]);
			return;
		}
		let cancelled = false;
		const peerActor: ChatActor = { id: selected.id, type: selected.type };
		loadConversation(me, peerActor)
			.then(list => {
				if (!cancelled) setMessages(list);
			})
			.catch(() => {
				if (!cancelled) setMessages([]);
			});
		markConversationRead(me, peerActor)
			.then(() => refreshUnread())
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [selected, me, myId, refreshUnread]);

	useEffect(() => {
		if (!myId) return;
		const unsub = subscribeToMessages(me, (action, record) => {
			if (action === 'create') {
				setMessages(prev => {
					if (prev.some(m => m.id === record.id)) return prev;
					if (!selected) return prev;
					const sel = selected;
					const involves =
						(record.sender === myId && record.recipient === sel.id) ||
						(record.sender === sel.id && record.recipient === myId) ||
						(record.sender === myId && record.recipient_parent === sel.id) ||
						(record.sender_parent === sel.id && record.recipient === myId);
					if (!involves) return prev;
					return [...prev, record];
				});
				if (record.recipient === myId) refreshUnread();
			} else if (action === 'update') {
				setMessages(prev => prev.map(m => (m.id === record.id ? record : m)));
			} else if (action === 'delete') {
				setMessages(prev => prev.filter(m => m.id !== record.id));
			}
		});
		return unsub;
	}, [me, myId, selected, refreshUnread]);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	const handleSend = async () => {
		const text = draft.trim();
		if ((!text && !pendingFile) || !selected || !myId) return;
		const file = pendingFile;
		setDraft('');
		setPendingFile(null);
		setSending(true);
		try {
			const peerActor: ChatActor = { id: selected.id, type: selected.type };
			const msg = await sendMessage(company.id, me, peerActor, text, file ?? undefined);
			setMessages(prev => [...prev, msg]);
		} catch {
			setDraft(text);
			setPendingFile(file);
		} finally {
			setSending(false);
		}
	};

	const handlePickFile = (file: File | null) => {
		if (!file) {
			setPendingFile(null);
			return;
		}
		if (!CHAT_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof CHAT_ATTACHMENT_MIME_TYPES)[number])) {
			toast.error('Hanya file PNG atau PDF yang diizinkan.');
			return;
		}
		if (file.size > CHAT_ATTACHMENT_MAX_SIZE) {
			toast.error('Ukuran file maksimal 5 MB.');
			return;
		}
		setPendingFile(file);
	};

	const q = search.trim().toLowerCase();
	const filteredPeers = peers.filter(p => !q || (p.name + p.email).toLowerCase().includes(q));

	return (
		<section className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600">
						Pesan internal
					</p>
					<h2 className="text-xl font-extrabold tracking-tight text-emerald-950">Chat</h2>
				</div>
				<p className="hidden text-[13px] text-muted-foreground sm:block">
					Pesan langsung dengan anggota {company.name}.
				</p>
			</div>

			<div className="overflow-hidden rounded-2xl border border-[#e6ecea] bg-transparent shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
				<div className="grid lg:grid-cols-[300px_1fr]">
					<div
						className={cn(
							'flex flex-col border-b border-[#e6ecea] bg-transparent lg:border-b-0',
							selected ? 'hidden lg:flex' : 'flex',
						)}
					>
						<div className="px-4 pb-1 pt-4">
							<p className="pb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600">
								Anggota
							</p>
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<input
									value={search}
									onChange={e => setSearch(e.target.value)}
									placeholder="Cari anggota…"
									className="w-full rounded-lg border border-[#e6ecea] bg-transparent py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
								/>
							</div>
						</div>
						<div className="max-h-[58vh] overflow-y-auto pb-4">
							{loadingPeers ? (
								<p className="px-4 py-6 text-center text-sm text-muted-foreground">Memuat…</p>
							) : filteredPeers.length === 0 ? (
								<p className="px-4 py-6 text-center text-sm text-muted-foreground">
									{peers.length === 0
										? 'Belum ada anggota lain yang dapat dihubungi.'
										: 'Tidak ada anggota yang cocok.'}
								</p>
							) : (
								<ul className="py-1">
									{filteredPeers.map(peer => {
										const active = selected?.id === peer.id && selected?.type === peer.type;
										const count = unread[peerKey(peer)] ?? 0;
										return (
											<li key={`${peer.type}-${peer.id}`}>
												<button
													type="button"
													onClick={() => setSelected(peer)}
													className={cn(
														'flex w-full items-center gap-3 px-4 py-4 text-left transition-colors',
														active ? 'bg-[#e7f7ef]' : 'hover:bg-[#e3efe9]',
													)}
												>
													<span
														className={cn(
															'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
															active ? 'bg-emerald-100 text-emerald-700' : 'bg-[#e3efe9] text-emerald-700/70',
														)}
													>
														{(peer.name || '?').trim().charAt(0).toUpperCase()}
													</span>
													<span className="min-w-0 flex-1">
														<span
															className={cn(
																'block truncate text-sm leading-tight',
																active ? 'font-bold text-emerald-800' : 'font-medium text-emerald-950/70',
															)}
														>
															{peer.name}
														</span>
														{peer.type === 'user' && onLeaveUserIds.has(peer.id) ? (
															<span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/80">
																<CalendarX className="size-2.5" /> Cuti hari ini
															</span>
														) : (
															<span className="mt-0.5 block truncate text-xs text-emerald-800/50">
																{peer.type === 'parent' ? 'Parent' : peer.email || peer.role || 'Anggota'}
															</span>
														)}
													</span>
													{count > 0 ? (
														<span className="flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
															{count > 9 ? '9+' : count}
														</span>
													) : null}
												</button>
											</li>
										);
									})}
								</ul>
							)}
						</div>
					</div>

					<div className={cn('flex min-w-0 flex-col', selected ? 'flex' : 'hidden lg:flex')}>
						{selected ? (
							<>
								<header className="flex items-center gap-3 border-b border-[#e6ecea] bg-transparent px-4 py-3.5">
									<button
										type="button"
										onClick={() => setSelected(null)}
										className="flex size-9 items-center justify-center rounded-lg border border-[#e6ecea] text-emerald-700 transition-colors hover:bg-[#e7f7ef] lg:hidden"
										aria-label="Kembali"
									>
										<ArrowLeft className="size-4" />
									</button>
									<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
										{(selected.name || '?').trim().charAt(0).toUpperCase()}
									</span>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-extrabold text-emerald-950">{selected.name}</p>
										<div className="flex min-w-0 items-center gap-2">
											{selected.type === 'user' && selected.position ? (
												<span className="shrink-0 rounded-full bg-[#e7f7ef] px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
													{selected.position}
												</span>
											) : null}
											<p className="truncate text-xs text-muted-foreground">
												{selected.type === 'parent' ? 'Parent' : selected.email || 'Anggota'}
											</p>
										</div>
									</div>
								</header>

								<div className="flex h-[52vh] flex-col gap-2 overflow-y-auto bg-transparent px-4 py-4">
									{messages.length === 0 ? (
										<div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
											Belum ada pesan. Mulai percakapan dengan {selected.name}.
										</div>
									) : (
										messages.map(m => {
											const mine = m.sender === myId;
											return (
												<div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
													<div
														className={cn(
															'max-w-[min(520px,82%)] rounded-2xl border px-4 py-2.5 text-sm leading-relaxed shadow-[0_4px_14px_rgba(15,23,42,0.05)]',
															mine
																? 'rounded-tr-md border-emerald-200/80 bg-[#e7f7ef] text-emerald-950'
																: 'rounded-tl-md border-[#e6ecea] bg-white text-foreground',
														)}
													>
														{m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null}
									<ChatMessageAttachment message={m} mine={mine} />
														<p
															className={cn(
																'mt-1 text-[10px]',
																'text-muted-foreground',
															)}
														>
															{formatChatTime(m.created)}
														</p>
													</div>
												</div>
											);
										})
									)}
									<div ref={endRef} />
								</div>

								<form
									onSubmit={e => {
										e.preventDefault();
										void handleSend();
									}}
									className="border-t border-[#e6ecea] bg-transparent px-4 py-4 sm:px-5"
								>
									<div className="flex items-end gap-2 rounded-xl border border-[#e6ecea] bg-transparent px-3 py-2 transition-colors focus-within:border-emerald-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20">
										{pendingFile ? (
											<div className="mb-2 flex items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm">
												<FileText className="size-4 shrink-0 text-rose-600" />
												<span className="min-w-0 flex-1 truncate text-foreground">{pendingFile.name}</span>
												<span className="text-xs text-muted-foreground">{(pendingFile.size / 1024).toFixed(0)} KB</span>
												<button type="button" onClick={() => setPendingFile(null)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Hapus lampiran">
													<X className="size-3.5" />
												</button>
											</div>
										) : null}
										<input ref={fileInputRef} type="file" accept=".png,.pdf,image/png,application/pdf" className="hidden" onChange={e => { handlePickFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
										<button type="button" onClick={() => fileInputRef.current?.click()} className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#e7f7ef]', pendingFile ? 'bg-[#e7f7ef] text-emerald-700' : 'text-emerald-700')} aria-label="Lampirkan file">
											<Paperclip className="size-4" />
										</button>
										<textarea
											value={draft}
											onChange={e => setDraft(e.target.value)}
											onKeyDown={e => {
												if (e.key === 'Enter' && !e.shiftKey) {
													e.preventDefault();
													void handleSend();
												}
											}}
											rows={1}
											placeholder={`Pesan ke ${selected.name}…`}
											className="max-h-28 min-h-10 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
										/>
										<button
											type="submit"
											disabled={(!draft.trim() && !pendingFile) || sending}
											className="flex size-9 items-center justify-center rounded-lg bg-[#0f9d68] text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
											aria-label="Kirim pesan"
										>
											<Send className="size-4" />
										</button>
									</div>
								</form>
							</>
						) : (
							<div className="flex h-[58vh] flex-col overflow-y-auto text-sm text-muted-foreground">
								<div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
									<div>
												<MessageCircle className="mx-auto size-7 text-emerald-600" strokeWidth={1.6} />
										<p className="mt-2">Pilih anggota untuk mulai percakapan.</p>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
*/
function useLiveAttendance(employee: Employee | null, company: Company) {
	const [record, setRecord] = useState<AttendanceRecord | null>(null);
	const [workSchedule, setWorkSchedule] = useState<ResolvedSchedule | null>(null);
	const [scheduleKey, setScheduleKey] = useState('');
	const [scheduleFailed, setScheduleFailed] = useState(false);
	const [scheduleRetry, setScheduleRetry] = useState(0);
	const [now, setNow] = useState(() => new Date());
	const date = toDateInputValue(now);
	const [busy, setBusy] = useState<'in' | 'out' | null>(null);
	const busyRef = useRef(false);
	const fetchVersion = useRef(0);
	const [loading, setLoading] = useState(true);
	const [loadedKey, setLoadedKey] = useState('');
	const [failed, setFailed] = useState(false);
	const [geoSettings, setGeoSettings] = useState<AttendanceSettings | null>(null);
	const [geoCompany, setGeoCompany] = useState('');
	const [geoFailed, setGeoFailed] = useState(false);
	const [geoRetry, setGeoRetry] = useState(0);
	const recordKey = `${company.id}:${employee?.id ?? ''}:${date}`;

	const refresh = useCallback(async () => {
		const version = ++fetchVersion.current;
		if (!employee?.id) {
			setRecord(null);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const list = await pb.collection('attendance_records').getFullList<AttendanceRecord>({
				filter: pb.filter('company = {:company} && employee = {:emp} && date ~ {:date}', {
					company: company.id,
					emp: employee.id,
					date,
				}),
				requestKey: null,
			});
			if (version === fetchVersion.current) {
				setRecord(list[0] ?? null);
				setLoadedKey(recordKey);
				setFailed(false);
			}
		} catch {
			if (version === fetchVersion.current) {
				setLoadedKey(recordKey);
				setFailed(true);
			}
		} finally {
			if (version === fetchVersion.current) setLoading(false);
		}
	}, [company.id, employee?.id, date, recordKey]);

	useEffect(() => {
		void refresh();
		const onFocus = () => { if (!busyRef.current) void refresh(); };
		window.addEventListener('focus', onFocus);
		return () => {
			fetchVersion.current++;
			window.removeEventListener('focus', onFocus);
		};
	}, [refresh]);

	// Perubahan absensi di perangkat lain atau oleh admin ikut memperbarui tombol.
	useEffect(() => {
		if (!employee?.id) return;
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		void pb.collection('attendance_records').subscribe<AttendanceRecord>('*', event => {
			if (!busyRef.current && event.record.company === company.id && event.record.employee === employee.id && event.record.date?.slice(0, 10) === date) {
				void refresh();
			}
		}).then(unsub => {
			if (cancelled) unsub();
			else unsubscribe = unsub;
		}).catch(() => {});
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [company.id, employee?.id, date, refresh]);

	// Muat pengaturan geofence sebelum aksi absensi dapat digunakan.
	useEffect(() => {
		let cancelled = false;
		setGeoCompany('');
		getAttendanceSettings(company.id).then(settings => {
			if (!cancelled) {
				setGeoSettings(settings);
				setGeoFailed(false);
				setGeoCompany(company.id);
			}
		}).catch(() => {
			if (!cancelled) {
				setGeoSettings(null);
				setGeoFailed(true);
				setGeoCompany(company.id);
			}
		});
		return () => { cancelled = true; };
	}, [company.id, geoRetry]);

	useEffect(() => {
		let cancelled = false;
		if (!employee?.id) return;
		setScheduleKey('');
		getEmployeeSchedule(company.id, employee.id, date).then(schedule => {
			if (!cancelled) { setWorkSchedule(schedule); setScheduleFailed(false); setScheduleKey(recordKey); }
		}).catch(() => {
			if (!cancelled) { setWorkSchedule(null); setScheduleFailed(true); setScheduleKey(recordKey); }
		});
		return () => { cancelled = true; };
	}, [company.id, employee?.id, date, recordKey, scheduleRetry]);

	useEffect(() => {
		const onFocus = () => setScheduleRetry(value => value + 1);
		window.addEventListener('focus', onFocus);
		const timer = window.setInterval(onFocus, 60_000);
		return () => { window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
	}, []);

	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(id);
	}, []);

	const scheduleIn = normalizeTime(record?.clock_in ? record.schedule_in : workSchedule?.work ? workSchedule.start : record?.schedule_in || '08:00');
	const clockIn = normalizeTime(record?.clock_in || '');
	const clockOut = normalizeTime(record?.clock_out || '');

	const status: 'not_in' | 'present' | 'late' | 'done' =
		clockIn && clockOut
			? 'done'
			: clockIn
				? clockIn > scheduleIn
					? 'late'
					: 'present'
				: 'not_in';

	const resolveAttendanceCode = (
		inVal: string,
		outVal: string,
		schedIn: string,
		schedOut: string,
	): AttendanceCode => {
		if (inVal && outVal) {
			if (outVal < (schedOut || '17:00')) return 'early_clock_out';
			if (inVal > schedIn) return 'late_clock_in';
			return 'on_time';
		}
		if (inVal && !outVal) return inVal > schedIn ? 'late_clock_in' : 'no_clock_out';
		if (!inVal && outVal) return 'no_clock_in';
		return 'absent';
	};

	const findExisting = async (): Promise<AttendanceRecord | null> => {
		if (!employee) return null;
		const list = await pb.collection('attendance_records').getFullList<AttendanceRecord>({
			filter: pb.filter('company = {:company} && employee = {:emp} && date ~ {:date}', {
				company: company.id,
				emp: employee.id,
				date,
			}),
			requestKey: null,
		});
		return list[0] ?? null;
	};

	const upsert = async (field: 'clock_in' | 'clock_out') => {
		if (!employee || loading || loadedKey !== recordKey || geoCompany !== company.id || scheduleKey !== recordKey || failed || geoFailed || scheduleFailed || busyRef.current) return;
		if (date !== toDateInputValue()) {
			setNow(new Date());
			toast.error('Tanggal telah berubah. Memuat absensi hari ini.');
			return;
		}
		busyRef.current = true;
		setBusy(field === 'clock_in' ? 'in' : 'out');
		const time = formatNowTime(new Date());
		try {
			const actorId = await resolveActorId();
			if (!actorId) {
				notifyExpiredSession();
				return;
			}
			if (!employee.id || !company.id) {
				toast.error('Data karyawan tidak lengkap.');
				return;
			}

			// Pertahankan verifikasi lokasi yang digunakan oleh kartu absensi.
			if (geoSettings?.geofence_enabled) {
				const workLat = Number(geoSettings.work_latitude);
				const workLng = Number(geoSettings.work_longitude);
				const radius = Number(geoSettings.geofence_radius);
				if (!Number.isNaN(workLat) && !Number.isNaN(workLng) && radius > 0) {
					const probe = await probeGeofence(workLat, workLng, radius);
					if (!probe.ok) {
						if (probe.reason === 'denied') {
							toast.error('Izin lokasi ditolak. Aktifkan izin lokasi di peramban untuk check in/out.');
						} else if (probe.reason === 'unavailable') {
							toast.error('Perangkat tidak mendukung deteksi lokasi.');
						} else {
							toast.error('Gagal mendeteksi lokasi. Pastikan sinyal GPS tersedia lalu coba lagi.');
						}
						return;
					}
					if (probe.distance > radius) {
						toast.error(`Anda berada ${Math.round(probe.distance)} m dari lokasi kantor. Check in/out hanya tersedia dalam radius ${radius} m.`);
						return;
					}
				}
			}
			if (date !== toDateInputValue()) {
				setNow(new Date());
				toast.error('Tanggal telah berubah. Memuat absensi hari ini.');
				return;
			}

			const existing = await findExisting();
			const currentSchedule = await getEmployeeSchedule(company.id, employee.id, date);
			setWorkSchedule(currentSchedule);
			if (field === 'clock_in' && currentSchedule && !currentSchedule.work) {
				toast.error('Hari ini adalah hari libur pada jadwal kerja Anda.');
				return;
			}
			if (existing?.attendance_code === 'day_off' || existing?.attendance_code === 'time_off') {
				toast.error('Absensi hari ini ditandai sebagai libur atau cuti. Hubungi admin jika perlu diperbarui.');
				return;
			}
			if (date !== toDateInputValue()) { setNow(new Date()); toast.error('Tanggal telah berubah. Memuat absensi hari ini.'); return; }
			const selectedIn = field === 'clock_out' && existing?.clock_in ? normalizeTime(existing.schedule_in || '08:00') : currentSchedule?.work ? currentSchedule.start : normalizeTime(existing?.schedule_in || '08:00');
			const selectedOut = field === 'clock_out' && existing?.clock_in ? normalizeTime(existing.schedule_out || '17:00') : currentSchedule?.work ? currentSchedule.end : normalizeTime(existing?.schedule_out || '17:00');
			const selectedShift = field === 'clock_out' && existing?.clock_in ? existing.shift : currentSchedule?.work ? currentSchedule.shift : existing?.shift || 'Regular';
			if ((field === 'clock_in' && existing?.clock_in) || (field === 'clock_out' && (!existing?.clock_in || existing.clock_out))) {
				setRecord(existing);
				toast.error('Status absensi telah berubah. Data terbaru ditampilkan.');
				return;
			}

			if (existing?.id) {
				const inVal = field === 'clock_in' ? time : normalizeTime(existing.clock_in || '');
				const outVal = field === 'clock_out' ? time : normalizeTime(existing.clock_out || '');
				const code = resolveAttendanceCode(inVal, outVal, selectedIn, selectedOut);
				const updated = await pb.collection('attendance_records').update<AttendanceRecord>(
					existing.id,
					{
						[field]: time,
						attendance_code: code,
						shift: selectedShift,
						schedule_in: selectedIn,
						schedule_out: selectedOut,
					},
					{ requestKey: `karyawan-att-upd-${existing.id}-${field}` },
				);
				setRecord(updated);
			} else {
				const inVal = field === 'clock_in' ? time : '';
				const outVal = field === 'clock_out' ? time : '';
				const code = resolveAttendanceCode(inVal, outVal, selectedIn, selectedOut);
				try {
					const created = await pb.collection('attendance_records').create<AttendanceRecord>(
						{
							company: company.id,
							employee: employee.id,
							date: date.slice(0, 10),
							shift: selectedShift,
							schedule_in: selectedIn,
							schedule_out: selectedOut,
							clock_in: inVal,
							clock_out: outVal,
							attendance_code: code,
							notes: '',
							owner: actorId,
						},
						{ requestKey: `karyawan-att-create-${employee.id}-${date}-${field}` },
					);
					setRecord(created);
				} catch (createErr: unknown) {
					// Unique (company, employee, date) — row exists but list/find missed it
					const status = (createErr as { status?: number })?.status;
					const data = (createErr as { response?: { data?: Record<string, unknown> } })?.response
						?.data;
					const uniqueHit =
						status === 400 &&
						data &&
						(Boolean(data.company) || Boolean(data.employee) || Boolean(data.date));
					if (!uniqueHit) throw createErr;

					const raced = await findExisting();
					if (!raced?.id) throw createErr;
					if ((field === 'clock_in' && (raced.clock_in || raced.attendance_code === 'day_off' || raced.attendance_code === 'time_off')) || (field === 'clock_out' && (!raced.clock_in || raced.clock_out))) {
						setRecord(raced);
						toast.error('Status absensi telah berubah. Data terbaru ditampilkan.');
						return;
					}

					const inVal2 = field === 'clock_in' ? time : normalizeTime(raced.clock_in || '');
					const outVal2 = field === 'clock_out' ? time : normalizeTime(raced.clock_out || '');
					const code2 = resolveAttendanceCode(inVal2, outVal2, selectedIn, selectedOut);
					const updated = await pb.collection('attendance_records').update<AttendanceRecord>(
						raced.id,
						{ [field]: time, attendance_code: code2, shift: selectedShift, schedule_in: selectedIn, schedule_out: selectedOut },
						{ requestKey: `karyawan-att-upd-race-${raced.id}-${field}` },
					);
					setRecord(updated);
				}
			}
			toast.success(
				`${field === 'clock_in' ? 'Clock in' : 'Clock out'} tercatat pukul ${time}.`,
			);
			await refresh();
		} catch (err: unknown) {
			const status = (err as { status?: number }).status;
			if (status === 401) {
				notifyExpiredSession();
				return;
			}
			const msg =
				(err as { response?: { message?: string } })?.response?.message ||
				(err as { message?: string })?.message ||
				'';
			console.error('attendance upsert failed', err);
			toast.error(msg ? `Gagal mencatat absensi: ${msg}` : 'Gagal mencatat absensi.');
		} finally {
			busyRef.current = false;
			setBusy(null);
		}
	};

	return {
		record, workSchedule, now, busy, loading: loading || (!!employee && (loadedKey !== recordKey || geoCompany !== company.id || scheduleKey !== recordKey)),
		failed: failed || geoFailed || scheduleFailed,
		geoSettings,
		refresh: async () => {
			if (geoFailed) setGeoRetry(value => value + 1);
			setScheduleRetry(value => value + 1);
			await refresh();
		},
		upsert,
		canClockIn: status === 'not_in' && (!workSchedule || workSchedule.work) && record?.attendance_code !== 'day_off' && record?.attendance_code !== 'time_off',
		canClockOut: (status === 'present' || status === 'late') && record?.attendance_code !== 'day_off' && record?.attendance_code !== 'time_off',
		done: status === 'done',
	};
}

function LiveAttendance({ attendance, companyId, employee, userId }: { attendance: ReturnType<typeof useLiveAttendance>; companyId: string; employee: Employee | null; userId: string }) {
	const { record, workSchedule, now, loading, failed, refresh } = attendance;
	const clockIn = normalizeTime(record?.clock_in || '');
	const clockOut = normalizeTime(record?.clock_out || '');
	const shownIn = record?.clock_in ? normalizeTime(record.schedule_in || '') : workSchedule ? (workSchedule.work ? workSchedule.start : '') : record?.schedule_in ? normalizeTime(record.schedule_in) : '';
	const shownOut = record?.clock_in ? normalizeTime(record.schedule_out || '') : workSchedule ? (workSchedule.work ? workSchedule.end : '') : record?.schedule_out ? normalizeTime(record.schedule_out) : '';
	const shiftName = record?.clock_in ? (record.shift || '').trim() : workSchedule ? (workSchedule.work ? workSchedule.shift : 'Hari libur') : (record?.shift || '').trim();
	const statusLine = clockIn && clockOut
		? `Anda sudah clock out pukul ${clockOut}${shownOut && clockOut < shownOut ? ' · Pulang lebih awal' : shownIn && clockIn > shownIn ? ' · Terlambat' : ''}`
		: clockIn
			? `Anda sudah clock in pukul ${clockIn}${shownIn && clockIn > shownIn ? ' · Terlambat' : ''}`
			: workSchedule && !workSchedule.work ? 'Hari ini tidak dijadwalkan bekerja' : 'Anda belum clock in hari ini';

	return (
		<section id="ess-shift-card" className="px-5 pb-5 pt-4">
			<p className="flex items-center gap-2 text-sm font-medium text-white/90">
				<CalendarDays className="size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
				<span>Jadwal shift untuk {formatShiftHeading(now)}</span>
			</p>
			<p className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-white">
				{shiftName || 'Belum ada jadwal shift'}
			</p>
			{employee && employee.company === companyId && employee.user === userId ? (
				<PayrollAttendanceProgressBar companyId={companyId} employeeId={employee.id} today={toDateInputValue(now)} attendanceVersion={`${record?.id ?? ''}:${record?.clock_in ?? ''}:${record?.clock_out ?? ''}`} />
			) : null}
			<div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-emerald-900">
				<Clock className="size-5 shrink-0 text-emerald-700" strokeWidth={1.8} aria-hidden="true" />
				<div className="min-w-0 flex-1">
					<p className="text-base font-bold tabular-nums">{shownIn && shownOut ? `${shownIn} - ${shownOut}` : '—'}</p>
					<p className="mt-0.5 text-sm leading-snug">{loading ? 'Memuat absensi…' : failed ? 'Gagal memuat absensi.' : statusLine}</p>
					{failed ? <button type="button" onClick={() => void refresh()} className="mt-2 text-sm font-semibold text-emerald-700 underline">Coba lagi</button> : null}
				</div>
			</div>
		</section>
	);
}

function RetiredAttendanceMarkup() {
	return null;
	void `
	const hideAttendanceHome = false;
	const panel = 'home' as Panel;
	const onPanel = (_p: Panel) => {};
	return (
		<section className="hidden">
			{hideAttendanceHome ? null : (
			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				<div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-4">
						<div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-indigo-100">
							<Radio className="size-6 animate-pulse text-emerald-600" />
						</div>
						<div>
							<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
								<span className="inline-flex size-1.5 animate-pulse rounded-full bg-emerald-500" />
								Live
							</p>
							<p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight">
								{formatLiveClock(now)}
							</p>
							<p className="text-xs text-muted-foreground">{formatAttendanceDate(date)}</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
						<div>
							<p className="text-xs text-muted-foreground">Jadwal</p>
							<p className="font-semibold tabular-nums">{scheduleIn} – {scheduleOut}</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground">Status</p>
							<span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_BADGE[status])}>
								{STATUS_LABELS[status]}
							</span>
						</div>
					</div>
				</div>
			</div>
			)}

			{hideAttendanceHome ? null : (
			<div className="grid grid-cols-2 gap-4">
				<div className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clock in</p>
					<p className="mt-2 text-2xl font-extrabold tabular-nums">{clockIn || '—'}</p>
					<button
						type="button"
						disabled={!canClockIn || busy === 'in'}
						onClick={() => void upsert('clock_in', formatNowTime(now))}
						className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
					>
						<LogIn className="size-4" /> {busy === 'in' ? 'Memproses…' : 'Clock in'}
					</button>
				</div>
				<div className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clock out</p>
					<p className="mt-2 text-2xl font-extrabold tabular-nums">{clockOut || '—'}</p>
					<button
						type="button"
						disabled={!canClockOut || busy === 'out'}
						onClick={() => void upsert('clock_out', formatNowTime(now))}
						className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
					>
						<LogOut className="size-4" /> {busy === 'out' ? 'Memproses…' : 'Clock out'}
					</button>
				</div>
			</div>
			)}

			{hideAttendanceHome ? null : <LeaveDirectory employee={employee} company={company} />}

			<AttendanceShortcutCard panel={panel} onPanel={onPanel} hideAttendanceMenus={hideAttendanceHome} />

			{panel === 'home' ? (
			<div className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-bold">Riwayat absensi terbaru</h2>
					<label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="date"
							value={date}
							onChange={e => setDate(e.target.value)}
							className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
						/>
					</label>
				</div>
				{loading ? (
					<p className="py-6 text-center text-sm text-muted-foreground">Memuat…</p>
				) : !record ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Belum ada absensi pada {formatAttendanceDate(date)}.
					</p>
				) : (
					<table className="mt-3 w-full text-sm">
						<tbody className="divide-y divide-border">
							<tr>
								<td className="py-2 text-muted-foreground">Tanggal</td>
								<td className="py-2 text-right font-medium">{formatAttendanceDate(record.date)}</td>
							</tr>
							<tr>
								<td className="py-2 text-muted-foreground">Clock in</td>
								<td className="py-2 text-right font-medium tabular-nums">{clockIn || '—'}</td>
							</tr>
							<tr>
								<td className="py-2 text-muted-foreground">Clock out</td>
								<td className="py-2 text-right font-medium tabular-nums">{clockOut || '—'}</td>
							</tr>
							<tr>
								<td className="py-2 text-muted-foreground">Kode</td>
								<td className="py-2 text-right font-medium">{ATTENDANCE_CODE_LABELS[record.attendance_code]}</td>
							</tr>
						</tbody>
					</table>
				)}
			</div>
			) : null}
		</section>
	);
`;
}

function AttendanceListPanel({ employee, company }: { employee: Employee; company: Company }) {
	const [rows, setRows] = useState<AttendanceRecord[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		pb.collection('attendance_records')
			.getFullList<AttendanceRecord>({
				filter: pb.filter('company = {:company} && employee = {:emp}', {
					company: company.id,
					emp: employee.id,
				}),
				sort: '-date',
				requestKey: `att-list-${employee.id}`,
			})
			.then(list => {
				if (!cancelled) setRows(list);
			})
			.catch(() => {
				if (!cancelled) setRows([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [company.id, employee.id]);

	return (
		<section className="overflow-hidden rounded-2xl border border-border bg-transparent">
			<div className="border-b border-border bg-transparent px-5 py-4">
				<h2 className="text-lg font-bold">Attendance List</h2>
				<p className="text-xs text-muted-foreground">Riwayat kehadiran Anda.</p>
			</div>
			{loading ? (
				<p className="px-5 py-8 text-center text-sm text-muted-foreground">Memuat…</p>
			) : rows.length === 0 ? (
				<p className="px-5 py-8 text-center text-sm text-muted-foreground">Belum ada data kehadiran.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[560px] text-left text-sm">
						<thead>
							<tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<th className="px-4 py-3">Tanggal</th>
								<th className="px-4 py-3">Masuk</th>
								<th className="px-4 py-3">Pulang</th>
								<th className="px-4 py-3">Kode</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{rows.map(r => (
								<tr key={r.id}>
									<td className="px-4 py-3">{r.date ? r.date.slice(0, 10) : '—'}</td>
									<td className="px-4 py-3 tabular-nums">{normalizeTime(r.clock_in || '') || '—'}</td>
									<td className="px-4 py-3 tabular-nums">{normalizeTime(r.clock_out || '') || '—'}</td>
									<td className="px-4 py-3">{ATTENDANCE_CODE_LABELS[r.attendance_code] ?? r.attendance_code}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

function AttendanceCorrectionPanel({ employee, company }: { employee: Employee; company: Company }) {
	const [date, setDate] = useState(todayIso());
	const [clockIn, setClockIn] = useState('');
	const [clockOut, setClockOut] = useState('');
	const [reason, setReason] = useState('');
	const [saving, setSaving] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		const inVal = normalizeTime(clockIn);
		const outVal = normalizeTime(clockOut);
		if (!date || (!inVal && !outVal)) {
			toast.error('Isi tanggal dan jam yang ingin dikoreksi.');
			return;
		}
		const actorId = await resolveActorId();
		if (!actorId) {
			notifyExpiredSession();
			return;
		}
		setSaving(true);
		try {
			const day = date.slice(0, 10);
			let existing: AttendanceRecord | null = null;
			try {
				existing = await pb.collection('attendance_records').getFirstListItem<AttendanceRecord>(
					pb.filter('company = {:company} && employee = {:emp} && date ~ {:date}', {
						company: company.id,
						emp: employee.id,
						date: day,
					}),
					{ requestKey: null },
				);
			} catch {
				existing = null;
			}
			const note = `Koreksi: ${reason || 'permintaan koreksi absensi'}`;
			if (existing?.id) {
				await pb.collection('attendance_records').update(existing.id, {
					clock_in: inVal || existing.clock_in || '',
					clock_out: outVal || existing.clock_out || '',
					notes: note,
				});
			} else {
				await pb.collection('attendance_records').create({
					company: company.id,
					employee: employee.id,
					date: day,
					shift: 'Regular',
					schedule_in: '08:00',
					schedule_out: '17:00',
					clock_in: inVal,
					clock_out: outVal,
					attendance_code: inVal ? 'on_time' : 'no_clock_in',
					notes: note,
					owner: actorId,
				});
			}
			toast.success('Koreksi absensi tersimpan.');
			setReason('');
		} catch {
			toast.error('Gagal menyimpan koreksi absensi.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
			<h2 className="text-lg font-bold">Attendance Correction</h2>
			<p className="mt-1 text-xs text-muted-foreground">Ajukan perbaikan jam masuk atau pulang.</p>
			<form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
				<label className="block text-sm">
					<span className="mb-1.5 block font-medium">Tanggal</span>
					<input type="date" required value={date.slice(0, 10)} onChange={e => setDate(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3" />
				</label>
				<label className="block text-sm">
					<span className="mb-1.5 block font-medium">Clock in</span>
					<input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3" />
				</label>
				<label className="block text-sm">
					<span className="mb-1.5 block font-medium">Clock out</span>
					<input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3" />
				</label>
				<label className="block text-sm md:col-span-2">
					<span className="mb-1.5 block font-medium">Alasan</span>
					<textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2" placeholder="Alasan koreksi…" />
				</label>
				<div className="md:col-span-2 flex justify-end">
					<button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
						{saving ? 'Menyimpan…' : 'Kirim koreksi'}
					</button>
				</div>
			</form>
		</section>
	);
}

function OnDutyPanel({ employee, company }: { employee: Employee; company: Company }) {
	const [date, setDate] = useState(todayIso());
	const [place, setPlace] = useState('');
	const [saving, setSaving] = useState(false);
	const [rows, setRows] = useState<AttendanceRecord[]>([]);

	const refresh = useCallback(async () => {
		const list = await pb.collection('attendance_records').getFullList<AttendanceRecord>({
			filter: pb.filter('company = {:company} && employee = {:emp}', {
				company: company.id,
				emp: employee.id,
			}),
			sort: '-date',
			requestKey: `onduty-${employee.id}`,
		});
		setRows(list.filter(r => (r.shift || '') === 'On Duty' || (r.notes || '').startsWith('On duty:')));
	}, [company.id, employee.id]);

	useEffect(() => {
		refresh().catch(() => setRows([]));
	}, [refresh]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!place.trim()) {
			toast.error('Lokasi atau keterangan dinas wajib diisi.');
			return;
		}
		const actorId = await resolveActorId();
		if (!actorId) {
			notifyExpiredSession();
			return;
		}
		setSaving(true);
		try {
			const day = date.slice(0, 10);
			const note = `On duty: ${place.trim()}`;
			let existing: AttendanceRecord | null = null;
			try {
				existing = await pb.collection('attendance_records').getFirstListItem<AttendanceRecord>(
					pb.filter('company = {:company} && employee = {:emp} && date ~ {:date}', {
						company: company.id,
						emp: employee.id,
						date: day,
					}),
					{ requestKey: null },
				);
			} catch {
				existing = null;
			}
			if (existing?.id) {
				await pb.collection('attendance_records').update(existing.id, { shift: 'On Duty', notes: note });
			} else {
				await pb.collection('attendance_records').create({
					company: company.id,
					employee: employee.id,
					date: day,
					shift: 'On Duty',
					schedule_in: '08:00',
					schedule_out: '17:00',
					clock_in: '',
					clock_out: '',
					attendance_code: 'day_off',
					notes: note,
					owner: actorId,
				});
			}
			toast.success('On duty tercatat.');
			setPlace('');
			await refresh();
		} catch {
			toast.error('Gagal mencatat on duty.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="space-y-4">
			<form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
				<h2 className="text-lg font-bold">On Duty</h2>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Tanggal</span>
						<input type="date" required value={date.slice(0, 10)} onChange={e => setDate(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3" />
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Lokasi / keterangan</span>
						<input required value={place} onChange={e => setPlace(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder="Lokasi dinas" />
					</label>
				</div>
				<div className="flex justify-end">
					<button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
						{saving ? 'Menyimpan…' : 'Simpan'}
					</button>
				</div>
			</form>
			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				{rows.length === 0 ? (
					<p className="px-5 py-8 text-center text-sm text-muted-foreground">Belum ada catatan on duty.</p>
				) : (
					<ul className="divide-y divide-border text-sm">
						{rows.map(r => (
							<li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
								<span>{formatAttendanceDate(r.date)}</span>
								<span className="text-muted-foreground">{(r.notes || '').replace(/^On duty:\s*/, '')}</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}

/* ----------------------------- Overtime Requests ----------------------------- */

function OvertimeRequests({ employee, company }: { employee: Employee; company: Company }) {
	const [requests, setRequests] = useState<OvertimeRequest[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState<Partial<OvertimeRequest>>(emptyOvertimeRequest(todayIso()));

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const list = await pb.collection('overtime_requests').getFullList<OvertimeRequest>({
				filter: pb.filter('company = {:company} && employee = {:emp}', {
					company: company.id,
					emp: employee.id,
				}),
				sort: '-overtime_date,-created',
			});
			setRequests(list);
		} catch {
			setRequests([]);
		} finally {
			setLoading(false);
		}
	}, [company.id, employee.id]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	const hourly = useMemo(() => Math.round((employee.basic_salary || 0) / 173), [employee.basic_salary]);
	const multiplier = 1.5;
	const previewAmount = calcOvertimeAmount(hourly, form.duration_minutes || 0, multiplier);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		const mins = form.duration_minutes || 0;
		if (!form.overtime_date) {
			toast.error('Tanggal lembur wajib diisi.');
			return;
		}
		if (mins <= 0) {
			toast.error('Durasi harus lebih dari 0 menit.');
			return;
		}
		const actorId = await resolveActorId();
		if (!actorId) {
			notifyExpiredSession();
			return;
		}
		setSaving(true);
		try {
			await pb.collection('overtime_requests').create({
				company: company.id,
				employee: employee.id,
				requested_date: (form.requested_date || todayIso()).slice(0, 10),
				overtime_date: (form.overtime_date || todayIso()).slice(0, 10),
				duration_minutes: mins,
				compensation: (form.compensation as OvertimeCompensation) || 'paid_overtime',
				status: 'awaiting_approval' as OvertimeStatus,
				hourly_rate: hourly,
				amount: form.compensation === 'paid_overtime' ? previewAmount : 0,
				reason: form.reason || '',
				owner: actorId,
			});
			toast.success('Pengajuan lembur dikirim.');
			setShowForm(false);
			setForm(emptyOvertimeRequest(todayIso()));
			await refresh();
		} catch {
			toast.error('Gagal mengajukan lembur.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="space-y-4">
		<div className="flex items-center justify-between">
			<h2 className="text-lg font-bold">Pengajuan Lembur</h2>
			<button
				type="button"
				onClick={() => setShowForm(o => !o)}
				className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
			>
				<Plus className="size-4" /> Ajukan
			</button>
		</div>

		{showForm ? (
			<form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
				<div className="flex items-center justify-between">
					<h3 className="text-base font-bold">Form Pengajuan Lembur</h3>
					<button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
						<X className="size-4" />
					</button>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Tanggal lembur</span>
						<input
							type="date"
							required
							value={(form.overtime_date || '').slice(0, 10)}
							onChange={e => setForm(f => ({ ...f, overtime_date: e.target.value }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Durasi (menit)</span>
						<input
							type="number"
							min={1}
							required
							value={form.duration_minutes || ''}
							onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
						<p className="mt-1 text-xs text-muted-foreground">{formatDuration(form.duration_minutes || 0)}</p>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Kompensasi</span>
						<select
							value={form.compensation || 'paid_overtime'}
							onChange={e => setForm(f => ({ ...f, compensation: e.target.value as OvertimeCompensation }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						>
							{OVERTIME_COMPENSATION_OPTIONS.map(c => (
								<option key={c} value={c}>{OVERTIME_COMPENSATION_LABELS[c]}</option>
							))}
						</select>
					</label>
					{form.compensation === 'paid_overtime' ? (
						<div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
							<p className="text-xs font-medium text-emerald-800">Estimasi bayaran</p>
							<p className="mt-1 text-lg font-bold text-emerald-900">{formatRupiah(previewAmount)}</p>
							<p className="text-xs text-emerald-700/80">× {multiplier} pengali weekday</p>
						</div>
					) : null}
				</div>
				<label className="block text-sm">
					<span className="mb-1.5 block font-medium">Alasan / keterangan</span>
					<textarea
						rows={3}
						value={form.reason || ''}
						onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
						placeholder="Alasan lembur…"
						className="w-full rounded-lg border border-input bg-background px-3 py-2"
					/>
				</label>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-medium">Batal</button>
					<button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
						{saving ? 'Mengirim…' : 'Kirim pengajuan'}
					</button>
				</div>
			</form>
		) : null}

		<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
			{loading ? (
				<p className="px-5 py-8 text-center text-sm text-muted-foreground">Memuat…</p>
			) : requests.length === 0 ? (
				<p className="px-5 py-8 text-center text-sm text-muted-foreground">Belum ada pengajuan lembur.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] text-left text-sm">
						<thead>
							<tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<th className="px-4 py-3">Tanggal</th>
								<th className="px-4 py-3">Durasi</th>
								<th className="px-4 py-3">Kompensasi</th>
								<th className="px-4 py-3 text-right">Jumlah</th>
								<th className="px-4 py-3">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{requests.map(r => (
								<tr key={r.id} className="hover:bg-muted/30">
									<td className="px-4 py-3">{formatOvertimeDate(r.overtime_date)}</td>
									<td className="px-4 py-3">{formatDuration(r.duration_minutes)}</td>
									<td className="px-4 py-3">{OVERTIME_COMPENSATION_LABELS[r.compensation] ?? r.compensation}</td>
									<td className="px-4 py-3 text-right">{r.amount > 0 ? formatRupiah(r.amount) : '—'}</td>
									<td className="px-4 py-3">
										<span className={cn(
											'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
											r.status === 'awaiting_approval' && 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/80',
											r.status === 'approved' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
											r.status === 'rejected' && 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80',
											r.status === 'cancelled' && 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
										)}>
											{OVERTIME_STATUS_LABELS[r.status] ?? r.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
		</section>
	);
}

/* ----------------------------- Loan Requests ----------------------------- */

function LoanRequests({ employee, company }: { employee: Employee; company: Company }) {
	const [loans, setLoans] = useState<EmployeeLoan[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		principal: 0,
		installments: 1,
		disbursed_date: todayIso(),
		description: '',
	});

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const list = await pb.collection('employee_loans').getFullList<EmployeeLoan>({
				filter: pb.filter('company = {:company} && employee = {:emp}', {
					company: company.id,
					emp: employee.id,
				}),
				sort: '-created',
			});
			setLoans(list);
		} catch {
			setLoans([]);
		} finally {
			setLoading(false);
		}
	}, [company.id, employee.id]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	const installment = useMemo(() => {
		const terms = Math.max(1, form.installments || 1);
		return Math.round((form.principal || 0) / terms);
	}, [form.principal, form.installments]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if ((form.principal || 0) <= 0) {
			toast.error('Jumlah pinjaman harus lebih dari 0.');
			return;
		}
		if ((form.installments || 0) < 1) {
			toast.error('Jumlah angsuran minimal 1.');
			return;
		}
		const actorId = await resolveActorId();
		if (!actorId) {
			notifyExpiredSession();
			return;
		}
		setSaving(true);
		try {
			const loan = await pb.collection('employee_loans').create<EmployeeLoan>({
				company: company.id,
				employee: employee.id,
				principal: Number(form.principal) || 0,
				installments: Number(form.installments) || 1,
				installment_amount: installment,
				disbursed_date: (form.disbursed_date || todayIso()).slice(0, 10),
				paid_installments: 0,
				paid_amount: 0,
				status: 'pending' as LoanStatus,
				description: form.description || '',
				owner: actorId,
			});
			// Tampilkan pengajuan sebagai transaksi pinjaman di Biaya agar akuntan
			// dapat meninjaunya dan memprosesnya ke pembukuan. Belum dibukukan
			// (booked=false) sampai akuntan memproses, dan tanpa akun/jurnal.
			try {
				await ensureLoanTransaction(company, loan, employee.name);
			} catch {
				// Transaksi pinjaman gagal dibuat — pengajuan tetap tersimpan dan
				// akan dipulihkan otomatis saat halaman Biaya dibuka.
			}
			toast.success('Pengajuan pinjaman dikirim. Menunggu tinjauan akuntan di menu Biaya.');
			setShowForm(false);
			setForm({ principal: 0, installments: 1, disbursed_date: todayIso(), description: '' });
			await refresh();
		} catch {
			toast.error('Gagal mengajukan pinjaman.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="space-y-4">
		<div className="flex items-center justify-between">
			<h2 className="text-lg font-bold">Pengajuan Pinjaman</h2>
			<button
				type="button"
				onClick={() => setShowForm(o => !o)}
				className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
			>
				<Plus className="size-4" /> Ajukan
			</button>
		</div>

		{showForm ? (
			<form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
				<div className="flex items-center justify-between">
					<h3 className="text-base font-bold">Form Pengajuan Pinjaman</h3>
					<button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
						<X className="size-4" />
					</button>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Jumlah pinjaman (Rp)</span>
						<input
							type="number"
							min={1}
							required
							value={form.principal || ''}
							onChange={e => setForm(f => ({ ...f, principal: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Jumlah angsuran (bulan)</span>
						<input
							type="number"
							min={1}
							required
							value={form.installments || ''}
							onChange={e => setForm(f => ({ ...f, installments: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Tanggal pengajuan</span>
						<input
							type="date"
							required
							value={(form.disbursed_date || '').slice(0, 10)}
							onChange={e => setForm(f => ({ ...f, disbursed_date: e.target.value }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
					<div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
						<p className="text-xs font-medium text-emerald-800">Angsuran / bulan</p>
						<p className="mt-1 text-lg font-bold text-emerald-900">{formatRupiah(installment)}</p>
					</div>
				</div>
				<label className="block text-sm">
					<span className="mb-1.5 block font-medium">Keterangan</span>
					<textarea
						rows={3}
						value={form.description}
						onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
						placeholder="Keperluan pinjaman…"
						className="w-full rounded-lg border border-input bg-background px-3 py-2"
					/>
				</label>
				<p className="text-xs text-muted-foreground">
					Pengajuan berstatus <strong>Menunggu</strong> persetujuan admin. Pinjaman baru dipotong
					dari gaji setelah disetujui menjadi Aktif.
				</p>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-medium">Batal</button>
					<button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
						{saving ? 'Mengirim…' : 'Kirim pengajuan'}
					</button>
				</div>
			</form>
		) : null}

		<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
			{loading ? (
				<p className="px-5 py-8 text-center text-sm text-muted-foreground">Memuat…</p>
			) : loans.length === 0 ? (
				<p className="px-5 py-8 text-center text-sm text-muted-foreground">Belum ada pengajuan pinjaman.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] text-left text-sm">
						<thead>
							<tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<th className="px-4 py-3">Tanggal</th>
								<th className="px-4 py-3 text-right">Pokok</th>
								<th className="px-4 py-3 text-right">Angsuran</th>
								<th className="px-4 py-3 text-right">Cicilan/bln</th>
								<th className="px-4 py-3">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{loans.map(l => (
								<tr key={l.id} className="hover:bg-muted/30">
									<td className="px-4 py-3">{formatAttendanceDate(l.disbursed_date)}</td>
									<td className="px-4 py-3 text-right">{formatRupiah(l.principal || 0)}</td>
									<td className="px-4 py-3 text-right">{l.installments || 0}x</td>
									<td className="px-4 py-3 text-right">{formatRupiah(loanInstallment(l))}</td>
									<td className="px-4 py-3">
										<span className={cn(
											'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
											l.status === 'pending' && 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/80',
											l.status === 'active' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
											l.status === 'completed' && 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80',
											l.status === 'cancelled' && 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
										)}>
											{LOAN_STATUS_LABELS[l.status] ?? l.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
		</section>
	);
}

/* ----------------------------- Reimbursement Requests ----------------------------- */

function ReimbursementRequests({
	employee,
	company,
	memberRole,
}: {
	employee: Employee;
	company: Company;
	memberRole: MemberRole | null;
}) {
	const [requests, setRequests] = useState<Reimbursement[]>([]);
	const [actorNames, setActorNames] = useState<Record<string, string>>({});
	const [loadingActorNames, setLoadingActorNames] = useState(false);
	const [settings, setSettings] = useState<ReimbursementSetting[]>([]);
	const [settingsLoadError, setSettingsLoadError] = useState(false);
	const [saldos, setSaldos] = useState<Record<string, ReimbursementSaldo>>({});
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		settingId: '',
		amount: 0,
		date: todayIso(),
		description: '',
	});
	const [proofFile, setProofFile] = useState<File | null>(null);
	const formRef = useRef<HTMLFormElement>(null);

	useEffect(() => {
		if (showForm) formRef.current?.scrollIntoView({ block: 'start' });
	}, [showForm]);

	const refresh = useCallback(async (quiet = false) => {
		if (!quiet) setLoading(true);
		try {
			const filter = pb.filter('company = {:company}', { company: company.id });
			const [list, sets] = await Promise.all([
				pb.collection('reimbursements').getFullList<Reimbursement>({
					filter: pb.filter('company = {:company} && employee = {:emp}', {
						company: company.id,
						emp: employee.id,
					}),
					sort: '-date,-created',
					expand: 'processed_by',
					requestKey: null,
				}),
				pb
					.collection('reimbursement_settings')
					.getFullList<ReimbursementSetting>({
						filter,
						sort: 'name',
						requestKey: null,
					})
					.then(items => ({ items, failed: false }))
					.catch(() => ({ items: [] as ReimbursementSetting[], failed: true })),
			]);
			setRequests(list);
			setSettings(sets.items);
			setSettingsLoadError(sets.failed);
			setLoadError(false);
			// Muat sisa saldo per jenis (company-wide) lewat API superuser.
			fetch('/api/reimbursement-saldo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ companyId: company.id }),
			})
				.then(res => (res.ok ? res.json() : { saldos: [] }))
				.then((data: { saldos?: { settingId: string; budget: number; used: number; remaining: number }[] }) =>
					setSaldos(indexSaldos(data.saldos)))
				.catch(() => {});
		} catch {
			setLoadError(true);
		} finally {
			if (!quiet) setLoading(false);
		}
	}, [company.id, employee.id]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	// Identitas yang ada di jejak pengajuan dimuat dengan izin pengguna saat ini.
	useEffect(() => {
		let active = true;
		setLoadingActorNames(true);
		void loadReimbursementActorNames(company.id, requests).then(names => {
			if (active) setActorNames(names);
		}).catch(() => {
			if (active) setActorNames({});
		}).finally(() => {
			if (active) setLoadingActorNames(false);
		});
		return () => { active = false; };
	}, [company.id, requests]);

	// Ikuti keputusan admin saat halaman terbuka, dan perbarui lagi saat kembali ke halaman.
	useEffect(() => {
		let active = true;
		let unsubscribe: (() => Promise<void>) | undefined;
		void pb.collection('reimbursements').subscribe<Reimbursement>('*', event => {
			if (active && event.record.company === company.id && event.record.employee === employee.id) {
				void refresh(true);
			}
		}).then(remove => {
			if (active) unsubscribe = remove;
			else void remove();
		}).catch(() => {});
		const onFocus = () => { void refresh(true); };
		window.addEventListener('focus', onFocus);
		return () => {
			active = false;
			window.removeEventListener('focus', onFocus);
			if (unsubscribe) void unsubscribe();
		};
	}, [company.id, employee.id, refresh]);

	// Pengaturan yang berlaku untuk karyawan ini (penugasan + eligibility).
	const eligibleSettings = useMemo(() => {
		return settings
			.filter(s => s.active !== false)
			.map(s => ({ setting: s, result: checkEligibility(s, employee, memberRole) }))
			.filter(x => x.result.eligible);
	}, [settings, employee, memberRole]);

	const selectedEligible = useMemo(
		() => eligibleSettings.find(x => x.setting.id === form.settingId) ?? null,
		[eligibleSettings, form.settingId],
	);

	const selectedSetting = selectedEligible?.setting ?? null;
	const amountLimit = selectedEligible?.result.amountLimit ?? 0;
	const limitNote = selectedEligible?.result.limitNote ?? '';
	const overLimit = amountLimit > 0 && (form.amount || 0) > amountLimit;
	const selectedSaldo = selectedSetting ? saldos[selectedSetting.id] : undefined;
	const saldoTrackedSelected = Boolean(selectedSaldo && selectedSaldo.budget > 0);
	const overSaldo = saldoTrackedSelected && (form.amount || 0) > (selectedSaldo?.remaining ?? 0);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (eligibleSettings.length > 0 && !form.settingId) {
			toast.error('Pilih jenis reimbursement terlebih dahulu.');
			return;
		}
		if ((form.amount || 0) <= 0) {
			toast.error('Nominal reimbursement harus lebih dari 0.');
			return;
		}
		if (overLimit) {
			toast.error(`Nominal melebihi batas ${formatRupiah(amountLimit)} (${limitNote}).`);
			return;
		}
		if (overSaldo && selectedSaldo) {
			toast.error(`Nominal melebihi sisa saldo ${formatRupiah(selectedSaldo.remaining)} untuk jenis ini.`);
			return;
		}
		if (!form.date) {
			toast.error('Tanggal wajib diisi.');
			return;
		}
		if (!form.description.trim()) {
			toast.error('Keterangan wajib diisi.');
			return;
		}
		if (!proofFile) {
			toast.error('Bukti struk/foto wajib diunggah.');
			return;
		}
		const actorId = await resolveActorId();
		if (!actorId) {
			notifyExpiredSession();
			return;
		}
		setSaving(true);
		try {
			const fd = new FormData();
			fd.append('company', company.id);
			fd.append('employee', employee.id);
			fd.append('amount', String(Number(form.amount) || 0));
			fd.append('date', (form.date || todayIso()).slice(0, 10));
			fd.append('description', form.description.trim());
			fd.append('proof', proofFile);
			fd.append('status', 'pending');
			fd.append('owner', actorId);
			if (form.settingId) fd.append('setting', form.settingId);
			await pb.collection('reimbursements').create(fd);
			toast.success('Pengajuan reimbursement dikirim. Menunggu tinjauan.');
			setShowForm(false);
			setForm({ settingId: '', amount: 0, date: todayIso(), description: '' });
			setProofFile(null);
			await refresh();
		} catch (err) {
			const serverMsg = (err as { response?: { message?: string } })?.response?.message;
			toast.error(serverMsg || 'Gagal mengajukan reimbursement.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="space-y-3">
		{showForm ? (
			<form ref={formRef} onSubmit={submit} className="scroll-mt-16 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
				<div className="flex items-center justify-between">
					<h3 className="text-base font-bold">Form Pengajuan Reimbursement</h3>
					<button type="button" aria-label="Tutup formulir" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
						<X className="size-4" />
					</button>
				</div>

				{settings.length > 0 && eligibleSettings.length === 0 ? (
					<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
						<p className="font-semibold">Belum dapat mengajukan reimbursement</p>
						<p className="mt-1 text-xs">
							Saat ini tidak ada jenis reimbursement yang berlaku untuk Anda. Hubungi admin jika
							merasa ini kekeliruan.
						</p>
					</div>
				) : null}

				{eligibleSettings.length > 0 ? (
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Jenis reimbursement <span className="text-destructive">*</span></span>
						<select
							required
							value={form.settingId}
							onChange={e => setForm(f => ({ ...f, settingId: e.target.value, amount: 0 }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						>
							<option value="">Pilih jenis…</option>
							{eligibleSettings.map(({ setting: s, result }) => (
								<option key={s.id} value={s.id}>
									{s.name}
									{result.amountLimit != null && result.amountLimit > 0 ? ` (maks ${formatRupiah(result.amountLimit)})` : ''}
									{` · ${eligibilityLabel(s)}`}
								</option>
							))}
						</select>
						{selectedSetting ? (
							<p className="mt-1 text-xs text-muted-foreground">
								{selectedSetting.description ? `${selectedSetting.description} · ` : ''}
								Eligibility: {eligibilityLabel(selectedSetting)}
								{amountLimit > 0 ? ` · Batas ${formatRupiah(amountLimit)}` : ' · Tanpa batas nominal'}
								{` (${limitNote})`}
							</p>
						) : null}
					</label>
				) : null}

				<div className="grid gap-3 md:grid-cols-2">
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Nominal (Rp)</span>
						<input
							type="number"
							min={1}
							required
							value={form.amount || ''}
							onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
						{selectedSetting ? (
							<p className="mt-1 text-xs text-muted-foreground">
								{amountLimit > 0
									? `Maksimal ${formatRupiah(amountLimit)} (${limitNote}).`
									: `Tanpa batas nominal. ${limitNote}.`}
								{saldoTrackedSelected && selectedSaldo
									? ` Sisa saldo jenis ini ${formatRupiah(selectedSaldo.remaining)} dari ${formatRupiah(selectedSaldo.budget)}.`
									: ''}
							</p>
						) : null}
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Tanggal pengeluaran</span>
						<input
							type="date"
							required
							value={(form.date || '').slice(0, 10)}
							onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
				</div>
				<label className="block text-sm">
					<span className="mb-1.5 block font-medium">Keterangan</span>
					<textarea
						rows={3}
						value={form.description}
						onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
						placeholder="Keperluan pengeluaran…"
						className="w-full rounded-lg border border-input bg-background px-3 py-2"
					/>
				</label>
				<label className="block text-sm">
					<span className="mb-1.5 block font-medium">Bukti struk/foto</span>
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp,application/pdf"
						required
						onChange={e => setProofFile(e.target.files?.[0] ?? null)}
						className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-primary"
					/>
					<p className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP, atau PDF (maks 5 MB).</p>
				</label>
				<p className="text-xs text-muted-foreground">
					Pengajuan berstatus <strong>Menunggu persetujuan</strong> hingga ditinjau admin. Setelah disetujui, pembayaran dapat diproses.
				</p>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-medium">Batal</button>
					<button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
						{saving ? 'Mengirim…' : 'Kirim pengajuan'}
					</button>
				</div>
			</form>
		) : null}

		<ReimbursementHistory
			requests={requests}
			loading={loading}
			loadError={loadError}
			refresh={() => void refresh()}
			onRequest={() => setShowForm(true)}
			showForm={showForm}
			actorNames={actorNames}
			loadingActorNames={loadingActorNames}
			settingsLoadError={settingsLoadError}
			hasSettings={settings.length > 0}
			eligibleSettings={eligibleSettings}
			saldos={saldos}
		/>
		</section>
	);
}
