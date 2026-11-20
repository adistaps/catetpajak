import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ArrowUpDown,
	BookOpen,
	ChevronDown,
	ExternalLink,
	FileText,
	MoreHorizontal,
	Plus,
	Search,
	Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, todayIso, type Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import { cn } from '@/lib/utils';
import { AmountInput } from '@/components/ui/amount-input';

export interface PayrollComponent {
	id: string;
	company: string;
	transaction_id: string;
	type: 'Adjustment' | 'Allowance' | 'Deduction' | 'Overtime' | 'Salary';
	effective_date: string;
	end_date: string;
	created_by_name: string;
	description: string;
	component_name: string;
	amount: number;
	employee_count: number;
	employees: string[];
	status: 'Active' | 'Inactive' | 'Draft';
	owner: string;
	created: string;
}

type SideNav = 'update' | 'ex-allowance' | 'settings';
type MainTab = 'update-history' | 'employee-history';

interface PayrollComponentsProps {
	company: Company;
}

const TYPE_OPTIONS: PayrollComponent['type'][] = [
	'Adjustment',
	'Allowance',
	'Deduction',
	'Overtime',
	'Salary',
];

function nextTransactionId(existing: PayrollComponent[]): string {
	const today = todayIso().replace(/-/g, '');
	const prefix = today.slice(0, 8);
	const nums = existing
		.map(c => c.transaction_id)
		.filter(id => id.startsWith(prefix))
		.map(id => Number(id.slice(prefix.length)) || 0);
	const next = (nums.length ? Math.max(...nums) : 0) + 1;
	return `${prefix}${String(next).padStart(2, '0')}`;
}

