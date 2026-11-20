import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ArrowLeft,
	Banknote,
	CheckCircle2,
	Search,
	Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, todayIso, type Company } from '@/lib/accounting';
import {
	DISBURSEMENT_METHOD_VALUES,
	DISBURSEMENT_STATUS_LABELS,
	RUN_STATUS_LABELS,
	type DisbursementMethod,
	type DisbursementStatus,
	type PayrollRun,
	type Payslip,
} from '@/lib/payroll';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';
import { NeoBankIntegrationPanel } from '@/components/app/neo-bank-integration-panel';

interface Props {
	company: Company;
	runs: PayrollRun[];
	onRefreshRuns: () => Promise<void>;
}

interface RunSummary {
	total: number;
	paid: number;
	totalNet: number;
	paidNet: number;
}

type SummaryState = Record<string, RunSummary | null>;

function periodLabel(period: string) {
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
	const [year, month] = period.split('-');
	return months[Number(month) - 1] ? `${months[Number(month) - 1]} ${year}` : period;
}

export function PayrollDisbursement({ company, runs, onRefreshRuns }: Props) {
	const { t } = useLanguage();
	const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
	const [summaries, setSummaries] = useState<SummaryState>({});
	const [summariesLoading, setSummariesLoading] = useState(true);
	const [retry, setRetry] = useState(0);

	const [payslips, setPayslips] = useState<Payslip[]>([]);
	const [payslipsLoading, setPayslipsLoading] = useState(false);
	const [payslipsError, setPayslipsError] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const [search, setSearch] = useState('');

	// Dialog untuk menandai pencairan.
	const [markOpen, setMarkOpen] = useState(false);
	const [markDate, setMarkDate] = useState(todayIso());
	const [markMethod, setMarkMethod] = useState<DisbursementMethod | ''>('');
	const [markNotes, setMarkNotes] = useState('');
	const [marking, setMarking] = useState(false);
	const [revertId, setRevertId] = useState<string | null>(null);
	const [reverting, setReverting] = useState(false);
	const [neoBankReady, setNeoBankReady] = useState(false);

	const ownerId = pb.authStore.record?.id ?? '';

	const methodLabel = useCallback(
		(method: DisbursementMethod | string | undefined | null): string => {
			if (!method) return t('payroll.disbursement.no_method');
			return t(`payroll.disbursement.method.${method}` as const);
		},
		[t],
	);

	const refreshSummaries = useCallback(async () => {
		setSummariesLoading(true);
		const entries = await Promise.all(
			runs.map(async run => {
				try {
					const list = await pb
						.collection('payslips')
						.getFullList<{ id: string; net_pay: number; disbursement_status?: string }>({
							filter: pb.filter('company = {:company} && run = {:run}', {
								company: company.id,
								run: run.id,
							}),
							fields: 'id,net_pay,disbursement_status',
							requestKey: null,
						});
					const total = list.length;
					const paid = list.filter(s => s.disbursement_status === 'paid').length;
					const totalNet = list.reduce((sum, s) => sum + (s.net_pay || 0), 0);
					const paidNet = list
						.filter(s => s.disbursement_status === 'paid')
						.reduce((sum, s) => sum + (s.net_pay || 0), 0);
					return [run.id, { total, paid, totalNet, paidNet }] as const;
				} catch {
					return [run.id, null] as const;
				}
			}),
		);
		setSummaries(Object.fromEntries(entries));
		setSummariesLoading(false);
	}, [company.id, runs]);

	useEffect(() => {
		refreshSummaries().catch(() => {});
	}, [refreshSummaries, retry]);

	const openRun = useCallback(
		async (run: PayrollRun) => {
			setSelectedRun(run);
			setSelected([]);
			setSearch('');
			setPayslipsLoading(true);
			setPayslipsError(false);
			try {
				const list = await pb.collection('payslips').getFullList<Payslip>({
					filter: pb.filter('company = {:company} && run = {:run}', {
						company: company.id,
						run: run.id,
					}),
					sort: 'created',
					expand: 'employee',
					requestKey: null,
				});
				setPayslips(list);
			} catch {
				setPayslipsError(true);
				toast.error('Gagal memuat slip gaji untuk periode ini.');
			} finally {
				setPayslipsLoading(false);
			}
		},
		[company.id],
	);

	const closeRun = () => {
		setSelectedRun(null);
		setPayslips([]);
		setSelected([]);
	};

	const filteredPayslips = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return payslips;
		return payslips.filter(s => {
			const name = s.expand?.employee?.name || '';
			const position = s.expand?.employee?.position || '';
			return name.toLowerCase().includes(q) || position.toLowerCase().includes(q);
		});
	}, [payslips, search]);

	const allSelected =
		payslips.length > 0 && payslips.every(s => selected.includes(s.id));

	const toggle = (id: string) =>
		setSelected(prev =>
			prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
		);

	const openMark = (ids: string[]) => {
		if (ids.length === 0) {
			toast.info('Pilih minimal satu karyawan.');
			return;
		}
		setMarkDate(todayIso());
		setMarkMethod('');
		setMarkNotes('');
		setMarkOpen(true);
	};

	const confirmMark = async () => {
		if (!selectedRun || marking) return;
		if (!markDate) {
			toast.error('Tanggal pencairan wajib diisi.');
			return;
		}
		if (!markMethod) {
			toast.error(t('payroll.disbursement.method_required'));
			return;
		}
		if (markMethod === 'neo_bank') {
			setMarking(true);
			try {
				const res = await fetch('/api/neo-bank/disburse', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						token: pb.authStore.token,
						companyId: company.id,
						runId: selectedRun.id,
						payslipIds: selected,
						disbursementDate: markDate,
						notes: markNotes,
					}),
				});
				const data = await res.json().catch(() => ({}));
				setMarking(false);
				setMarkOpen(false);
				setSelected([]);
				if (!data.configured) {
					toast.error(t('payroll.disbursement.neo_bank.not_configured'));
					return;
				}
				if (data.companyReady === false) {
					toast.error(t('payroll.disbursement.neo_bank.company_not_ready'));
					return;
				}
				await openRun(selectedRun);
				await refreshSummaries().catch(() => {});
				if (data.failed > 0 && data.success > 0) {
					toast.error(t('payroll.disbursement.neo_bank.partial', { ok: data.success, fail: data.failed }));
				} else if (data.success > 0) {
					toast.success(t('payroll.disbursement.neo_bank.success', { count: data.success }));
				} else {
					toast.error(t('payroll.disbursement.neo_bank.all_failed'));
				}
			} catch {
				setMarking(false);
				toast.error('Gagal memproses pencairan via Neo Bank.');
			}
			return;
		}
		setMarking(true);
		const targets = payslips.filter(s => selected.includes(s.id) && s.disbursement_status !== 'paid');
		if (targets.length === 0) {
			setMarking(false);
			setMarkOpen(false);
			toast.info('Slip terpilih sudah ditandai dicairkan.');
			return;
		}
		const results = await Promise.allSettled(
			targets.map((slip, index) =>
				pb.collection('payslips').update(
					slip.id,
					{
						disbursement_status: 'paid',
						disbursement_date: markDate,
						disbursement_method: markMethod,
						disbursement_notes: markNotes.trim(),
						disbursed_by: ownerId,
					},
					{ requestKey: `disburse-${slip.id}-${index}` },
				),
			),
		);
		const failed = results.filter(r => r.status === 'rejected').length;
		setMarking(false);
		setMarkOpen(false);
		setSelected([]);
		if (selectedRun) await openRun(selectedRun);
		await refreshSummaries().catch(() => {});
		await onRefreshRuns().catch(() => {});
		if (failed) {
			toast.error(`${targets.length - failed} slip ditandai dicairkan, ${failed} gagal.`);
		} else {
			toast.success(`${targets.length} slip ditandai sudah dicairkan.`);
		}
	};

	const confirmRevert = async () => {
		if (!selectedRun || !revertId || reverting) return;
		setReverting(true);
		try {
			await pb.collection('payslips').update(revertId, {
				disbursement_status: 'pending',
				disbursement_date: '',
				disbursement_method: '',
				disbursement_notes: '',
				disbursed_by: '',
			});
			toast.success('Status pencairan dibatalkan menjadi belum dicairkan.');
			await openRun(selectedRun);
			await refreshSummaries().catch(() => {});
		} catch {
			toast.error('Gagal membatalkan status pencairan.');
		} finally {
			setReverting(false);
			setRevertId(null);
		}
	};

	// ---------------- Daftar periode ----------------
	if (!selectedRun) {
		return (
			<div className="space-y-5">
				<div>
					<h2 className="text-xl font-bold tracking-tight text-slate-900">{t('payroll.disbursement_title')}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t('payroll.disbursement_desc')}
					</p>
				</div>
				<NeoBankIntegrationPanel company={company} onStatusChange={s => setNeoBankReady(Boolean(s?.companyReady))} />
				<div className="overflow-x-auto">
					<table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm text-slate-800">
						<thead>
							<tr className="text-left text-[13px] font-semibold text-slate-900">
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-5 py-2.5">{t('payroll.col.period')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-2 py-2.5">{t('payroll.col.pay_date')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-2 py-2.5 text-right">{t('payroll.col.net_pay')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-2 py-2.5">{t('payroll.col.disbursement_status')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-2 py-2.5">{t('payroll.col.payroll_status')}</th>
								<th scope="col" className="border-b border-slate-200 px-2 py-2.5 text-right"><span className="sr-only">Tindakan</span></th>
							</tr>
						</thead>
						<tbody>
							{runs.map(run => {
								const summary = summaries[run.id];
								return (
									<tr key={run.id} className="transition-colors hover:bg-slate-50/60">
										<td className="whitespace-nowrap px-5 py-4 font-medium">
											<button type="button" onClick={() => openRun(run)} className="text-emerald-700 hover:underline">
												{periodLabel(run.period)}
											</button>
										</td>
										<td className="whitespace-nowrap px-2 py-4">{formatDate(run.pay_date)}</td>
										<td className="whitespace-nowrap px-2 py-4 text-right tabular-nums">
											{summariesLoading ? '…' : summary ? formatRupiah(summary.totalNet) : '—'}
										</td>
										<td className="px-2 py-4">
											{summariesLoading ? (
												<span className="text-xs text-slate-500">Memuat…</span>
											) : !summary ? (
												<span className="text-xs text-slate-500">Tidak tersedia</span>
											) : summary.total === 0 ? (
												<span className="text-xs text-slate-500">Belum ada slip gaji</span>
											) : (
												<div className="min-w-[150px] max-w-[200px]">
													<p className="mb-1 text-xs text-slate-700">
														<span className="text-slate-500">{summary.paid} dari</span> {summary.total} dicairkan
													</p>
													<div
														role="progressbar"
														aria-label={`Pencairan ${periodLabel(run.period)}`}
														aria-valuemin={0}
														aria-valuemax={summary.total}
														aria-valuenow={summary.paid}
														className="h-2 overflow-hidden rounded-full bg-slate-200"
													>
														<div
															className="h-full rounded-full bg-emerald-600"
															style={{ width: `${(summary.paid / summary.total) * 100}%` }}
														/>
													</div>
													<p className="mt-1 text-[11px] text-slate-500">
														{formatRupiah(summary.paidNet)} / {formatRupiah(summary.totalNet)}
													</p>
												</div>
											)}
										</td>
										<td className="whitespace-nowrap px-2 py-4">
											<span
												className={cn(
													'rounded-full px-2 py-1 text-xs font-semibold',
													run.status === 'posted'
														? 'bg-emerald-100 text-emerald-800'
														: 'bg-amber-100 text-amber-800',
												)}
											>
												{RUN_STATUS_LABELS[run.status]}
											</span>
										</td>
										<td className="px-2 py-4 text-right">
											<button
												type="button"
												onClick={() => openRun(run)}
												disabled={summariesLoading || summary?.total === 0}
												className="min-w-[128px] whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
											>
												Kelola pencairan
											</button>
										</td>
									</tr>
								);
							})}
							{runs.length === 0 && (
								<tr>
									<td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
										{summariesLoading ? t('payroll.disbursement.loading_periods') : t('payroll.disbursement.no_periods')}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				{!summariesLoading && Object.values(summaries).some(v => v === null) && (
					<p className="text-xs text-slate-500">
						Sebagian data slip tidak dapat dimuat.{' '}
						<button type="button" onClick={() => setRetry(v => v + 1)} className="font-semibold text-emerald-700 hover:underline">
							Coba lagi
						</button>
					</p>
				)}
			</div>
		);
	}

	// ---------------- Detail pencairan periode ----------------
	const paidCount = payslips.filter(s => s.disbursement_status === 'paid').length;
	const paidNet = payslips.filter(s => s.disbursement_status === 'paid').reduce((sum, s) => sum + (s.net_pay || 0), 0);
	const pendingCount = payslips.length - paidCount;

	return (
		<div className="space-y-5">
			<div>
				<button
					type="button"
					onClick={closeRun}
					className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
				>
					<ArrowLeft className="size-4" /> Kembali ke daftar pencairan
				</button>
				<h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
					{t('payroll.disbursement_title')} {periodLabel(selectedRun.period)}
				</h2>
				<p className="text-sm text-muted-foreground">
					{t('payroll.col.pay_date')} {formatDate(selectedRun.pay_date)}
					{selectedRun.cutoff_start && selectedRun.cutoff_end
						? ` · Cut-off ${formatDate(selectedRun.cutoff_start)} – ${formatDate(selectedRun.cutoff_end)}`
						: ''}
				</p>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<SummaryCard label={t('payroll.disbursement.total_slip')} value={String(payslips.length)} />
				<SummaryCard label={t('payroll.disbursement.paid')} value={String(paidCount)} accent="emerald" />
				<SummaryCard label={t('payroll.disbursement.unpaid')} value={String(pendingCount)} accent="amber" />
				<SummaryCard label={t('payroll.disbursement.total_paid')} value={formatRupiah(paidNet)} />
			</div>

			{selected.length > 0 && (
				<div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg bg-[#f5f6f8] px-4 py-3 text-sm">
					<span className="font-medium">{selected.length} karyawan dipilih</span>
					<button
						type="button"
						onClick={() => openMark(selected)}
						className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 font-medium text-white hover:bg-emerald-800"
					>
						<CheckCircle2 className="size-4" /> Tandai sudah dibayar
					</button>
					{!allSelected && (
						<button
							type="button"
							onClick={() => setSelected(payslips.map(s => s.id))}
							className="font-medium text-emerald-700 hover:underline"
						>
							Pilih semua {payslips.length}
						</button>
					)}
					<button
						type="button"
						onClick={() => setSelected([])}
						className="text-xs font-semibold text-slate-600 hover:underline"
					>
						Hapus pilihan
					</button>
				</div>
			)}

			<div className="mb-3 flex items-center justify-between gap-3">
				<label className="relative w-full sm:w-64">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
					<span className="sr-only">Cari karyawan</span>
					<input
						type="search"
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder={t('payroll.disbursement.search')}
						className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
					/>
				</label>
				<button
					type="button"
					onClick={() => openMark(payslips.filter(s => s.disbursement_status !== 'paid').map(s => s.id))}
					disabled={payslipsLoading || pendingCount === 0}
					className="hidden shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
				>
					<Banknote className="size-4" /> {t('payroll.disbursement.pay_all')}
				</button>
			</div>

			{payslipsLoading ? (
				<p role="status" className="px-4 py-10 text-center text-sm text-slate-500">Memuat slip gaji…</p>
			) : payslipsError ? (
				<p role="alert" className="px-4 py-10 text-center text-sm text-slate-500">
					Data slip tidak dapat dimuat.{' '}
					<button type="button" onClick={() => openRun(selectedRun)} className="font-semibold text-emerald-700 hover:underline">Coba lagi</button>
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[980px] text-left text-sm">
						<thead>
							<tr className="text-[13px] font-semibold text-slate-900">
								<th scope="col" className="border-b border-slate-200 px-3 py-3 w-10">
									<input
										type="checkbox"
										aria-label="Pilih semua slip"
										checked={allSelected}
										onChange={() => setSelected(allSelected ? [] : payslips.map(s => s.id))}
										className="size-4 accent-emerald-600"
									/>
								</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{t('payroll.col.employee')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-3 text-right">{t('payroll.col.net_pay')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{t('payroll.col.disbursement_status')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{t('payroll.col.disbursement_method')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{t('payroll.col.disbursement_date')}</th>
								<th scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{t('payroll.col.notes')}</th>
								<th scope="col" className="border-b border-slate-200 px-3 py-3 text-right"><span className="sr-only">Aksi</span></th>
							</tr>
						</thead>
						<tbody>
							{filteredPayslips.map(slip => {
								const person = slip.expand?.employee;
								const paid = slip.disbursement_status === 'paid';
								return (
									<tr key={slip.id} className="hover:bg-slate-50/60">
										<td className="px-3 py-3">
											<input
												type="checkbox"
												aria-label={`Pilih ${person?.name || 'slip'}`}
												checked={selected.includes(slip.id)}
												onChange={() => toggle(slip.id)}
												className="size-4 accent-emerald-600"
											/>
										</td>
										<td className="px-3 py-3">
											<div className="font-medium">{person?.name || '—'}</div>
											{person?.position && <div className="mt-0.5 text-xs text-slate-500">{person.position}</div>}
										</td>
										<td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatRupiah(slip.net_pay || 0)}</td>
										<td className="whitespace-nowrap px-3 py-3">
											<span
												className={cn(
													'rounded-full px-2.5 py-1 text-xs font-semibold',
													paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
												)}
											>
												{DISBURSEMENT_STATUS_LABELS[(slip.disbursement_status ?? 'pending') as DisbursementStatus]}
											</span>
										</td>
										<td className="whitespace-nowrap px-3 py-3 text-slate-700">
											{paid ? methodLabel(slip.disbursement_method) : '—'}
										</td>
										<td className="whitespace-nowrap px-3 py-3 text-slate-700">
											{slip.disbursement_date ? formatDate(slip.disbursement_date) : '—'}
										</td>
										<td className="px-3 py-3 text-slate-600">
											<span className="line-clamp-2 max-w-[220px]">{slip.disbursement_notes || '—'}</span>
										</td>
										<td className="px-3 py-3 text-right">
											{paid ? (
												<button
													type="button"
													onClick={() => setRevertId(slip.id)}
													className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
												>
													<Undo2 className="size-3.5" /> {t('payroll.disbursement.revert_button')}
												</button>
											) : (
												<button
													type="button"
													onClick={() => {
														setSelected([slip.id]);
														openMark([slip.id]);
													}}
													className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
												>
													<CheckCircle2 className="size-3.5" /> {t('payroll.disbursement.mark_button')}
												</button>
											)}
										</td>
									</tr>
								);
							})}
							{filteredPayslips.length === 0 && (
								<tr>
									<td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
										{payslips.length ? t('payroll.disbursement.no_match') : t('payroll.disbursement.no_slips')}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}

			{/* Dialog konfirmasi pencairan */}
			<Dialog open={markOpen} onOpenChange={setMarkOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t('payroll.disbursement.confirm_title')}</DialogTitle>
						<DialogDescription>
							{t('payroll.disbursement.confirm_desc', { count: selected.length, period: periodLabel(selectedRun.period) })}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						{/* Tinjauan jumlah dan karyawan sebelum konfirmasi */}
						<div className="rounded-lg border border-slate-200 bg-[#f7f9fb] p-3">
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
								{t('payroll.disbursement.review_title')}
							</p>
							<p className="mt-1 text-xs leading-relaxed text-slate-500">
								{t('payroll.disbursement.review_summary')}
							</p>
							<dl className="mt-3 grid grid-cols-2 gap-3">
								<div>
									<dt className="text-xs text-slate-500">{t('payroll.disbursement.review_employee_count')}</dt>
									<dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
										{payslips.filter(s => selected.includes(s.id) && s.disbursement_status !== 'paid').length}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-slate-500">{t('payroll.disbursement.review_total_net')}</dt>
									<dd className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">
										{formatRupiah(
											payslips
												.filter(s => selected.includes(s.id) && s.disbursement_status !== 'paid')
												.reduce((sum, s) => sum + (s.net_pay || 0), 0),
										)}
									</dd>
								</div>
							</dl>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="disb-method" className="block text-sm font-semibold">
								{t('payroll.disbursement.method')} <span className="text-destructive">*</span>
							</label>
							<select
								id="disb-method"
								value={markMethod}
								onChange={e => setMarkMethod(e.target.value as DisbursementMethod | '')}
								className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
							>
								<option value="">{t('payroll.disbursement.method_placeholder')}</option>
								{DISBURSEMENT_METHOD_VALUES.filter(method => method !== 'neo_bank' || neoBankReady).map(method => (
									<option key={method} value={method}>
										{t(`payroll.disbursement.method.${method}` as const)}
									</option>
								))}
							</select>
							{markMethod === 'neo_bank' ? (
								<p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
									{t('payroll.disbursement.neo_bank.review_note')}
								</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<label htmlFor="disb-date" className="block text-sm font-semibold">
								{t('payroll.disbursement.date')} <span className="text-destructive">*</span>
							</label>
							<input
								id="disb-date"
								type="date"
								required
								value={markDate}
								onChange={e => setMarkDate(e.target.value)}
								className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="disb-notes" className="block text-sm font-semibold">{t('payroll.disbursement.notes')}</label>
							<textarea
								id="disb-notes"
								value={markNotes}
								onChange={e => setMarkNotes(e.target.value)}
								placeholder={t('payroll.disbursement.notes_placeholder')}
								rows={3}
								className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
							/>
						</div>
					</div>
					<DialogFooter className="gap-2">
						<button
							type="button"
							onClick={() => setMarkOpen(false)}
							disabled={marking}
							className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-muted disabled:opacity-50"
						>
							Batal
						</button>
						<button
							type="button"
							onClick={() => confirmMark()}
							disabled={marking || !markDate || !markMethod}
							className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<CheckCircle2 className="size-4" />
							{marking ? t('payroll.disbursement.marking') : t('payroll.disbursement.confirm')}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog konfirmasi pembatalan */}
			<Dialog open={Boolean(revertId)} onOpenChange={open => { if (!open) setRevertId(null); }}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t('payroll.disbursement.revert_title')}</DialogTitle>
						<DialogDescription>
							{t('payroll.disbursement.revert_desc')}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<button
							type="button"
							onClick={() => setRevertId(null)}
							disabled={reverting}
							className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-muted disabled:opacity-50"
						>
							Batal
						</button>
						<button
							type="button"
							onClick={() => confirmRevert()}
							disabled={reverting}
							className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
						>
							{reverting ? t('payroll.disbursement.reverting') : t('payroll.disbursement.revert_confirm')}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'amber' }) {
	return (
		<div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
			<p className="text-xs text-slate-500">{label}</p>
			<p
				className={cn(
					'mt-1 text-lg font-bold tabular-nums',
					accent === 'emerald' && 'text-emerald-700',
					accent === 'amber' && 'text-amber-700',
					!accent && 'text-slate-900',
				)}
			>
				{value}
			</p>
		</div>
	);
}
