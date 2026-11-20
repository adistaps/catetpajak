import { AmountInput } from '@/components/ui/amount-input';
import type { LoanScheduleRow } from '@/lib/payroll';
import { useLanguage } from '@/hooks/use-language';

export interface LoanHistoryRow {
	date: string;
	principal: number;
	interest: number;
}

interface Props {
	rows: LoanScheduleRow[];
	history: LoanHistoryRow[] | null;
	paidCount: number;
	historyLoading: boolean;
	principal: number;
	paidAmount: number;
	disabled: boolean;
	onChange: (number: number, field: 'date' | 'principal' | 'interest', value: string | number) => void;
	onRecalculate: () => void;
}

const amount = (value: number) => new Intl.NumberFormat('id-ID').format(value);

export function LoanInstallmentSchedule({ rows, history, paidCount, historyLoading, principal, paidAmount, disabled, onChange, onRecalculate }: Props) {
	const { t } = useLanguage();
	let remaining = Math.max(0, principal - paidAmount);
	let historicalRemaining = principal;
	return (
		<section aria-labelledby="loan-schedule-title" className="space-y-4 border-t border-slate-200 pt-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 id="loan-schedule-title" className="text-lg font-semibold text-slate-900">{t('payroll.loan_schedule.title')}</h2>
					<p className="mt-1 text-sm text-slate-500">{t('payroll.loan_schedule.desc')}</p>
				</div>
				<button type="button" disabled={disabled} onClick={onRecalculate} className="min-h-10 rounded-md border border-emerald-300 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{t('payroll.loan_schedule.recalculate')}</button>
			</div>
			<p className="text-xs leading-relaxed text-slate-500">{t('payroll.loan_schedule.note')}</p>
			{paidCount > 0 && <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Tercatat dalam payroll: <strong>{paidCount} cicilan</strong> · Pokok terbayar <strong>Rp{amount(paidAmount)}</strong>. Riwayat tidak dapat diubah di sini.</p>}
			{paidCount > 0 && !historyLoading && history === null && <p role="status" className="text-sm text-amber-700">Rincian cicilan sebelumnya tidak tersedia atau tidak cocok dengan total tersimpan. Total terbayar tetap dipertahankan.</p>}
			<div className="overflow-x-auto rounded-sm border border-slate-200">
				<table className="w-full min-w-[850px] text-left text-sm tabular-nums">
					<thead className="border-b-2 border-slate-300 bg-slate-100 text-slate-800"><tr><th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">{t('payroll.loan_schedule.col_number')}</th><th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">{t('payroll.loan_schedule.col_date')}</th><th scope="col" className="min-w-[160px] px-3 py-3 font-semibold">{t('payroll.loan_schedule.col_principal')}</th><th scope="col" className="min-w-[150px] px-3 py-3 font-semibold">{t('payroll.loan_schedule.col_interest')}</th><th scope="col" className="px-3 py-3 font-semibold">{t('payroll.loan_schedule.col_total')}</th><th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">{t('payroll.loan_schedule.col_remaining')}</th></tr></thead>
					<tbody>
						{history?.map((row, index) => {
							historicalRemaining -= row.principal;
							return <tr key={`history-${index}`} className="border-b border-slate-200 text-slate-500"><td className="px-3 py-4">{index + 1}<span className="block text-xs">Tercatat</span></td><td className="whitespace-nowrap px-3 py-4">{row.date || '—'}</td><td className="px-3 py-4">{amount(row.principal)}</td><td className="px-3 py-4">{amount(row.interest)}</td><td className="px-3 py-4">{amount(row.principal + row.interest)}</td><td className="px-3 py-4">{amount(historicalRemaining)}</td></tr>;
						})}
						{rows.map(row => {
							remaining -= row.principal;
							return <tr key={row.number} className="border-b border-slate-200 last:border-0"><td className="px-3 py-4">{row.number}</td><td className="px-3 py-4"><input aria-label={`Tanggal pembayaran angsuran ${row.number}`} type="date" required disabled={disabled} value={row.date} onChange={event => onChange(row.number, 'date', event.target.value)} className="w-full min-w-[145px] border-b border-slate-400 bg-transparent py-2 outline-none focus:border-emerald-600 disabled:opacity-60" /></td><td className="px-3 py-4"><AmountInput aria-label={`Pokok angsuran ${row.number}`} disabled={disabled} value={row.principal} onValueChange={value => onChange(row.number, 'principal', value)} className="w-full border-b border-slate-400 bg-transparent py-2 outline-none focus:border-emerald-600 disabled:opacity-60" /></td><td className="px-3 py-4"><AmountInput aria-label={`Bunga angsuran ${row.number}`} disabled={disabled} value={row.interest} onValueChange={value => onChange(row.number, 'interest', value)} className="w-full border-b border-slate-400 bg-transparent py-2 outline-none focus:border-emerald-600 disabled:opacity-60" /></td><td className="whitespace-nowrap px-3 py-4">{amount(row.principal + row.interest)}</td><td className={`whitespace-nowrap px-3 py-4 ${remaining < 0 ? 'text-rose-600' : ''}`}>{amount(remaining)}</td></tr>;
						})}
						{rows.length === 0 && !history?.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">{t('payroll.loan_schedule.empty')}</td></tr>}
					</tbody>
				</table>
			</div>
		</section>
	);
}
