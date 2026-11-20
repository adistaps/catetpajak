import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	CalendarDays,
	Download,
	HelpCircle,
	Printer,
	Search,
	Settings2,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { todayIso, type Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import {
	LEAVE_STATUS_LABELS,
	LEAVE_TYPE_LABELS,
	LEAVE_TYPE_OPTIONS,
	annualRemaining,
	calcLeaveDays,
	computeLeaveUsage,
	defaultBalanceFromSettings,
	defaultLeaveSettings,
	formatLeaveRange,
	quotaForType,
	type LeaveBalance,
	type LeaveRequest,
	type LeaveSettings,
	type LeaveStatus,
	type LeaveType,
} from '@/lib/leave';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { cn } from '@/lib/utils';

interface LeaveManagerProps {
	company: Company;
}

type SideNav = 'requests' | 'balances' | 'settings';

const SIDE_ITEMS: { key: SideNav; label: string }[] = [
	{ key: 'requests', label: 'Pengajuan cuti' },
	{ key: 'balances', label: 'Saldo cuti' },
	{ key: 'settings', label: 'Pengaturan' },
];

export function LeaveManager({ company }: LeaveManagerProps) {
	const [sideNav, setSideNav] = useState<SideNav>('requests');
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [requests, setRequests] = useState<LeaveRequest[]>([]);
	const [balances, setBalances] = useState<LeaveBalance[]>([]);
	const [settings, setSettings] = useState<LeaveSettings | null>(null);
	const [loading, setLoading] = useState(true);

	const [year, setYear] = useState(String(new Date().getFullYear()));
	const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all');
	const [typeFilter, setTypeFilter] = useState<'all' | LeaveType>('all');
	const [search, setSearch] = useState('');

	const ownerId = pb.authStore.record?.id ?? '';

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const companyFilter = pb.filter('company = {:company}', { company: company.id });
			const [emps, reqs, bals, sets] = await Promise.all([
				pb.collection('employees').getFullList<Employee>({
					filter: companyFilter,
					sort: 'name',
				}),
				pb.collection('leave_requests').getFullList<LeaveRequest>({
					filter: companyFilter,
					sort: '-start_date,-created',
					expand: 'employee',
				}),
				pb
					.collection('leave_balances')
					.getFullList<LeaveBalance>({
						filter: companyFilter,
						expand: 'employee',
						requestKey: null,
					})
					.catch(() => [] as LeaveBalance[]),
				pb
					.collection('leave_settings')
					.getFullList<LeaveSettings>({ filter: companyFilter, requestKey: null })
					.catch(() => [] as LeaveSettings[]),
			]);
			setEmployees(emps);
			setRequests(reqs);
			setBalances(bals);
			const s = sets[0] ?? null;
			setSettings(s);
		} catch {
			toast.error('Gagal memuat data cuti.');
		} finally {
			setLoading(false);
		}
	}, [company.id]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	const empMap = useMemo(() => {
		const m = new Map<string, Employee>();
		for (const e of employees) m.set(e.id, e);
		return m;
	}, [employees]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return requests.filter(r => {
			const startY = (r.start_date || '').slice(0, 4);
			if (year !== 'all' && startY !== year) return false;
			if (statusFilter !== 'all' && r.status !== statusFilter) return false;
			if (typeFilter !== 'all' && r.leave_type !== typeFilter) return false;
			if (!q) return true;
			const emp = r.expand?.employee ?? empMap.get(r.employee);
			return (emp?.name || '').toLowerCase().includes(q);
		});
	}, [requests, year, statusFilter, typeFilter, search, empMap]);

	const years = useMemo(() => {
		const set = new Set<string>();
		set.add(String(new Date().getFullYear()));
		for (const r of requests) {
			const y = (r.start_date || '').slice(0, 4);
			if (y) set.add(y);
		}
		return Array.from(set).sort((a, b) => Number(b) - Number(a));
	}, [requests]);

	const setStatus = async (r: LeaveRequest, status: LeaveStatus) => {
		try {
			await pb.collection('leave_requests').update(r.id, { status });
			toast.success(
				`Pengajuan cuti ${status === 'approved' ? 'disetujui' : status === 'rejected' ? 'ditolak' : 'diperbarui'}.`,
			);
			await refresh();
		} catch {
			toast.error('Gagal memperbarui pengajuan cuti.');
		}
	};

	const remove = async (r: LeaveRequest) => {
		const name = r.expand?.employee?.name ?? empMap.get(r.employee)?.name ?? 'karyawan';
		if (!window.confirm(`Hapus pengajuan cuti ${name}?`)) return;
		try {
			await pb.collection('leave_requests').delete(r.id);
			toast.success('Pengajuan dihapus.');
			await refresh();
		} catch {
			toast.error('Gagal menghapus.');
		}
	};

	const exportList = () => {
		const rows = [
			[
				'Karyawan',
				'Jenis cuti',
				'Tanggal mulai',
				'Tanggal akhir',
				'Hari',
				'Alasan',
				'Status',
			],
			...filtered.map(r => {
				const emp = r.expand?.employee ?? empMap.get(r.employee);
				return [
					emp?.name ?? '',
					LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type,
					(r.start_date || '').slice(0, 10),
					(r.end_date || '').slice(0, 10),
					r.days || calcLeaveDays(r.start_date, r.end_date),
					r.reason || '',
					LEAVE_STATUS_LABELS[r.status] ?? r.status,
				];
			}),
		];
		exportCsv(timestampedFilename('pengajuan-cuti'), rows);
		toast.success('Diekspor ke CSV.');
	};

	const printList = () => {
		const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
		if (!win) return;
		const rows = filtered
			.map(r => {
				const emp = r.expand?.employee ?? empMap.get(r.employee);
				return `<tr>
					<td>${emp?.name ?? '—'}</td>
					<td>${LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type}</td>
					<td>${formatLeaveRange(r.start_date, r.end_date)}</td>
					<td>${r.days || calcLeaveDays(r.start_date, r.end_date)}</td>
					<td>${LEAVE_STATUS_LABELS[r.status] ?? r.status}</td>
				</tr>`;
			})
			.join('');
		win.document.write(`<!doctype html><html lang="id"><head><title>Pengajuan cuti</title>
			<style>
				body{font-family:Inter,system-ui,sans-serif;padding:24px;color:#0f172a}
				h1{font-size:20px;margin:0 0 16px}
				table{width:100%;border-collapse:collapse;font-size:12px}
				th,td{border-bottom:1px solid #e2e8f0;padding:8px 10px;text-align:left}
				th{background:#f8fafc;font-weight:600}
			</style></head><body>
			<h1>Pengajuan cuti — ${company.name}</h1>
			<table><thead><tr>
				<th>Karyawan</th><th>Jenis</th><th>Rentang</th><th>Hari</th><th>Status</th>
			</tr></thead><tbody>${rows}</tbody></table>
			<script>window.onload=function(){window.print()}</script>
			</body></html>`);
		win.document.close();
	};

	return (
		<div className="-mx-1 flex min-h-[640px] overflow-hidden rounded-2xl border border-border bg-[#f4f7fb] shadow-soft-sm md:-mx-0">
			<aside className="hidden w-52 shrink-0 border-r border-border/70 bg-[#eef2f7] p-3 md:block">
				<p className="mb-3 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
					Cuti
				</p>
				<nav className="space-y-1">
					{SIDE_ITEMS.map(item => (
						<button
							key={item.key}
							type="button"
							onClick={() => setSideNav(item.key)}
							className={cn(
								'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
								sideNav === item.key
									? 'bg-emerald-100/80 text-emerald-800'
									: 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
							)}
						>
							{item.key === 'settings' ? <Settings2 className="size-3.5 opacity-70" /> : null}
							{item.key === 'balances' ? <CalendarDays className="size-3.5 opacity-70" /> : null}
							{item.label}
						</button>
					))}
				</nav>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col bg-white">
				<div className="flex gap-1 border-b border-border p-2 md:hidden">
					{SIDE_ITEMS.map(item => (
						<button
							key={item.key}
							type="button"
							onClick={() => setSideNav(item.key)}
							className={cn(
								'flex-1 rounded-lg px-3 py-2 text-xs font-semibold',
								sideNav === item.key
									? 'bg-emerald-100 text-emerald-800'
									: 'text-muted-foreground',
							)}
						>
							{item.label}
						</button>
					))}
				</div>

				{sideNav === 'requests' ? (
					<RequestsPanel
						loading={loading}
						filtered={filtered}
						years={years}
						year={year}
						setYear={setYear}
						statusFilter={statusFilter}
						setStatusFilter={setStatusFilter}
						typeFilter={typeFilter}
						setTypeFilter={setTypeFilter}
						search={search}
						setSearch={setSearch}
						empMap={empMap}
						onSetStatus={setStatus}
						onRemove={remove}
						onExport={exportList}
						onPrint={printList}
					/>
				) : null}

				{sideNav === 'balances' ? (
					<BalancesPanel
						company={company}
						ownerId={ownerId}
						loading={loading}
						employees={employees}
						balances={balances}
						requests={requests}
						settings={settings}
						year={year}
						setYear={setYear}
						years={years}
						onChanged={refresh}
					/>
				) : null}

				{sideNav === 'settings' ? (
					<SettingsPanel
						company={company}
						ownerId={ownerId}
						settings={settings}
						onSaved={refresh}
					/>
				) : null}
			</div>
		</div>
	);
}

