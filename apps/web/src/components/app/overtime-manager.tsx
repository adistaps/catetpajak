import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Download,
	HelpCircle,
	Printer,
	Search,
	Settings2,
	Upload,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, todayIso, type Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import {
	OVERTIME_COMPENSATION_LABELS,
	OVERTIME_COMPENSATION_OPTIONS,
	OVERTIME_STATUS_LABELS,
	OVERTIME_STATUS_OPTIONS,
	avatarHue,
	calcOvertimeAmount,
	defaultOvertimeSettings,
	employeeDisplayCode,
	emptyOvertimeRequest,
	formatDuration,
	formatOvertimeDate,
	initials,
	type OvertimeCompensation,
	type OvertimeRequest,
	type OvertimeSettings,
	type OvertimeStatus,
} from '@/lib/overtime';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { cn } from '@/lib/utils';

interface OvertimeManagerProps {
	company: Company;
}

type SideNav = 'requests' | 'settings';

const SIDE_ITEMS: { key: SideNav; label: string }[] = [
	{ key: 'requests', label: 'Overtime requests' },
	{ key: 'settings', label: 'Settings' },
];

export function OvertimeManager({ company }: OvertimeManagerProps) {
	const [sideNav, setSideNav] = useState<SideNav>('requests');
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [requests, setRequests] = useState<OvertimeRequest[]>([]);
	const [settings, setSettings] = useState<OvertimeSettings | null>(null);
	const [loading, setLoading] = useState(true);

	const [year, setYear] = useState(String(new Date().getFullYear()));
	const [statusFilter, setStatusFilter] = useState<'all' | OvertimeStatus>('all');
	const [search, setSearch] = useState('');
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const [formOpen, setFormOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<Partial<OvertimeRequest>>(emptyOvertimeRequest(todayIso()));
	const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
	const [saving, setSaving] = useState(false);

	const [settingsForm, setSettingsForm] = useState(defaultOvertimeSettings());
	const [settingsSaving, setSettingsSaving] = useState(false);

	const ownerId = pb.authStore.record?.id ?? '';

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const companyFilter = pb.filter('company = {:company}', { company: company.id });
			const [emps, reqs, sets] = await Promise.all([
				pb.collection('employees').getFullList<Employee>({
					filter: companyFilter,
					sort: 'name',
				}),
				pb.collection('overtime_requests').getFullList<OvertimeRequest>({
					filter: companyFilter,
					sort: '-overtime_date,-created',
					expand: 'employee',
				}),
				pb
					.collection('overtime_settings')
					.getFullList<OvertimeSettings>({ filter: companyFilter, requestKey: null })
					.catch(() => [] as OvertimeSettings[]),
			]);
			setEmployees(emps);
			setRequests(reqs);
			const s = sets[0] ?? null;
			setSettings(s);
			if (s) {
				setSettingsForm({
					weekday_multiplier: s.weekday_multiplier ?? 1.5,
					weekend_multiplier: s.weekend_multiplier ?? 2,
					holiday_multiplier: s.holiday_multiplier ?? 3,
					require_attachment: Boolean(s.require_attachment),
					auto_approve: Boolean(s.auto_approve),
					min_minutes: s.min_minutes ?? 30,
					auto_overtime: Boolean(s.auto_overtime),
					overtime_before_minutes: s.overtime_before_minutes ?? 30,
					overtime_after_minutes: s.overtime_after_minutes ?? 30,
				});
			}
		} catch {
			toast.error('Gagal memuat data overtime.');
		} finally {
			setLoading(false);
		}
	}, [company.id]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	const activeEmployees = useMemo(
		() => employees.filter(e => e.status === 'aktif'),
		[employees],
	);

	const empMap = useMemo(() => {
		const m = new Map<string, Employee>();
		for (const e of employees) m.set(e.id, e);
		return m;
	}, [employees]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return requests.filter(r => {
			const otYear = (r.overtime_date || '').slice(0, 4);
			if (year !== 'all' && otYear !== year) return false;
			if (statusFilter !== 'all' && r.status !== statusFilter) return false;
			if (!q) return true;
			const emp = r.expand?.employee ?? empMap.get(r.employee);
			const name = (emp?.name || '').toLowerCase();
			const pos = (emp?.position || '').toLowerCase();
			const code = employeeDisplayCode(emp).toLowerCase();
			return name.includes(q) || pos.includes(q) || code.includes(q);
		});
	}, [requests, year, statusFilter, search, empMap]);

	const years = useMemo(() => {
		const set = new Set<string>();
		const cy = String(new Date().getFullYear());
		set.add(cy);
		for (const r of requests) {
			const y = (r.overtime_date || '').slice(0, 4);
			if (y) set.add(y);
		}
		return Array.from(set).sort((a, b) => Number(b) - Number(a));
	}, [requests]);

	const multiplier = settingsForm.weekday_multiplier || 1.5;

	const openCreate = () => {
		setEditingId(null);
		setAttachmentFile(null);
		setForm(emptyOvertimeRequest(todayIso()));
		setFormOpen(true);
	};

	const openEdit = (r: OvertimeRequest) => {
		setEditingId(r.id);
		setAttachmentFile(null);
		setForm({
			employee: r.employee,
			requested_date: (r.requested_date || '').slice(0, 10),
			overtime_date: (r.overtime_date || '').slice(0, 10),
			duration_minutes: r.duration_minutes || 0,
			compensation: r.compensation || 'paid_overtime',
			status: r.status || 'awaiting_approval',
			hourly_rate: r.hourly_rate || 0,
			amount: r.amount || 0,
			reason: r.reason || '',
		});
		setFormOpen(true);
	};

	const resolveAmount = (partial: Partial<OvertimeRequest>, emp?: Employee) => {
		if (partial.compensation !== 'paid_overtime') return 0;
		const rate =
			partial.hourly_rate && partial.hourly_rate > 0
				? partial.hourly_rate
				: emp
					? Math.round((emp.basic_salary || 0) / 173)
					: 0;
		return calcOvertimeAmount(rate, partial.duration_minutes || 0, multiplier);
	};

	const submitForm = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!form.employee) {
			toast.error('Pilih karyawan.');
			return;
		}
		if (!form.overtime_date) {
			toast.error('Tanggal overtime wajib diisi.');
			return;
		}
		const mins = form.duration_minutes || 0;
		if (mins <= 0) {
			toast.error('Durasi harus lebih dari 0.');
			return;
		}
		if (settingsForm.min_minutes && mins < settingsForm.min_minutes) {
			toast.error(`Durasi minimum ${settingsForm.min_minutes} menit.`);
			return;
		}
		if (settingsForm.require_attachment && !attachmentFile && !editingId) {
			toast.error('Lampiran wajib diunggah.');
			return;
		}
		const emp = empMap.get(form.employee || '');
		const hourly =
			form.hourly_rate && form.hourly_rate > 0
				? form.hourly_rate
				: emp
					? Math.round((emp.basic_salary || 0) / 173)
					: 0;
		const amount = resolveAmount({ ...form, hourly_rate: hourly }, emp);
		const status: OvertimeStatus =
			!editingId && settingsForm.auto_approve
				? 'approved'
				: ((form.status as OvertimeStatus) || 'awaiting_approval');

		setSaving(true);
		try {
			const base = {
				company: company.id,
				employee: form.employee,
				requested_date: (form.requested_date || todayIso()).slice(0, 10),
				overtime_date: (form.overtime_date || todayIso()).slice(0, 10),
				duration_minutes: mins,
				compensation: (form.compensation as OvertimeCompensation) || 'paid_overtime',
				status,
				hourly_rate: hourly,
				amount,
				reason: form.reason || '',
				owner: ownerId,
			};

			if (attachmentFile) {
				const fd = new FormData();
				Object.entries(base).forEach(([k, v]) => fd.append(k, String(v ?? '')));
				fd.append('attachment', attachmentFile);
				if (editingId) {
					await pb.collection('overtime_requests').update(editingId, fd);
					toast.success('Permintaan overtime diperbarui.');
				} else {
					await pb.collection('overtime_requests').create(fd);
					toast.success('Permintaan overtime dibuat.');
				}
			} else if (editingId) {
				await pb.collection('overtime_requests').update(editingId, base);
				toast.success('Permintaan overtime diperbarui.');
			} else {
				await pb.collection('overtime_requests').create(base);
				toast.success('Permintaan overtime dibuat.');
			}
			setFormOpen(false);
			await refresh();
		} catch {
			toast.error('Gagal menyimpan permintaan overtime.');
		} finally {
			setSaving(false);
		}
	};

	const setStatus = async (r: OvertimeRequest, status: OvertimeStatus) => {
		try {
			await pb.collection('overtime_requests').update(r.id, { status });
			toast.success(`Status diubah menjadi ${OVERTIME_STATUS_LABELS[status]}.`);
			await refresh();
		} catch {
			toast.error('Gagal mengubah status.');
		}
	};

	const remove = async (r: OvertimeRequest) => {
		const name = r.expand?.employee?.name ?? empMap.get(r.employee)?.name ?? 'karyawan';
		if (!window.confirm(`Hapus permintaan overtime ${name}?`)) return;
		try {
			await pb.collection('overtime_requests').delete(r.id);
			toast.success('Permintaan dihapus.');
			await refresh();
		} catch {
			toast.error('Gagal menghapus.');
		}
	};

	const toggleSelect = (id: string) => {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleAll = () => {
		if (selected.size === filtered.length) setSelected(new Set());
		else setSelected(new Set(filtered.map(r => r.id)));
	};

	const exportList = () => {
		const rows = [
			[
				'Employee name',
				'Employee code',
				'Position',
				'Requested date',
				'Overtime date',
				'Duration',
				'Compensation',
				'Amount',
				'Status',
				'Reason',
			],
			...filtered.map(r => {
				const emp = r.expand?.employee ?? empMap.get(r.employee);
				return [
					emp?.name ?? '',
					employeeDisplayCode(emp),
					emp?.position ?? '',
					formatOvertimeDate(r.requested_date),
					formatOvertimeDate(r.overtime_date),
					formatDuration(r.duration_minutes),
					OVERTIME_COMPENSATION_LABELS[r.compensation] ?? r.compensation,
					r.amount || 0,
					OVERTIME_STATUS_LABELS[r.status] ?? r.status,
					r.reason || '',
				];
			}),
		];
		exportCsv(timestampedFilename('overtime-requests'), rows);
		toast.success('Diekspor ke CSV.');
	};

	const printList = () => {
		const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
		if (!win) return;
		const rows = filtered
			.map(r => {
				const emp = r.expand?.employee ?? empMap.get(r.employee);
				return `<tr>
					<td>${emp?.name ?? '—'}<br/><span style="color:#64748b;font-size:11px">${employeeDisplayCode(emp)} | ${(emp?.position || '').toUpperCase()}</span></td>
					<td>${formatOvertimeDate(r.requested_date)}</td>
					<td>${formatOvertimeDate(r.overtime_date)}</td>
					<td>${formatDuration(r.duration_minutes)}</td>
					<td>${OVERTIME_COMPENSATION_LABELS[r.compensation] ?? r.compensation}</td>
					<td>${OVERTIME_STATUS_LABELS[r.status] ?? r.status}</td>
				</tr>`;
			})
			.join('');
		win.document.write(`<!doctype html><html><head><title>Overtime requests</title>
			<style>
				body{font-family:Inter,system-ui,sans-serif;padding:24px;color:#0f172a}
				h1{font-size:20px;margin:0 0 16px}
				table{width:100%;border-collapse:collapse;font-size:12px}
				th,td{border-bottom:1px solid #e2e8f0;padding:8px 10px;text-align:left;vertical-align:top}
				th{background:#f8fafc;font-weight:600}
			</style></head><body>
			<h1>Overtime requests — ${company.name}</h1>
			<table><thead><tr>
				<th>Employee name</th><th>Requested date</th><th>Overtime date</th>
				<th>Duration</th><th>Compensation</th><th>Status</th>
			</tr></thead><tbody>${rows}</tbody></table>
			<script>window.onload=function(){window.print()}</script>
			</body></html>`);
		win.document.close();
	};

	const saveSettings = async (event: React.FormEvent) => {
		event.preventDefault();
		setSettingsSaving(true);
		try {
			const payload = {
				company: company.id,
				weekday_multiplier: Number(settingsForm.weekday_multiplier) || 1.5,
				weekend_multiplier: Number(settingsForm.weekend_multiplier) || 2,
				holiday_multiplier: Number(settingsForm.holiday_multiplier) || 3,
				require_attachment: Boolean(settingsForm.require_attachment),
				auto_approve: Boolean(settingsForm.auto_approve),
				min_minutes: Number(settingsForm.min_minutes) || 0,
				auto_overtime: Boolean(settingsForm.auto_overtime),
				overtime_before_minutes: Number(settingsForm.overtime_before_minutes) || 0,
				overtime_after_minutes: Number(settingsForm.overtime_after_minutes) || 0,
				owner: ownerId,
			};
			if (settings?.id) {
				const updated = await pb
					.collection('overtime_settings')
					.update<OvertimeSettings>(settings.id, payload);
				setSettings(updated);
			} else {
				try {
					const created = await pb
						.collection('overtime_settings')
						.create<OvertimeSettings>(payload);
					setSettings(created);
				} catch {
					const existing = await pb
						.collection('overtime_settings')
						.getFirstListItem<OvertimeSettings>(
							pb.filter('company = {:company}', { company: company.id }),
						);
					const updated = await pb
						.collection('overtime_settings')
						.update<OvertimeSettings>(existing.id, payload);
					setSettings(updated);
				}
			}
			toast.success('Pengaturan overtime disimpan.');
		} catch {
			toast.error('Gagal menyimpan pengaturan.');
		} finally {
			setSettingsSaving(false);
		}
	};

	const handleImport = async (file: File) => {
		try {
			const text = await file.text();
			const lines = text.split(/\r?\n/).filter(l => l.trim());
			if (lines.length < 2) {
				toast.error('File CSV kosong.');
				return;
			}
			const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
			const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('nama'));
			const dateIdx = headers.findIndex(h => h.includes('overtime') && h.includes('date'));
			const durIdx = headers.findIndex(h => h.includes('duration') || h.includes('durasi'));
			const reasonIdx = headers.findIndex(h => h.includes('reason') || h.includes('alasan'));
			let created = 0;
			for (let i = 1; i < lines.length; i++) {
				const cols = lines[i].match(/("([^"]*)"|[^,]+)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) ?? [];
				const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
				if (!name) continue;
				const emp = activeEmployees.find(e => e.name.toLowerCase() === name.toLowerCase());
				if (!emp) continue;
				const otDate = (dateIdx >= 0 ? cols[dateIdx] : cols[1]) || todayIso();
				let mins = 60;
				const durRaw = durIdx >= 0 ? cols[durIdx] : cols[2];
				if (durRaw) {
					const hm = durRaw.match(/(\d+)\s*h(?:our)?s?\s*(\d+)?/i);
					if (hm) mins = Number(hm[1]) * 60 + (Number(hm[2]) || 0);
					else {
						const n = Number(durRaw);
						if (Number.isFinite(n)) mins = n > 24 ? n : Math.round(n * 60);
					}
				}
				const hourly = Math.round((emp.basic_salary || 0) / 173);
				const amount = calcOvertimeAmount(hourly, mins, multiplier);
				await pb.collection('overtime_requests').create(
					{
						company: company.id,
						employee: emp.id,
						requested_date: todayIso(),
						overtime_date: otDate.slice(0, 10),
						duration_minutes: mins,
						compensation: 'paid_overtime',
						status: settingsForm.auto_approve ? 'approved' : 'awaiting_approval',
						hourly_rate: hourly,
						amount,
						reason: reasonIdx >= 0 ? cols[reasonIdx] || '' : '',
						owner: ownerId,
					},
					{ requestKey: `ot-import-${i}` },
				);
				created += 1;
			}
			setImportOpen(false);
			await refresh();
			toast.success(`${created} permintaan overtime diimpor.`);
		} catch {
			toast.error('Gagal mengimpor CSV.');
		}
	};

	const attachmentUrl = (r: OvertimeRequest) => {
		if (!r.attachment) return null;
		try {
			return pb.files.getURL(r, r.attachment);
		} catch {
			return null;
		}
	};

	const selectedEmp = form.employee ? empMap.get(form.employee) : undefined;
	const previewAmount = resolveAmount(
		{
			...form,
			hourly_rate:
				form.hourly_rate && form.hourly_rate > 0
					? form.hourly_rate
					: selectedEmp
						? Math.round((selectedEmp.basic_salary || 0) / 173)
						: 0,
		},
		selectedEmp,
	);

	return (
		<div className="-mx-1 flex min-h-[640px] overflow-hidden rounded-2xl border border-border bg-[#f4f7fb] shadow-soft-sm md:-mx-0">
			{/* Side rail */}
			<aside className="hidden w-52 shrink-0 border-r border-border/70 bg-[#eef2f7] p-3 md:block">
				<p className="mb-3 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
					Overtime
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
							{item.key === 'settings' ? (
								<Settings2 className="size-3.5 opacity-70" />
							) : null}
							{item.label}
						</button>
					))}
				</nav>
			</aside>

			{/* Main */}
			<div className="flex min-w-0 flex-1 flex-col bg-white">
				{/* Mobile side tabs */}
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
					<>
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
							<h2 className="text-xl font-bold tracking-tight text-slate-900">
								Overtime requests
							</h2>
							<div className="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={() =>
										toast.info(
											'Ajukan lembur karyawan, setujui, lalu jumlah approved paid overtime ikut dihitung saat membuat periode gaji.',
										)
									}
									className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
								>
									<HelpCircle className="size-3.5" /> Help
								</button>
								<button
									type="button"
									onClick={() => setImportOpen(true)}
									className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
								>
									Import request
								</button>
								<button
									type="button"
									onClick={openCreate}
									className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft-sm hover:bg-primary/90"
								>
									Request overtime
								</button>
							</div>
						</div>

						{/* Filters */}
						<div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
							<select
								value={year}
								onChange={e => setYear(e.target.value)}
								className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
							>
								{years.map(y => (
									<option key={y} value={y}>
										{y}
									</option>
								))}
								<option value="all">All years</option>
							</select>
							<select
								value={statusFilter}
								onChange={e =>
									setStatusFilter(e.target.value as 'all' | OvertimeStatus)
								}
								className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
							>
								<option value="all">All status</option>
								{OVERTIME_STATUS_OPTIONS.map(s => (
									<option key={s} value={s}>
										{OVERTIME_STATUS_LABELS[s]}
									</option>
								))}
							</select>
							<span className="text-sm font-medium text-primary">All filters</span>
							<div className="ml-auto flex items-center gap-2">
								<button
									type="button"
									onClick={printList}
									className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
									title="Print"
								>
									<Printer className="size-4" />
								</button>
								<button
									type="button"
									onClick={exportList}
									className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
									title="Export"
								>
									<Download className="size-4" />
								</button>
								<div className="relative">
									<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
									<input
										value={search}
										onChange={e => setSearch(e.target.value)}
										placeholder="Search by employee name or ID"
										className="h-9 w-56 rounded-full border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none ring-primary/30 placeholder:text-slate-400 focus:ring-2 sm:w-64"
									/>
								</div>
							</div>
						</div>

						{/* Table */}
						<div className="flex-1 overflow-auto">
							{loading ? (
								<div className="p-10 text-center text-sm text-muted-foreground">
									Memuat…
								</div>
							) : filtered.length === 0 ? (
								<div className="p-10 text-center text-sm text-muted-foreground">
									Belum ada permintaan overtime.
									<button
										type="button"
										onClick={openCreate}
										className="mt-3 block w-full font-semibold text-primary"
									>
										+ Request overtime
									</button>
								</div>
							) : (
								<table className="w-full min-w-[960px] border-collapse text-sm">
									<thead>
										<tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
											<th className="w-10 px-4 py-3">
												<input
													type="checkbox"
													checked={
														filtered.length > 0 &&
														selected.size === filtered.length
													}
													onChange={toggleAll}
													className="size-4 rounded border-slate-300"
												/>
											</th>
											<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">
												Employee name
											</th>
											<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">
												Requested date
											</th>
											<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">
												Overtime date
											</th>
											<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">
												Duration
											</th>
											<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">
												Compensation
											</th>
											<th className="px-3 py-3 font-semibold normal-case tracking-normal text-slate-600">
												Status
											</th>
											<th className="px-3 py-3 text-right font-semibold normal-case tracking-normal text-slate-600">
												Actions
											</th>
										</tr>
									</thead>
									<tbody>
										{filtered.map(r => {
											const emp =
												r.expand?.employee ?? empMap.get(r.employee);
											const name = emp?.name || '—';
											const hue = avatarHue(name);
											const url = attachmentUrl(r);
											return (
												<tr
													key={r.id}
													className="border-b border-slate-100 hover:bg-slate-50/60"
												>
													<td className="px-4 py-3">
														<input
															type="checkbox"
															checked={selected.has(r.id)}
															onChange={() => toggleSelect(r.id)}
															className="size-4 rounded border-slate-300"
														/>
													</td>
													<td className="px-3 py-3">
														<div className="flex items-center gap-3">
															<span
																className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
																style={{
																	background: `hsl(${hue} 55% 42%)`,
																}}
															>
																{initials(name)}
															</span>
															<div className="min-w-0">
																<p className="truncate font-semibold text-slate-900">
																	{name}
																</p>
																<p className="truncate text-xs text-slate-500">
																	{employeeDisplayCode(emp)}
																	{emp?.position
																		? ` | ${emp.position.toUpperCase()}`
																		: ''}
																</p>
															</div>
														</div>
													</td>
													<td className="px-3 py-3 text-slate-700">
														{formatOvertimeDate(r.requested_date)}
													</td>
													<td className="px-3 py-3">
														<div className="text-slate-700">
															{formatOvertimeDate(r.overtime_date)}
														</div>
														{url ? (
															<a
																href={url}
																target="_blank"
																rel="noreferrer"
																className="text-xs font-medium text-primary hover:underline"
															>
																View attachment
															</a>
														) : null}
													</td>
													<td className="px-3 py-3 text-slate-700">
														{formatDuration(r.duration_minutes)}
													</td>
													<td className="px-3 py-3 text-slate-700">
														<div>
															{OVERTIME_COMPENSATION_LABELS[
																r.compensation
															] ?? r.compensation}
														</div>
														{r.compensation === 'paid_overtime' &&
														r.amount > 0 ? (
															<div className="text-xs text-slate-500">
																{formatRupiah(r.amount)}
															</div>
														) : null}
													</td>
													<td className="px-3 py-3">
														<span
															className={cn(
																'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
																r.status === 'awaiting_approval' &&
																	'bg-amber-50 text-amber-600 ring-1 ring-amber-200/80',
																r.status === 'approved' &&
																	'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
																r.status === 'rejected' &&
																	'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80',
																r.status === 'cancelled' &&
																	'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
															)}
														>
															{OVERTIME_STATUS_LABELS[r.status] ??
																r.status}
														</span>
														{r.auto_generated ? (
															<span className="ml-1 inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200/80">
																Auto
															</span>
														) : null}
													</td>
													<td className="px-3 py-3 text-right">
														<details className="relative inline-block text-left">
															<summary className="list-none cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
																Actions ▾
															</summary>
															<div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
																<button
																	type="button"
																	onClick={() => openEdit(r)}
																	className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
																>
																	Edit
																</button>
																{r.status === 'awaiting_approval' ? (
																	<>
																		<button
																			type="button"
																			onClick={() =>
																				setStatus(r, 'approved')
																			}
																			className="block w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
																		>
																			Approve
																		</button>
																		<button
																			type="button"
																			onClick={() =>
																				setStatus(r, 'rejected')
																			}
																			className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
																		>
																			Reject
																		</button>
																	</>
																) : null}
																{r.status === 'approved' ? (
																	<button
																		type="button"
																		onClick={() =>
																			setStatus(
																				r,
																				'awaiting_approval',
																			)
																		}
																		className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
																	>
																		Reopen
																	</button>
																) : null}
																<button
																	type="button"
																	onClick={() =>
																		setStatus(r, 'cancelled')
																	}
																	className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
																>
																	Cancel
																</button>
																<button
																	type="button"
																	onClick={() => remove(r)}
																	className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
																>
																	Delete
																</button>
															</div>
														</details>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							)}
						</div>
					</>
				) : (
					<div className="flex-1 overflow-auto p-6">
						<h2 className="mb-1 text-xl font-bold tracking-tight text-slate-900">
							Overtime settings
						</h2>
						<p className="mb-6 text-sm text-muted-foreground">
							Atur pengali tarif lembur dan kebijakan persetujuan.
						</p>
						<form
							onSubmit={saveSettings}
							className="max-w-xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft-sm"
						>
							<div className="grid gap-4 sm:grid-cols-3">
								<label className="block text-sm">
									<span className="mb-1.5 block font-medium">
										Weekday multiplier
									</span>
									<input
										type="number"
										step="0.1"
										min={0}
										value={settingsForm.weekday_multiplier}
										onChange={e =>
											setSettingsForm(s => ({
												...s,
												weekday_multiplier: Number(e.target.value),
											}))
										}
										className="h-10 w-full rounded-lg border border-input bg-background px-3"
									/>
								</label>
								<label className="block text-sm">
									<span className="mb-1.5 block font-medium">
										Weekend multiplier
									</span>
									<input
										type="number"
										step="0.1"
										min={0}
										value={settingsForm.weekend_multiplier}
										onChange={e =>
											setSettingsForm(s => ({
												...s,
												weekend_multiplier: Number(e.target.value),
											}))
										}
										className="h-10 w-full rounded-lg border border-input bg-background px-3"
									/>
								</label>
								<label className="block text-sm">
									<span className="mb-1.5 block font-medium">
										Holiday multiplier
									</span>
									<input
										type="number"
										step="0.1"
										min={0}
										value={settingsForm.holiday_multiplier}
										onChange={e =>
											setSettingsForm(s => ({
												...s,
												holiday_multiplier: Number(e.target.value),
											}))
										}
										className="h-10 w-full rounded-lg border border-input bg-background px-3"
									/>
								</label>
							</div>
							<label className="block text-sm">
								<span className="mb-1.5 block font-medium">
									Minimum duration (minutes)
								</span>
								<input
									type="number"
									min={0}
									value={settingsForm.min_minutes}
									onChange={e =>
										setSettingsForm(s => ({
											...s,
											min_minutes: Number(e.target.value),
										}))
									}
									className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3"
								/>
							</label>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={settingsForm.require_attachment}
									onChange={e =>
										setSettingsForm(s => ({
											...s,
											require_attachment: e.target.checked,
										}))
									}
									className="size-4 rounded border-slate-300"
								/>
								Require attachment on new requests
							</label>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={settingsForm.auto_approve}
									onChange={e =>
										setSettingsForm(s => ({
											...s,
											auto_approve: e.target.checked,
										}))
									}
									className="size-4 rounded border-slate-300"
								/>
								Auto-approve new requests
							</label>
							<div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
								<label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
									<input
										type="checkbox"
										checked={settingsForm.auto_overtime}
										onChange={e =>
											setSettingsForm(s => ({
												...s,
												auto_overtime: e.target.checked,
											}))
										}
										className="size-4 rounded border-slate-300"
									/>
									Automatic overtime from attendance
								</label>
								<p className="mt-1 pl-6 text-xs text-emerald-800/80">
									Buat permintaan overtime otomatis saat karyawan clock in lebih awal dari jam masuk dan clock out lebih lambat dari jam pulang.
								</p>
								<div className="mt-3 grid gap-4 pl-6 sm:grid-cols-2">
									<label className="block text-sm">
										<span className="mb-1.5 block font-medium">Min. overtime before (minutes)</span>
										<input
											type="number"
											min={0}
											disabled={!settingsForm.auto_overtime}
											value={settingsForm.overtime_before_minutes}
											onChange={e =>
												setSettingsForm(s => ({
													...s,
													overtime_before_minutes: Number(e.target.value),
												}))
											}
											className="h-10 w-full rounded-lg border border-input bg-background px-3 disabled:opacity-60"
										/>
										<p className="mt-1 text-xs text-muted-foreground">
											Clock in sekian menit lebih awal dari jam masuk terjadwal.
										</p>
									</label>
									<label className="block text-sm">
										<span className="mb-1.5 block font-medium">Min. overtime after (minutes)</span>
										<input
											type="number"
											min={0}
											disabled={!settingsForm.auto_overtime}
											value={settingsForm.overtime_after_minutes}
											onChange={e =>
												setSettingsForm(s => ({
													...s,
													overtime_after_minutes: Number(e.target.value),
												}))
											}
											className="h-10 w-full rounded-lg border border-input bg-background px-3 disabled:opacity-60"
										/>
										<p className="mt-1 text-xs text-muted-foreground">
											Clock out sekian menit lebih lambat dari jam pulang terjadwal.
										</p>
									</label>
								</div>
							</div>
							<button
								type="submit"
								disabled={settingsSaving}
								className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
							>
								{settingsSaving ? 'Menyimpan…' : 'Simpan pengaturan'}
							</button>
						</form>
					</div>
				)}
			</div>

			{/* Request modal */}
			{formOpen ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
					<div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white shadow-xl">
						<div className="flex items-center justify-between border-b border-border px-5 py-4">
							<h3 className="text-lg font-bold">
								{editingId ? 'Edit overtime request' : 'Request overtime'}
							</h3>
							<button
								type="button"
								onClick={() => setFormOpen(false)}
								className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
							>
								<X className="size-4" />
							</button>
						</div>
						<form onSubmit={submitForm} className="space-y-4 p-5">
							<label className="block text-sm">
								<span className="mb-1.5 block font-medium">Employee</span>
								<select
									required
									value={form.employee || ''}
									onChange={e => {
										const emp = empMap.get(e.target.value);
										const hourly = emp
											? Math.round((emp.basic_salary || 0) / 173)
											: 0;
										setForm(f => ({
											...f,
											employee: e.target.value,
											hourly_rate: hourly,
										}));
									}}
									className="h-10 w-full rounded-lg border border-input bg-background px-3"
								>
									<option value="">Pilih karyawan…</option>
									{activeEmployees.map(e => (
										<option key={e.id} value={e.id}>
											{e.name}
											{e.position ? ` — ${e.position}` : ''}
										</option>
									))}
								</select>
							</label>
							<div className="grid gap-4 sm:grid-cols-2">
								<label className="block text-sm">
									<span className="mb-1.5 block font-medium">Requested date</span>
									<input
										type="date"
										required
										value={(form.requested_date || '').slice(0, 10)}
										onChange={e =>
											setForm(f => ({ ...f, requested_date: e.target.value }))
										}
										className="h-10 w-full rounded-lg border border-input bg-background px-3"
									/>
								</label>
								<label className="block text-sm">
									<span className="mb-1.5 block font-medium">Overtime date</span>
									<input
										type="date"
										required
										value={(form.overtime_date || '').slice(0, 10)}
										onChange={e =>
											setForm(f => ({ ...f, overtime_date: e.target.value }))
										}
										className="h-10 w-full rounded-lg border border-input bg-background px-3"
									/>
								</label>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<label className="block text-sm">
									<span className="mb-1.5 block font-medium">
										Duration (minutes)
									</span>
									<input
										type="number"
										min={1}
										required
										value={form.duration_minutes || ''}
										onChange={e =>
											setForm(f => ({
												...f,
												duration_minutes: Number(e.target.value),
											}))
										}
										className="h-10 w-full rounded-lg border border-input bg-background px-3"
									/>
									<p className="mt-1 text-xs text-muted-foreground">
										{formatDuration(form.duration_minutes || 0)}
									</p>
								</label>
								<label className="block text-sm">
									<span className="mb-1.5 block font-medium">Compensation</span>
									<select
										value={form.compensation || 'paid_overtime'}
										onChange={e =>
											setForm(f => ({
												...f,
												compensation: e.target
													.value as OvertimeCompensation,
											}))
										}
										className="h-10 w-full rounded-lg border border-input bg-background px-3"
									>
										{OVERTIME_COMPENSATION_OPTIONS.map(c => (
											<option key={c} value={c}>
												{OVERTIME_COMPENSATION_LABELS[c]}
											</option>
										))}
									</select>
								</label>
							</div>
							{form.compensation === 'paid_overtime' ? (
								<div className="grid gap-4 sm:grid-cols-2">
									<label className="block text-sm">
										<span className="mb-1.5 block font-medium">
											Hourly rate (Rp)
										</span>
										<input
											type="number"
											min={0}
											value={form.hourly_rate || ''}
											onChange={e =>
												setForm(f => ({
													...f,
													hourly_rate: Number(e.target.value),
												}))
											}
											className="h-10 w-full rounded-lg border border-input bg-background px-3"
										/>
										<p className="mt-1 text-xs text-muted-foreground">
											Default: gaji pokok ÷ 173
										</p>
									</label>
									<div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
										<p className="text-xs font-medium text-emerald-800">
											Estimated amount
										</p>
										<p className="mt-1 text-lg font-bold text-emerald-900">
											{formatRupiah(previewAmount)}
										</p>
										<p className="text-xs text-emerald-700/80">
											× {multiplier} weekday multiplier
										</p>
									</div>
								</div>
							) : null}
							{editingId ? (
								<label className="block text-sm">
									<span className="mb-1.5 block font-medium">Status</span>
									<select
										value={form.status || 'awaiting_approval'}
										onChange={e =>
											setForm(f => ({
												...f,
												status: e.target.value as OvertimeStatus,
											}))
										}
										className="h-10 w-full rounded-lg border border-input bg-background px-3"
									>
										{OVERTIME_STATUS_OPTIONS.map(s => (
											<option key={s} value={s}>
												{OVERTIME_STATUS_LABELS[s]}
											</option>
										))}
									</select>
								</label>
							) : null}
							<label className="block text-sm">
								<span className="mb-1.5 block font-medium">Reason / notes</span>
								<textarea
									rows={3}
									value={form.reason || ''}
									onChange={e =>
										setForm(f => ({ ...f, reason: e.target.value }))
									}
									className="w-full rounded-lg border border-input bg-background px-3 py-2"
									placeholder="Alasan lembur…"
								/>
							</label>
							<label className="block text-sm">
								<span className="mb-1.5 block font-medium">
									Attachment {settingsForm.require_attachment ? '*' : '(optional)'}
								</span>
								<input
									type="file"
									accept="image/*,application/pdf"
									onChange={e =>
										setAttachmentFile(e.target.files?.[0] ?? null)
									}
									className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary"
								/>
							</label>
							<div className="flex justify-end gap-2 pt-2">
								<button
									type="button"
									onClick={() => setFormOpen(false)}
									className="h-10 rounded-lg border border-border px-4 text-sm font-medium"
								>
									Batal
								</button>
								<button
									type="submit"
									disabled={saving}
									className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
								>
									{saving ? 'Menyimpan…' : editingId ? 'Simpan' : 'Submit request'}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}

			{/* Import modal */}
			{importOpen ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
					<div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="text-lg font-bold">Import request</h3>
							<button
								type="button"
								onClick={() => setImportOpen(false)}
								className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
							>
								<X className="size-4" />
							</button>
						</div>
						<p className="mb-3 text-sm text-muted-foreground">
							CSV dengan kolom: Employee name, Overtime date, Duration, Reason.
							Nama harus cocok dengan karyawan aktif.
						</p>
						<label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm hover:bg-slate-100">
							<Upload className="size-6 text-primary" />
							<span className="font-medium">Pilih file CSV</span>
							<input
								type="file"
								accept=".csv,text/csv"
								className="hidden"
								onChange={e => {
									const f = e.target.files?.[0];
									if (f) handleImport(f).catch(() => {});
								}}
							/>
						</label>
						<button
							type="button"
							onClick={() => {
								exportCsv('overtime-import-template.csv', [
									['Employee name', 'Overtime date', 'Duration', 'Reason'],
									['Contoh Karyawan', todayIso(), '2 hours 30 mins', 'Closing bulanan'],
								]);
							}}
							className="mt-3 text-sm font-medium text-primary hover:underline"
						>
							Unduh template CSV
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}

/** Sum of approved paid overtime amounts for an employee in a YYYY-MM period.
 *  Pass explicit `start`/`end` (ISO) to filter by a custom cut-off range
 *  instead of the calendar month. */
export function approvedOvertimeForPeriod(
	requests: OvertimeRequest[],
	employeeId: string,
	period: string,
	start?: string,
	end?: string,
): number {
	const rangeStart = start ?? `${period}-01`;
	let rangeEnd = end;
	if (!rangeEnd) {
		const [y, m] = period.split('-').map(Number);
		const endDate = new Date(y, m, 0);
		rangeEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
	}
	let sum = 0;
	for (const r of requests) {
		if (r.employee !== employeeId) continue;
		if (r.status !== 'approved') continue;
		if (r.compensation !== 'paid_overtime') continue;
		const d = (r.overtime_date || '').slice(0, 10);
		if (d < rangeStart || d > rangeEnd) continue;
		sum += r.amount || 0;
	}
	return sum;
}
