import { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp, Eye, LockKeyhole, LockKeyholeOpen, Printer } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah } from '@/lib/accounting';
import { RUN_STATUS_LABELS, type PayrollRun, type Payslip } from '@/lib/payroll';
import { AmountInput } from '@/components/ui/amount-input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/hooks/use-language';

type Props = {
	run: PayrollRun;
	payslips: Payslip[];
	drafts: Record<string, Partial<Payslip>>;
	onEdit: (id: string, field: keyof Payslip, value: string) => void;
	onPreview: (slip: Payslip) => void;
	onPrint: (slip: Payslip) => void;
	onPublish: (ids: string[]) => void;
	publishing: boolean;
	recompute: (draft: Partial<Payslip>, loan: number, allowance: number, deduction: number) => { gross: number; ded: number; net: number };
};

function EmployeeAvatar({ slip }: { slip: Payslip }) {
	const [failed, setFailed] = useState(false);
	const employee = slip.expand?.employee;
	const initials = (employee?.name || '?').trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
	const photo = employee?.photo && !failed ? pb.files.getURL(employee, employee.photo, { thumb: '100x100' }) : '';
	return <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
		{photo ? <img src={photo} alt="" className="size-full object-cover" onError={() => setFailed(true)} /> : initials || '?'}
	</span>;
}