/* ----------------------------- Requests Panel ----------------------------- */

interface RequestsPanelProps {
	loading: boolean;
	filtered: LeaveRequest[];
	years: string[];
	year: string;
	setYear: (v: string) => void;
	statusFilter: 'all' | LeaveStatus;
	setStatusFilter: (v: 'all' | LeaveStatus) => void;
	typeFilter: 'all' | LeaveType;
	setTypeFilter: (v: 'all' | LeaveType) => void;
	search: string;
	setSearch: (v: string) => void;
	empMap: Map<string, Employee>;
	onSetStatus: (r: LeaveRequest, s: LeaveStatus) => void;
	onRemove: (r: LeaveRequest) => void;
	onExport: () => void;
	onPrint: () => void;
}

function RequestsPanel({
	loading,
	filtered,
	years,
	year,
	setYear,
	statusFilter,
	setStatusFilter,
	typeFilter,
	setTypeFilter,
	search,
	setSearch,
	empMap,
	onSetStatus,
	onRemove,
	onExport,
	onPrint,
}: RequestsPanelProps) {
	return (
		<>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
				<h2 className="text-xl font-bold tracking-tight text-slate-900">Pengajuan cuti</h2>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() =>
							toast.info(
								'Setujui pengajuan cuti karyawan. Hari cuti yang disetujui mengurangi saldo cuti tahunan karyawan.',
							)
						}
						className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						<HelpCircle className="size-3.5" /> Bantuan
					</button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
				<select
					value={year}
					onChange={e => setYear(e.target.value)}
					className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
				>
					{years.map(y => (
						<option key={y} value={y}>{y}</option>
					))}
					<option value="all">Semua tahun</option>
				</select>
				<select
					value={typeFilter}
					onChange={e => setTypeFilter(e.target.value as 'all' | LeaveType)}
					className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
				>
					<option value="all">Semua jenis</option>
					{LEAVE_TYPE_OPTIONS.map(t => (
						<option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
					))}
				</select>
				<select
					value={statusFilter}
					onChange={e => setStatusFilter(e.target.value as 'all' | LeaveStatus)}
					className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
				>
					<option value="all">Semua status</option>
					{(['awaiting_approval', 'approved', 'rejected', 'cancelled'] as LeaveStatus[]).map(s => (
						<option key={s} value={s}>{LEAVE_STATUS_LABELS[s]}</option>
					))}
				</select>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={onPrint}
						className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
						title="Cetak"
					>
						<Printer className="size-4" />
					</button>
					<button
						type="button"
						onClick={onExport}
						className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
						title="Ekspor"
					>
						<Download className="size-4" />
					</button>
					<div className="relative">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
						<input
							value={search}
							onChange={e => setSearch(e.target.value)}
							placeholder="Cari karyawan…"
							className="h-9 w-56 rounded-full border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none ring-primary/30 placeholder:text-slate-400 focus:ring-2 sm:w-64"
						/>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				{loading ? (
					<div className="p-10 text-center text-sm text-muted-foreground">Memuat…</div>
				) : filtered.length === 0 ? (
					<div className="p-10 text-center text-sm text-muted-foreground">
						Belum ada pengajuan cuti.
					</div>
				) : (
					<table className="w-full min-w-[960px] border-collapse text-sm">
						<thead>
							<tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<th className="px-4 py-3 font-semibold normal-case tracking-normal text-slate-600">Karyawan</th>
								<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">Jenis</th>
								<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">Rentang</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Hari</th>
								<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">Alasan</th>
								<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">Status</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Aksi</th>
							</tr>
						</thead>
						<tbody>
							{filtered.map(r => {
								const emp = r.expand?.employee ?? empMap.get(r.employee);
								return (
									<tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
										<td className="px-4 py-3 font-medium text-slate-900">{emp?.name ?? '—'}</td>
										<td className="px-3 py-3 text-slate-700">{LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type}</td>
										<td className="px-3 py-3 text-slate-700">{formatLeaveRange(r.start_date, r.end_date)}</td>
										<td className="px-3 py-3 text-right text-slate-700">{r.days || calcLeaveDays(r.start_date, r.end_date)}</td>
										<td className="px-3 py-3 text-slate-500">{r.reason || '—'}</td>
										<td className="px-3 py-3">
											<span className={cn(
												'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
												r.status === 'awaiting_approval' && 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/80',
												r.status === 'approved' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
												r.status === 'rejected' && 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80',
												r.status === 'cancelled' && 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
											)}>
												{LEAVE_STATUS_LABELS[r.status] ?? r.status}
											</span>
										</td>
										<td className="px-3 py-3 text-right">
											<div className="flex justify-end gap-1">
												{r.status === 'awaiting_approval' ? (
													<>
														<button
															type="button"
															onClick={() => onSetStatus(r, 'approved')}
															className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
														>
															Setujui
														</button>
														<button
															type="button"
															onClick={() => onSetStatus(r, 'rejected')}
															className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
														>
															Tolak
														</button>
													</>
												) : (
													<button
														type="button"
														onClick={() => onRemove(r)}
														className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
													>
														Hapus
													</button>
												)}
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</>
	);
}

/* ----------------------------- Balances Panel ----------------------------- */

interface BalancesPanelProps {
	company: Company;
	ownerId: string;
	loading: boolean;
	employees: Employee[];
	balances: LeaveBalance[];
	requests: LeaveRequest[];
	settings: LeaveSettings | null;
	year: string;
	setYear: (v: string) => void;
	years: string[];
	onChanged: () => void;
}

function BalancesPanel({
	company,
	ownerId,
	loading,
	employees,
	balances,
	requests,
	settings,
	year,
	setYear,
	years,
	onChanged,
}: BalancesPanelProps) {
	const [editing, setEditing] = useState<Record<string, Partial<LeaveBalance>>>({});
	const [saving, setSaving] = useState(false);

	const balanceMap = useMemo(() => {
		const m = new Map<string, LeaveBalance>();
		for (const b of balances) {
			if (b.year === year) m.set(b.employee, b);
		}
		return m;
	}, [balances, year]);

	const rows = useMemo(() => {
		return employees.map(emp => {
			const bal = balanceMap.get(emp.id);
			const usage = computeLeaveUsage(requests, emp.id, year);
			const annualEnt = bal?.annual_entitlement ?? settings?.annual_quota ?? defaultLeaveSettings().annual_quota;
			const annualCarry = bal?.annual_carry_forward ?? 0;
			const annualRem = bal
				? annualRemaining(bal, usage)
				: Math.max(0, annualEnt + annualCarry - usage.annual);
			return { emp, bal, usage, annualEnt, annualCarry, annualRem };
		});
	}, [employees, balanceMap, requests, year, settings]);

	const ensureBalance = async (empId: string): Promise<LeaveBalance> => {
		const existing = balanceMap.get(empId);
		if (existing) return existing;
		const payload = {
			company: company.id,
			employee: empId,
			...defaultBalanceFromSettings(settings, year),
			owner: ownerId,
		};
		try {
			const created = await pb.collection('leave_balances').create<LeaveBalance>(payload);
			return created;
		} catch {
			const existing2 = await pb
				.collection('leave_balances')
				.getFirstListItem<LeaveBalance>(
					pb.filter('company = {:company} && employee = {:emp} && year = {:year}', {
						company: company.id,
						emp: empId,
						year,
					}),
				);
			return existing2;
		}
	};

	const patch = (empId: string, field: keyof LeaveBalance, value: string) => {
		setEditing(prev => {
			const current = prev[empId] ?? {};
			return { ...prev, [empId]: { ...current, [field]: Number(value) || 0 } };
		});
	};

	const saveRow = async (empId: string) => {
		const draft = editing[empId];
		if (!draft) return;
		setSaving(true);
		try {
			const bal = await ensureBalance(empId);
			await pb.collection('leave_balances').update(bal.id, {
				annual_entitlement: draft.annual_entitlement ?? bal.annual_entitlement ?? 0,
				annual_carry_forward: draft.annual_carry_forward ?? bal.annual_carry_forward ?? 0,
				sick_entitlement: draft.sick_entitlement ?? bal.sick_entitlement ?? 0,
				personal_entitlement: draft.personal_entitlement ?? bal.personal_entitlement ?? 0,
				maternity_entitlement: draft.maternity_entitlement ?? bal.maternity_entitlement ?? 0,
			});
			setEditing(prev => {
				const next = { ...prev };
				delete next[empId];
				return next;
			});
			onChanged();
			toast.success('Saldo cuti disimpan.');
		} catch {
			toast.error('Gagal menyimpan saldo cuti.');
		} finally {
			setSaving(false);
		}
	};

	const generateAll = async () => {
		if (!window.confirm(`Buat saldo cuti ${year} untuk semua karyawan aktif?`)) return;
		setSaving(true);
		try {
			let created = 0;
			await Promise.all(
				employees
					.filter(e => e.status === 'aktif' && !balanceMap.has(e.id))
					.map((emp, i) =>
						pb.collection('leave_balances').create(
							{
								company: company.id,
								employee: emp.id,
								...defaultBalanceFromSettings(settings, year),
								owner: ownerId,
							},
							{ requestKey: `leave-bal-${year}-${i}` },
						).then(() => { created += 1; }).catch(() => {}),
					),
			);
			onChanged();
			toast.success(`${created} saldo cuti dibuat untuk tahun ${year}.`);
		} catch {
			toast.error('Gagal membuat saldo cuti.');
		} finally {
			setSaving(false);
		}
	};

	const exportBalances = () => {
		const rowsCsv = [
			['Karyawan', 'Tahun', 'Hak tahunan', 'Carry forward', 'Terpakai', 'Sisa', 'Sakit terpakai', 'Pribadi terpakai'],
			...rows.map(({ emp, usage, annualEnt, annualCarry, annualRem }) => [
				emp.name,
				year,
				annualEnt,
				annualCarry,
				usage.annual,
				annualRem,
				usage.sick,
				usage.personal,
			]),
		];
		exportCsv(timestampedFilename(`saldo-cuti-${year}`), rowsCsv);
		toast.success('Diekspor ke CSV.');
	};

	return (
		<>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
				<div>
					<h2 className="text-xl font-bold tracking-tight text-slate-900">Saldo cuti</h2>
					<p className="text-sm text-muted-foreground">
						Atur hak cuti tahunan per karyawan. Sisa dihitung otomatis dari pengajuan disetujui.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<select
						value={year}
						onChange={e => setYear(e.target.value)}
						className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
					>
						{years.map(y => (
							<option key={y} value={y}>{y}</option>
						))}
					</select>
					<button
						type="button"
						onClick={exportBalances}
						className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Ekspor
					</button>
					<button
						type="button"
						onClick={generateAll}
						disabled={saving}
						className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
					>
						{saving ? 'Memproses…' : 'Buat saldo otomatis'}
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				{loading ? (
					<div className="p-10 text-center text-sm text-muted-foreground">Memuat…</div>
				) : rows.length === 0 ? (
					<div className="p-10 text-center text-sm text-muted-foreground">
						Belum ada karyawan. Tambahkan karyawan pada menu Kontak.
					</div>
				) : (
					<table className="w-full min-w-[960px] border-collapse text-sm">
						<thead>
							<tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<th className="px-4 py-3 font-semibold normal-case tracking-normal text-slate-600">Karyawan</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Hak tahunan</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Carry forward</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Terpakai</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Sisa</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Sakit</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Pribadi</th>
								<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">Aksi</th>
							</tr>
						</thead>
						<tbody>
							{rows.map(({ emp, bal, usage, annualEnt, annualCarry, annualRem }) => {
								const draft = editing[emp.id];
								const entVal = draft?.annual_entitlement ?? annualEnt;
								const carryVal = draft?.annual_carry_forward ?? annualCarry;
								const sickEnt = draft?.sick_entitlement ?? bal?.sick_entitlement ?? settings?.sick_quota ?? defaultLeaveSettings().sick_quota;
								const persEnt = draft?.personal_entitlement ?? bal?.personal_entitlement ?? settings?.personal_quota ?? defaultLeaveSettings().personal_quota;
								return (
									<tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50/60">
										<td className="px-4 py-3 font-medium text-slate-900">
											{emp.name}
											{emp.status !== 'aktif' ? (
												<span className="ml-2 text-xs text-slate-400">({emp.status})</span>
											) : null}
										</td>
										<td className="px-3 py-3 text-right">
											<input
												type="number"
												min={0}
												value={entVal}
												onChange={e => patch(emp.id, 'annual_entitlement', e.target.value)}
												className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm outline-none ring-primary/30 focus:ring-2"
											/>
										</td>
										<td className="px-3 py-3 text-right">
											<input
												type="number"
												min={0}
												value={carryVal}
												onChange={e => patch(emp.id, 'annual_carry_forward', e.target.value)}
												className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm outline-none ring-primary/30 focus:ring-2"
											/>
										</td>
										<td className="px-3 py-3 text-right text-slate-700">{usage.annual}</td>
										<td className={cn('px-3 py-3 text-right font-semibold', annualRem > 0 ? 'text-emerald-700' : 'text-rose-600')}>
											{annualRem}
										</td>
										<td className="px-3 py-3 text-right text-slate-500">
											{usage.sick}/{sickEnt}
										</td>
										<td className="px-3 py-3 text-right text-slate-500">
											{usage.personal}/{persEnt}
										</td>
										<td className="px-3 py-3 text-right">
											<button
												type="button"
												disabled={!editing[emp.id] || saving}
												onClick={() => saveRow(emp.id)}
												className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
											>
												Simpan
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</>
	);
}

/* ----------------------------- Settings Panel ----------------------------- */

function settingsToForm(s: LeaveSettings) {
	return {
		annual_quota: s.annual_quota ?? 12,
		sick_quota: s.sick_quota ?? 12,
		personal_quota: s.personal_quota ?? 12,
		maternity_quota: s.maternity_quota ?? 90,
		unpaid_quota: s.unpaid_quota ?? 0,
		require_attachment: Boolean(s.require_attachment),
		auto_approve: Boolean(s.auto_approve),
		carry_forward: Boolean(s.carry_forward),
		year_start_month: s.year_start_month ?? 1,
	};
}

function SettingsPanel({
	company,
	ownerId,
	settings,
	onSaved,
}: {
	company: Company;
	ownerId: string;
	settings: LeaveSettings | null;
	onSaved: () => void;
}) {
	const [form, setForm] = useState(() =>
		settings ? settingsToForm(settings) : settingsToForm(defaultLeaveSettings() as LeaveSettings),
	);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (settings) setForm(settingsToForm(settings));
	}, [settings]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const payload = {
				company: company.id,
				annual_quota: Number(form.annual_quota) || 0,
				sick_quota: Number(form.sick_quota) || 0,
				personal_quota: Number(form.personal_quota) || 0,
				maternity_quota: Number(form.maternity_quota) || 0,
				unpaid_quota: Number(form.unpaid_quota) || 0,
				require_attachment: Boolean(form.require_attachment),
				auto_approve: Boolean(form.auto_approve),
				carry_forward: Boolean(form.carry_forward),
				year_start_month: Number(form.year_start_month) || 1,
				owner: ownerId,
			};
			if (settings?.id) {
				await pb.collection('leave_settings').update(settings.id, payload);
			} else {
				try {
					await pb.collection('leave_settings').create(payload);
				} catch {
					const existing = await pb
						.collection('leave_settings')
						.getFirstListItem<LeaveSettings>(
							pb.filter('company = {:company}', { company: company.id }),
						);
					await pb.collection('leave_settings').update(existing.id, payload);
				}
			}
			onSaved();
			toast.success('Pengaturan cuti disimpan.');
		} catch {
			toast.error('Gagal menyimpan pengaturan.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex-1 overflow-auto p-6">
			<h2 className="mb-1 text-xl font-bold tracking-tight text-slate-900">Pengaturan cuti</h2>
			<p className="mb-6 text-sm text-muted-foreground">
				Atur kuota cuti default per jenis dan kebijakan persetujuan. Kuota ini dipakai saat
				membuat saldo cuti baru untuk karyawan.
			</p>
			<form onSubmit={submit} className="max-w-xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft-sm">
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Kuota cuti tahunan (hari)</span>
						<input
							type="number"
							min={0}
							value={form.annual_quota}
							onChange={e => setForm(s => ({ ...s, annual_quota: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Kuota cuti sakit (hari)</span>
						<input
							type="number"
							min={0}
							value={form.sick_quota}
							onChange={e => setForm(s => ({ ...s, sick_quota: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Kuota cuti pribadi (hari)</span>
						<input
							type="number"
							min={0}
							value={form.personal_quota}
							onChange={e => setForm(s => ({ ...s, personal_quota: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Kuota cuti melahirkan (hari)</span>
						<input
							type="number"
							min={0}
							value={form.maternity_quota}
							onChange={e => setForm(s => ({ ...s, maternity_quota: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Kuota cuti tanpa bayaran (hari)</span>
						<input
							type="number"
							min={0}
							value={form.unpaid_quota}
							onChange={e => setForm(s => ({ ...s, unpaid_quota: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						/>
						<p className="mt-1 text-xs text-muted-foreground">0 = tanpa batas.</p>
					</label>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Awal tahun cuti (bulan)</span>
						<select
							value={form.year_start_month}
							onChange={e => setForm(s => ({ ...s, year_start_month: Number(e.target.value) }))}
							className="h-10 w-full rounded-lg border border-input bg-background px-3"
						>
							{Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
								<option key={m} value={m}>{m}</option>
							))}
						</select>
					</label>
				</div>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={form.require_attachment}
						onChange={e => setForm(s => ({ ...s, require_attachment: e.target.checked }))}
						className="size-4 rounded border-slate-300"
					/>
					Wajib lampiran pada pengajuan cuti
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={form.auto_approve}
						onChange={e => setForm(s => ({ ...s, auto_approve: e.target.checked }))}
						className="size-4 rounded border-slate-300"
					/>
					Otomatis setujui pengajuan cuti baru
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={form.carry_forward}
						onChange={e => setForm(s => ({ ...s, carry_forward: e.target.checked }))}
						className="size-4 rounded border-slate-300"
					/>
					Izinkan sisa cuti tahunan dibawa ke tahun berikutnya (carry forward)
				</label>
				<button
					type="submit"
					disabled={saving}
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
				>
					{saving ? 'Menyimpan…' : 'Simpan pengaturan'}
				</button>
			</form>
		</div>
	);
}
