import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, type Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import { ROLE_OPTIONS, type MemberRole } from '@/data/user-roles';
import {
	ASSIGNMENT_TYPE_LABELS,
	ELIGIBILITY_TYPE_LABELS,
	assignmentLabel,
	eligibilityLabel,
	emptyReimbursementSetting,
	indexSaldos,
	normalizeLevelLimits,
	saldoTracked,
	type ReimbursementAssignmentType,
	type ReimbursementEligibilityType,
	type ReimbursementSaldo,
	type ReimbursementSetting,
} from '@/lib/reimbursement-settings';
import { cn } from '@/lib/utils';
import { AmountInput } from '@/components/ui/amount-input';
import { mergeLevelOptions, useJobLevels } from '@/lib/job-levels';

interface ReimbursementSettingsManagerProps {
	company: Company;
}

export function ReimbursementSettingsManager({ company }: ReimbursementSettingsManagerProps) {
	const [settings, setSettings] = useState<ReimbursementSetting[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [saldos, setSaldos] = useState<Record<string, ReimbursementSaldo>>({});
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState(emptyReimbursementSetting());
	const { levels: jobLevels } = useJobLevels(company.id);
	const levelOptions = useMemo(
		() => mergeLevelOptions(jobLevels, Object.keys(form.level_limits ?? {})),
		[jobLevels, form.level_limits],
	);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const filter = pb.filter('company = {:company}', { company: company.id });
			const [list, emps] = await Promise.all([
				pb.collection('reimbursement_settings').getFullList<ReimbursementSetting>({
					filter,
					sort: '-created',
					expand: 'assigned_employees',
					requestKey: `reimb-settings-list-${company.id}`,
				}),
				pb.collection('employees').getFullList<Employee>({
					filter,
					sort: 'name',
					requestKey: `reimb-settings-emps-${company.id}`,
				}),
			]);
			setSettings(list);
			setEmployees(emps);
		} catch {
			setSettings([]);
			setEmployees([]);
		} finally {
			setLoading(false);
		}
		try {
			const res = await fetch('/api/reimbursement-saldo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ companyId: company.id }),
			});
			if (res.ok) {
				const data = (await res.json()) as { saldos?: { settingId: string; budget: number; used: number; remaining: number }[] };
				setSaldos(indexSaldos(data.saldos));
			} else {
				setSaldos({});
			}
		} catch {
			setSaldos({});
		}
	}, [company.id]);

	useEffect(() => {
		refresh().catch(() => toast.error('Gagal memuat pengaturan reimbursement.'));
	}, [refresh]);

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyReimbursementSetting());
		setShowForm(true);
	};

	const openEdit = (rec: ReimbursementSetting) => {
		setEditingId(rec.id);
		setForm({
			name: rec.name || '',
			description: rec.description || '',
			amount_limit: rec.amount_limit || 0,
			budget: rec.budget || 0,
			assignment_type: rec.assignment_type || 'all',
			assigned_employees: Array.isArray(rec.assigned_employees) ? rec.assigned_employees : [],
			assigned_roles: Array.isArray(rec.assigned_roles) ? rec.assigned_roles : [],
			eligibility_type: rec.eligibility_type || 'immediate',
			probation_months: rec.probation_months ?? 3,
			effective_date: (rec.effective_date || '').slice(0, 10),
			active: rec.active !== false,
			level_limits: normalizeLevelLimits(rec.level_limits),
		});
		setShowForm(true);
	};

	const remove = async (rec: ReimbursementSetting) => {
		if (!window.confirm(`Hapus jenis reimbursement "${rec.name}"? Pengajuan yang sudah ada tidak terpengaruh.`)) {
			return;
		}
		try {
			await pb.collection('reimbursement_settings').delete(rec.id);
			toast.success('Jenis reimbursement dihapus.');
			await refresh();
		} catch {
			toast.error('Gagal menghapus jenis reimbursement.');
		}
	};

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.name.trim()) {
			toast.error('Nama jenis reimbursement wajib diisi.');
			return;
		}
		if (form.assignment_type === 'employees' && form.assigned_employees.length === 0) {
			toast.error('Pilih minimal satu karyawan untuk penugasan.');
			return;
		}
		if (form.assignment_type === 'role' && form.assigned_roles.length === 0) {
			toast.error('Pilih minimal satu role untuk penugasan.');
			return;
		}
		if (form.eligibility_type === 'after_date' && !form.effective_date) {
			toast.error('Tanggal mulai eligibility wajib diisi.');
			return;
		}
		setSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const payload = {
				company: company.id,
				name: form.name.trim(),
				description: form.description.trim(),
				amount_limit: Number(form.amount_limit) || 0,
				budget: Number(form.budget) || 0,
				assignment_type: form.assignment_type,
				assigned_employees: form.assignment_type === 'employees' ? form.assigned_employees : [],
				assigned_roles: form.assignment_type === 'role' ? form.assigned_roles : [],
				eligibility_type: form.eligibility_type,
				probation_months: form.eligibility_type === 'after_probation' ? Number(form.probation_months) || 0 : 0,
				effective_date: form.eligibility_type === 'after_date' ? form.effective_date : '',
				active: Boolean(form.active),
				level_limits: form.level_limits ?? {},
				owner: ownerId,
			};
			if (editingId) {
				await pb.collection('reimbursement_settings').update(editingId, payload);
				toast.success('Pengaturan reimbursement diperbarui.');
			} else {
				await pb.collection('reimbursement_settings').create(payload);
				toast.success('Jenis reimbursement ditambahkan.');
			}
			setShowForm(false);
			setEditingId(null);
			await refresh();
		} catch {
			toast.error('Gagal menyimpan pengaturan reimbursement.');
		} finally {
			setSaving(false);
		}
	};

	const toggleEmployee = (id: string) => {
		setForm(f => ({
			...f,
			assigned_employees: f.assigned_employees.includes(id)
				? f.assigned_employees.filter(x => x !== id)
				: [...f.assigned_employees, id],
		}));
	};

	const toggleRole = (role: MemberRole) => {
		setForm(f => ({
			...f,
			assigned_roles: f.assigned_roles.includes(role)
				? f.assigned_roles.filter(x => x !== role)
				: [...f.assigned_roles, role],
		}));
	};

	const [levelLimitInput, setLevelLimitInput] = useState({ level: '', amount: 0 });

	const addLevelLimit = () => {
		const level = levelLimitInput.level.trim();
		if (!level) {
			toast.error('Nama level wajib diisi.');
			return;
		}
		setForm(f => ({
			...f,
			level_limits: { ...(f.level_limits ?? {}), [level]: Number(levelLimitInput.amount) || 0 },
		}));
		setLevelLimitInput({ level: '', amount: 0 });
	};

	const updateLevelLimit = (level: string, amount: number) => {
		setForm(f => ({
			...f,
			level_limits: { ...(f.level_limits ?? {}), [level]: amount },
		}));
	};

	const removeLevelLimit = (level: string) => {
		setForm(f => ({
			...f,
			level_limits: Object.fromEntries(
				Object.entries(f.level_limits ?? {}).filter(([k]) => k !== level),
			),
		}));
	};

	const activeCount = useMemo(() => settings.filter(s => s.active !== false).length, [settings]);

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-xl font-bold tracking-tight text-slate-900">Aturan Reimbursement</h2>
					<p className="text-sm text-muted-foreground">
						Tentukan jenis reimbursement, siapa yang berhak mengajukan, batas nominal, dan kapan
						eligibility berlaku (mis. setelah masa probation). Pengajuan yang sudah ada tidak terpengaruh.
					</p>
				</div>
				<button
					type="button"
					onClick={openCreate}
					className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
				>
					<Plus className="size-4" /> Tambah Jenis
				</button>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<StatCard label="Total Jenis" value={String(settings.length)} />
				<StatCard label="Aktif" value={String(activeCount)} tone="emerald" />
				<StatCard label="Nonaktif" value={String(settings.length - activeCount)} tone="muted" />
			</div>

			{showForm ? (
				<form
					onSubmit={submit}
					className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft-sm"
				>
					<div className="flex items-center justify-between">
						<h3 className="text-base font-bold">
							{editingId ? 'Ubah Jenis Reimbursement' : 'Jenis Reimbursement Baru'}
						</h3>
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
							}}
							className="text-muted-foreground hover:text-foreground"
						>
							<X className="size-4" />
						</button>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">Nama jenis <span className="text-destructive">*</span></span>
							<input
								required
								value={form.name}
								onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
								placeholder="mis. Transport, Makan, Kesehatan"
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							/>
						</label>
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">Batas nominal per pengajuan</span>
							<AmountInput
								value={form.amount_limit}
								onValueChange={v => setForm(f => ({ ...f, amount_limit: v }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3 text-right"
							/>
							<p className="mt-1 text-xs text-muted-foreground">0 = tanpa batas nominal.</p>
						</label>
					</div>

					<div className="rounded-xl border border-border bg-background p-4">
					<p className="text-sm font-medium">Total saldo per jenis (alokasi benefit)</p>
					<p className="text-xs text-muted-foreground">
						Total anggaran untuk jenis reimbursement ini di seluruh perusahaan. Sisa saldo
						berkurang setiap kali ada pengajuan (kecuali yang ditolak). 0 = tanpa pelacakan saldo.
					</p>
					<div className="mt-3">
						<AmountInput
							value={form.budget}
							onValueChange={v => setForm(f => ({ ...f, budget: v }))}
							className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-right"
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							{Number(form.budget) > 0
								? `Saldo total ${formatRupiah(Number(form.budget))} akan dilacak; pengajuan ditolak bila melebihi sisa saldo.`
								: 'Saldo tidak dilacak. Pengajuan tetap dibatasi oleh batas nominal per pengajuan di atas.'}
						</p>
					</div>
				</div>

				{/* Batas nominal per level karyawan */}
					<div className="rounded-xl border border-border bg-background p-4">
						<div>
							<p className="text-sm font-medium">Batas nominal per level</p>
							<p className="text-xs text-muted-foreground">
								Atur batas berbeda per tingkat karyawan (mis. Manager Rp1.000.000, Staff Rp500.000).
								Level diatur pada data karyawan. Jika level karyawan tidak punya batas khusus, memakai batas umum di atas.
							</p>
						</div>
						<div className="mt-3 flex flex-wrap items-end gap-2">
							<label className="block text-sm">
								<span className="mb-1.5 block font-medium">Nama level</span>
								<select
									value={levelLimitInput.level}
									onChange={e => setLevelLimitInput(s => ({ ...s, level: e.target.value }))}
									className="h-10 w-44 rounded-lg border border-input bg-background px-3"
								>
									<option value="">Pilih level…</option>
									{levelOptions.map(opt => (
										<option key={opt} value={opt}>{opt}</option>
									))}
								</select>
								<p className="mt-1 text-xs text-muted-foreground">Kelola daftar level di Pengaturan → Kontak.</p>
							</label>
							<label className="block text-sm">
								<span className="mb-1.5 block font-medium">Batas nominal</span>
								<AmountInput
									value={levelLimitInput.amount}
									onValueChange={v => setLevelLimitInput(s => ({ ...s, amount: v }))}
									className="h-10 w-40 rounded-lg border border-input bg-background px-3 text-right"
								/>
							</label>
							<button
								type="button"
								onClick={addLevelLimit}
								className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
							>
								Tambah
							</button>
						</div>
						{Object.keys(form.level_limits ?? {}).length > 0 ? (
							<div className="mt-3 divide-y divide-border rounded-lg border border-border">
								{Object.entries(form.level_limits ?? {}).map(([level, amount]) => (
									<div key={level} className="flex items-center gap-3 px-3 py-2 text-sm">
										<span className="min-w-0 flex-1 font-medium">{level}</span>
										<AmountInput
											value={Number(amount) || 0}
											onValueChange={v => updateLevelLimit(level, v)}
											className="h-9 w-40 rounded-lg border border-input bg-background px-3 text-right"
										/>
										<button
											type="button"
											onClick={() => removeLevelLimit(level)}
											aria-label="Hapus"
											className="border border-border p-1 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
										>
											<X className="size-3.5" />
										</button>
									</div>
								))}
							</div>
						) : (
							<p className="mt-3 text-xs text-muted-foreground">Belum ada batas per level. Semua karyawan memakai batas umum.</p>
						)}
					</div>

					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Keterangan</span>
						<textarea
							rows={2}
							value={form.description}
							onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
							placeholder="Ketentuan reimbursement…"
							className="w-full rounded-lg border border-input bg-background px-3 py-2"
						/>
					</label>

					<div className="grid gap-4 md:grid-cols-2">
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">Berlaku untuk</span>
							<select
								value={form.assignment_type}
								onChange={e => setForm(f => ({ ...f, assignment_type: e.target.value as ReimbursementAssignmentType }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							>
								{(['all', 'employees', 'role'] as ReimbursementAssignmentType[]).map(t => (
									<option key={t} value={t}>{ASSIGNMENT_TYPE_LABELS[t]}</option>
								))}
							</select>
						</label>
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">Eligibility</span>
							<select
								value={form.eligibility_type}
								onChange={e => setForm(f => ({ ...f, eligibility_type: e.target.value as ReimbursementEligibilityType }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							>
								{(['immediate', 'after_probation', 'after_date'] as ReimbursementEligibilityType[]).map(t => (
									<option key={t} value={t}>{ELIGIBILITY_TYPE_LABELS[t]}</option>
								))}
							</select>
						</label>
					</div>

					{form.assignment_type === 'employees' ? (
						<div className="rounded-xl border border-border bg-background p-3">
							<p className="mb-2 text-sm font-medium">Pilih karyawan</p>
							<div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
								{employees.length === 0 ? (
									<p className="px-3 py-6 text-center text-sm text-muted-foreground">
										Belum ada karyawan di perusahaan ini.
									</p>
								) : (
									employees.map(emp => {
										const checked = form.assigned_employees.includes(emp.id);
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
													onChange={() => toggleEmployee(emp.id)}
													className="size-4 rounded border-border text-primary accent-primary"
												/>
												<span className="min-w-0 flex-1">
													<span className="font-medium text-foreground">{emp.name}</span>
													{emp.position ? (
														<span className="block text-xs text-muted-foreground">{emp.position}</span>
													) : null}
												</span>
											</label>
										);
									})
								)}
							</div>
							<p className="mt-2 text-xs text-muted-foreground">{form.assigned_employees.length} karyawan dipilih.</p>
						</div>
					) : null}

					{form.assignment_type === 'role' ? (
						<div className="rounded-xl border border-border bg-background p-3">
							<p className="mb-2 text-sm font-medium">Pilih role</p>
							<div className="flex flex-wrap gap-2">
								{ROLE_OPTIONS.map(opt => {
									const checked = form.assigned_roles.includes(opt.value);
									return (
										<button
											key={opt.value}
											type="button"
											onClick={() => toggleRole(opt.value)}
											className={cn(
												'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
												checked
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-border bg-background text-foreground hover:bg-muted/60',
											)}
										>
											{opt.label}
										</button>
									);
								})}
							</div>
						</div>
					) : null}

					{form.eligibility_type === 'after_probation' ? (
						<label className="block max-w-xs text-sm">
							<span className="mb-1.5 block font-medium">Masa probation (bulan)</span>
							<input
								type="number"
								min={0}
								value={form.probation_months}
								onChange={e => setForm(f => ({ ...f, probation_months: Number(e.target.value) }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								Eligibility berlaku setelah sekian bulan dari tanggal bergabung karyawan.
							</p>
						</label>
					) : null}

					{form.eligibility_type === 'after_date' ? (
						<label className="block max-w-xs text-sm">
							<span className="mb-1.5 block font-medium">Tanggal mulai berlaku</span>
							<input
								type="date"
								value={(form.effective_date || '').slice(0, 10)}
								onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							/>
						</label>
					) : null}

					<label className="flex items-center gap-2 text-sm font-medium">
						<input
							type="checkbox"
							checked={form.active}
							onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
							className="size-4 rounded border-border text-primary accent-primary"
						/>
						Aktif (tersedia untuk diajukan karyawan)
					</label>

					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
							}}
							className="h-10 rounded-lg border border-border px-4 text-sm font-medium"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={saving}
							className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
						>
							{saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah'}
						</button>
					</div>
				</form>
			) : null}

			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				{loading ? (
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">Memuat…</p>
				) : settings.length === 0 ? (
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">
						Belum ada jenis reimbursement. Klik &quot;Tambah Jenis&quot; untuk membuat aturan pertama.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[860px] text-left text-sm">
							<thead>
								<tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
									<th className="px-4 py-3 font-semibold">Jenis</th>
									<th className="px-4 py-3 font-semibold">Berlaku untuk</th>
									<th className="px-4 py-3 font-semibold">Eligibility</th>
									<th className="px-4 py-3 text-right font-semibold">Batas Nominal</th>
									<th className="px-4 py-3 font-semibold">Status</th>
									<th className="px-4 py-3 text-right font-semibold">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{settings.map(s => (
									<tr key={s.id} className="hover:bg-muted/30">
										<td className="px-4 py-3">
											<p className="font-medium">{s.name}</p>
											{s.description ? (
												<p className="text-xs text-muted-foreground">{s.description}</p>
											) : null}
										</td>
										<td className="px-4 py-3 text-muted-foreground">
											<span className="block text-xs font-semibold text-foreground">
												{ASSIGNMENT_TYPE_LABELS[s.assignment_type]}
											</span>
											{assignmentLabel(s)}
										</td>
										<td className="px-4 py-3 text-muted-foreground">{eligibilityLabel(s)}</td>
										<td className="px-4 py-3 text-right">
											{s.amount_limit ? formatRupiah(s.amount_limit) : '—'}{saldoTracked(saldos[s.id]) ? (<><span className="block text-xs font-normal text-emerald-700">Sisa saldo {formatRupiah(saldos[s.id].remaining)}</span><span className="block text-xs font-normal text-muted-foreground">dari {formatRupiah(saldos[s.id].budget)} · terpakai {formatRupiah(saldos[s.id].used)}</span></>) : null}
											{Object.keys(s.level_limits ?? {}).length > 0 ? (
												<span className="block text-xs font-normal text-muted-foreground">
													+{Object.keys(s.level_limits ?? {}).length} level
												</span>
											) : null}
										</td>
										<td className="px-4 py-3">
											<span
												className={cn(
													'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
													s.active !== false
														? 'bg-emerald-100 text-emerald-800'
														: 'bg-slate-100 text-slate-600',
												)}
											>
												{s.active !== false ? 'Aktif' : 'Nonaktif'}
											</span>
										</td>
										<td className="px-4 py-3 text-right">
											<div className="flex justify-end gap-1">
												<button
													type="button"
													onClick={() => openEdit(s)}
													aria-label="Ubah"
													className="border border-border p-1 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
												>
													<Pencil className="size-3.5" />
												</button>
												<button
													type="button"
													onClick={() => remove(s)}
													aria-label="Hapus"
													className="border border-primary/30 p-1 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
												>
													<Trash2 className="size-3.5" />
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

function StatCard({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: 'emerald' | 'muted';
}) {
	return (
		<div
			className={cn(
				'rounded-2xl border border-border bg-card p-4 shadow-soft-sm',
				tone === 'emerald' && 'border-emerald-200 bg-emerald-50/60',
				tone === 'muted' && 'opacity-80',
			)}
		>
			<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className="mt-1 text-lg font-extrabold tracking-tight">{value}</p>
		</div>
	);
}
