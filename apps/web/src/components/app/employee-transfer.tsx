import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Paperclip, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, type Company } from '@/lib/accounting';
import { EMPLOYEE_STATUS_LABELS, type Employee } from '@/lib/payroll';
import { PTKP_LABELS, PTKP_OPTIONS, type PtkpStatus } from '@/lib/payroll-calc';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { cn } from '@/lib/utils';

export interface EmployeeTransferRecord {
	id: string;
	company: string;
	employee: string;
	employee_code: string;
	employee_name: string;
	transfer_type: TransferType;
	from_value: string;
	to_value: string;
	notes: string;
	created_date: string;
	effective_date: string;
	status: TransferStatus;
	attachment: string;
	owner: string;
	created: string;
}

type TransferType = 'position' | 'status' | 'salary' | 'bank' | 'npwp' | 'ptkp' | 'other';
type TransferStatus = 'pending' | 'approved' | 'cancelled';
type SortKey = 'employee_name' | 'employee_code' | 'transfer_type' | 'created_date' | 'effective_date' | 'status';

const TYPE_LABELS: Record<TransferType, string> = {
	position: 'Jabatan',
	status: 'Status karyawan',
	salary: 'Gaji pokok',
	bank: 'Rekening bank',
	npwp: 'NPWP',
	ptkp: 'PTKP',
	other: 'Other',
};

const STATUS_LABELS: Record<TransferStatus, string> = {
	pending: 'Pending',
	approved: 'Approved',
	cancelled: 'Cancelled',
};

