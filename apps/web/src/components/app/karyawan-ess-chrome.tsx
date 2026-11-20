import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
	ArrowLeft,
	Bell,
	ChevronDown,
	ChevronUp,
	ClipboardCheck,
	Gift,
	Home,
	LogIn,
	LogOut,
	Printer,
	UserRound,
	Users,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { fetchCompanyLogoUrl } from '@/lib/company-logo';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import type { Employee } from '@/lib/payroll';
import type { AttendanceRecord } from '@/lib/attendance';
import type { Payslip } from '@/lib/payroll';
import { formatDate, formatRupiah } from '@/lib/accounting';
import { cn } from '@/lib/utils';
import { openCookiePreferences } from '@/lib/cookie-consent';
import { toast } from 'sonner';
import { PayslipDocument, payslipPeriodLabel, payslipRunDetails, printPayslipDocument } from '@/components/app/payslip-document';

export type EssNav = 'home' | 'employees' | 'approvals' | 'account';

type EssTab = EssNav | 'attendance';

export function formatShiftHeading(date: Date): string {
	return new Intl.DateTimeFormat('id-ID', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(date);
}

export function EssGreeting({
	name,
	companyName,
	photoUrl,
	onGift,
	lightText = false,
}: {
	name: string;
	companyName: string;
	photoUrl: string;
	onGift: () => void;
	lightText?: boolean;
}) {
	return (
		<header className={cn('flex items-center gap-3 px-4 pb-3 pt-4', lightText && 'px-5 pb-2 pt-5')}>
			<div className="size-11 shrink-0 overflow-hidden rounded-full bg-slate-200">
				{photoUrl ? (
					<img src={photoUrl} alt="" className="size-full object-cover" />
				) : (
					<div className="flex size-full items-center justify-center text-sm font-bold text-slate-600">
						{name.trim().charAt(0).toUpperCase() || '?'}
					</div>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<p className={cn('text-[13px]', lightText ? 'text-white' : 'text-slate-500')}>{companyName}</p>
				<p className={cn('truncate text-[15px] font-extrabold uppercase tracking-tight', lightText ? 'text-white' : 'text-slate-900')}>
					{name}
				</p>
			</div>
			<button
				type="button"
				onClick={onGift}
				aria-label="Notifikasi"
				className={cn('flex size-11 items-center justify-center rounded-full text-rose-500 active:scale-95', lightText && 'border border-white/60 text-white hover:bg-white/10')}
			>
				<Bell className="size-6" strokeWidth={1.75} />
			</button>
		</header>
	);
}

const APP_ICONS: Record<string, { bg: string; color: string }> = {
	reimbursement: { bg: 'bg-teal-50', color: 'text-teal-500' },
	leave: { bg: 'bg-violet-100', color: 'text-violet-500' },
	attendance: { bg: 'bg-rose-100', color: 'text-rose-500' },
	loan: { bg: 'bg-indigo-100', color: 'text-indigo-500' },
	list: { bg: 'bg-orange-100', color: 'text-orange-500' },
	payslip: { bg: 'bg-sky-100', color: 'text-sky-600' },
	calendar: { bg: 'bg-fuchsia-100', color: 'text-fuchsia-500' },
	correction: { bg: 'bg-blue-100', color: 'text-blue-500' },
	duty: { bg: 'bg-amber-100', color: 'text-amber-500' },
	overtime: { bg: 'bg-cyan-100', color: 'text-cyan-600' },
};

function EssAppIcon({ kind, color }: { kind: string; color: string }) {
	return (
		<svg viewBox="0 0 32 32" className={cn('size-6', color)} fill="currentColor" aria-hidden="true">
			{kind === 'reimbursement' ? <path d="M4 2.8a1.3 1.3 0 0 1 1.9-1.15L8 2.8l2.15-1.17a1.6 1.6 0 0 1 1.5 0L14 2.8l2.25-1.17a1.6 1.6 0 0 1 1.5 0L20 2.8l2.25-1.17a1.6 1.6 0 0 1 1.5 0L26 2.8l2.1-1.15A1.3 1.3 0 0 1 30 2.8v26.4a1.3 1.3 0 0 1-1.9 1.15L26 29.2l-2.25 1.17a1.6 1.6 0 0 1-1.5 0L20 29.2l-2.25 1.17a1.6 1.6 0 0 1-1.5 0L14 29.2l-2.35 1.17a1.6 1.6 0 0 1-1.5 0L8 29.2l-2.1 1.15A1.3 1.3 0 0 1 4 29.2z" /> : null}
			{kind === 'leave' ? <path d="M14.6 12.5c-3.8-1.5-7.5-1.4-10.7.4-.9.5-2-.1-2-1.1C1.9 6.4 6 2 11.2 2c4 0 7.1 2.2 8.6 5.6 1.1-.5 2.4-.8 3.8-.8 4.7 0 8.1 3.6 8.4 8.4.1 1-.8 1.7-1.7 1.4-3.2-1.2-6.2-1.2-9.1-.1 1.3 4.2 1.4 8.7.6 13.2-.1.7-.7 1.2-1.4 1.2h-6.8c-.9 0-1.5-.9-1.1-1.7 1.6-3.4 2.4-6.9 2.6-10.5-1.8 2.6-4 4.8-6.3 6.4-.7.5-1.6.3-2.1-.3-3.5-4.5-2.5-9.8 1.8-12.3 1.9-1.1 4-1.3 6.1 0z" /> : null}
			{kind === 'attendance' ? <path d="M16 1.5C9.1 1.5 3.5 7 3.5 13.7c0 8.3 9.8 16.3 11.2 17.3a2.1 2.1 0 0 0 2.6 0c1.4-1 11.2-9 11.2-17.3C28.5 7 22.9 1.5 16 1.5z" /> : null}
			{kind === 'loan' ? <path d="M16 4a1.5 1.5 0 0 1 1.5 1.5v9h9a1.5 1.5 0 0 1 0 3h-9v9a1.5 1.5 0 0 1-3 0v-9h-9a1.5 1.5 0 0 1 0-3h9v-9A1.5 1.5 0 0 1 16 4z" /> : null}
			{kind === 'list' ? <path d="M11 3.5A2.5 2.5 0 0 1 13.5 1h5A2.5 2.5 0 0 1 21 3.5v.4h2.2A4.8 4.8 0 0 1 28 8.7v17.5a4.8 4.8 0 0 1-4.8 4.8H8.8A4.8 4.8 0 0 1 4 26.2V8.7a4.8 4.8 0 0 1 4.8-4.8H11z" /> : null}
			{kind === 'payslip' ? <path d="M5 6a4 4 0 0 1 4-4h17a4 4 0 0 1 4 4v2.2c1.2.5 2 1.7 2 3v3c.6.6 1 1.4 1 2.3v4c0 .9-.4 1.7-1 2.3v3.3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" transform="translate(-2 0)" /> : null}
			{kind === 'calendar' ? <path d="M10 1a1.5 1.5 0 0 1 1.5 1.5V4h9V2.5a1.5 1.5 0 0 1 3 0V4H26a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4h2.5V2.5A1.5 1.5 0 0 1 10 1z" /> : null}
			{kind === 'correction' ? <>
				<path d="M14 2a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm0 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" />
				<path d="M14 7v6.2l4.2 2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
				<path d="M20.5 17.5l4.8 4.8-1.7 1.7-4.8-4.8z" />
				<path d="M22.2 15.8l1.7-1.7 2.6 2.6-1.7 1.7z" />
			</> : null}
			{kind === 'duty' ? <path d="M28 4 3.5 13.4c-.9.3-.9 1.6.1 1.9l6.7 2.1 2.6 6.9c.3.8 1.4.9 1.9.2l3.3-4.2 6.6 4.7c.7.5 1.7.1 1.9-.7L28.8 5c.2-1-.7-1.9-1.8-1.6z" /> : null}
			{kind === 'overtime' ? <>
				<path d="M13 2a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm0 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" />
				<path d="M13 7v5.5l4 2.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
				<path d="M20.5 13h6M23.5 10v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			</> : null}
		</svg>
	);
}

export function EssAppGrid({
	onOpen,
}: {
	onOpen: (key: string) => void;
}) {
	const { t } = useLanguage();
	const items = [
		{ key: 'reimbursement', label: t('ess.reimbursement') },
		{ key: 'leave', label: t('ess.leave') },
		{ key: 'attendance', label: t('ess.attendance') },
		{ key: 'list', label: t('ess.list') },
		{ key: 'correction', label: t('ess.correction') },
		{ key: 'duty', label: t('ess.duty') },
		{ key: 'overtime', label: t('ess.overtime') },
		{ key: 'payslip', label: t('ess.payslip') },
		{ key: 'calendar', label: t('ess.calendar') },
	];
	return (
		<div className="px-2 py-5">
			<div className="grid grid-cols-4 gap-y-5">
				{items.map(item => {
					const spec = APP_ICONS[item.key];
					return (
						<button
							key={item.key}
							type="button"
							onClick={() => onOpen(item.key)}
							className="flex min-h-11 flex-col items-center gap-2 px-1 text-center active:scale-[0.97]"
						>
							<span className={cn('flex size-11 items-center justify-center rounded-2xl', spec.bg)}>
								<EssAppIcon kind={item.key} color={spec.color} />
							</span>
							<span className="text-[11px] font-medium leading-tight text-slate-700">{item.label}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function EssTabBar({
	nav,
	onNav,
	clockedIn,
	clockDisabled,
	clockBusy,
	clockDone,
	onClock,
	homeBack = false,
}: {
	nav: EssNav;
	onNav: (nav: EssNav) => void;
	clockedIn: boolean;
	clockDisabled: boolean;
	clockBusy: boolean;
	clockDone: boolean;
	onClock: () => void;
	homeBack?: boolean;
}) {
	const { t } = useLanguage();
	const items: { key: EssTab; label: string; icon: typeof Home }[] = [
		{ key: 'home', label: homeBack ? '' : t('ess.home'), icon: homeBack ? ArrowLeft : Home },
		{ key: 'employees', label: t('ess.employees'), icon: Users },
		{ key: 'attendance', label: clockBusy ? t('ess.processing') : clockedIn ? t('ess.clock_out') : t('ess.clock_in'), icon: clockedIn ? LogOut : LogIn },
		{ key: 'approvals', label: t('ess.approvals'), icon: ClipboardCheck },
		{ key: 'account', label: t('ess.account'), icon: UserRound },
	];
	return (
		<nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
			<div className="mx-auto grid max-w-[430px] grid-cols-5">
				{items.map(item => {
					const active = nav === item.key;
					const Icon = item.icon;
					return (
						<button
							key={item.key}
							type="button"
							onClick={() => item.key === 'attendance' ? onClock() : onNav(item.key as EssNav)}
							disabled={item.key === 'attendance' && clockDisabled}
							title={item.key === 'attendance' && clockDone ? t('ess.clock_done') : undefined}
							aria-current={active ? 'page' : undefined}
							aria-label={homeBack && item.key === 'home' ? t('ess.back_home') : undefined}
							className={cn(
								'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold disabled:opacity-50',
								item.key === 'attendance'
									? cn(
										'mx-1 my-1 min-h-12 rounded-lg text-white shadow-sm transition-transform active:scale-[0.97]',
										clockedIn ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700',
									)
									: homeBack && item.key === 'home'
										? 'text-slate-600'
										: active
											? 'text-blue-600'
										: 'text-slate-400',
							)}
						>
							<span className="relative">
								<Icon className={homeBack && item.key === 'home' ? 'size-6' : 'size-5'} strokeWidth={homeBack && item.key === 'home' ? 1.8 : active ? 2.4 : 1.8} />
							</span>
							{item.label || (homeBack && item.key === 'home' ? <span className="sr-only">{t('ess.back_home')}</span> : null)}
						</button>
					);
				})}
			</div>
		</nav>
	);
}

export function DirectReportsStrip({
	employeeId,
	companyId,
	onViewAll,
}: {
	employeeId: string;
	companyId: string;
	onViewAll: () => void;
}) {
	const [people, setPeople] = useState<Employee[]>([]);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let cancelled = false;
		pb.collection('employees')
			.getFullList<Employee>({
				filter: pb.filter('company = {:company} && manager = {:manager}', {
					company: companyId,
					manager: employeeId,
				}),
				sort: 'name',
				requestKey: null,
			})
			.then(list => {
				if (!cancelled) setPeople(list);
			})
			.catch(() => {
				if (!cancelled) setPeople([]);
			})
			.finally(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [companyId, employeeId]);

	return (
		<section className="bg-white px-4 py-4">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-lg font-extrabold tracking-tight text-slate-900">Laporan langsung</h2>
				<button type="button" onClick={onViewAll} className="text-sm font-semibold text-blue-600">
					Lihat aktivitas
				</button>
			</div>
			{!ready ? (
				<p className="mt-4 text-sm text-slate-400">Memuat…</p>
			) : people.length === 0 ? (
				<p className="mt-4 text-sm text-slate-500">Belum ada karyawan yang melapor langsung kepada Anda.</p>
			) : (
				<ul className="mt-4 flex gap-3 overflow-x-auto pb-1">
					{people.map(person => {
						const photo = person.photo
							? pb.files.getURL(person, person.photo, { thumb: '100x100' })
							: '';
						return (
							<li key={person.id} className="w-14 shrink-0 text-center">
								<div className="mx-auto size-12 overflow-hidden rounded-full bg-slate-200">
									{photo ? (
										<img src={photo} alt="" className="size-full object-cover" />
									) : (
										<div className="flex size-full items-center justify-center text-sm font-bold text-slate-600">
											{person.name.trim().charAt(0).toUpperCase()}
										</div>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

interface AnnouncementRow {
	id: string;
	title: string;
	body: string;
	date: string;
}

/** Bersihkan token placeholder {{variabel}} untuk tampilan ESS karyawan */
function sanitizeAnnouncementBody(body: string | null | undefined): string {
	if (!body) return '';
	return body.replace(/\{\{\s*[a-z_]+\s*\}\}/gi, '').replace(/[ \t]{2,}/g, ' ').trim();
}

export function AnnouncementStrip({
	companyId,
	onViewAll,
}: {
	companyId: string;
	onViewAll: () => void;
}) {
	const { t } = useLanguage();
	const [rows, setRows] = useState<AnnouncementRow[]>([]);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let cancelled = false;
		pb.collection('announcements')
			.getFullList<AnnouncementRow>({
				filter: pb.filter('company = {:company} && status = "published"', { company: companyId }),
				sort: '-date,-created',
				fields: 'id,title,body,date',
				requestKey: null,
			})
			.then(list => {
				if (!cancelled) setRows(list);
			})
			.catch(() => {
				if (!cancelled) setRows([]);
			})
			.finally(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [companyId]);

	const featured = rows[0];

	return (
		<>
			{featured && featured.title.trim().toLocaleLowerCase('id-ID') !== 'beasiswa' ? (
				<button
					type="button"
					onClick={onViewAll}
					className="mx-4 mt-4 block overflow-hidden rounded-2xl bg-[#c62828] px-4 py-4 text-left text-white shadow-sm"
				>
					<p className="text-sm font-bold leading-snug">{featured.title}</p>
					<p className="mt-1 line-clamp-2 text-xs text-white/85">{sanitizeAnnouncementBody(featured.body)}</p>
				</button>
			) : null}
			<section className="mt-3 px-4 py-4">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t('ess.announcements')}</h2>
					<button type="button" onClick={onViewAll} className="text-sm font-semibold text-blue-600">
						{t('ess.view_all')}
					</button>
				</div>
				{!ready ? (
					<p className="mt-3 text-sm text-slate-400">{t('ess.loading')}</p>
				) : rows.length === 0 ? (
					<p className="mt-3 text-sm text-slate-500">{t('ess.no_announcements')}</p>
				) : (
					<ul className="mt-3 divide-y divide-slate-100">
						{rows.slice(0, 3).map(row => (
							<li key={row.id} className="py-3">
								<p className="text-sm font-semibold text-slate-900">{row.title}</p>
								<p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{sanitizeAnnouncementBody(row.body)}</p>
							</li>
						))}
					</ul>
				)}
			</section>
		</>
	);
}

export function AnnouncementList({ companyId }: { companyId: string }) {
	const { t } = useLanguage();
	const [rows, setRows] = useState<AnnouncementRow[]>([]);
	const [ready, setReady] = useState(false);
	useEffect(() => {
		let cancelled = false;
		pb.collection('announcements')
			.getFullList<AnnouncementRow>({
				filter: pb.filter('company = {:company} && status = "published"', { company: companyId }),
				sort: '-date,-created',
				requestKey: null,
			})
			.then(list => {
				if (!cancelled) setRows(list);
			})
			.catch(() => {
				if (!cancelled) setRows([]);
			})
			.finally(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [companyId]);
	if (!ready) return <p className="px-4 py-8 text-sm text-slate-400">{t('ess.loading_announcements')}</p>;
	if (rows.length === 0) {
		return <p className="px-4 py-8 text-sm text-slate-500">{t('ess.no_company_announcements')}</p>;
	}
	return (
		<ul className="divide-y divide-slate-100 bg-white">
			{rows.map(row => (
				<li key={row.id} className="px-4 py-4">
					<p className="text-sm font-semibold text-slate-900">{row.title}</p>
					<p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{sanitizeAnnouncementBody(row.body)}</p>
				</li>
			))}
		</ul>
	);
}

export function DirectReportActivity({
	employeeId,
	companyId,
}: {
	employeeId: string;
	companyId: string;
}) {
	const [people, setPeople] = useState<Employee[]>([]);
	const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
	const [ready, setReady] = useState(false);
	const today = new Date().toISOString().slice(0, 10);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const list = await pb.collection('employees').getFullList<Employee>({
					filter: pb.filter('company = {:company} && manager = {:manager}', {
						company: companyId,
						manager: employeeId,
					}),
					sort: 'name',
					requestKey: null,
				});
				if (cancelled) return;
				setPeople(list);
				if (list.length === 0) return;
				const ids = list.map(p => p.id);
				const records = await pb.collection('attendance_records').getFullList<AttendanceRecord>({
					filter: pb.filter('company = {:company} && date ~ {:date}', {
						company: companyId,
						date: today,
					}),
					requestKey: null,
				});
				const map: Record<string, AttendanceRecord> = {};
				for (const rec of records) {
					if (ids.includes(rec.employee)) map[rec.employee] = rec;
				}
				if (!cancelled) setAttendance(map);
			} catch {
				if (!cancelled) setPeople([]);
			} finally {
				if (!cancelled) setReady(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [companyId, employeeId, today]);

	if (!ready) return <p className="px-4 py-8 text-sm text-slate-400">Memuat…</p>;
	if (people.length === 0) {
		return (
			<p className="px-4 py-8 text-sm text-slate-500">
				Belum ada karyawan yang melapor langsung kepada Anda.
			</p>
		);
	}
	return (
		<ul className="divide-y divide-slate-100 bg-white">
			{people.map(person => {
				const rec = attendance[person.id];
				const photo = person.photo ? pb.files.getURL(person, person.photo, { thumb: '100x100' }) : '';
				const status = rec?.clock_in
					? rec.clock_out
						? `Clock out ${rec.clock_out}`
						: `Clock in ${rec.clock_in}`
					: 'Belum clock in';
				return (
					<li key={person.id} className="flex items-center gap-3 px-4 py-3">
						<div className="size-11 overflow-hidden rounded-full bg-slate-200">
							{photo ? (
								<img src={photo} alt="" className="size-full object-cover" />
							) : (
								<div className="flex size-full items-center justify-center text-sm font-bold text-slate-600">
									{person.name.trim().charAt(0).toUpperCase()}
								</div>
							)}
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold text-slate-900">{person.name}</p>
							<p className="truncate text-xs text-slate-500">
								{person.position || 'Karyawan'} · {status}
							</p>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

export function EmployeeDirectory({ companyId }: { companyId: string }) {
	const { t } = useLanguage();
	const [people, setPeople] = useState<Employee[]>([]);
	const [ready, setReady] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		pb.collection('employees')
			.getFullList<Employee>({
				filter: pb.filter('company = {:company}', { company: companyId }),
				sort: 'name',
				requestKey: null,
			})
			.then(list => {
				if (!cancelled) setPeople(list);
			})
			.catch(() => {
				if (!cancelled) {
					setPeople([]);
					setFailed(true);
				}
			})
			.finally(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [companyId]);

	if (!ready) return <p className="px-4 py-8 text-sm text-slate-400">{t('ess.loading_employees')}</p>;
	if (failed) {
		return (
			<p className="px-4 py-8 text-sm text-slate-500">
				{t('ess.employee_load_failed')}
			</p>
		);
	}
	if (people.length === 0) {
		return <p className="px-4 py-8 text-sm text-slate-500">{t('ess.no_employees')}</p>;
	}
	return (
		<ul className="divide-y divide-slate-100 bg-transparent">
			{people.map(person => {
				const photo = person.photo ? pb.files.getURL(person, person.photo, { thumb: '100x100' }) : '';
				const active = person.status !== 'nonaktif';
				return (
					<li key={person.id} className="flex items-center gap-3 px-4 py-3">
						<div className="size-11 overflow-hidden rounded-full bg-slate-200">
							{photo ? (
								<img src={photo} alt="" className="size-full object-cover" />
							) : (
								<div className="flex size-full items-center justify-center text-sm font-bold text-slate-600">
									{person.name.trim().charAt(0).toUpperCase()}
								</div>
							)}
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-semibold text-slate-900">{person.name}</p>
							<p className="truncate text-xs text-slate-500">
								{person.position || t('ess.employee')}
								{person.employee_code ? ` · ${person.employee_code}` : ''}
							</p>
						</div>
						<span
							className={cn(
								'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
								active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
							)}
						>
							{active ? t('ess.active') : t('ess.inactive')}
						</span>
					</li>
				);
			})}
		</ul>
	);
}

export function PayslipList({
	employee,
	companyId,
	companyName,
	companyLogo,
}: {
	employee: Employee;
	companyId: string;
	companyName: string;
	companyLogo?: string;
}) {
	const { t } = useLanguage();
	const employeeId = employee.id;
	const [rows, setRows] = useState<Payslip[]>([]);
	const [ready, setReady] = useState(false);
	const [blocked, setBlocked] = useState(false);
	const [openId, setOpenId] = useState<string | null>(null);
	// Logo perusahaan dimuat segar agar slip karyawan selalu memakai logo
	// terbaru dan tidak bergantung pada metadata koleksi dari state app.
	const [logoUrl, setLogoUrl] = useState<string | undefined>(companyLogo);
	useEffect(() => {
		let cancelled = false;
		setLogoUrl(companyLogo);
		fetchCompanyLogoUrl(companyId)
			.then(url => {
				if (!cancelled) setLogoUrl(url);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [companyId, companyLogo]);

	useEffect(() => {
		let cancelled = false;
		pb.collection('payslips')
			.getFullList<Payslip>({
				filter: pb.filter('company = {:company} && employee = {:emp} && published = true', {
					company: companyId,
					emp: employeeId,
				}),
				sort: '-created',
				expand: 'run',
				requestKey: null,
			})
			.then(list => {
				if (!cancelled) {
					// Portal hanya menampilkan slip terbit milik karyawan ini;
					// aturan koleksi tetap menegakkan akses di server.
					setRows(list);
				}
			})
			.catch((err: { status?: number }) => {
				if (!cancelled) {
					setRows([]);
					setBlocked(err?.status === 403 || err?.status === 404);
				}
			})
			.finally(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [companyId, employeeId]);

	if (!ready) return <p className="px-4 py-8 text-sm text-slate-400">{t('ess.loading_payslips')}</p>;
	if (blocked) {
		return (
			<p className="px-4 py-8 text-sm text-slate-500">
				{t('ess.payslip_blocked')}
			</p>
		);
	}
	if (rows.length === 0) {
		return (
			<p className="px-4 py-8 text-sm text-slate-500">
				{t('ess.no_payslips')}
			</p>
		);
	}
	return (
		<ul className="divide-y divide-slate-100 bg-transparent">
			{rows.map(slip => {
				const open = openId === slip.id;
				const run = payslipRunDetails(slip);
				return (
					<li key={slip.id} className="px-4 py-3">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<p className="text-sm font-semibold text-slate-900">{payslipPeriodLabel(slip)}</p>
								<p className="text-xs text-slate-500">
									{t('ess.salary_received')}
									{run?.pay_date ? ` · ${formatDate(run.pay_date)}` : ''}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<p className="text-sm font-bold text-slate-900">{formatRupiah(slip.net_pay || 0)}</p>
								<button
									type="button"
									onClick={() => setOpenId(open ? null : slip.id)}
									aria-label={open ? t('ess.close_detail') : t('ess.view_detail')}
									aria-expanded={open}
									className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50"
								>
									{open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
								</button>
							</div>
						</div>
						{open ? (
							<div className="mt-3 space-y-3 bg-slate-100 p-2 sm:p-4">
								<PayslipDocument slip={slip} companyName={companyName} companyLogo={logoUrl} employee={employee} run={run} />
								<button
									type="button"
									onClick={() => {
										if (!printPayslipDocument({ slip, companyName, companyLogo: logoUrl, employee, run })) toast.error('Popup diblokir. Izinkan popup untuk mencetak slip gaji.');
									}}
									className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
								>
									<Printer className="size-4" /> {t('ess.print_download')}
								</button>
							</div>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}

export function AccountPanel({
	employee,
	email,
	photoUrl,
	companyName,
}: {
	employee: Employee | null;
	email: string;
	photoUrl: string;
	companyName: string;
}) {
	const { logout } = useAuth();
	const { t } = useLanguage();
	const navigate = useNavigate();
	const name = employee?.name || email || t('ess.employee');
	return (
		<div className="bg-white">
			<div className="flex items-center gap-3 px-4 py-5">
				<div className="size-14 overflow-hidden rounded-full bg-slate-200">
					{photoUrl ? (
						<img src={photoUrl} alt="" className="size-full object-cover" />
					) : (
						<div className="flex size-full items-center justify-center text-lg font-bold text-slate-600">
							{name.trim().charAt(0).toUpperCase()}
						</div>
					)}
				</div>
				<div className="min-w-0">
					<p className="truncate text-base font-extrabold text-slate-900">{name}</p>
					<p className="truncate text-sm text-slate-500">{employee?.position || companyName}</p>
					<p className="truncate text-xs text-slate-400">{email}</p>
				</div>
			</div>
			<button type="button" onClick={openCookiePreferences} className="min-h-12 w-full border-t border-slate-100 px-4 text-left text-sm font-semibold text-slate-600">{t('ess.cookie_settings')}</button>
			<button
				type="button"
				onClick={() => {
					logout();
					navigate('/login');
				}}
				className="flex min-h-12 w-full items-center gap-2 border-t border-slate-100 px-4 text-sm font-semibold text-rose-600"
			>
				<LogOut className="size-4" /> {t('ess.signout')}
			</button>
		</div>
	);
}
