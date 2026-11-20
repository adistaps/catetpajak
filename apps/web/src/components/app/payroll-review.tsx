import { Fragment, useMemo, useState } from 'react';
import { ArrowUpDown, CircleHelp, Info, RotateCcw, Save, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatRupiah } from '@/lib/accounting';
import type { AllowanceMethod, Employee, EmployeeLoan } from '@/lib/payroll';
import { TAX_METHOD_LABELS, type TaxMethod } from '@/lib/payroll-calc';
import { AmountInput } from '@/components/ui/amount-input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type PayrollReviewAmounts = Pick<Employee, 'basic_salary' | 'meal_allowance' | 'transport_allowance' | 'other_allowance' | 'bpjs_tk' | 'bpjs_kes' | 'pph21'>;

type ReviewRow = {
	emp: Employee;
	isEx: boolean;
	defaults: PayrollReviewAmounts;
	amounts: PayrollReviewAmounts;
	loan?: EmployeeLoan;
	loanDed: number;
	compAllowance: number;
	compDeduction: number;
	gross: number;
	deduction: number;
	net: number;
};

interface PayrollReviewProps {
	period: string;
	payDate: string;
	cutoffStart: string;
	cutoffEnd: string;
	mealMethod: AllowanceMethod;
	transportMethod: AllowanceMethod;
	rows: ReviewRow[];
	overrides: Record<string, PayrollReviewAmounts>;
	onChangeOverrides: React.Dispatch<React.SetStateAction<Record<string, PayrollReviewAmounts>>>;
	saving: boolean;
	runBlocked: boolean;
	onBack: () => void;
	onRun: () => void;
}

const amountFields: Array<{ key: keyof PayrollReviewAmounts; label: string }> = [
	{ key: 'basic_salary', label: 'Gaji pokok' },
	{ key: 'meal_allowance', label: 'Tunjangan makan' },
	{ key: 'transport_allowance', label: 'Tunjangan transportasi' },
	{ key: 'other_allowance', label: 'Tunjangan lainnya' },
	{ key: 'bpjs_tk', label: 'BPJS Ketenagakerjaan' },
	{ key: 'bpjs_kes', label: 'BPJS Kesehatan' },
	{ key: 'pph21', label: 'PPh 21' },
];

const outlineButton = 'inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50';