const AVATAR_COLORS = ['#0f766e', '#047857', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#0e7490'];

function displayDate(iso: string): string {
	if (!iso) return '—';
	const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

function todayIso(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function avatarColor(name: string): string {
	let n = 0;
	for (const ch of name) n = (n + ch.charCodeAt(0)) % AVATAR_COLORS.length;
	return AVATAR_COLORS[n] ?? AVATAR_COLORS[0];
}

function employeeCode(emp: Employee): string {
	if (emp.employee_code?.trim()) return emp.employee_code.trim();
	let n = 0;
	for (const ch of emp.id) n = (n * 33 + ch.charCodeAt(0)) % 90000000;
	return String(10000000 + n);
}

function currentValue(emp: Employee, type: TransferType): string {
	switch (type) {
		case 'position':
			return emp.position || '';
		case 'status':
			return emp.status;
		case 'salary':
			return String(emp.basic_salary || 0);
		case 'bank':
			return emp.bank_account || '';
		case 'npwp':
			return emp.npwp || '';
		case 'ptkp':
			return emp.ptkp_status || 'TK0';
		default:
			return '';
	}
}

function formatValue(type: TransferType, value: string): string {
	if (!value) return '—';
	if (type === 'status') return value === 'aktif' ? 'Aktif' : value === 'nonaktif' ? 'Nonaktif' : value;
	if (type === 'salary') return formatRupiah(Number(value) || 0);
	if (type === 'ptkp') return PTKP_LABELS[value as PtkpStatus] ?? value;
	return value;
}

function employeePatch(type: TransferType, toValue: string): Record<string, string | number> | null {
	switch (type) {
		case 'position':
			return { position: toValue };
		case 'status':
			return toValue === 'aktif' || toValue === 'nonaktif' ? { status: toValue } : null;
		case 'salary':
			return { basic_salary: Number(toValue) || 0 };
		case 'bank':
			return { bank_account: toValue };
		case 'npwp':
			return { npwp: toValue };
		case 'ptkp':
			return { ptkp_status: toValue };
		default:
			return null;
	}
}

export function EmployeeTransfer({
	company,
	employees,
	onEmployeesChange,
}: {
	company: Company;
	employees: Employee[];
	onEmployeesChange: () => Promise<void>;
}) {
	const ownerId = pb.authStore.record?.id ?? '';
	const [rows, setRows] = useState<EmployeeTransferRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [statusFilter, setStatusFilter] = useState<'all' | TransferStatus>('all');
	const [typeFilter, setTypeFilter] = useState<'all' | TransferType>('all');
	const [effectiveDate, setEffectiveDate] = useState('');
	const [showFilters, setShowFilters] = useState(false);
	const [search, setSearch] = useState('');
	const [sortKey, setSortKey] = useState<SortKey>('created_date');
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
	const [selected, setSelected] = useState<string[]>([]);
	const [showCreate, setShowCreate] = useState(false);
	const [detail, setDetail] = useState<EmployeeTransferRecord | null>(null);
	const [saving, setSaving] = useState(false);

	const [formEmp, setFormEmp] = useState('');
	const [formType, setFormType] = useState<TransferType>('position');
	const [formTo, setFormTo] = useState('');
	const [formDate, setFormDate] = useState('');
	const [formNotes, setFormNotes] = useState('');
	const [formFile, setFormFile] = useState<File | null>(null);
	const [formStatus, setFormStatus] = useState<TransferStatus>('pending');

	const refresh = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('employee_transfers').getFullList<EmployeeTransferRecord>({
			filter,
			sort: '-created',
			requestKey: null,
		});
		setRows(list);
	}, [company.id]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		refresh()
			.catch(err => {
				if (!cancelled && err?.status !== 0) toast.error('Gagal memuat data transfer karyawan.');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [refresh]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		const list = rows.filter(row => {
			if (statusFilter !== 'all' && row.status !== statusFilter) return false;
			if (typeFilter !== 'all' && row.transfer_type !== typeFilter) return false;
			if (effectiveDate && row.effective_date.slice(0, 10) !== effectiveDate) return false;
			if (!q) return true;
			return (
				row.employee_name.toLowerCase().includes(q) ||
				(row.employee_code || '').toLowerCase().includes(q) ||
				TYPE_LABELS[row.transfer_type].toLowerCase().includes(q)
			);
		});
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...list].sort((a, b) => {
			const av = String(a[sortKey] ?? '');
			const bv = String(b[sortKey] ?? '');
			return av.localeCompare(bv) * dir;
		});
	}, [rows, search, statusFilter, typeFilter, effectiveDate, sortKey, sortDir]);

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
		else {
			setSortKey(key);
			setSortDir('asc');
		}
	};

	const allChecked = filtered.length > 0 && filtered.every(r => selected.includes(r.id));

	const applyToEmployee = async (row: Pick<EmployeeTransferRecord, 'employee' | 'transfer_type' | 'to_value' | 'employee_code'>) => {
		const patch = employeePatch(row.transfer_type, row.to_value) ?? {};
		if (row.employee_code) patch.employee_code = row.employee_code;
		if (Object.keys(patch).length === 0) return;
		await pb.collection('employees').update(row.employee, patch);
		await onEmployeesChange();
	};

	const openCreate = () => {
		setFormEmp(employees[0]?.id ?? '');
		setFormType('position');
		setFormTo('');
		setFormDate(todayIso());
		setFormNotes('');
		setFormFile(null);
		setFormStatus('pending');
		setShowCreate(true);
	};

	const selectedEmployee = employees.find(e => e.id === formEmp);

	const submitCreate = async (event: React.FormEvent) => {
		event.preventDefault();
		const emp = employees.find(e => e.id === formEmp);
		if (!emp) {
			toast.error('Pilih karyawan.');
			return;
		}
		if (!formTo.trim()) {
			toast.error('Isi nilai baru transfer.');
			return;
		}
		if (!formDate) {
			toast.error('Pilih tanggal efektif.');
			return;
		}
		setSaving(true);
		try {
			const code = employeeCode(emp);
			if (!emp.employee_code) {
				await pb.collection('employees').update(emp.id, { employee_code: code });
			}
			const fd = new FormData();
			fd.append('company', company.id);
			fd.append('employee', emp.id);
			fd.append('employee_code', code);
			fd.append('employee_name', emp.name);
			fd.append('transfer_type', formType);
			fd.append('from_value', currentValue(emp, formType));
			fd.append('to_value', formTo.trim());
			fd.append('notes', formNotes.trim());
			fd.append('created_date', todayIso());
			fd.append('effective_date', formDate);
			fd.append('status', formStatus);
			fd.append('owner', ownerId);
			if (formFile) fd.append('attachment', formFile);
			const created = await pb.collection('employee_transfers').create<EmployeeTransferRecord>(fd);
			if (formStatus === 'approved') await applyToEmployee(created);
			else await onEmployeesChange();
			await refresh();
			setShowCreate(false);
			toast.success(formStatus === 'approved' ? 'Transfer disetujui dan diterapkan.' : 'Transfer dibuat.');
		} catch {
			toast.error('Gagal membuat transfer.');
		} finally {
			setSaving(false);
		}
	};

	const setStatus = async (row: EmployeeTransferRecord, status: TransferStatus) => {
		setSaving(true);
		try {
			const updated = await pb.collection('employee_transfers').update<EmployeeTransferRecord>(row.id, { status });
			if (status === 'approved' && row.status !== 'approved') await applyToEmployee(updated);
			await refresh();
			setDetail(updated);
			toast.success(status === 'approved' ? 'Transfer diterapkan ke data karyawan.' : 'Status transfer diperbarui.');
		} catch {
			toast.error('Gagal memperbarui status transfer.');
		} finally {
			setSaving(false);
		}
	};

	const removeRow = async (row: EmployeeTransferRecord) => {
		if (!window.confirm(`Hapus transfer ${row.employee_name}?`)) return;
		try {
			await pb.collection('employee_transfers').delete(row.id);
			setSelected(prev => prev.filter(id => id !== row.id));
			setDetail(null);
			await refresh();
			toast.success('Transfer dihapus.');
		} catch {
			toast.error('Gagal menghapus transfer.');
		}
	};

	const handleExport = () => {
		const data = selected.length ? rows.filter(r => selected.includes(r.id)) : filtered;
		exportCsv(timestampedFilename('employee-transfer'), [
			['Employee name', 'Employee ID', 'Transfer type', 'From', 'To', 'Created date', 'Effective date', 'Status', 'Notes'],
			...data.map(r => [
				r.employee_name,
				r.employee_code,
				TYPE_LABELS[r.transfer_type] ?? r.transfer_type,
				r.from_value,
				r.to_value,
				r.created_date,
				r.effective_date,
				STATUS_LABELS[r.status],
				r.notes ?? '',
			]),
		]);
		toast.success('Data transfer diekspor.');
	};

	const handleImport = async (file: File) => {
		const text = await file.text();
		const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
		if (lines.length < 2) {
			toast.error('File kosong atau tidak valid.');
			return;
		}
		const parseLine = (line: string) => {
			const cols: string[] = [];
			let cur = '';
			let inQ = false;
			for (const ch of line) {
				if (ch === '"') {
					inQ = !inQ;
					continue;
				}
				if (ch === ',' && !inQ) {
					cols.push(cur);
					cur = '';
					continue;
				}
				cur += ch;
			}
			cols.push(cur);
			return cols;
		};
		let created = 0;
		let skipped = 0;
		for (const line of lines.slice(1)) {
			const [nameOrCode, typeRaw, toRaw, dateRaw, statusRaw] = parseLine(line);
			const key = (nameOrCode ?? '').trim().toLowerCase();
			const emp = employees.find(
				e => e.name.toLowerCase() === key || employeeCode(e).toLowerCase() === key || (e.employee_code || '').toLowerCase() === key,
			);
			const type = (Object.keys(TYPE_LABELS) as TransferType[]).find(
				t => t === (typeRaw ?? '').trim().toLowerCase() || TYPE_LABELS[t].toLowerCase() === (typeRaw ?? '').trim().toLowerCase(),
			);
			if (!emp || !type || !(toRaw ?? '').trim()) {
				skipped += 1;
				continue;
			}
			const status: TransferStatus =
				(statusRaw ?? '').toLowerCase().includes('approv') || (statusRaw ?? '').toLowerCase().includes('setuju')
					? 'approved'
					: (statusRaw ?? '').toLowerCase().includes('cancel') || (statusRaw ?? '').toLowerCase().includes('batal')
						? 'cancelled'
						: 'pending';
			try {
				const code = employeeCode(emp);
				const rec = await pb.collection('employee_transfers').create<EmployeeTransferRecord>(
					{
						company: company.id,
						employee: emp.id,
						employee_code: code,
						employee_name: emp.name,
						transfer_type: type,
						from_value: currentValue(emp, type),
						to_value: toRaw.trim(),
						notes: '',
						created_date: todayIso(),
						effective_date: (dateRaw ?? '').trim() || todayIso(),
						status,
						owner: ownerId,
					},
					{ requestKey: `import-transfer-${created}-${emp.id}` },
				);
				if (status === 'approved') await applyToEmployee(rec);
				created += 1;
			} catch {
				skipped += 1;
			}
		}
		await refresh();
		await onEmployeesChange();
		if (created === 0) toast.error('Tidak ada transfer yang berhasil diimpor.');
		else toast.success(`${created} transfer diimpor${skipped ? `, ${skipped} dilewati` : ''}.`);
	};

	const SortIcon = ({ col }: { col: SortKey }) =>
		sortKey === col ? (
			sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
		) : (
			<ChevronDown className="size-3 opacity-40" />
		);

	const filterCount = (statusFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0) + (effectiveDate ? 1 : 0);

	return (
		<div className="bg-white">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f7f8fc] px-5 py-4">
				<h1 className="text-xl font-bold tracking-tight text-slate-900">Employee transfer</h1>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={handleExport}
						className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 shadow-sm hover:bg-slate-50"
					>
						Export
					</button>
					<label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 shadow-sm hover:bg-slate-50">
						Import
						<input
							type="file"
							accept=".csv,text/csv"
							className="hidden"
							onChange={e => {
								const f = e.target.files?.[0];
								if (f) void handleImport(f);
								e.target.value = '';
							}}
						/>
					</label>
					<button
						type="button"
						onClick={openCreate}
						className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98]"
					>
						Create transfer
					</button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2 px-5 py-4">
				<div className="relative">
					<select
						value={statusFilter}
						onChange={e => setStatusFilter(e.target.value as 'all' | TransferStatus)}
						aria-label="All status"
						className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none ring-indigo-200 focus:ring-2"
					>
						<option value="all">All status</option>
						<option value="pending">Pending</option>
						<option value="approved">Approved</option>
						<option value="cancelled">Cancelled</option>
					</select>
					<ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
				</div>
				<label className="relative inline-flex items-center">
					<input
						type="date"
						value={effectiveDate}
						onChange={e => setEffectiveDate(e.target.value)}
						aria-label="Select effective date"
						className={cn(
							'rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm outline-none ring-indigo-200 focus:ring-2',
							effectiveDate ? 'text-slate-800' : 'text-slate-400',
						)}
					/>
					<Calendar className="pointer-events-none absolute right-2.5 size-4 text-slate-400" />
				</label>
				<button
					type="button"
					onClick={() => setShowFilters(v => !v)}
					className="text-sm font-semibold text-indigo-600 hover:underline"
				>
					All filters{filterCount ? ` (${filterCount})` : ''}
				</button>
				<div className="relative ml-auto">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
					<input
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder="Search employee..."
						className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-indigo-200 focus:ring-2"
					/>
				</div>
			</div>

			{showFilters ? (
				<div className="mx-5 mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
					<div className="space-y-1">
						<label className="text-xs font-semibold text-slate-500">Transfer type</label>
						<select
							value={typeFilter}
							onChange={e => setTypeFilter(e.target.value as 'all' | TransferType)}
							className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
						>
							<option value="all">Semua tipe</option>
							{(Object.keys(TYPE_LABELS) as TransferType[]).map(t => (
								<option key={t} value={t}>
									{TYPE_LABELS[t]}
								</option>
							))}
						</select>
					</div>
					<button
						type="button"
						onClick={() => {
							setStatusFilter('all');
							setTypeFilter('all');
							setEffectiveDate('');
						}}
						className="text-sm font-semibold text-slate-500 hover:text-slate-800"
					>
						Reset
					</button>
				</div>
			) : null}

			<div className="overflow-x-auto px-3 pb-6">
				<table className="w-full min-w-[980px] text-left text-sm">
					<thead>
						<tr className="border-y border-slate-100 bg-[#f7f8fc] text-xs font-semibold text-slate-700">
							<th className="w-10 px-3 py-3">
								<input
									type="checkbox"
									checked={allChecked}
									onChange={e => setSelected(e.target.checked ? filtered.map(r => r.id) : [])}
									aria-label="Pilih semua"
									className="size-4 accent-indigo-600"
								/>
							</th>
							{(
								[
									['employee_name', 'Employee name'],
									['employee_code', 'Employee ID'],
									['transfer_type', 'Transfer type'],
									['created_date', 'Created date'],
									['effective_date', 'Effective date'],
									['status', 'Status'],
								] as [SortKey, string][]
							).map(([key, label]) => (
								<th key={key} className="px-3 py-3">
									<button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1">
										{label} <SortIcon col={key} />
									</button>
								</th>
							))}
							<th className="px-3 py-3">Attachment</th>
							<th className="px-3 py-3" />
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{loading ? (
							<tr>
								<td colSpan={9} className="px-4 py-10 text-center text-slate-500">
									Memuat transfer…
								</td>
							</tr>
						) : filtered.length === 0 ? (
							<tr>
								<td colSpan={9} className="px-4 py-12 text-center text-slate-500">
									Belum ada transfer. Klik Create transfer untuk memindahkan jabatan, status, atau data lain.
								</td>
							</tr>
						) : (
							filtered.map(row => (
								<tr key={row.id} className="hover:bg-slate-50/70">
									<td className="px-3 py-3">
										<input
											type="checkbox"
											checked={selected.includes(row.id)}
											onChange={e =>
												setSelected(prev => (e.target.checked ? [...prev, row.id] : prev.filter(id => id !== row.id)))
											}
											aria-label={`Pilih ${row.employee_name}`}
											className="size-4 accent-indigo-600"
										/>
									</td>
									<td className="px-3 py-3">
										<div className="flex items-center gap-3">
											<span
												className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
												style={{ backgroundColor: avatarColor(row.employee_name) }}
											>
												{initials(row.employee_name)}
											</span>
											<span className="max-w-[180px] font-semibold uppercase leading-tight text-slate-800">
												{row.employee_name}
											</span>
										</div>
									</td>
									<td className="px-3 py-3 tabular-nums text-slate-700">{row.employee_code || '—'}</td>
									<td className="px-3 py-3 text-slate-700">{TYPE_LABELS[row.transfer_type] ?? row.transfer_type}</td>
									<td className="px-3 py-3 text-slate-700">{displayDate(row.created_date)}</td>
									<td className="px-3 py-3 text-slate-700">{displayDate(row.effective_date)}</td>
									<td className="px-3 py-3">
										<span
											className={cn(
												'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
												row.status === 'cancelled' && 'bg-sky-100 text-sky-700',
												row.status === 'approved' && 'bg-emerald-100 text-emerald-700',
												row.status === 'pending' && 'bg-amber-100 text-amber-800',
											)}
										>
											{STATUS_LABELS[row.status]}
										</span>
									</td>
									<td className="px-3 py-3 text-slate-400">
										{row.attachment ? (
											<a
												href={pb.files.getURL(row, row.attachment)}
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
											>
												<Paperclip className="size-3.5" /> File
											</a>
										) : (
											'—'
										)}
									</td>
									<td className="px-3 py-3 text-right">
										<button
											type="button"
											onClick={() => setDetail(row)}
											className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
										>
											Detail
										</button>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{showCreate ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setShowCreate(false)}>
					<form
						onSubmit={submitCreate}
						onClick={e => e.stopPropagation()}
						className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
					>
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-lg font-bold text-slate-900">Create transfer</h2>
							<button type="button" onClick={() => setShowCreate(false)} aria-label="Tutup" className="text-slate-400">
								<X className="size-4" />
							</button>
						</div>
						<div className="space-y-3">
							<label className="block space-y-1 text-xs font-semibold text-slate-600">
								Karyawan
								<select
									value={formEmp}
									onChange={e => setFormEmp(e.target.value)}
									required
									className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
								>
									<option value="">Pilih karyawan</option>
									{employees.map(emp => (
										<option key={emp.id} value={emp.id}>
											{emp.name} · {employeeCode(emp)}
										</option>
									))}
								</select>
							</label>
							<label className="block space-y-1 text-xs font-semibold text-slate-600">
								Transfer type
								<select
									value={formType}
									onChange={e => {
										setFormType(e.target.value as TransferType);
										setFormTo('');
									}}
									className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
								>
									{(Object.keys(TYPE_LABELS) as TransferType[]).map(t => (
										<option key={t} value={t}>
											{TYPE_LABELS[t]}
										</option>
									))}
								</select>
							</label>
							{selectedEmployee ? (
								<p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
									Nilai saat ini: <span className="font-semibold">{formatValue(formType, currentValue(selectedEmployee, formType))}</span>
								</p>
							) : null}
							<label className="block space-y-1 text-xs font-semibold text-slate-600">
								Nilai baru
								{formType === 'status' ? (
									<select
										value={formTo}
										onChange={e => setFormTo(e.target.value)}
										required
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
									>
										<option value="">Pilih status</option>
										<option value="aktif">{EMPLOYEE_STATUS_LABELS.aktif}</option>
										<option value="nonaktif">{EMPLOYEE_STATUS_LABELS.nonaktif}</option>
									</select>
								) : formType === 'ptkp' ? (
									<select
										value={formTo}
										onChange={e => setFormTo(e.target.value)}
										required
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
									>
										<option value="">Pilih PTKP</option>
										{PTKP_OPTIONS.map(opt => (
											<option key={opt} value={opt}>
												{PTKP_LABELS[opt]}
											</option>
										))}
									</select>
								) : (
									<input
										required
										type={formType === 'salary' ? 'number' : 'text'}
										min={formType === 'salary' ? 0 : undefined}
										value={formTo}
										onChange={e => setFormTo(e.target.value)}
										placeholder={formType === 'position' ? 'Jabatan baru' : 'Nilai baru'}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
									/>
								)}
							</label>
							<label className="block space-y-1 text-xs font-semibold text-slate-600">
								Effective date
								<input
									type="date"
									required
									value={formDate}
									onChange={e => setFormDate(e.target.value)}
									className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
								/>
							</label>
							<label className="block space-y-1 text-xs font-semibold text-slate-600">
								Catatan
								<textarea
									value={formNotes}
									onChange={e => setFormNotes(e.target.value)}
									rows={2}
									className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
								/>
							</label>
							<label className="block space-y-1 text-xs font-semibold text-slate-600">
								Attachment
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp,application/pdf"
									onChange={e => setFormFile(e.target.files?.[0] ?? null)}
									className="w-full text-sm font-normal"
								/>
							</label>
							<label className="block space-y-1 text-xs font-semibold text-slate-600">
								Status
								<select
									value={formStatus}
									onChange={e => setFormStatus(e.target.value as TransferStatus)}
									className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
								>
									<option value="pending">Pending — belum diterapkan</option>
									<option value="approved">Approved — terapkan sekarang</option>
									<option value="cancelled">Cancelled</option>
								</select>
							</label>
						</div>
						<div className="mt-5 flex justify-end gap-2">
							<button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">
								Batal
							</button>
							<button
								type="submit"
								disabled={saving}
								className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
							>
								{saving ? 'Menyimpan…' : 'Simpan'}
							</button>
						</div>
					</form>
				</div>
			) : null}

			{detail ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setDetail(null)}>
					<div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
						<div className="mb-4 flex items-start justify-between gap-3">
							<div>
								<p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
									{TYPE_LABELS[detail.transfer_type]}
								</p>
								<h2 className="text-lg font-bold text-slate-900">{detail.employee_name}</h2>
								<p className="text-sm text-slate-500">ID {detail.employee_code}</p>
							</div>
							<button type="button" onClick={() => setDetail(null)} aria-label="Tutup" className="text-slate-400">
								<X className="size-4" />
							</button>
						</div>
						<dl className="space-y-2 text-sm">
							<div className="flex justify-between gap-3">
								<dt className="text-slate-500">Dari</dt>
								<dd className="font-semibold text-slate-800">{formatValue(detail.transfer_type, detail.from_value)}</dd>
							</div>
							<div className="flex justify-between gap-3">
								<dt className="text-slate-500">Ke</dt>
								<dd className="font-semibold text-slate-800">{formatValue(detail.transfer_type, detail.to_value)}</dd>
							</div>
							<div className="flex justify-between gap-3">
								<dt className="text-slate-500">Dibuat</dt>
								<dd>{displayDate(detail.created_date)}</dd>
							</div>
							<div className="flex justify-between gap-3">
								<dt className="text-slate-500">Efektif</dt>
								<dd>{displayDate(detail.effective_date)}</dd>
							</div>
							<div className="flex justify-between gap-3">
								<dt className="text-slate-500">Status</dt>
								<dd>{STATUS_LABELS[detail.status]}</dd>
							</div>
							{detail.notes ? (
								<div>
									<dt className="text-slate-500">Catatan</dt>
									<dd className="mt-1 text-slate-800">{detail.notes}</dd>
								</div>
							) : null}
						</dl>
						<p className="mt-3 text-xs text-slate-400">
							Menyetujui transfer jabatan, status, gaji, rekening, NPWP, atau PTKP langsung memperbarui data karyawan.
							Tipe Other hanya dicatat.
						</p>
						<div className="mt-5 flex flex-wrap justify-end gap-2">
							<button type="button" onClick={() => void removeRow(detail)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">
								Hapus
							</button>
							{detail.status !== 'cancelled' ? (
								<button
									type="button"
									disabled={saving}
									onClick={() => void setStatus(detail, 'cancelled')}
									className="rounded-lg border px-3 py-2 text-sm font-semibold"
								>
									Batalkan
								</button>
							) : null}
							{detail.status !== 'approved' ? (
								<button
									type="button"
									disabled={saving}
									onClick={() => void setStatus(detail, 'approved')}
									className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
								>
									Setujui & terapkan
								</button>
							) : null}
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