export function PayrollComponents({ company }: PayrollComponentsProps) {
	const [sideNav, setSideNav] = useState<SideNav>('update');
	const [mainTab, setMainTab] = useState<MainTab>('update-history');
	const [items, setItems] = useState<PayrollComponent[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [periodFilter, setPeriodFilter] = useState('');
	const [showForm, setShowForm] = useState(false);
	const [saving, setSaving] = useState(false);
	const [actionOpen, setActionOpen] = useState<string | null>(null);
	const [descOpen, setDescOpen] = useState<PayrollComponent | null>(null);
	const [detailOpen, setDetailOpen] = useState<PayrollComponent | null>(null);
	const [exEmployees, setExEmployees] = useState<Employee[]>([]);
	const [showExForm, setShowExForm] = useState(false);
	const [exSaving, setExSaving] = useState(false);
	const [exForm, setExForm] = useState({
		component_name: '',
		amount: 0,
		effective_date: todayIso(),
		end_date: '',
		description: '',
		employeeIds: [] as string[],
		status: 'Active' as PayrollComponent['status'],
	});

	const ownerId = pb.authStore.record?.id ?? '';
	const ownerName =
		(pb.authStore.record as { name?: string } | null)?.name ||
		(pb.authStore.record as { email?: string } | null)?.email ||
		'—';

	const [form, setForm] = useState({
		type: 'Adjustment' as PayrollComponent['type'],
		effective_date: todayIso(),
		end_date: '',
		component_name: '',
		description: '',
		amount: 0,
		employeeIds: [] as string[],
		status: 'Active' as PayrollComponent['status'],
	});

	const refresh = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const [list, emps] = await Promise.all([
			pb.collection('payroll_components').getFullList<PayrollComponent>({
				filter,
				sort: '-transaction_id',
			}),
			pb.collection('employees').getFullList<Employee>({
				filter,
				sort: 'name',
			}),
		]);
		setItems(list);
		setEmployees(emps.filter(e => e.status === 'aktif'));
		setExEmployees(emps.filter(e => e.status !== 'aktif'));
	}, [company.id]);

	useEffect(() => {
		setLoading(true);
		refresh()
			.catch(() => toast.error('Gagal memuat komponen payroll.'))
			.finally(() => setLoading(false));
	}, [refresh]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return items.filter(item => {
			if (periodFilter) {
				const eff = (item.effective_date || '').slice(0, 7);
				if (eff !== periodFilter) return false;
			}
			if (!q) return true;
			return (
				item.transaction_id.toLowerCase().includes(q) ||
				item.component_name.toLowerCase().includes(q) ||
				item.type.toLowerCase().includes(q) ||
				(item.created_by_name || '').toLowerCase().includes(q) ||
				(item.description || '').toLowerCase().includes(q)
			);
		});
	}, [items, search, periodFilter]);

	const openCreate = () => {
		setForm({
			type: 'Adjustment',
			effective_date: todayIso(),
			end_date: '',
			component_name: '',
			description: '',
			amount: 0,
			employeeIds: [],
			status: 'Active',
		});
		setShowForm(true);
	};

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!form.component_name.trim()) {
			toast.error('Nama komponen wajib diisi.');
			return;
		}
		if (!form.effective_date) {
			toast.error('Tanggal efektif wajib diisi.');
			return;
		}
		setSaving(true);
		try {
			const txn = nextTransactionId(items);
			await pb.collection('payroll_components').create({
				company: company.id,
				transaction_id: txn,
				type: form.type,
				effective_date: form.effective_date,
				end_date: form.end_date || '',
				created_by_name: ownerName,
				description: form.description,
				component_name: form.component_name.trim(),
				amount: form.amount || 0,
				employee_count: form.employeeIds.length || 0,
				employees: form.employeeIds,
				status: form.status,
				owner: ownerId,
			});
			// Komponen Salary = penyesuaian gaji pokok: perbarui langsung di direktori karyawan.
			if (form.type === 'Salary' && form.employeeIds.length > 0) {
				await Promise.all(
					form.employeeIds.map((id, i) =>
						pb
							.collection('employees')
							.update(id, { basic_salary: form.amount || 0 }, { requestKey: `salary-adj-${txn}-${i}` }),
					),
				);
			}
			setShowForm(false);
			await refresh();
			if (form.type === 'Salary' && form.employeeIds.length > 0) {
				toast.success(`Gaji pokok ${form.employeeIds.length} karyawan diperbarui di direktori.`);
			} else {
				toast.success(`Komponen ${txn} berhasil dibuat.`);
			}
		} catch {
			toast.error('Gagal menyimpan komponen payroll.');
		} finally {
			setSaving(false);
		}
	};

	const setStatus = async (item: PayrollComponent, status: PayrollComponent['status']) => {
		try {
			await pb.collection('payroll_components').update(item.id, { status });
			setActionOpen(null);
			await refresh();
			toast.success(`Status diubah menjadi ${status}.`);
		} catch {
			toast.error('Gagal mengubah status.');
		}
	};

	const remove = async (item: PayrollComponent) => {
		if (!window.confirm(`Hapus transaksi ${item.transaction_id}?`)) return;
		try {
			await pb.collection('payroll_components').delete(item.id);
			setActionOpen(null);
			await refresh();
			toast.success('Komponen dihapus.');
		} catch {
			toast.error('Gagal menghapus.');
		}
	};

	const toggleEmp = (id: string) => {
		setForm(f => ({
			...f,
			employeeIds: f.employeeIds.includes(id)
				? f.employeeIds.filter(x => x !== id)
				: [...f.employeeIds, id],
		}));
	};

	const openExCreate = () => {
		setExForm({
			component_name: '',
			amount: 0,
			effective_date: todayIso(),
			end_date: '',
			description: '',
			employeeIds: [],
			status: 'Active',
		});
		setShowExForm(true);
	};

	const toggleExEmp = (id: string) => {
		setExForm(f => ({
			...f,
			employeeIds: f.employeeIds.includes(id)
				? f.employeeIds.filter(x => x !== id)
				: [...f.employeeIds, id],
		}));
	};

	const submitEx = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!exForm.component_name.trim()) {
			toast.error('Nama tunjangan wajib diisi.');
			return;
		}
		if (exForm.employeeIds.length === 0) {
			toast.error('Pilih minimal satu karyawan resign.');
			return;
		}
		if (!exForm.effective_date) {
			toast.error('Tanggal efektif wajib diisi.');
			return;
		}
		setExSaving(true);
		try {
			const txn = nextTransactionId(items);
			await pb.collection('payroll_components').create({
				company: company.id,
				transaction_id: txn,
				type: 'Allowance',
				effective_date: exForm.effective_date,
				end_date: exForm.end_date || '',
				created_by_name: ownerName,
				description: exForm.description,
				component_name: exForm.component_name.trim(),
				amount: exForm.amount || 0,
				employee_count: exForm.employeeIds.length,
				employees: exForm.employeeIds,
				status: exForm.status,
				owner: ownerId,
			});
			setShowExForm(false);
			await refresh();
			toast.success(`Tunjangan ex-employee ${txn} berhasil dibuat.`);
		} catch {
			toast.error('Gagal menyimpan tunjangan ex-employee.');
		} finally {
			setExSaving(false);
		}
	};

	const exAllowances = useMemo(() => {
		const exIds = new Set(exEmployees.map(e => e.id));
		return items.filter(
			i =>
				i.type === 'Allowance' &&
				Array.isArray(i.employees) &&
				i.employees.some(id => exIds.has(id)),
		);
	}, [items, exEmployees]);

	const exEmpName = (id: string) => exEmployees.find(e => e.id === id)?.name ?? '—';

	return (
		<div className="flex min-h-[70vh] overflow-hidden rounded-2xl border border-border bg-[#f4f7fb] shadow-soft-sm">
			{/* Left rail */}
			<aside className="hidden w-56 shrink-0 border-r border-border/80 bg-[#eef2f8] p-4 md:block">
				<p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
					Payroll Components
				</p>
				<nav className="space-y-1">
					<button
						type="button"
						onClick={() => setSideNav('update')}
						className={cn(
							'w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
							sideNav === 'update'
								? 'bg-primary/10 text-primary'
								: 'text-slate-700 hover:bg-white/70',
						)}
					>
						Update components
					</button>
					<button
						type="button"
						onClick={() => setSideNav('ex-allowance')}
						className={cn(
							'w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
							sideNav === 'ex-allowance'
								? 'bg-primary/10 text-primary'
								: 'text-slate-700 hover:bg-white/70',
						)}
					>
						Ex-employee allowance
					</button>
					<button
						type="button"
						onClick={() => setSideNav('settings')}
						className={cn(
							'flex w-full items-center gap-1.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
							sideNav === 'settings'
								? 'bg-primary/10 text-primary'
								: 'text-slate-700 hover:bg-white/70',
						)}
					>
						Settings
						<ExternalLink className="size-3.5 opacity-60" />
					</button>
				</nav>
			</aside>

			{/* Main */}
			<div className="min-w-0 flex-1 bg-[#f8fafc]">
				<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 bg-white px-5 py-4">
					<div>
						<p className="text-xs font-medium text-slate-500">Payroll</p>
						<h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
							{sideNav === 'update'
								? 'Update Payroll Component'
								: sideNav === 'ex-allowance'
									? 'Ex-employee Allowance'
									: 'Component Settings'}
						</h1>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary shadow-sm hover:bg-primary/10"
						>
							More <ChevronDown className="size-3.5" />
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary shadow-sm hover:bg-primary/10"
						>
							<BookOpen className="size-3.5 text-primary" /> Guidebook
						</button>
						{sideNav === 'update' ? (
							<button
								type="button"
								onClick={openCreate}
								className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]"
							>
								<Plus className="size-3.5" /> Update component
							</button>
						) : null}
						{sideNav === 'ex-allowance' ? (
							<button
								type="button"
								onClick={openExCreate}
								className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]"
							>
								<Plus className="size-3.5" /> Tambah tunjangan resign
							</button>
						) : null}
					</div>
				</div>

				{sideNav === 'update' ? (
					<div className="p-5">
						<div className="mb-4 flex gap-6 border-b border-border/70">
							<button
								type="button"
								onClick={() => setMainTab('update-history')}
								className={cn(
									'border-b-2 pb-2.5 text-sm font-semibold transition-colors',
									mainTab === 'update-history'
										? 'border-primary text-primary'
										: 'border-transparent text-slate-500 hover:text-slate-800',
								)}
							>
								Update history
							</button>
							<button
								type="button"
								onClick={() => setMainTab('employee-history')}
								className={cn(
									'border-b-2 pb-2.5 text-sm font-semibold transition-colors',
									mainTab === 'employee-history'
										? 'border-primary text-primary'
										: 'border-transparent text-slate-500 hover:text-slate-800',
								)}
							>
								Employee history
							</button>
						</div>

						{showForm ? (
							<form
								onSubmit={submit}
								className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
							>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Type</label>
									<select
										value={form.type}
										onChange={e =>
											setForm(f => ({
												...f,
												type: e.target.value as PayrollComponent['type'],
											}))
										}
										className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									>
										{TYPE_OPTIONS.map(t => (
											<option key={t} value={t}>
												{t}
											</option>
										))}
									</select>
									{form.type === 'Salary' ? (
										<p className="text-[11px] font-medium text-amber-700">
											Type Salary = penyesuaian gaji pokok. Amount akan mengubah gaji pokok karyawan terpilih di direktori.
										</p>
									) : null}
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">
										Components name
									</label>
									<input
										required
										value={form.component_name}
										onChange={e => setForm(f => ({ ...f, component_name: e.target.value }))}
										placeholder="Tunjangan Lainnya"
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Effective date</label>
									<input
										type="date"
										required
										value={form.effective_date}
										onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">End date</label>
									<input
										type="date"
										value={form.end_date}
										onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Amount (Rp)</label>
									<AmountInput
										value={form.amount}
										onValueChange={v => setForm(f => ({ ...f, amount: v }))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Status</label>
									<select
										value={form.status}
										onChange={e =>
											setForm(f => ({
												...f,
												status: e.target.value as PayrollComponent['status'],
											}))
										}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									>
										<option value="Active">Active</option>
										<option value="Inactive">Inactive</option>
										<option value="Draft">Draft</option>
									</select>
								</div>
								<div className="space-y-1.5 md:col-span-2">
									<label className="text-xs font-semibold text-slate-600">Description</label>
									<input
										value={form.description}
										onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
										placeholder="Catatan penyesuaian…"
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-2 md:col-span-2">
									<label className="text-xs font-semibold text-slate-600">
										Employees ({form.employeeIds.length})
									</label>
									<div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
										{employees.length === 0 ? (
											<p className="px-2 py-3 text-xs text-slate-500">
												Belum ada karyawan aktif.
											</p>
										) : (
											employees.map(emp => (
												<label
													key={emp.id}
													className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white"
												>
													<input
														type="checkbox"
														checked={form.employeeIds.includes(emp.id)}
														onChange={() => toggleEmp(emp.id)}
														className="rounded border-slate-300"
													/>
													<span className="font-medium text-slate-800">{emp.name}</span>
													{emp.position ? (
														<span className="text-xs text-slate-500">· {emp.position}</span>
													) : null}
												</label>
											))
										)}
									</div>
								</div>
								<div className="flex flex-wrap gap-2 md:col-span-2">
									<button
										type="submit"
										disabled={saving}
										className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
									>
										{saving ? 'Menyimpan…' : 'Simpan komponen'}
									</button>
									<button
										type="button"
										onClick={() => setShowForm(false)}
										className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
									>
										Batal
									</button>
								</div>
							</form>
						) : null}

						{mainTab === 'update-history' ? (
							<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
								<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
									<div className="relative">
										<input
											type="month"
											value={periodFilter}
											onChange={e => setPeriodFilter(e.target.value)}
											className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none ring-green-200 focus:ring-2"
											aria-label="All period"
										/>
										{!periodFilter ? (
											<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
												All period
											</span>
										) : null}
									</div>
									<div className="relative">
										<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
										<input
											value={search}
											onChange={e => setSearch(e.target.value)}
											placeholder="Search..."
											className="w-48 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-green-200 focus:ring-2 md:w-56"
										/>
									</div>
								</div>

								<div className="overflow-x-auto">
									<table className="w-full min-w-[980px] text-left text-sm">
										<thead>
											<tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
												{(
													[
														'Transaction ID',
														'Type',
														'Effective date',
														'End date',
														'Created by',
														'Description',
														'Employees',
														'Components name',
														'Status',
														'',
													] as const
												).map(h => (
													<th key={h || 'act'} className="whitespace-nowrap px-4 py-3 font-semibold">
														<span className="inline-flex items-center gap-1">
															{h}
															{h ? <ArrowUpDown className="size-3 opacity-40" /> : null}
														</span>
													</th>
												))}
											</tr>
										</thead>
										<tbody className="divide-y divide-slate-100">
											{loading ? (
												<tr>
													<td colSpan={10} className="px-4 py-10 text-center text-slate-500">
														Memuat…
													</td>
												</tr>
											) : filtered.length === 0 ? (
												<tr>
													<td colSpan={10} className="px-4 py-10 text-center text-slate-500">
														Belum ada riwayat update komponen. Klik &quot;Update component&quot;
														untuk menambah.
													</td>
												</tr>
											) : (
												filtered.map(row => (
													<tr key={row.id} className="hover:bg-slate-50/80">
														<td className="px-4 py-3">
															<button
																type="button"
																onClick={() => setDetailOpen(row)}
																className="font-semibold text-green-600 hover:underline"
															>
																{row.transaction_id}
															</button>
														</td>
														<td className="px-4 py-3 text-slate-700">{row.type}</td>
														<td className="px-4 py-3 text-slate-700">
															{row.effective_date ? formatDate(row.effective_date) : '—'}
														</td>
														<td className="px-4 py-3 text-slate-700">
															{row.end_date ? formatDate(row.end_date) : '—'}
														</td>
														<td className="px-4 py-3 text-slate-700">
															{row.created_by_name || '—'}
														</td>
														<td className="px-4 py-3">
															{row.description ? (
																<button
																	type="button"
																	onClick={() => setDescOpen(row)}
																	className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
																>
																	<FileText className="size-3.5" /> View
																</button>
															) : (
																<span className="text-slate-400">—</span>
															)}
														</td>
														<td className="px-4 py-3 text-slate-700">
															{row.employee_count || 0}
														</td>
														<td className="px-4 py-3 font-medium text-slate-800">
															{row.component_name}
														</td>
														<td className="px-4 py-3">
															<span
																className={cn(
																	'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
																	row.status === 'Active' && 'bg-emerald-100 text-emerald-700',
																	row.status === 'Inactive' && 'bg-slate-100 text-slate-600',
																	row.status === 'Draft' && 'bg-amber-100 text-amber-800',
																)}
															>
																{row.status}
															</span>
														</td>
														<td className="relative px-4 py-3 text-right">
															<button
																type="button"
																onClick={() =>
																	setActionOpen(actionOpen === row.id ? null : row.id)
																}
																className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-primary/10"
															>
																Action <ChevronDown className="size-3" />
															</button>
															{actionOpen === row.id ? (
																<div className="absolute right-4 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
																	<button
																		type="button"
																		onClick={() => setStatus(row, 'Active')}
																		className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
																	>
																		Set Active
																	</button>
																	<button
																		type="button"
																		onClick={() => setStatus(row, 'Inactive')}
																		className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
																	>
																		Set Inactive
																	</button>
																	<button
																		type="button"
																		onClick={() => remove(row)}
																		className="block w-full px-3 py-2 text-left text-sm text-primary hover:bg-primary/10"
																	>
																		Delete
																	</button>
																</div>
															) : null}
														</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							</div>
						) : (
							<div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
								<p className="text-sm text-slate-600">
									Riwayat per karyawan menampilkan komponen yang pernah diterapkan ke masing-masing
									karyawan.
								</p>
								<div className="mt-6 overflow-x-auto">
									<table className="mx-auto w-full max-w-3xl text-left text-sm">
										<thead>
											<tr className="border-b text-xs uppercase text-slate-500">
												<th className="px-3 py-2">Employee</th>
												<th className="px-3 py-2">Components</th>
												<th className="px-3 py-2">Active updates</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{employees.map(emp => {
												const related = items.filter(
													i =>
														Array.isArray(i.employees) &&
														i.employees.includes(emp.id) &&
														i.status === 'Active',
												);
												return (
													<tr key={emp.id}>
														<td className="px-3 py-2.5 font-medium">{emp.name}</td>
														<td className="px-3 py-2.5 text-slate-600">
															{related.map(r => r.component_name).join(', ') || '—'}
														</td>
														<td className="px-3 py-2.5">{related.length}</td>
													</tr>
												);
											})}
											{employees.length === 0 ? (
												<tr>
													<td colSpan={3} className="px-3 py-8 text-center text-slate-500">
														Belum ada karyawan.
													</td>
												</tr>
											) : null}
										</tbody>
									</table>
								</div>
							</div>
						)}
					</div>
				) : null}

				{sideNav === 'ex-allowance' ? (
					<div className="p-5">
						<p className="mb-4 text-sm text-slate-600">
							Kelola tunjangan untuk karyawan yang sudah resign (nonaktif) — misalnya tunjangan
							akhir masa kerja, komisi tertunda, atau bonus yang masih terutang.
						</p>

						{showExForm ? (
							<form
								onSubmit={submitEx}
								className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
							>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">
										Nama tunjangan
									</label>
									<input
											required
										value={exForm.component_name}
										onChange={e => setExForm(f => ({ ...f, component_name: e.target.value }))}
										placeholder="Tunjangan Akhir Masa Kerja"
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Jumlah (Rp)</label>
									<AmountInput
										required
										value={exForm.amount || ''}
										onValueChange={v => setExForm(f => ({ ...f, amount: v }))}
										placeholder="1000000"
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Tanggal efektif</label>
									<input
										type="date"
										required
										value={exForm.effective_date}
										onChange={e => setExForm(f => ({ ...f, effective_date: e.target.value }))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Tanggal berakhir (opsional)</label>
									<input
										type="date"
										value={exForm.end_date}
										onChange={e => setExForm(f => ({ ...f, end_date: e.target.value }))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Status</label>
									<select
										value={exForm.status}
										onChange={e =>
											setExForm(f => ({
												...f,
												status: e.target.value as PayrollComponent['status'],
											}))
										}
										className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									>
										<option value="Active">Active</option>
										<option value="Inactive">Inactive</option>
										<option value="Draft">Draft</option>
									</select>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-semibold text-slate-600">Keterangan (opsional)</label>
									<input
											value={exForm.description}
										onChange={e => setExForm(f => ({ ...f, description: e.target.value }))}
										placeholder="Bonus akhir kontrak"
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-green-200 focus:ring-2"
									/>
								</div>
								<div className="space-y-1.5 md:col-span-2">
									<label className="text-xs font-semibold text-slate-600">
										Pilih karyawan resign ({exForm.employeeIds.length} dipilih)
									</label>
									{exEmployees.length === 0 ? (
										<p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
											Belum ada karyawan dengan status nonaktif. Ubah status karyawan menjadi
											Nonaktif di direktori karyawan terlebih dahulu.
										</p>
									) : (
										<div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5">
											{exEmployees.map(emp => (
												<label
													key={emp.id}
													className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-white"
												>
												<input
														type="checkbox"
													checked={exForm.employeeIds.includes(emp.id)}
													onChange={() => toggleExEmp(emp.id)}
														className="size-4 accent-[hsl(var(--primary))]"
												/>
												<span className="font-medium text-slate-800">{emp.name}</span>
												{emp.position ? (
													<span className="text-xs text-slate-500">{emp.position}</span>
												) : null}
											</label>
										))}
									</div>
									)}
								</div>
								<div className="flex items-center gap-2 md:col-span-2">
									<button
										type="submit"
										disabled={exSaving}
										className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
									>
										{exSaving ? 'Menyimpan…' : 'Simpan tunjangan'}
									</button>
									<button
										type="button"
										onClick={() => setShowExForm(false)}
										className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
									>
										Batal
									</button>
								</div>
							</form>
						) : null}

						<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
							<table className="w-full text-left text-sm">
								<thead>
									<tr className="border-b bg-slate-50 text-xs uppercase text-slate-500">
										<th className="px-3 py-2.5">Transaction ID</th>
										<th className="px-3 py-2.5">Karyawan resign</th>
										<th className="px-3 py-2.5">Komponen</th>
										<th className="px-3 py-2.5">Jumlah</th>
										<th className="px-3 py-2.5">Efektif</th>
										<th className="px-3 py-2.5">Status</th>
										<th className="px-3 py-2.5 text-right">Aksi</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{exAllowances.length === 0 ? (
										<tr>
											<td colSpan={7} className="px-3 py-8 text-center text-slate-500">
												Belum ada tunjangan untuk karyawan resign.
											</td>
											</tr>
									) : (
										exAllowances.map(item => (
											<tr key={item.id} className="hover:bg-slate-50/60">
												<td className="px-3 py-2.5 font-mono text-xs text-slate-600">
													{item.transaction_id}
												</td>
												<td className="px-3 py-2.5">
													{(item.employees || []).map(exEmpName).join(', ') || '—'}
												</td>
												<td className="px-3 py-2.5 font-medium">{item.component_name}</td>
												<td className="px-3 py-2.5">{formatRupiah(item.amount || 0)}</td>
												<td className="px-3 py-2.5 text-slate-600">
													{formatDate(item.effective_date)}
												</td>
												<td className="px-3 py-2.5">
													<span
														className={cn(
															'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
															item.status === 'Active' && 'bg-green-100 text-green-700',
															item.status === 'Inactive' && 'bg-slate-100 text-slate-600',
															item.status === 'Draft' && 'bg-amber-100 text-amber-800',
														)}
													>
														{item.status}
													</span>
												</td>
												<td className="px-3 py-2.5 text-right">
													<div className="inline-flex items-center gap-1.5">
														<button
															type="button"
															onClick={() => setStatus(item, item.status === 'Active' ? 'Inactive' : 'Active')}
															className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
														>
															{item.status === 'Active' ? 'Nonaktifkan' : 'Aktifkan'}
														</button>
														<button
															type="button"
															onClick={() => remove(item)}
															className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
														>
															Hapus
														</button>
													</div>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</div>
				) : null}

				{sideNav === 'settings' ? (
					<div className="p-8">
						<div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
							<div className="mb-4 flex items-center gap-2">
								<Settings className="size-5 text-primary" />
								<h2 className="text-lg font-bold text-slate-900">Component settings</h2>
							</div>
							<ul className="space-y-3 text-sm text-slate-600">
								<li className="flex items-start gap-2">
									<span className="mt-1 size-1.5 shrink-0 rounded-full bg-green-500" />
									Tipe komponen: Adjustment, Allowance, Deduction, Overtime.
								</li>
								<li className="flex items-start gap-2">
									<span className="mt-1 size-1.5 shrink-0 rounded-full bg-green-500" />
									Status Active diterapkan pada perhitungan slip gaji periode berjalan.
								</li>
								<li className="flex items-start gap-2">
									<span className="mt-1 size-1.5 shrink-0 rounded-full bg-green-500" />
									Transaction ID digenerate otomatis (YYYYMMDD + urutan).
								</li>
							</ul>
						</div>
					</div>
				) : null}
			</div>

			{descOpen ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
					onClick={() => setDescOpen(null)}
					onKeyDown={e => e.key === 'Escape' && setDescOpen(null)}
					role="presentation"
				>
					<div
						className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
						onClick={e => e.stopPropagation()}
						role="dialog"
						aria-modal="true"
					>
						<div className="mb-3 flex items-center justify-between">
							<h3 className="font-bold text-slate-900">Description</h3>
							<button
								type="button"
								onClick={() => setDescOpen(null)}
								className="text-slate-400 hover:text-slate-700"
								aria-label="Tutup"
							>
								<MoreHorizontal className="size-4 rotate-90" />
							</button>
						</div>
						<p className="text-sm text-slate-600 whitespace-pre-wrap">
							{descOpen.description || '—'}
						</p>
						<p className="mt-4 text-xs text-slate-400">
							{descOpen.transaction_id} · {descOpen.component_name}
						</p>
					</div>
				</div>
			) : null}

			{detailOpen ? (
				<div
					className="fixed inset-0 z-50 overflow-y-auto bg-slate-100/95"
					role="dialog"
					aria-modal="true"
					aria-labelledby="component-detail-title"
				>
					<div className="mx-auto min-h-full max-w-6xl bg-white px-6 py-6 shadow-sm sm:px-10 sm:py-8">
						<div className="mb-6 flex items-center justify-between gap-3">
							<h3
								id="component-detail-title"
								className="text-lg font-bold text-slate-900"
							>
								Rincian komponen
							</h3>
							<button
								type="button"
								onClick={() => setDetailOpen(null)}
								className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
							>
								Tutup
							</button>
						</div>

						{/* Meta fields — label left, value right */}
						<div className="max-w-xl space-y-3.5 text-sm">
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">Status</span>
								<span>
									<span
										className={cn(
											'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
											detailOpen.status === 'Active' && 'bg-green-100 text-green-700',
											detailOpen.status === 'Inactive' && 'bg-slate-100 text-slate-600',
											detailOpen.status === 'Draft' && 'bg-amber-100 text-amber-800',
										)}
									>
										{detailOpen.status}
									</span>
								</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">Transaction ID</span>
								<span className="font-medium text-slate-800">{detailOpen.transaction_id}</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">Type</span>
								<span className="font-medium text-slate-800">{detailOpen.type}</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-start gap-3">
								<span className="text-slate-500">Description</span>
								<span className="font-medium uppercase text-slate-800">
									{detailOpen.description || detailOpen.component_name || '—'}
								</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">Effective date</span>
								<span className="font-medium text-slate-800">
									{detailOpen.effective_date ? formatDate(detailOpen.effective_date) : '—'}
								</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">End date</span>
								<span className="font-medium text-slate-800">
									{detailOpen.end_date ? formatDate(detailOpen.end_date) : '—'}
								</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">Backpay date</span>
								<span className="font-medium text-slate-800">—</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">Created by</span>
								<span className="font-medium uppercase text-slate-800">
									{detailOpen.created_by_name || '—'}
								</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">Create at</span>
								<span className="font-medium text-slate-800">
									{detailOpen.created
										? new Date(detailOpen.created).toLocaleString('en-GB', {
												day: '2-digit',
												month: 'short',
												year: 'numeric',
												hour: '2-digit',
												minute: '2-digit',
												second: '2-digit',
												hour12: false,
											}).replace(',', '.')
										: '—'}
								</span>
							</div>
							<div className="grid grid-cols-[140px_1fr] items-center gap-3">
								<span className="text-slate-500">Attachment</span>
								<span className="font-medium text-slate-800">—</span>
							</div>
						</div>

						{/* Updated employee component */}
						<div className="mt-10 border-t border-slate-200 pt-6">
							<h4 className="mb-4 text-base font-bold text-slate-900">
								Updated employee component
							</h4>

							<div className="mb-4 flex flex-wrap items-center gap-2">
								<button
									type="button"
									className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600"
								>
									All components
									<ChevronDown className="size-3.5 text-slate-400" />
								</button>
								<button
									type="button"
									className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600"
								>
									All type
									<ChevronDown className="size-3.5 text-slate-400" />
								</button>
								<div className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
									<Search className="size-4 text-slate-400" />
									<span className="text-sm text-slate-400">Search...</span>
								</div>
							</div>

							<div className="overflow-x-auto rounded-xl border border-slate-200">
								<table className="w-full min-w-[640px] text-left text-sm">
									<thead>
										<tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-slate-500">
											<th className="px-4 py-3">
												<span className="inline-flex items-center gap-1">
													Employee name
													<ArrowUpDown className="size-3" />
												</span>
											</th>
											<th className="px-4 py-3">Component</th>
											<th className="px-4 py-3">Type</th>
											<th className="px-4 py-3 text-right">Current amount</th>
											<th className="px-4 py-3 text-right">New amount</th>
										</tr>
									</thead>
									<tbody>
										{Array.isArray(detailOpen.employees) && detailOpen.employees.length > 0 ? (
											detailOpen.employees.map(empId => {
												const emp = employees.find(e => e.id === empId);
												let currentAmount = 0;
												if (detailOpen.type === 'Salary') {
													currentAmount = emp?.basic_salary ?? 0;
												} else if (detailOpen.type === 'Deduction') {
													currentAmount = 0;
												} else {
													currentAmount = emp?.other_allowance ?? 0;
												}
												const newAmount = detailOpen.amount || 0;
												const initials = (emp?.name || '?')
													.split(/\s+/)
													.slice(0, 2)
													.map(p => p[0]?.toUpperCase() || '')
													.join('');
												const typeLabel =
													detailOpen.type === 'Deduction'
														? 'Deduction'
														: detailOpen.type === 'Salary'
															? 'Salary'
															: detailOpen.type === 'Overtime'
																? 'Overtime'
																: 'Allowance';
												return (
													<tr
														key={empId}
														className="border-b border-slate-100 last:border-0"
													>
														<td className="px-4 py-3">
															<div className="flex items-center gap-3">
																<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
																	{initials || '?'}
																</span>
																<div>
																	<p className="font-semibold uppercase text-slate-800">
																		{emp?.name || empId}
																	</p>
																	<p className="text-xs text-slate-400">
																		{emp?.id?.slice(0, 10) || '—'}
																	</p>
																</div>
															</div>
														</td>
														<td className="px-4 py-3 text-slate-700">
															{detailOpen.component_name || '—'}
														</td>
														<td className="px-4 py-3 text-slate-700">{typeLabel}</td>
														<td className="px-4 py-3 text-right font-medium text-slate-800">
															{formatRupiah(currentAmount)}
														</td>
														<td className="px-4 py-3 text-right font-medium text-slate-800">
															{formatRupiah(newAmount)}
														</td>
													</tr>
												);
											})
										) : (
											<tr>
												<td
													colSpan={5}
													className="px-4 py-10 text-center text-sm text-slate-500"
												>
													Tidak ada karyawan terhubung.
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>

							<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
								<span>
									Rows per page{' '}
									<span className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 font-medium text-slate-700">
										5 <ChevronDown className="size-3" />
									</span>{' '}
									Showing 1 -{' '}
									{Array.isArray(detailOpen.employees) ? detailOpen.employees.length : 0} of{' '}
									{Array.isArray(detailOpen.employees) ? detailOpen.employees.length : 0}
								</span>
								<span className="inline-flex items-center gap-1">
									<span className="rounded border border-green-300 bg-green-50 px-2 py-0.5 font-semibold text-green-700">
										1
									</span>
									of 1 page
								</span>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
