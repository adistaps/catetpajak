import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, RefreshCw, ChevronRight, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, type Company } from '@/lib/accounting';
import { type Employee, type PayrollRun, type Payslip, type PayrollRunStatus } from '@/lib/payroll';
import { getOrCreateTaxSettings } from '@/lib/tax';
import { exportPph21Excel } from '@/lib/pph21-excel-export';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';
import { PajakTabs } from './pajak-tabs';
import {
	formatIdDate,
	KODE_OBJEK_GAJI,
	TABLE_HEADERS,
	todayIsoDate,
	type WithholdingRow,
} from './pajak-shared';

interface PajakModuleProps {
	company: Company;
}

interface PeriodSummary {
	period: string;
	/** Label bulan/tahun untuk ditampilkan, mis. "November 2026". */
	label: string;
	runs: PayrollRun[];
	slipCount: number;
	totalGross: number;
	totalPph: number;
	posted: boolean;
}

const MONTH_NAMES_ID = [
	'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
	'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTH_NAMES_EN = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
];

function periodLabel(period: string, lang: 'id' | 'en'): string {
	const [y, m] = period.split('-').map(Number);
	if (!y || !m) return period;
	const names = lang === 'en' ? MONTH_NAMES_EN : MONTH_NAMES_ID;
	return `${names[m - 1]} ${y}`;
}

