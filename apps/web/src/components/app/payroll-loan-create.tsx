import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { AmountInput } from '@/components/ui/amount-input';
import { formatRupiah, todayIso, type Company } from '@/lib/accounting';
import { ensureLoanTransaction } from '@/lib/loan-ledger';
import type { Employee, EmployeeLoan } from '@/lib/payroll';
import pb from '@/lib/pocketbase-client';
import { useLanguage } from '@/hooks/use-language';

interface PayrollLoanCreateProps {
	company: Company;
	employees: Employee[];
	loans: EmployeeLoan[];
	onCancel: () => void;
	onCreated: () => Promise<void>;
}

const inputClass = 'h-11 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';

export function PayrollLoanCreate({ company, employees, loans, onCancel, onCreated }: PayrollLoanCreateProps) {
	const { t } = useLanguage();
	const [saving, setSaving] = useState(false);
	const savingRef = useRef(false);
	const [form, setForm] = useState(() => ({ employee: '', principal: 0, installments: '1', disbursedDate: todayIso(), description: '' }));
	const activeEmployees = employees.filter(employee => employee.status === 'aktif');
	const existingActive = loans.some(loan => loan.employee === form.employee && loan.status === 'active');
	const terms = Number(form.installments);
	const validTerms = Number.isSafeInteger(terms) && terms >= 1;
	const installment = validTerms ? Math.floor(form.principal / terms) : 0;


	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (savingRef.current) return;
		const employee = activeEmployees.find(item => item.id === form.employee);
		if (!employee) {
			toast.error('Pilih karyawan aktif.');
			return;
		}
		if (!Number.isSafeInteger(form.principal) || form.principal <= 0) {
			toast.error('Jumlah pinjaman harus berupa rupiah dan lebih dari 0.');
			return;
		}
		if (!validTerms || form.principal < terms) {
			toast.error('Jumlah angsuran harus berupa bilangan bulat positif dan tidak melebihi jumlah pinjaman dalam rupiah.');
			return;
		}
		if (!form.disbursedDate) {
			toast.error('Isi tanggal pencairan.');
			return;
		}
		const owner = pb.authStore.record?.id;
		if (!owner || !pb.authStore.isValid) {
			toast.error('Sesi Anda telah berakhir. Silakan masuk kembali.');
			return;
		}

		savingRef.current = true;
		setSaving(true);
		try {
			let activeLoans: EmployeeLoan[];
			try {
				activeLoans = await pb.collection('employee_loans').getFullList<EmployeeLoan>({
					filter: pb.filter('company = {:company} && employee = {:employee} && status = "active"', { company: company.id, employee: employee.id }),
					requestKey: null,
				});
			} catch {
				toast.error('Tidak dapat memeriksa pinjaman aktif. Periksa koneksi lalu coba lagi.');
				return;
			}
			if (activeLoans.length > 0) {
				toast.error('Karyawan ini masih memiliki pinjaman aktif. Selesaikan pinjaman tersebut sebelum mencatat pinjaman baru.');
				await onCreated().catch(() => {});
				return;
			}

			let loan: EmployeeLoan;
			try {
				loan = await pb.collection('employee_loans').create<EmployeeLoan>({
					company: company.id,
					employee: employee.id,
					principal: form.principal,
					installments: terms,
					installment_amount: installment,
					disbursed_date: form.disbursedDate,
					paid_installments: 0,
					paid_amount: 0,
					status: 'active',
					description: form.description.trim(),
					owner,
				});
			} catch {
				// A lost response can still mean the record was saved. Do not encourage a duplicate retry.
				onCancel();
				await onCreated().catch(() => {});
				toast.error('Hasil penyimpanan belum dapat dipastikan. Periksa daftar pinjaman sebelum mencoba lagi.');
				return;
			}

			onCancel();
			let transactionSaved = true;
			try {
				await ensureLoanTransaction(company, loan, employee.name);
			} catch {
				transactionSaved = false;
			}
			const refreshed = await onCreated().then(() => true).catch(() => false);
			toast.success('Pinjaman aktif berhasil dicatat.');
			if (!transactionSaved) toast.warning('Pinjaman tersimpan, tetapi transaksi Biaya belum dapat dibuat. Periksa menu Biaya.');
			if (!refreshed) toast.warning('Daftar pinjaman belum dapat diperbarui. Muat ulang halaman untuk memeriksanya.');
		} finally {
			savingRef.current = false;
			setSaving(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-3xl space-y-5">
			<button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50">
				<ArrowLeft className="size-4" /> {t('payroll.loan_create.back')}
			</button>
			<section className="rounded-xl border border-border bg-white p-5 shadow-soft-sm sm:p-6">
				<header className="mb-6 space-y-1.5">
					<h1 className="text-xl font-bold tracking-tight text-foreground">{t('payroll.loan_create.title')}</h1>
					<p className="text-sm text-muted-foreground">{t('payroll.loan_create.desc')}</p>
				</header>
				<form onSubmit={submit} className="space-y-4">
						<fieldset disabled={saving} className="space-y-4">
						<div className="space-y-1.5">
							<label htmlFor="payroll-loan-employee" className="block text-sm font-semibold">{t('payroll.loan_create.employee')} <span className="text-destructive">*</span></label>
							<select id="payroll-loan-employee" required value={form.employee} onChange={event => setForm(prev => ({ ...prev, employee: event.target.value }))} className={inputClass}>
								<option value="">{t('payroll.loan_create.pick_employee')}</option>
								{activeEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
							</select>
							{activeEmployees.length === 0 ? <p className="text-xs text-muted-foreground">Belum ada karyawan aktif. Tambahkan karyawan terlebih dahulu.</p> : null}
							{existingActive ? <p className="text-xs text-amber-700">Karyawan ini masih memiliki pinjaman aktif. Payroll memotong satu pinjaman aktif per karyawan; selesaikan pinjaman tersebut sebelum menambahkan pinjaman baru.</p> : null}
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-1.5">
								<label htmlFor="payroll-loan-principal" className="block text-sm font-semibold">{t('payroll.loan_create.principal')} <span className="text-destructive">*</span></label>
								<AmountInput id="payroll-loan-principal" value={form.principal} onValueChange={principal => setForm(prev => ({ ...prev, principal }))} required className={inputClass} />
							</div>
							<div className="space-y-1.5">
								<label htmlFor="payroll-loan-date" className="block text-sm font-semibold">{t('payroll.loan_create.disbursed_date')} <span className="text-destructive">*</span></label>
								<input id="payroll-loan-date" type="date" required value={form.disbursedDate} onChange={event => setForm(prev => ({ ...prev, disbursedDate: event.target.value }))} className={inputClass} />
							</div>
							<div className="space-y-1.5">
								<label htmlFor="payroll-loan-terms" className="block text-sm font-semibold">{t('payroll.loan_create.installments')} <span className="text-destructive">*</span></label>
								<input id="payroll-loan-terms" type="number" min="1" step="1" required value={form.installments} onChange={event => setForm(prev => ({ ...prev, installments: event.target.value }))} className={inputClass} />
							</div>
							<div className="space-y-1.5">
								<span className="block text-sm font-semibold">{t('payroll.loan_create.est_installment')}</span>
								<div className="flex h-11 items-center rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">{formatRupiah(installment)}</div>
							</div>
						</div>
						<p className="text-xs leading-relaxed text-muted-foreground">Cicilan dihitung dari pokok dibagi jumlah angsuran. Cicilan terakhir disesuaikan dengan sisa pinjaman.</p>
						<div className="space-y-1.5">
							<label htmlFor="payroll-loan-description" className="block text-sm font-semibold">{t('payroll.loan_create.description')} <span className="font-normal text-muted-foreground">(opsional)</span></label>
							<textarea id="payroll-loan-description" maxLength={300} rows={2} value={form.description} onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))} placeholder="Tambahkan keterangan pinjaman" className="w-full resize-y rounded-lg border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
						</div>
						<p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{t('payroll.loan_create.note')}</p>
						</fieldset>
						<div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
							<button type="button" onClick={onCancel} disabled={saving} className="min-h-10 rounded-md border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">{t('sales.form.cancel')}</button>
							<button type="submit" disabled={saving || activeEmployees.length === 0 || existingActive} className="min-h-10 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? t('payroll.loan_create.saving') : t('payroll.loan_create.save')}</button>
						</div>
				</form>
			</section>
		</div>
	);
}
