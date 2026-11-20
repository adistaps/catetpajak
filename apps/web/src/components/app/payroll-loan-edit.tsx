import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { AmountInput } from '@/components/ui/amount-input';
import { LoanInstallmentSchedule, type LoanHistoryRow } from '@/components/app/loan-installment-schedule';
import { formatRupiah, todayIso, type Company } from '@/lib/accounting';
import { buildLoanSchedule } from '@/lib/loan-schedule';
import { LOAN_STATUS_LABELS, loanInstallment, type Employee, type EmployeeLoan, type LoanScheduleRow, type LoanStatus } from '@/lib/payroll';
import { payrollErrorMessage } from '@/lib/payroll-expenses';
import pb from '@/lib/pocketbase-client';
import { useLanguage } from '@/hooks/use-language';

interface PayrollLoanEditProps {
	company: Company;
	loan: EmployeeLoan;
	employees: Employee[];
	onCancel: () => void;
	onSaved: () => Promise<void>;
}

const inputClass = 'h-11 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';
const EDITABLE_STATUSES: LoanStatus[] = ['pending', 'active', 'completed', 'cancelled'];

export function PayrollLoanEdit({ company, loan, employees, onCancel, onSaved }: PayrollLoanEditProps) {
	const { t } = useLanguage();
	const [saving, setSaving] = useState(false);
	const savingRef = useRef(false);
	const paidCount = Number(loan.paid_installments) || 0;
	const paidAmount = Number(loan.paid_amount) || 0;
	const [form, setForm] = useState(() => ({ principal: Number(loan.principal) || 0, installments: String(loan.installments || 1), disbursedDate: (loan.disbursed_date || todayIso()).slice(0, 10), description: loan.description || '', status: (loan.status || 'active') as LoanStatus }));
	const [schedule, setSchedule] = useState<LoanScheduleRow[]>(() => {
		if (Array.isArray(loan.installment_schedule) && loan.installment_schedule.length) return loan.installment_schedule.filter(row => row.number > paidCount).map(row => ({ ...row })).sort((a, b) => a.number - b.number);
		return buildLoanSchedule(Number(loan.principal) || 0, Number(loan.installments) || 1, paidCount, paidAmount, (loan.disbursed_date || '').slice(0, 10), loanInstallment(loan));
	});
	const [history, setHistory] = useState<LoanHistoryRow[] | null>(null);
	const [historyLoading, setHistoryLoading] = useState(paidCount > 0);
	const [saveUncertain, setSaveUncertain] = useState(false);
	const [stale, setStale] = useState(false);
	const employee = employees.find(item => item.id === loan.employee);
	const terms = Number(form.installments);
	const totalPrincipal = useMemo(() => schedule.reduce((sum, row) => sum + row.principal, 0), [schedule]);
	const balance = form.principal - paidAmount;

	useEffect(() => {
		if (!paidCount) return;
		let cancelled = false;
		pb.send<{ history: LoanHistoryRow[] | null }>('/api/loan-schedule/history', {
			query: { company: company.id, loan: loan.id }, requestKey: null,
		}).then(result => {
			if (!cancelled) setHistory(result.history);
		}).catch(() => { if (!cancelled) setHistory(null); }).finally(() => { if (!cancelled) setHistoryLoading(false); });
		return () => { cancelled = true; };
	}, [company.id, loan.id, paidAmount, paidCount]);

	const recalculate = () => {
		if (schedule.length > 0 && !window.confirm('Hitung ulang akan mengganti jadwal dan bunga pada cicilan yang belum tercatat. Lanjutkan?')) return;
		setSchedule(buildLoanSchedule(form.principal, terms, paidCount, paidAmount, form.disbursedDate));
	};

	const updateRow = (number: number, field: 'date' | 'principal' | 'interest', value: string | number) => {
		setSchedule(previous => previous.map(row => row.number === number ? { ...row, [field]: value } : row));
	};

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (savingRef.current || saveUncertain || stale) return;
		if (!Number.isSafeInteger(form.principal) || form.principal <= 0 || form.principal < paidAmount) { toast.error('Pokok pinjaman harus berupa rupiah positif dan tidak kurang dari pokok yang telah dibayar.'); return; }
		if (!Number.isSafeInteger(terms) || terms < 1 || terms > 600 || terms < paidCount) { toast.error('Jumlah angsuran harus berupa bilangan bulat antara 1 dan 600, tidak kurang dari cicilan tercatat.'); return; }
		if (!form.disbursedDate) { toast.error('Isi tanggal pencairan.'); return; }
		if (schedule.length !== terms - paidCount || (balance > 0 && schedule.length === 0) || (balance === 0 && schedule.length > 0)) { toast.error('Jadwal belum sesuai jumlah angsuran dan sisa pinjaman. Klik Hitung ulang jadwal.'); return; }
		let previousDate = form.disbursedDate;
		let scheduledBalance = balance;
		for (let index = 0; index < schedule.length; index++) {
			const row = schedule[index];
			if (row.number !== paidCount + index + 1 || !row.date || row.date <= previousDate || !Number.isSafeInteger(row.principal) || row.principal < 0 || !Number.isSafeInteger(row.interest) || row.interest < 0 || !Number.isSafeInteger(row.principal + row.interest)) { toast.error('Periksa urutan tanggal dan nominal pokok serta bunga setiap cicilan.'); return; }
			scheduledBalance -= row.principal;
			if (index < schedule.length - 1 && scheduledBalance <= 0) { toast.error('Pokok tidak boleh lunas sebelum cicilan terakhir. Sesuaikan jadwal.'); return; }
			previousDate = row.date;
		}
		if (totalPrincipal !== balance) { toast.error('Total pokok cicilan harus sama dengan sisa pinjaman.'); return; }
		if ((form.status === 'completed' && balance !== 0) || (form.status === 'active' && balance === 0)) { toast.error('Status pinjaman tidak sesuai dengan sisa pokok.'); return; }
		if (!pb.authStore.record?.id || !pb.authStore.isValid) { toast.error('Sesi Anda telah berakhir. Silakan masuk kembali.'); return; }
		savingRef.current = true;
		setSaving(true);
		try {
			await pb.send('/api/loan-schedule/update', { method: 'POST', body: { company: company.id, loan: loan.id, updated: loan.updated || '', principal: form.principal, installments: terms, disbursed_date: form.disbursedDate, description: form.description.trim(), status: form.status, schedule }, requestKey: `loan-schedule-save-${loan.id}` });
			onCancel();
			const refreshed = await onSaved().then(() => true).catch(() => false);
			toast.success('Pinjaman dan jadwal cicilan diperbarui.');
			if (!refreshed) toast.warning('Daftar pinjaman belum dapat diperbarui. Muat ulang halaman untuk memeriksanya.');
		} catch (error) {
			const status = (error as { status?: number })?.status;
			if (status && status >= 400 && status < 500) {
				const message = payrollErrorMessage(error, 'Gagal memperbarui pinjaman. Periksa data lalu coba lagi.');
				toast.error(message);
				if (message.includes('Pinjaman telah berubah')) {
					setStale(true);
					await onSaved().catch(() => {});
				}
			} else {
				setSaveUncertain(true);
				toast.error('Hasil penyimpanan belum dapat dipastikan. Kembali ke daftar dan buka ulang pinjaman untuk memeriksa.');
				await onSaved().catch(() => {});
			}
		} finally {
			savingRef.current = false;
			setSaving(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-6xl space-y-5">
			<button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"><ArrowLeft className="size-4" /> {t('payroll.loan_edit.back')}</button>
			<section className="rounded-xl border border-border bg-white p-5 shadow-soft-sm sm:p-6">
				<header className="mb-6 space-y-1.5"><h1 className="text-xl font-bold tracking-tight text-foreground">{t('payroll.loan_edit.title')}</h1><p className="text-sm text-muted-foreground">{t('payroll.loan_edit.desc')}</p></header>
				<form onSubmit={submit} className="space-y-5">
					<fieldset disabled={saving || saveUncertain || stale} className="space-y-4">
						<div className="space-y-1.5"><span className="block text-sm font-semibold">{t('payroll.loan_edit.employee')}</span><div className="flex h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">{employee?.name ?? '—'}{employee?.position ? <span className="ml-2 text-xs text-slate-500">· {employee.position}</span> : null}</div><p className="text-xs text-muted-foreground">{t('payroll.loan_edit.employee_locked')}</p></div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-1.5"><label htmlFor="payroll-loan-edit-principal" className="block text-sm font-semibold">{t('payroll.loan_edit.principal')} <span className="text-destructive">*</span></label><AmountInput id="payroll-loan-edit-principal" value={form.principal} disabled={saving || paidCount > 0} onValueChange={principal => setForm(prev => ({ ...prev, principal }))} required className={inputClass} /></div>
							<div className="space-y-1.5"><label htmlFor="payroll-loan-edit-date" className="block text-sm font-semibold">{t('payroll.loan_edit.disbursed_date')} <span className="text-destructive">*</span></label><input id="payroll-loan-edit-date" type="date" required disabled={saving || paidCount > 0} value={form.disbursedDate} onChange={event => setForm(prev => ({ ...prev, disbursedDate: event.target.value }))} className={inputClass} /></div>
							<div className="space-y-1.5"><label htmlFor="payroll-loan-edit-terms" className="block text-sm font-semibold">{t('payroll.loan_edit.installments')} <span className="text-destructive">*</span></label><input id="payroll-loan-edit-terms" type="number" min="1" max="600" step="1" required value={form.installments} onChange={event => setForm(prev => ({ ...prev, installments: event.target.value }))} className={inputClass} /></div>
							<div className="space-y-1.5"><span className="block text-sm font-semibold">{t('payroll.loan_edit.remaining_principal')}</span><div className="flex h-11 items-center rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">{formatRupiah(Math.max(0, balance))}</div></div>
						</div>
						{paidCount > 0 && <p className="text-xs text-slate-500">Pokok dan tanggal pencairan dikunci karena sudah ada cicilan tercatat.</p>}
						<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor="payroll-loan-edit-status" className="block text-sm font-semibold">{t('payroll.loan_edit.status')}</label><select id="payroll-loan-edit-status" value={form.status} onChange={event => setForm(prev => ({ ...prev, status: event.target.value as LoanStatus }))} className={inputClass}>{EDITABLE_STATUSES.map(status => <option key={status} value={status}>{LOAN_STATUS_LABELS[status]}</option>)}</select></div><div className="space-y-1.5"><label htmlFor="payroll-loan-edit-description" className="block text-sm font-semibold">{t('payroll.loan_edit.description')} <span className="font-normal text-muted-foreground">(opsional)</span></label><textarea id="payroll-loan-edit-description" maxLength={300} rows={2} value={form.description} onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))} placeholder="Tambahkan keterangan pinjaman" className="w-full resize-y rounded-lg border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></div></div>
						<LoanInstallmentSchedule rows={schedule} history={history} paidCount={paidCount} historyLoading={historyLoading} principal={form.principal} paidAmount={paidAmount} disabled={saving || saveUncertain || stale} onChange={updateRow} onRecalculate={recalculate} />
						{historyLoading && <p role="status" className="text-xs text-slate-500">Memuat riwayat cicilan…</p>}
						{schedule.length > 0 && <p className={`text-sm ${totalPrincipal === balance ? 'text-slate-600' : 'text-rose-700'}`}>Total pokok jadwal: <strong>{formatRupiah(totalPrincipal)}</strong> · Sisa pokok: <strong>{formatRupiah(Math.max(0, balance))}</strong>{totalPrincipal !== balance && ' — jumlah belum sesuai.'}</p>}
						<p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">Ubah pokok, tanggal pencairan, atau jumlah angsuran lalu pilih Hitung ulang jadwal. Pokok dan tanggal pencairan tidak dapat diubah jika sudah ada transaksi terkait. Simpan hanya setelah seluruh rincian sesuai. Tidak ada transaksi atau jurnal yang dibuat atau diubah otomatis.</p>
					</fieldset>
					{(saveUncertain || stale) && <p role="alert" className="text-sm text-amber-700">{stale ? 'Pinjaman telah berubah.' : 'Hasil penyimpanan belum pasti.'} Kembali ke daftar dan buka ulang pinjaman sebelum mencoba lagi.</p>}
					<div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={onCancel} disabled={saving} className="min-h-10 rounded-md border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">{t('sales.form.cancel')}</button><button type="submit" disabled={saving || saveUncertain || stale} className="min-h-10 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? t('payroll.loan_edit.saving') : t('payroll.loan_edit.save')}</button></div>
				</form>
			</section>
		</div>
	);
}