export function PayrollReview({ mealMethod, transportMethod, rows, overrides, onChangeOverrides, saving, runBlocked, onBack, onRun }: PayrollReviewProps) {
	const [tab, setTab] = useState<'overview' | 'detail'>('overview');
	const [query, setQuery] = useState('');
	const [ascending, setAscending] = useState(true);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editAmounts, setEditAmounts] = useState<PayrollReviewAmounts | null>(null);
	const [guideOpen, setGuideOpen] = useState(false);
	const cancelEdit = () => {
		setEditingId(null);
		setEditAmounts(null);
	};
	const saveEdit = () => {
		if (!editingId || !editAmounts) return;
		if (amountFields.some(field => !Number.isSafeInteger(editAmounts[field.key]) || editAmounts[field.key] < 0)) {
			toast.error('Nominal harus berupa angka bulat yang valid.');
			return;
		}
		onChangeOverrides(previous => ({ ...previous, [editingId]: editAmounts }));
		cancelEdit();
	};
	const editField = (key: keyof PayrollReviewAmounts, label: string, showLabel = false) => editAmounts && (
		<label className="block min-w-[132px] text-xs font-medium text-slate-600">
			<span className={showLabel ? 'mb-1 block' : 'sr-only'}>{label}</span>
			<AmountInput
				value={editAmounts[key]}
				onValueChange={value => setEditAmounts(previous => previous ? { ...previous, [key]: value } : previous)}
				className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
			/>
		</label>
	);
	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter(row => [row.emp.name, row.emp.employee_code || '', row.emp.position || ''].some(value => value.toLowerCase().includes(q)))
			.slice().sort((a, b) => (ascending ? 1 : -1) * a.emp.name.localeCompare(b.emp.name, 'id'));
	}, [rows, query, ascending]);

	return (
		<div className="mx-auto w-full max-w-[1600px] text-[#202938]">
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<div><p className="mb-1 text-xs text-slate-500">Penggajian / Tinjauan</p><h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Run payroll</h1></div>
				<button type="button" onClick={() => setGuideOpen(true)} className={outlineButton}><CircleHelp className="mr-2 size-4" /> Panduan</button>
			</div>
			<section className="rounded-md border border-slate-200 bg-transparent px-4 pb-0 pt-7 sm:px-6 sm:pt-10" aria-label="Tinjauan payroll">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div role="tablist" aria-label="Tampilan payroll" className="inline-flex overflow-hidden rounded-md border border-emerald-600">
						{(['overview', 'detail'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-10 px-4 text-sm font-semibold ${tab === value ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 hover:bg-emerald-50'}`} >{value === 'overview' ? 'Overview' : 'Detail'}</button>)}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<button type="button" disabled={Object.keys(overrides).length === 0 || saving || Boolean(editingId)} onClick={() => { if (window.confirm('Hapus semua perubahan di tinjauan dan kembalikan nilai awal? Data yang sudah tersimpan tidak akan berubah.')) onChangeOverrides({}); }} className={outlineButton}>Reset perubahan</button>
						<label className="relative w-full sm:w-48"><span className="sr-only">Cari karyawan</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={Boolean(editingId)} placeholder="Cari…" className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
					</div>
				</div>
				<p className="mt-3 text-xs text-slate-500">Perubahan hanya berlaku untuk payroll ini. Komponen tambahan mencakup komponen aktif dan lembur yang disetujui.</p>
			<p className="mt-1 text-xs text-slate-500">Tunjangan makan: {mealMethod === 'attendance' ? 'berdasarkan kehadiran' : 'nominal flat per bulan'} · Tunjangan transportasi: {transportMethod === 'attendance' ? 'berdasarkan kehadiran' : 'nominal flat per bulan'}.</p>
				<div className="mt-4 overflow-x-auto">
					<table className="w-full min-w-[1050px] text-left text-sm">
						<thead className="border-b-2 border-slate-300 bg-[#f5f6f8] text-[#202938]"><tr>
							<th className="min-w-[250px] w-[30%] px-2 py-4"><button type="button" onClick={() => setAscending(value => !value)} className="inline-flex items-center gap-2 font-semibold">Karyawan <ArrowUpDown className="size-3 text-slate-400" /></button></th>
							{(tab === 'overview' ? ['Gaji pokok', 'Tunjangan', 'Penghasilan tambahan', 'Potongan', 'Benefit', 'Total'] : ['Gaji pokok', 'Tunjangan makan', 'Tunjangan transportasi', 'Tunjangan lainnya', 'BPJS TK', 'BPJS Kes', 'PPh 21', 'Pinjaman', 'Komponen +', 'Komponen −', 'Total']).map(label => <th key={label} className="whitespace-nowrap px-2 py-4 font-semibold">{label}{label === 'Total' && <span title="Total yang diterima setelah potongan" className="ml-1 inline-block align-middle"><Info className="size-4 text-slate-500" /></span>}</th>)}
							<th className="px-2 py-4"><span className="sr-only">Aksi</span></th>
						</tr></thead>
						<tbody>
							{filteredRows.map((row, index) => {
								const initials = row.emp.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('');
								const colors = ['bg-slate-500', 'bg-lime-500', 'bg-amber-500', 'bg-orange-500'];
								const allowances = row.amounts.meal_allowance + row.amounts.transport_allowance + row.amounts.other_allowance;
								const isEditing = editingId === row.emp.id && editAmounts !== null;
								const draft = isEditing ? editAmounts : row.amounts;
								const draftEarnings = draft.basic_salary + draft.meal_allowance + draft.transport_allowance + draft.other_allowance;
								const savedEarnings = row.amounts.basic_salary + allowances;
								const draftDeductions = draft.bpjs_tk + draft.bpjs_kes + draft.pph21;
								const savedDeductions = row.amounts.bpjs_tk + row.amounts.bpjs_kes + row.amounts.pph21;
								const previewNet = Math.max(0, row.gross - row.deduction + draftEarnings - savedEarnings - draftDeductions + savedDeductions);
								const amountCell = (key: keyof PayrollReviewAmounts, label: string) => <td key={key} className="whitespace-nowrap px-2 py-5 tabular-nums">{isEditing ? editField(key, label) : formatRupiah(row.amounts[key] || 0)}</td>;
								return <Fragment key={row.emp.id}><tr className="border-b border-slate-300 align-top">
									<td className="px-2 py-4"><div className="flex items-start gap-3"><span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${colors[index % colors.length]}`}>{initials || '?'}</span><div><p className="font-medium uppercase">{row.emp.name}</p><p className="mt-1 text-slate-500">{row.emp.employee_code || '—'}</p><p className="mt-1 text-slate-500">{row.isEx ? 'Nonaktif' : row.emp.position || 'Aktif'}</p><p className="mt-1 text-slate-500">{TAX_METHOD_LABELS[(row.emp.tax_method ?? 'gross') as TaxMethod]}</p></div></div></td>
									{amountCell('basic_salary', `Gaji pokok ${row.emp.name}`)}
									{tab === 'overview' ? <>
										<td className="whitespace-nowrap px-2 py-5 tabular-nums">{isEditing ? <div className="space-y-3">{editField('meal_allowance', 'Tunjangan makan', true)}{editField('transport_allowance', 'Tunjangan transportasi', true)}{editField('other_allowance', 'Tunjangan lainnya', true)}</div> : formatRupiah(allowances)}</td>
										<td className="whitespace-nowrap px-2 py-5 tabular-nums">{formatRupiah(row.compAllowance || 0)}</td>
										<td className="whitespace-nowrap px-2 py-5 tabular-nums">{isEditing ? <div className="space-y-3">{editField('bpjs_tk', 'BPJS Ketenagakerjaan', true)}{editField('bpjs_kes', 'BPJS Kesehatan', true)}{editField('pph21', 'PPh 21', true)}{(row.loanDed > 0 || row.compDeduction > 0) && <p className="text-xs text-slate-500">Pinjaman & komponen: {formatRupiah(row.loanDed + row.compDeduction)}</p>}</div> : formatRupiah(row.deduction || 0)}</td>
										<td className="px-2 py-5 text-slate-500" title="Data benefit terpisah belum tersedia">—</td>
									</> : <>
										{amountCell('meal_allowance', `Tunjangan makan ${row.emp.name}`)}
										{amountCell('transport_allowance', `Tunjangan transportasi ${row.emp.name}`)}
										{amountCell('other_allowance', `Tunjangan lainnya ${row.emp.name}`)}
										{amountCell('bpjs_tk', `BPJS Ketenagakerjaan ${row.emp.name}`)}
										{amountCell('bpjs_kes', `BPJS Kesehatan ${row.emp.name}`)}
										{amountCell('pph21', `PPh 21 ${row.emp.name}`)}
										{[row.loanDed, row.compAllowance, row.compDeduction].map((value, valueIndex) => <td key={valueIndex} className="whitespace-nowrap px-2 py-5 tabular-nums">{formatRupiah(value || 0)}</td>)}
									</>}
									<td className="whitespace-nowrap px-2 py-5 tabular-nums">{formatRupiah(isEditing ? previewNet : row.net)}</td>
									<td className="px-2 py-4 text-right">{isEditing ? <div className="flex items-center justify-end gap-1">
										{[
											{ label: 'Simpan perubahan', icon: Save, action: saveEdit, style: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' },
											{ label: 'Kembalikan nilai awal', icon: RotateCcw, action: () => setEditAmounts({ ...row.defaults }), style: 'border-slate-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
											{ label: 'Batal', icon: X, action: cancelEdit, style: 'border-slate-300 bg-white text-emerald-700 hover:bg-emerald-50' },
										].map(({ label, icon: Icon, action, style }) => <button key={label} type="button" aria-label={label} title={label} onClick={action} className={`group relative inline-flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${style}`}><Icon aria-hidden="true" className="size-4" /><span aria-hidden="true" className="pointer-events-none absolute right-0 top-full z-10 mt-1 w-max rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100">{label}</span></button>)}
									</div> : <button type="button" disabled={row.isEx || saving || runBlocked || Boolean(editingId)} title={row.isEx ? 'Karyawan nonaktif hanya menerima tunjangan komponen aktif' : undefined} onClick={() => { setEditingId(row.emp.id); setEditAmounts({ ...row.amounts }); }} className={outlineButton}>Edit</button>}</td>
								</tr>{isEditing && <tr><td colSpan={tab === 'overview' ? 8 : 13} className="px-2 py-3 text-xs leading-relaxed text-slate-500">Potongan otomatis ditampilkan dari perhitungan saat ini. Jika gaji diubah di sini, sesuaikan juga potongan bila diperlukan. Komponen aktif, lembur, dan cicilan pinjaman dikelola melalui menu masing-masing. Simpan perubahan untuk menerapkannya pada tinjauan payroll ini.</td></tr>}</Fragment>;
							})}
							{filteredRows.length === 0 && <tr><td colSpan={tab === 'overview' ? 8 : 13} className="px-4 py-12 text-center text-slate-500">{rows.length ? 'Tidak ada karyawan yang cocok dengan pencarian.' : 'Tidak ada karyawan untuk diproses.'}</td></tr>}
						</tbody>
					</table>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"><p className="text-slate-500">{runBlocked ? 'Payroll belum dapat dilanjutkan. Kembali dan periksa data atau status periode terlebih dahulu.' : Object.keys(overrides).length > 0 ? `${Object.keys(overrides).length} karyawan memiliki perubahan yang belum disimpan.` : 'Periksa seluruh data sebelum melanjutkan.'}</p><div className="flex items-center gap-3"><button type="button" onClick={onBack} disabled={saving || Boolean(editingId)} className="min-h-10 px-3 text-slate-500 hover:text-slate-900 disabled:opacity-50">Kembali</button><button type="button" onClick={onRun} disabled={saving || runBlocked || rows.length === 0 || Boolean(editingId)} className="min-h-10 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Memproses…' : 'Run payroll'}</button></div></div>
			</section>
			<Dialog open={guideOpen} onOpenChange={setGuideOpen}><DialogContent className="rounded-lg bg-white sm:max-w-lg"><DialogHeader><DialogTitle>Panduan Run Payroll</DialogTitle><DialogDescription>Tinjau payroll sebelum membuat periode dan slip gaji.</DialogDescription></DialogHeader><div className="space-y-3 text-sm leading-relaxed text-slate-600"><p>Gunakan Overview untuk ringkasan atau Detail untuk melihat rincian komponen setiap karyawan. Tombol Edit mengubah nilai untuk periode ini saja.</p><p>Ekspor CSV sebagai format impor, lalu isi nominal dalam angka bulat tanpa pemisah. Impor hanya mengubah tinjauan; data belum disimpan sampai Anda memilih Run payroll. Karyawan nonaktif hanya menerima komponen yang berlaku; nilai mereka dalam CSV harus tetap seperti semula.</p><p>Run payroll membuat periode draf dan slip gaji sesuai alur yang ada. Penerbitan jurnal dan payslip dilakukan secara terpisah.</p></div></DialogContent></Dialog>
		</div>
	);
}
