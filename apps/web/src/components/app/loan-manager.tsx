import { useCallback, useEffect, useMemo, useState } from 'react';
import { HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, todayIso, type Account, type Company } from '@/lib/accounting';
import {
	LOAN_STATUS_LABELS,
	loanBalance,
	loanInstallment,
	type Employee,
	type EmployeeLoan,
	type LoanStatus,
} from '@/lib/payroll';
import { cn } from '@/lib/utils';

interface LoanManagerProps {
	company: Company;
}

const emptyLoan = (): Partial<EmployeeLoan> => ({
	employee: '',
	principal: 0,
	installments: 1,
	installment_amount: 0,
	disbursed_date: todayIso(),
	description: '',
	status: 'active',
});

function findAccountByCode(accounts: Account[], code: string): Account | undefined {
	return accounts.find(account => account.code === code);
}

export function LoanManager({ company }: LoanManagerProps) {
	const [loans, setLoans] = useState<EmployeeLoan[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<Partial<EmployeeLoan>>(emptyLoan());
	const [disburseJournal, setDisburseJournal] = useState(false);
	const [cashAccount, setCashAccount] = useState('');
	const [saving, setSaving] = useState(false);

	const ownerId = pb.authStore.record?.id ?? '';

	const refreshLoans = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('employee_loans').getFullList<EmployeeLoan>({
			filter,
			sort: '-disbursed_date,-created',
			expand: 'employee',
		});
		setLoans(list);
	}, [company.id]);

	const refreshEmployees = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('employees').getFullList<Employee>({
			filter,
			sort: 'name',
		});
		setEmployees(list);
	}, [company.id]);

	const refreshAccounts = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const list = await pb.collection('accounts').getFullList<Account>({
			filter,
			sort: 'code',
		});
		setAccounts(list);
		const bank = findAccountByCode(list, '102') ?? findAccountByCode(list, '101');
		setCashAccount(prev => (prev && list.some(a => a.id === prev) ? prev : bank?.id ?? ''));
	}, [company.id]);

	useEffect(() => {
		refreshLoans().catch(() => toast.error('Gagal memuat data pinjaman.'));
		refreshEmployees().catch(() => {});
		refreshAccounts().catch(() => {});
	}, [refreshLoans, refreshEmployees, refreshAccounts]);

	const cashAccounts = useMemo(
		() => accounts.filter(account => account.type === 'aset' && /kas|bank/i.test(account.name)),
		[accounts],
	);

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyLoan());
		setDisburseJournal(false);
		setShowForm(true);
	};

	const openEdit = (loan: EmployeeLoan) => {
		setEditingId(loan.id);
		setForm({ ...loan });
		setDisburseJournal(false);
		setShowForm(true);
	};

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!form.employee) {
			toast.error('Pilih karyawan peminjam.');
			return;
		}
		if (!form.principal || form.principal <= 0) {
			toast.error('Jumlah pinjaman harus lebih dari 0.');
			return;
		}
		if (!form.installments || form.installments < 1) {
			toast.error('Jumlah cicilan minimal 1.');
			return;
		}
		if (disburseJournal && !cashAccount) {
			toast.error('Pilih akun kas/bank untuk pencairan pinjaman.');
			return;
		}
		setSaving(true);
		try {
			const installment = loanInstallment(form as EmployeeLoan);
			const payload = {
				company: company.id,
				employee: form.employee,
				principal: Number(form.principal) || 0,
				installments: Number(form.installments) || 1,
				installment_amount: Number(form.installment_amount) || 0,
				disbursed_date: form.disbursed_date,
				paid_installments: Number(form.paid_installments) || 0,
				paid_amount: Number(form.paid_amount) || 0,
				status: form.status ?? 'active',
				description: form.description ?? '',
				owner: ownerId,
			};
			if (editingId) {
				await pb.collection('employee_loans').update(editingId, payload);
				toast.success('Pinjaman diperbarui.');
			} else {
				const loan = await pb.collection('employee_loans').create<EmployeeLoan>(payload);
				if (disburseJournal) {
					const piutang = findAccountByCode(accounts, '206');
					const cash = accounts.find(a => a.id === cashAccount);
					if (piutang && cash) {
						const base = {
							company: company.id,
							date: form.disbursed_date,
							description: form.description || `Pencairan pinjaman ${loan.expand?.employee?.name ?? ''}`,
							owner: ownerId,
						};
						await pb.collection('entries').create(
							{ ...base, account: piutang.id, debit: payload.principal, credit: 0 },
							{ requestKey: `loan-disburse-debit-${loan.id}` },
						);
						await pb.collection('entries').create(
							{ ...base, account: cash.id, debit: 0, credit: payload.principal },
							{ requestKey: `loan-disburse-cash-${loan.id}` },
						);
					}
				}
				toast.success('Pinjaman dicatat. Angsuran/bulan: ' + formatRupiah(installment));
			}
			setShowForm(false);
			setEditingId(null);
			await refreshLoans();
		} catch {
			toast.error('Gagal menyimpan pinjaman.');
		} finally {
			setSaving(false);
		}
	};

	const remove = async (loan: EmployeeLoan) => {
		if (!window.confirm(`Hapus pinjaman ${loan.expand?.employee?.name ?? ''}?`)) return;
		try {
			await pb.collection('employee_loans').delete(loan.id);
			await refreshLoans();
			toast.success('Pinjaman dihapus.');
		} catch {
			toast.error('Gagal menghapus pinjaman.');
		}
	};

	const activeEmployees = employees.filter(emp => emp.status === 'aktif');
	const totalOutstanding = loans.reduce((sum, l) => sum + loanBalance(l), 0);

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-bold tracking-tight">Pinjaman Karyawan</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Catat pinjaman karyawan. Angsuran bulanan otomatis dipotong dari slip gaji saat membuat periode penggajian.
					</p>
				</div>
				{!showForm ? (
					<button
						type="button"
						onClick={openCreate}
						className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						<Plus className="size-4" /> Tambah Pinjaman
					</button>
				) : null}
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<SummaryCard label="Total Pinjaman" value={formatRupiah(loans.reduce((s, l) => s + (l.principal || 0), 0))} />
				<SummaryCard label="Total Dibayar" value={formatRupiah(loans.reduce((s, l) => s + (l.paid_amount || 0), 0))} muted />
				<SummaryCard label="Sisa Tagihan" value={formatRupiah(totalOutstanding)} accent />
			</div>

			{showForm ? (
				<form
					onSubmit={submit}
					className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft-sm"
				>
					<div className="grid gap-4 md:grid-cols-3">
						<div className="space-y-2 md:col-span-1">
							<label htmlFor="loan-emp" className="text-xs font-semibold">
								Karyawan <span className="text-destructive">*</span>
							</label>
							<select
								id="loan-emp"
								required
								value={form.employee ?? ''}
								onChange={e => setForm(f => ({ ...f, employee: e.target.value }))}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								<option value="">Pilih karyawan</option>
								{activeEmployees.map(emp => (
									<option key={emp.id} value={emp.id}>
										{emp.name}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<label htmlFor="loan-principal" className="text-xs font-semibold">
								Jumlah Pinjaman <span className="text-destructive">*</span>
							</label>
							<input
								id="loan-principal"
								type="number"
								min="0"
								required
								value={form.principal ?? 0}
								onChange={e => setForm(f => ({ ...f, principal: Number(e.target.value) || 0 }))}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="loan-date" className="text-xs font-semibold">
								Tanggal Pencairan <span className="text-destructive">*</span>
							</label>
							<input
								id="loan-date"
								type="date"
								required
								value={form.disbursed_date ?? todayIso()}
								onChange={e => setForm(f => ({ ...f, disbursed_date: e.target.value }))}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="loan-terms" className="text-xs font-semibold">
								Jumlah Cicilan (bulan) <span className="text-destructive">*</span>
							</label>
							<input
								id="loan-terms"
								type="number"
								min="1"
								required
								value={form.installments ?? 1}
								onChange={e => setForm(f => ({ ...f, installments: Number(e.target.value) || 1 }))}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="loan-inst" className="text-xs font-semibold">
								Angsuran/Bulan (opsional)
							</label>
							<input
								id="loan-inst"
								type="number"
								min="0"
								value={form.installment_amount ?? 0}
								onChange={e => setForm(f => ({ ...f, installment_amount: Number(e.target.value) || 0 }))}
								placeholder="Otomatis: pokok ÷ cicilan"
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="loan-status" className="text-xs font-semibold">
								Status
							</label>
							<select
								id="loan-status"
								value={form.status ?? 'active'}
								onChange={e => setForm(f => ({ ...f, status: e.target.value as LoanStatus }))}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								<option value="active">Aktif</option>
								<option value="completed">Lunas</option>
								<option value="cancelled">Dibatalkan</option>
							</select>
						</div>
						<div className="space-y-2 md:col-span-3">
							<label htmlFor="loan-desc" className="text-xs font-semibold">
								Keterangan
							</label>
							<input
								id="loan-desc"
								value={form.description ?? ''}
								onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
								placeholder="Pinjaman karyawan untuk …"
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
					</div>

					{!editingId ? (
						<div className="space-y-3 rounded-xl bg-secondary px-4 py-3">
							<label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
								<input
									type="checkbox"
									checked={disburseJournal}
									onChange={e => setDisburseJournal(e.target.checked)}
									className="size-4 accent-primary"
								/>
								Catat pencairan ke jurnal (Debit Piutang Pinjaman Karyawan 206, Kredit Kas/Bank)
							</label>
							{disburseJournal ? (
								<div className="space-y-2">
									<label htmlFor="loan-cash" className="text-xs font-semibold">
										Akun kas/bank pencairan
									</label>
									<select
										id="loan-cash"
										value={cashAccount}
										onChange={e => setCashAccount(e.target.value)}
										className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
									>
										<option value="">Pilih akun</option>
										{cashAccounts.map(acc => (
											<option key={acc.id} value={acc.id}>
												{acc.code} — {acc.name}
											</option>
										))}
									</select>
								</div>
							) : null}
						</div>
					) : null}

					<div className="rounded-xl bg-primary/5 px-4 py-3 text-sm">
						Angsuran/bulan dihitung: <span className="font-bold text-primary">{formatRupiah(loanInstallment(form as EmployeeLoan))}</span>
						{' · '}Sisa setelah potongan berjalan: <span className="font-semibold">{formatRupiah(loanBalance(form as EmployeeLoan))}</span>
					</div>

					<div className="flex flex-wrap gap-3">
						<button
							type="submit"
							disabled={saving}
							className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
						>
							{saving ? 'Menyimpan…' : editingId ? 'Simpan Perubahan' : 'Simpan Pinjaman'}
						</button>
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
							}}
							className="rounded-full border border-border px-5 py-2.5 text-sm font-bold transition-colors hover:bg-secondary"
						>
							Batal
						</button>
					</div>
				</form>
			) : null}

			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				<div className="border-b border-border px-5 py-4">
					<h3 className="font-semibold">Daftar Pinjaman</h3>
					<p className="text-sm text-muted-foreground">Total {loans.length} pinjaman tercatat.</p>
				</div>
				{loans.length === 0 ? (
					<p className="px-5 py-8 text-center text-sm text-muted-foreground">
						Belum ada pinjaman. Klik &quot;Tambah Pinjaman&quot; untuk mulai.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[920px] text-left text-sm">
							<thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-5 py-3 font-semibold">Karyawan</th>
									<th className="px-5 py-3 font-semibold">Tanggal</th>
									<th className="px-5 py-3 font-semibold text-right">Pokok</th>
									<th className="px-5 py-3 font-semibold text-center">Cicilan</th>
									<th className="px-5 py-3 font-semibold text-right">Angsuran/Bln</th>
									<th className="px-5 py-3 font-semibold text-right">Dibayar</th>
									<th className="px-5 py-3 font-semibold text-right">Sisa</th>
									<th className="px-5 py-3 font-semibold">Status</th>
									<th className="px-5 py-3 font-semibold text-right">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{loans.map(loan => {
									const balance = loanBalance(loan);
									const installment = loanInstallment(loan);
									const progress = loan.installments
										? Math.min(100, Math.round(((loan.paid_installments || 0) / loan.installments) * 100))
										: 0;
									return (
										<tr key={loan.id} className="transition-colors hover:bg-muted/30">
											<td className="px-5 py-3 font-medium">
												{loan.expand?.employee?.name ?? '—'}
												{loan.description ? (
													<span className="block text-xs text-muted-foreground">{loan.description}</span>
												) : null}
											</td>
											<td className="px-5 py-3 text-muted-foreground">{formatDate(loan.disbursed_date)}</td>
											<td className="px-5 py-3 text-right">{formatRupiah(loan.principal || 0)}</td>
											<td className="px-5 py-3 text-center">
												<div className="space-y-1">
													<span className="text-xs font-semibold">
														{loan.paid_installments || 0}/{loan.installments || 0}
													</span>
													<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
														<div
															className="h-full rounded-full bg-primary"
															style={{ width: `${progress}%` }}
														/>
													</div>
												</div>
											</td>
											<td className="px-5 py-3 text-right">{formatRupiah(installment)}</td>
											<td className="px-5 py-3 text-right text-muted-foreground">{formatRupiah(loan.paid_amount || 0)}</td>
											<td className="px-5 py-3 text-right font-semibold">{formatRupiah(balance)}</td>
											<td className="px-5 py-3">
												<span
													className={cn(
														'rounded-full px-2 py-0.5 text-xs font-semibold',
														loan.status === 'completed'
															? 'bg-emerald-100 text-emerald-800'
															: loan.status === 'cancelled'
																? 'bg-slate-100 text-slate-600'
																: 'bg-amber-100 text-amber-800',
													)}
												>
													{LOAN_STATUS_LABELS[loan.status]}
												</span>
											</td>
											<td className="px-5 py-3">
												<div className="flex justify-end gap-1">
													<button
														type="button"
														onClick={() => openEdit(loan)}
														aria-label="Edit"
														className="border border-border p-1 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
													>
														<Pencil className="size-3.5" />
													</button>
													<button
														type="button"
														onClick={() => remove(loan)}
														aria-label="Hapus"
														className="border border-border p-1 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
													>
														<Trash2 className="size-3.5" />
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

			{loans.length > 0 ? (
				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<HandCoins className="size-3.5" />
					Saat membuat periode penggajian, angsuran pinjaman aktif otomatis dipotong dari slip gaji karyawan bersangkutan.
				</p>
			) : null}
		</div>
	);
}

function SummaryCard({
	label,
	value,
	muted,
	accent,
}: {
	label: string;
	value: string;
	muted?: boolean;
	accent?: boolean;
}) {
	return (
		<div
			className={cn(
				'rounded-2xl border border-border bg-card p-5 shadow-soft-sm',
				accent && 'border-primary/30 bg-primary/5',
			)}
		>
			<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
			<p
				className={cn(
					'mt-1 text-xl font-extrabold tracking-tight',
					muted && 'text-muted-foreground',
					accent && 'text-primary',
				)}
			>
				{value}
			</p>
		</div>
	);
}
