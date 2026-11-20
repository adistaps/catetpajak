import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MoreVertical, Search } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, todayIso } from '@/lib/accounting';
import { RUN_STATUS_LABELS, type PayrollRun, type Payslip } from '@/lib/payroll';
import { exportPayrollRunExcel } from '@/lib/payroll-excel-export';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/hooks/use-language';

type SlipSummary = { total: number; published: number };
type SummaryState = Record<string, SlipSummary | null>;
type SortKey = 'period' | 'updated' | 'employees' | 'status';

function periodLabel(period: string) {
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
	const [year, month] = period.split('-');
	return months[Number(month) - 1] ? `${months[Number(month) - 1]} ${year}` : period;
}

function updatedLabel(value?: string) {
	return value ? value.slice(0, 19).replace('T', ' ') : '—';
}

interface Props {
	companyId: string;
	runs: PayrollRun[];
	runsLoading: boolean;
	runsError: boolean;
	onRetry: () => void;
	onOpen: (run: PayrollRun) => void;
	onDelete: (run: PayrollRun) => void;
}

export function PayrollRunsList({ companyId, runs, runsLoading, runsError, onRetry, onOpen, onDelete }: Props) {
	const { t, lang } = useLanguage();
	const [year, setYear] = useState('');
	const [search, setSearch] = useState('');
	const [summaries, setSummaries] = useState<SummaryState>({});
	const [loading, setLoading] = useState(true);
	const [retry, setRetry] = useState(0);
	const [report, setReport] = useState<PayrollRun | null>(null);
	const [exportingId, setExportingId] = useState<string | null>(null);
	const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'period', ascending: false });

	useEffect(() => { setYear(todayIso().slice(0, 4)); }, []);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setSummaries({});
		Promise.all(runs.map(async run => {
			try {
				const slips = await pb.collection('payslips').getFullList<{ id: string; employee: string; published?: boolean }>({
					filter: pb.filter('company = {:company} && run = {:run}', { company: companyId, run: run.id }),
					fields: 'id,employee,published',
					requestKey: null,
				});
				// Hitung karyawan unik; seluruh slip milik karyawan harus terbit agar dihitung terbit.
				const employees = new Map<string, boolean>();
				for (const slip of slips) {
					const key = slip.employee || slip.id;
					employees.set(key, (employees.get(key) ?? true) && Boolean(slip.published));
				}
				return [run.id, { total: employees.size, published: [...employees.values()].filter(Boolean).length }] as const;
			} catch {
				return [run.id, null] as const;
			}
		})).then(entries => {
			if (!cancelled) { setSummaries(Object.fromEntries(entries)); setLoading(false); }
		});
		return () => { cancelled = true; };
	}, [companyId, runs, retry]);

	const years = useMemo(() => {
		const values = new Set(runs.map(run => run.period.slice(0, 4)).filter(value => /^\d{4}$/.test(value)));
		if (year) { values.add(year); values.add(String(Number(year) - 1)); values.add(String(Number(year) + 1)); }
		return [...values].sort((a, b) => Number(b) - Number(a));
	}, [runs, year]);

	const filteredRuns = useMemo(() => {
		const q = search.trim().toLowerCase();
		return runs.filter(run => (!year || run.period.startsWith(`${year}-`)) && (!q ||
			[run.period, periodLabel(run.period), run.description, updatedLabel(run.updated), RUN_STATUS_LABELS[run.status], summaries[run.id]?.total.toString() ?? ''].some(value => (value || '').toLowerCase().includes(q))))
			.sort((a, b) => {
				let result = 0;
				if (sort.key === 'period') result = a.period.localeCompare(b.period);
				if (sort.key === 'updated') result = (a.updated || '').localeCompare(b.updated || '');
				if (sort.key === 'employees') result = (summaries[a.id]?.total ?? -1) - (summaries[b.id]?.total ?? -1);
				if (sort.key === 'status') result = (summaries[a.id]?.published ?? -1) - (summaries[b.id]?.published ?? -1);
				return (sort.ascending ? result : -result) || b.period.localeCompare(a.period);
			});
	}, [runs, year, search, sort, summaries]);

	const reportSummary = report ? summaries[report.id] : undefined;

	const exportRun = async (run: PayrollRun) => {
		if (exportingId) return;
		setExportingId(run.id);
		try {
			const filter = pb.filter('run = {:run} && company = {:company}', { run: run.id, company: companyId });
			const slips = await pb.collection('payslips').getFullList<Payslip>({
				filter,
				sort: 'created',
				expand: 'employee',
				requestKey: null,
			});
			if (slips.length === 0) {
				toast.info('Belum ada slip gaji pada periode ini untuk diekspor.');
				return;
			}
			exportPayrollRunExcel(run, slips, { fileName: `payroll-${run.period}` });
			toast.success(`Data payroll ${run.period} diekspor ke Excel.`);
		} catch {
			toast.error('Gagal mengekspor data payroll. Coba lagi.');
		} finally {
			setExportingId(null);
		}
	};

	return <section className="bg-transparent text-[#1f2937]" aria-label="Daftar periode gaji">
		<p className="mb-5 text-sm leading-relaxed text-slate-700">{lang === 'en' ? 'View payroll history by stored period.' : 'Lihat riwayat penggajian berdasarkan periode yang tersimpan.'}</p>
		<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
			<div className="flex items-center gap-2">
				<div className="relative">
					<select aria-label="Pilih tahun" value={year} onChange={event => setYear(event.target.value)} className="h-10 w-40 appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-10 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:w-52">
						{!year && <option value="">Memuat tahun…</option>}
						{years.map(item => <option key={item} value={item}>{item}</option>)}
					</select>
					<CalendarDays className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
				</div>
				<button type="button" disabled={!year || Number(year) <= 1900} onClick={() => setYear(String(Number(year) - 1))} aria-label="Tahun sebelumnya" className="grid size-10 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="size-5" /></button>
				<button type="button" disabled={!year || Number(year) >= 2100} onClick={() => setYear(String(Number(year) + 1))} aria-label="Tahun berikutnya" className="grid size-10 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="size-5" /></button>
			</div>
			<label className="flex items-center gap-2 text-sm text-slate-600">
						<span>Urutkan</span>
				<select aria-label="Urutkan periode penggajian" value={`${sort.key}-${sort.ascending ? 'asc' : 'desc'}`} onChange={event => { const [key, direction] = event.target.value.split('-'); setSort({ key: key as SortKey, ascending: direction === 'asc' }); }} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
							<option value="period-desc">Periode terbaru</option><option value="period-asc">Periode terlama</option>
							<option value="updated-desc">Pembaruan terbaru</option><option value="updated-asc">Pembaruan terlama</option>
							<option value="employees-desc">Karyawan terbanyak</option><option value="employees-asc">Karyawan tersedikit</option>
							<option value="status-desc">Status terbanyak diterbitkan</option><option value="status-asc">Status tersedikit diterbitkan</option>
				</select>
			</label>
			<label className="relative w-full sm:w-56">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
				<span className="sr-only">Cari periode penggajian</span>
				<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari…" className="h-10 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
			</label>
		</div>
		<div className="overflow-x-auto">
			<table className="w-full min-w-[830px] border-separate border-spacing-0 text-left text-sm text-slate-800">
				<thead><tr className="text-left text-[13px] font-semibold text-slate-900">
					<th scope="col" aria-sort={sort.key === 'period' ? (sort.ascending ? 'ascending' : 'descending') : 'none'} className="whitespace-nowrap border-b border-slate-200 px-5 py-2.5">Periode</th>
					<th scope="col" aria-sort={sort.key === 'updated' ? (sort.ascending ? 'ascending' : 'descending') : 'none'} className="whitespace-nowrap border-b border-slate-200 px-2 py-2.5">Pembaruan terakhir</th>
					<th scope="col" aria-sort={sort.key === 'employees' ? (sort.ascending ? 'ascending' : 'descending') : 'none'} className="whitespace-nowrap border-b border-slate-200 px-2 py-2.5">Jumlah karyawan</th>
					<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-2 py-2.5">Laporan</th>
					<th scope="col" aria-sort={sort.key === 'status' ? (sort.ascending ? 'ascending' : 'descending') : 'none'} className="whitespace-nowrap border-b border-slate-200 px-2 py-2.5">Status payroll<span className="sr-only">: publikasi slip gaji; status jurnal tersedia di detail periode</span></th>
					<th scope="col" className="border-b border-slate-200 px-2 py-2.5 text-right"><span className="sr-only">Tindakan</span></th>
				</tr></thead>
				<tbody>
					{filteredRuns.map(run => {
						const summary = summaries[run.id];
						const published = Boolean(summary && summary.total > 0 && summary.published === summary.total);
						return <tr key={run.id} className="transition-colors hover:bg-slate-50/60">
							<td className="whitespace-nowrap px-5 py-4 font-medium"><button type="button" onClick={() => onOpen(run)} className="text-emerald-700 hover:underline">{periodLabel(run.period)}</button></td>
							<td className="whitespace-nowrap px-2 py-4">{updatedLabel(run.updated)}</td>
							<td className="px-2 py-4">{loading ? '…' : summary ? summary.total : '—'}</td>
							<td className="px-2 py-4"><button type="button" disabled={exportingId === run.id} onClick={() => { void exportRun(run); }} className="text-emerald-700 hover:underline disabled:opacity-50">{exportingId === run.id ? 'Mengekspor…' : 'Lihat'}</button></td>
							<td className="px-2 py-4">
								{loading ? <span className="text-xs text-slate-500">Memuat…</span> : !summary ? <span className="text-xs text-slate-500">Tidak tersedia</span> : published ? <span className="rounded-full bg-[#e5f4e9] px-2 py-1 text-xs font-medium text-[#31944b]">Diterbitkan</span> : summary.total === 0 ? <span className="text-xs text-slate-500">Belum ada slip gaji</span> : <div className="min-w-[150px] max-w-[185px]"><p className="mb-1 text-xs text-slate-700"><span className="text-slate-500">{summary.published} dari</span> {summary.total} payslip diterbitkan</p><div role="progressbar" aria-label={`Publikasi payslip ${periodLabel(run.period)}`} aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.published} className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${summary.published / summary.total * 100}%` }} /></div></div>}
							</td>
						<td className="px-2 py-4"><div className="flex items-center justify-end gap-2">{published && <button type="button" onClick={() => onOpen(run)} className="min-w-[128px] whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Lihat detail</button>}<DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Tindakan periode ${periodLabel(run.period)}`} className="grid size-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><MoreVertical className="size-5" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="bg-white"><DropdownMenuItem onSelect={() => onOpen(run)}>Proses payslip</DropdownMenuItem><DropdownMenuItem onSelect={() => onOpen(run)}>Lihat detail</DropdownMenuItem><DropdownMenuItem onSelect={() => onDelete(run)} className="text-red-600 focus:text-red-700">Hapus periode</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></td>
						</tr>;
					})}
					{filteredRuns.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">{runsLoading ? 'Memuat periode penggajian…' : runsError ? 'Data periode tidak dapat dimuat.' : runs.length === 0 ? 'Belum ada periode penggajian. Klik “Buat Periode” untuk mulai.' : 'Tidak ada periode yang cocok untuk tahun atau pencarian ini.'}</td></tr>}
				</tbody>
			</table>
		</div>
		{runsError && <p className="mt-3 text-xs text-slate-500">Data periode mungkin belum diperbarui. <button type="button" onClick={onRetry} className="font-semibold text-emerald-700 hover:underline">Coba lagi</button></p>}
		{!loading && Object.values(summaries).some(value => value === null) && <p className="mt-3 text-xs text-slate-500">Sebagian data slip tidak dapat dimuat. <button type="button" onClick={() => setRetry(value => value + 1)} className="font-semibold text-emerald-700 hover:underline">Coba lagi</button></p>}
		<Dialog open={Boolean(report)} onOpenChange={open => { if (!open) setReport(null); }}>
			<DialogContent className="max-h-[85vh] overflow-auto rounded-xl bg-white sm:max-w-lg">
				<DialogHeader><DialogTitle>Laporan penggajian {report ? periodLabel(report.period) : ''}</DialogTitle><DialogDescription>Ringkasan berdasarkan data periode penggajian yang tersimpan.</DialogDescription></DialogHeader>
				{report && <div className="space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-slate-500">Tanggal bayar</span><span>{formatDate(report.pay_date)}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500">Cut-off</span><span>{report.cutoff_start && report.cutoff_end ? `${formatDate(report.cutoff_start)} – ${formatDate(report.cutoff_end)}` : '—'}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500">Jumlah karyawan</span><span>{loading ? 'Memuat…' : reportSummary ? reportSummary.total : 'Tidak tersedia'}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500">Status jurnal</span><span>{RUN_STATUS_LABELS[report.status]}</span></div><div className="border-t border-slate-200 pt-3"><div className="flex justify-between py-1"><span>Total bruto</span><span>{formatRupiah(report.total_gross || 0)}</span></div><div className="flex justify-between py-1"><span>Total potongan</span><span>{formatRupiah(report.total_deductions || 0)}</span></div><div className="flex justify-between py-1 font-semibold"><span>Total bersih</span><span>{formatRupiah(report.total_net || 0)}</span></div></div><button type="button" onClick={() => { setReport(null); onOpen(report); }} className="mt-2 rounded-md border border-slate-300 px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">Buka detail periode</button></div>}
			</DialogContent>
		</Dialog>
	</section>;
}