function AmountField({ label, value, editable, onChange }: { label: string; value: number; editable: boolean; onChange: (value: string) => void }) {
	return <div className="min-w-0"><div className="mb-1.5 text-xs text-slate-500">{label}</div>
		{editable ? <AmountInput aria-label={label} value={value} onValueChange={next => onChange(String(next))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-right text-sm tabular-nums outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /> : <div className="py-1.5 text-sm tabular-nums text-slate-800">{formatRupiah(value)}</div>}
	</div>;
}

export function PayrollPayslipTable({ run, payslips, drafts, onEdit, onPreview, onPrint, onPublish, publishing, recompute }: Props) {
	const { t } = useLanguage();
	const [selected, setSelected] = useState<string[]>([]);
	const [selectedOnly, setSelectedOnly] = useState(false);
	const [sort, setSort] = useState<'original' | 'asc' | 'desc'>('original');
	const rows = useMemo(() => {
		const items = payslips.filter(slip => !selectedOnly || selected.includes(slip.id));
		if (sort !== 'original') items.sort((a, b) => (sort === 'asc' ? 1 : -1) * (a.expand?.employee?.name || '').localeCompare(b.expand?.employee?.name || '', 'id'));
		return items;
	}, [payslips, selected, selectedOnly, sort]);
	const allSelected = payslips.length > 0 && payslips.every(slip => selected.includes(slip.id));
	const toggle = (id: string) => {
		if (selectedOnly && selected.length === 1 && selected.includes(id)) setSelectedOnly(false);
		setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
	};

	return <section className="min-w-0 bg-transparent text-[#202938]" aria-label="Slip gaji">
		<div className="flex flex-wrap items-end justify-between gap-3 px-4 py-5 sm:px-5">
			<div><h3 className="text-base font-semibold">{t('payroll.payslip_title')}</h3><p className="mt-1 text-sm text-slate-500">{t('payroll.payslip_count', { count: payslips.length })}</p></div>
		</div>
		{selected.length > 0 && <div className="flex flex-wrap items-center gap-x-5 gap-y-3 bg-[#f5f6f8] px-4 py-3 text-sm sm:px-5">
			<label className="inline-flex items-center gap-3"><input type="checkbox" checked disabled={publishing} onChange={() => { setSelected([]); setSelectedOnly(false); }} aria-label="Hapus semua pilihan" className="size-4 accent-emerald-600" /><span>{selected.length} {t('payroll.employees_word')}</span></label>
			<DropdownMenu>
				<DropdownMenuTrigger asChild><button type="button" disabled={publishing} className="inline-flex min-h-10 items-center gap-3 rounded-md bg-emerald-700 px-4 font-medium text-white hover:bg-emerald-800 disabled:opacity-60">{publishing ? t('payroll.run_processing') : t('payroll.actions')} <ChevronDown className="size-4" /></button></DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-[200px] border-slate-300 bg-white p-1.5 text-slate-800 shadow-lg"><DropdownMenuItem onSelect={() => onPublish(selected)} className="cursor-pointer px-3 py-2.5 focus:bg-slate-100 focus:text-slate-900">{t('payroll.publish_payslip')}</DropdownMenuItem></DropdownMenuContent>
			</DropdownMenu>
			{!allSelected && <button type="button" disabled={publishing} onClick={() => setSelected(payslips.map(slip => slip.id))} className="font-medium text-emerald-700 hover:underline disabled:opacity-50">{t('payroll.select_all_count', { count: payslips.length })}</button>}
			<button type="button" disabled={publishing} onClick={() => setSelectedOnly(value => !value)} className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50">{selectedOnly ? t('payroll.show_all') : t('payroll.show_selected')}</button>
			<button type="button" disabled={publishing} onClick={() => { setSelected([]); setSelectedOnly(false); }} className="text-xs font-semibold text-slate-600 hover:underline disabled:opacity-50">{t('payroll.clear_selection')}</button>
		</div>}
		<p className="px-4 pb-2 text-xs text-slate-500 sm:hidden">Geser tabel ke samping untuk melihat kolom lainnya.</p>
		<div className="overflow-x-auto">
			<table className="w-full min-w-[920px] text-left text-sm">
				<thead className="text-slate-800"><tr>
					<th scope="col" className="w-[29%] min-w-[235px] px-3 py-4 font-semibold"><div className="flex items-center gap-3"><input type="checkbox" aria-label="Pilih semua slip gaji" checked={allSelected} disabled={publishing} onChange={() => { setSelected(allSelected ? [] : payslips.map(slip => slip.id)); if (allSelected) setSelectedOnly(false); }} className="size-4 accent-emerald-600" /><button type="button" onClick={() => setSort(value => value === 'asc' ? 'desc' : 'asc')} className="inline-flex items-center gap-2 hover:text-emerald-700">{t('payroll.col.employee')} <ArrowUpDown className="size-3 text-slate-400" /></button></div></th>
					<th scope="col" className="whitespace-nowrap px-3 py-4 font-semibold">{t('payroll.col.net_pay')}</th>
					<th scope="col" className="whitespace-nowrap px-3 py-4 font-semibold">{t('payroll.col.pay_date')}</th>
					<th scope="col" className="whitespace-nowrap px-3 py-4 font-semibold">{t('payroll.col.payslip_status')}</th>
					<th scope="col" className="whitespace-nowrap px-3 py-4 font-semibold">{t('payroll.col.payroll_status')}</th>
					<th scope="col" className="px-3 py-4"><span className="sr-only">Aksi</span></th>
				</tr></thead>
				<tbody>
					{rows.map(slip => {
						const draft = drafts[slip.id];
						const current = draft ?? slip;
						const loan = slip.loan_deduction ?? 0;
						const allowance = (slip.component_allowance ?? 0) + (slip.tax_allowance ?? 0);
						const deduction = slip.component_deduction ?? 0;
						const calculated = draft ? recompute(draft, loan, allowance, deduction) : { gross: slip.gross, ded: slip.total_deductions, net: slip.net_pay };
						const person = slip.expand?.employee;
						const editable = run.status === 'draft';
						return <tr key={slip.id} className="hover:bg-slate-50/60">
							<td className="px-3 py-3"><div className="flex items-center gap-3"><input type="checkbox" aria-label={`Pilih ${person?.name || 'slip gaji'}`} checked={selected.includes(slip.id)} disabled={publishing} onChange={() => toggle(slip.id)} className="size-4 shrink-0 accent-emerald-600" /><EmployeeAvatar slip={slip} /><div className="min-w-0"><div className="font-medium">{person?.name || '—'}</div>{person?.employee_code && <div className="mt-1 text-xs text-slate-500">{person.employee_code}</div>}{person?.position && <div className="mt-1 text-xs text-slate-500">{person.position}</div>}</div></div></td>
							<td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatRupiah(calculated.net)}</td>
							<td className="whitespace-nowrap px-3 py-3">{formatDate(run.pay_date)}</td>
							<td className="whitespace-nowrap px-3 py-3"><span className={slip.published ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700' : 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700'}>{slip.published ? t('payroll.published') : t('payroll.not_published')}</span></td>
							<td className="whitespace-nowrap px-3 py-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{RUN_STATUS_LABELS[run.status]}</span> <span className="ml-1 inline-flex align-middle text-slate-500" title={editable ? t('payroll.locked_edit') : t('payroll.locked_view')}>{editable ? <LockKeyholeOpen className="size-4" aria-label={t('payroll.editable')} /> : <LockKeyhole className="size-4" aria-label={t('payroll.not_editable')} />}</span></td>
							<td className="px-3 py-3"><div className="flex items-center justify-end gap-1.5"><button type="button" onClick={() => onPreview(slip)} aria-label={`${t('payroll.preview_slip')} ${person?.name || ''}`} title={t('payroll.preview_slip')} className="grid size-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><Eye className="size-4" /></button><button type="button" onClick={() => onPrint(slip)} aria-label={`${t('payroll.print_slip')} ${person?.name || ''}`} title={t('payroll.print_slip')} className="grid size-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><Printer className="size-4" /></button></div></td>
						</tr>;
					})}
					{rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{payslips.length ? t('payroll.no_slips_selected') : t('payroll.no_slips')}</td></tr>}
				</tbody>
				<tfoot><tr className="bg-[#f5f6f8] font-semibold"><td className="px-3 py-4">{t('payroll.total_period')}</td><td className="whitespace-nowrap px-3 py-4 tabular-nums">{formatRupiah(run.total_net || 0)}</td><td colSpan={4} className="px-3 py-4 text-xs font-normal text-slate-500">{t('payroll.based_on_data')}</td></tr></tfoot>
			</table>
		</div>
	</section>;
}