export function PajakModule({ company }: PajakModuleProps) {
	const { t, lang } = useLanguage();
	const navigate = useNavigate();
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [runs, setRuns] = useState<PayrollRun[]>([]);
	const [slips, setSlips] = useState<Payslip[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadFailed, setLoadFailed] = useState(false);
	const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
	const [tglPemotongan, setTglPemotongan] = useState(todayIsoDate());
	const [idTku, setIdTku] = useState('');
	const [statusFilter, setStatusFilter] = useState<'all' | 'aktif' | 'nonaktif'>('all');
	/** NPWP pemotong (perusahaan) dari pengaturan pajak untuk header ekspor. */
	const [npwpPemotong, setNpwpPemotong] = useState('');

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setLoadFailed(false);
		const companyFilter = pb.filter('company = {:company}', { company: company.id });
		Promise.allSettled([
			pb.collection('employees').getFullList<Employee>({ filter: companyFilter, sort: 'name', requestKey: null }),
			pb.collection('payroll_runs').getFullList<PayrollRun>({ filter: companyFilter, sort: '-period,-created', requestKey: null }),
			pb.collection('payslips').getFullList<Payslip>({ filter: companyFilter, sort: '-created', requestKey: null }),
			getOrCreateTaxSettings(company.id, pb.authStore.record?.id ?? ''),
		]).then(results => {
			if (cancelled) return;
			setLoading(false);
			if (results[0].status === 'fulfilled') setEmployees(results[0].value);
			if (results[1].status === 'fulfilled') setRuns(results[1].value);
			if (results[2].status === 'fulfilled') setSlips(results[2].value);
			if (results[3].status === 'fulfilled') setNpwpPemotong(results[3].value.npwp || '');
			const failed = results.slice(0, 3).some(r => r.status === 'rejected');
			setLoadFailed(failed);
			if (failed) toast.error(t('tax.load_failed'));
		});
		return () => { cancelled = true; };
	}, [company.id, t]);

	const runById = useMemo(() => {
		const map = new Map<string, PayrollRun>();
		for (const run of runs) map.set(run.id, run);
		return map;
	}, [runs]);

	/** Bulan payroll yang sudah dijalankan, dikelompokkan per periode (YYYY-MM). */
	const periods = useMemo<PeriodSummary[]>(() => {
		const map = new Map<string, PeriodSummary>();
		for (const slip of slips) {
			const run = runById.get(slip.run);
			const period = run?.period ?? '';
			if (!period) continue;
			let entry = map.get(period);
			if (!entry) {
				entry = {
					period,
					label: periodLabel(period, lang),
					runs: [],
					slipCount: 0,
					totalGross: 0,
					totalPph: 0,
					posted: false,
				};
				map.set(period, entry);
			}
			entry.slipCount += 1;
			entry.totalGross += slip.gross || 0;
			entry.totalPph += slip.pph21 || 0;
			if (run && !entry.runs.some(r => r.id === run.id)) entry.runs.push(run);
			if (run?.status === 'posted') entry.posted = true;
		}
		return Array.from(map.values()).sort((a, b) => b.period.localeCompare(a.period));
	}, [slips, runById, lang]);

	const selectedRun = useMemo(() => {
		if (!selectedPeriod) return null;
		// Utamakan run posted untuk periode terpilih.
		const periodRuns = runs.filter(r => r.period === selectedPeriod);
		return periodRuns.find(r => r.status === 'posted') ?? periodRuns[0] ?? null;
	}, [runs, selectedPeriod]);

	const selectedRunIds = useMemo(() => {
		if (!selectedPeriod) return new Set<string>();
		return new Set(runs.filter(r => r.period === selectedPeriod).map(r => r.id));
	}, [runs, selectedPeriod]);

	const withholdingRows = useMemo((): WithholdingRow[] => {
		if (!selectedPeriod) return [];
		const masaPajak = selectedPeriod.slice(5, 7);
		const tahunPajak = selectedPeriod.slice(0, 4);
		const periodSlips = slips.filter(s => selectedRunIds.has(s.run));
		const empList =
			statusFilter === 'all'
				? employees
				: employees.filter(e => e.status === statusFilter);
		const empIdSet = new Set(empList.map(e => e.id));

		return periodSlips
			.filter(slip => empIdSet.has(slip.employee))
			.map(slip => {
				const emp = employees.find(e => e.id === slip.employee);
				const run = runById.get(slip.run);
				const bruto = slip.gross || 0;
				const tax = slip.pph21 || 0;
				const rate = bruto > 0 ? tax / bruto : 0;
				const rateLabel = bruto > 0 ? `${(rate * 100).toFixed(2)}%` : '0%';
				const empName = emp?.name ?? '—';
				const empHasNpwp = Boolean((emp?.npwp ?? '').trim());
				const npwp = (emp?.npwp ?? '').trim();

				return {
					id: slip.id,
					employeeId: slip.employee,
					name: empName,
					masaPajak,
					tahunPajak,
					statusPegawai: emp?.status === 'aktif' ? 'Pegawai Tetap' : 'Tidak Aktif',
					npwpNikTin: npwp || '—',
					nomorPassport: '—',
					status: empHasNpwp ? 'NPWP' : 'NIK',
					posisi: emp?.position || '—',
					sertifikatFasilitas: 'N/A',
					kodeObjekPajak: KODE_OBJEK_GAJI,
					penghasilanKotor: bruto,
					tarif: rate,
					tarifLabel: rateLabel,
					idTku: idTku.trim() || '—',
					tglPemotongan,
					pph21: tax,
					ptkpStatus: emp?.ptkp_status ?? 'TK0',
					employeeType: emp?.employee_type,
					source: (run?.status === 'posted' ? 'aktual' : 'draf') as WithholdingRow['source'],
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [selectedPeriod, slips, selectedRunIds, employees, statusFilter, tglPemotongan, idTku, runById]);

	const totalKotor = withholdingRows.reduce((s, r) => s + r.penghasilanKotor, 0);
	const totalPph = withholdingRows.reduce((s, r) => s + r.pph21, 0);

	const exportPph21 = () => {
		try {
			exportPph21Excel(withholdingRows, {
				npwpPemotong,
				period: selectedPeriod ?? '',
			});
			toast.success(t('tax.excel_downloaded'));
		} catch {
			toast.error(t('tax.excel_failed'));
		}
	};

	return (
		<div className="pajak-clean mx-auto max-w-[1400px]">
			<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
				<PajakTabs />
				<div className="min-w-0 flex-1 space-y-6">
					<header className="flex flex-wrap items-end justify-between gap-4">
						<div>
							<h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
								<FileText className="size-7 text-primary" strokeWidth={2} />
								{t('tax.title')}
							</h1>
							<p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
								{t('tax.subtitle')}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{selectedPeriod ? (
								<button
									type="button"
									onClick={exportPph21}
									disabled={withholdingRows.length === 0}
									className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
								>
									{t('tax.export_excel')}
								</button>
							) : null}
							<button
								type="button"
								onClick={() => navigate('/app/pajak/simulasi')}
								className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							>
								<RefreshCw className="size-3.5" /> {t('tax.open_sim')}
							</button>
						</div>
					</header>

					{!selectedPeriod ? (
						/* ---------------- Daftar Bulan Payroll ---------------- */
						<section className="space-y-4">
							<div className="flex flex-wrap items-end justify-between gap-3">
								<div>
									<h2 className="text-sm font-bold text-foreground">{t('tax.periods_title')}</h2>
									<p className="mt-1 max-w-2xl text-[11px] text-muted-foreground">
										{t('tax.periods_subtitle')}
									</p>
								</div>
							</div>

							{loading ? (
								<div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
									{t('tax.loading_periods')}
								</div>
							) : loadFailed && periods.length === 0 ? (
								<div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
									{t('tax.load_failed')}
								</div>
							) : periods.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
									<CalendarDays className="mx-auto size-8 text-muted-foreground/60" />
									<p className="mt-3 text-sm text-muted-foreground">{t('tax.periods_empty')}</p>
								</div>
							) : (
								<ul className="space-y-2.5">
									{periods.map(p => (
										<li key={p.period}>
											<button
												type="button"
												onClick={() => setSelectedPeriod(p.period)}
												className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
											>
												<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
													<CalendarDays className="size-5" />
												</div>
												<div className="min-w-0 flex-1">
													<div className="flex flex-wrap items-center gap-2">
														<span className="text-sm font-bold text-foreground">{p.label}</span>
														<span
															className={cn(
																'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
																p.posted
																	? 'bg-primary/10 text-primary'
																	: 'bg-amber-100 text-amber-800',
															)}
														>
															{p.posted ? t('tax.run_posted') : t('tax.run_draft')}
														</span>
													</div>
													<p className="mt-0.5 text-[11px] text-muted-foreground">
														{t('tax.period_employees', { count: p.slipCount })} · {t('tax.total_gross')}: {formatRupiah(p.totalGross)}
													</p>
												</div>
												<div className="hidden text-right sm:block">
													<p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('tax.total_pph')}</p>
													<p className="text-sm font-bold text-primary">{formatRupiah(p.totalPph)}</p>
												</div>
												<div className="flex items-center gap-2">
													<span className="hidden text-xs font-semibold text-primary sm:inline">
														{t('tax.view_detail')}
													</span>
													<ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
												</div>
											</button>
										</li>
									))}
								</ul>
							)}
						</section>
					) : (
						/* ---------------- Rincian per Bulan ---------------- */
						<section className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<button
									type="button"
									onClick={() => setSelectedPeriod(null)}
									className="text-xs font-semibold text-primary transition-colors hover:text-primary/80"
								>
									{t('tax.back_to_periods')}
								</button>
								{selectedRun ? (
									<span
										className={cn(
											'rounded-full px-3 py-1 text-[10px] font-bold',
											selectedRun.status === 'posted'
												? 'bg-primary/10 text-primary'
												: 'bg-amber-100 text-amber-800',
										)}
									>
										{selectedRun.status === 'posted' ? t('tax.run_posted') : t('tax.run_draft')}
									</span>
								) : null}
							</div>

							<div className="flex flex-wrap items-end justify-between gap-3">
								<div>
									<h2 className="text-lg font-bold tracking-tight text-foreground">
										{t('tax.detail_for', { period: periodLabel(selectedPeriod, lang) })}
									</h2>
									<p className="mt-1 text-[11px] text-muted-foreground">
										{t('tax.rows', { count: withholdingRows.length, masa: selectedPeriod.slice(5, 7), tahun: selectedPeriod.slice(0, 4), code: KODE_OBJEK_GAJI })}
									</p>
								</div>
								<div className="flex flex-wrap gap-4 text-right text-[11px]">
									<div>
										<p className="font-semibold uppercase tracking-wide text-muted-foreground">{t('tax.total_gross')}</p>
										<p className="text-sm font-bold text-foreground">{formatRupiah(totalKotor)}</p>
									</div>
									<div>
										<p className="font-semibold uppercase tracking-wide text-muted-foreground">{t('tax.total_pph')}</p>
										<p className="text-sm font-bold text-primary">{formatRupiah(totalPph)}</p>
									</div>
								</div>
							</div>

							{/* Filter bar */}
							<section className="rounded-2xl border border-border bg-card p-4 shadow-soft-sm">
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									<label className="block">
										<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											{t('tax.tgl_potong')}
										</span>
										<input
											type="date"
											value={tglPemotongan}
											onChange={e => setTglPemotongan(e.target.value)}
											className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
										/>
									</label>
									<label className="block">
										<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											{t('tax.id_tku')}
										</span>
										<input
											type="text"
											value={idTku}
											onChange={e => setIdTku(e.target.value)}
											placeholder="Optional"
											className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
										/>
									</label>
									<label className="block">
										<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											{t('tax.status_pegawai')}
										</span>
										<select
											value={statusFilter}
											onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
											className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
										>
											<option value="aktif">{t('tax.active')}</option>
											<option value="nonaktif">{t('tax.inactive')}</option>
											<option value="all">{t('tax.all')}</option>
										</select>
									</label>
								</div>
							</section>

							{/* e-Bupot style table */}
							<section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
								<div className="overflow-x-auto">
									<table className="w-full min-w-[1280px] border-collapse text-left text-[11px]">
										<thead>
											<tr className="bg-muted/80">
												<th className="sticky left-0 z-10 border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold text-muted-foreground">
													{t('tax.col.name')}
												</th>
												{TABLE_HEADERS.map(h => (
													<th
														key={h}
														className="whitespace-nowrap border-b border-border px-3 py-2.5 font-semibold text-muted-foreground"
													>
														{h}
													</th>
												))}
												<th className="whitespace-nowrap border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">
													{t('tax.col.pph21')}
												</th>
											</tr>
										</thead>
										<tbody>
											{withholdingRows.length === 0 ? (
												<tr>
													<td
														colSpan={TABLE_HEADERS.length + 2}
														className="px-4 py-12 text-center text-sm text-muted-foreground"
													>
														{t('tax.empty_no_payroll', { masa: selectedPeriod.slice(5, 7), tahun: selectedPeriod.slice(0, 4) })}
													</td>
												</tr>
											) : (
												withholdingRows.map(row => (
													<tr
														key={row.id}
														className="group border-b border-border/70 transition-colors hover:bg-primary/5"
													>
														<td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2.5 font-semibold text-foreground group-hover:bg-primary/5">
															<button
																type="button"
																onClick={() =>
																	navigate(`/app/pajak/simulasi?employee=${row.employeeId}`)
																}
																className="text-left text-primary hover:underline"
															>
																{row.name}
															</button>
															<span
																className={cn(
																	'ml-1 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold align-middle',
																	row.source === 'aktual'
																		? 'bg-primary/10 text-primary'
																		: 'bg-sky-100 text-sky-700',
																)}
																title={
																	row.source === 'aktual'
																		? 'Dari slip gaji yang sudah diterbitkan'
																		: 'Dari slip gaji (masih draf)'
																}
															>
																{row.source === 'aktual' ? t('tax.source.aktual') : t('tax.source.draf')}
															</span>
														</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-foreground">{row.masaPajak}</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-foreground">{row.tahunPajak}</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-foreground">{row.statusPegawai}</td>
														<td className="whitespace-nowrap px-3 py-2.5 font-mono text-foreground">{row.npwpNikTin}</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{row.nomorPassport}</td>
														<td className="whitespace-nowrap px-3 py-2.5">
															<span
																className={cn(
																	'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
																	row.status === 'NPWP'
																		? 'bg-primary/10 text-primary'
																		: 'bg-amber-100 text-amber-800',
																)}
															>
																{row.status}
															</span>
														</td>
														<td className="max-w-[140px] truncate px-3 py-2.5 text-foreground" title={row.posisi}>
															{row.posisi}
														</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
															{row.sertifikatFasilitas}
														</td>
														<td className="whitespace-nowrap px-3 py-2.5 font-mono text-foreground">
															{row.kodeObjekPajak}
														</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-foreground">
															{formatRupiah(row.penghasilanKotor)}
														</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-foreground">
															{row.tarifLabel}
														</td>
														<td className="whitespace-nowrap px-3 py-2.5 font-mono text-muted-foreground">
															{row.idTku}
														</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-foreground">
															{formatIdDate(row.tglPemotongan)}
														</td>
														<td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
															{formatRupiah(row.pph21)}
														</td>
													</tr>
												))
											)}
										</tbody>
										{withholdingRows.length > 0 ? (
											<tfoot>
												<tr className="bg-muted/50 font-semibold">
													<td className="sticky left-0 z-10 border-r border-t border-border bg-muted/80 px-3 py-2.5">
														{t('tax.total')}
													</td>
													<td colSpan={9} className="border-t border-border px-3 py-2.5" />
													<td className="border-t border-border px-3 py-2.5 text-right tabular-nums">
														{formatRupiah(totalKotor)}
													</td>
													<td className="border-t border-border px-3 py-2.5" />
													<td className="border-t border-border px-3 py-2.5" />
													<td className="border-t border-border px-3 py-2.5" />
													<td className="border-t border-border px-3 py-2.5 text-right tabular-nums text-primary">
														{formatRupiah(totalPph)}
													</td>
												</tr>
											</tfoot>
										) : null}
									</table>
								</div>
							</section>
						</section>
					)}
				</div>
			</div>
		</div>
	);
}
