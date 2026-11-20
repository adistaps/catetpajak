import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ListFilter, Plus, Workflow } from 'lucide-react';
import { formatRupiah } from '@/lib/accounting';
import { REIMBURSEMENT_STATUS_LABELS, type Reimbursement, type ReimbursementStatus } from '@/lib/reimbursements';
import { ReimbursementApprovalDetails } from '@/components/app/reimbursement-approval-details';
import { ReimbursementBalance } from '@/components/app/reimbursement-balance';
import type { EligibilityResult, ReimbursementSaldo, ReimbursementSetting } from '@/lib/reimbursement-settings';
import { cn } from '@/lib/utils';

const EMPTY_ILLUSTRATION = 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/0b783747-417e-4f87-8710-ba49d08cdafe.png';

function monthLabel(value: string) {
	const [year, month] = value.split('-').map(Number);
	return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function dateLabel(value: string) {
	const day = (value || '').slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value || '—';
	const date = new Date(`${day}T12:00:00`);
	return Number.isNaN(date.getTime()) ? day : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function ReimbursementHistory({
	requests, loading, loadError, refresh, onRequest, showForm, actorNames, loadingActorNames,
	settingsLoadError, hasSettings, eligibleSettings, saldos,
}: {
	requests: Reimbursement[];
	loading: boolean;
	loadError: boolean;
	refresh: () => void;
	onRequest: () => void;
	showForm: boolean;
	actorNames: Record<string, string>;
	loadingActorNames: boolean;
	settingsLoadError: boolean;
	hasSettings: boolean;
	eligibleSettings: { setting: ReimbursementSetting; result: EligibilityResult }[];
	saldos: Record<string, ReimbursementSaldo>;
}) {
	const [period, setPeriod] = useState('all');
	const [status, setStatus] = useState<'all' | ReimbursementStatus>('all');
	const [showStatus, setShowStatus] = useState(false);
	const [expandedApproval, setExpandedApproval] = useState<Record<string, boolean>>({});
	const periods = useMemo(() => [...new Set(requests.map(request => (request.date || '').slice(0, 7)).filter(value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)))].sort().reverse(), [requests]);
	const visible = useMemo(() => requests.filter(request =>
		(period === 'all' || (request.date || '').slice(0, 7) === period) && (status === 'all' || request.status === status),
	), [requests, period, status]);
	const filtered = period !== 'all' || status !== 'all';

	return (
		<section aria-label="Riwayat reimbursement" className="min-h-[440px] rounded-2xl bg-transparent p-3 sm:p-4">
			<ReimbursementBalance loading={loading} unavailable={loadError || settingsLoadError} hasSettings={hasSettings} eligibleSettings={eligibleSettings} saldos={saldos} onRetry={refresh} />
			<div className="flex items-center gap-2">
				<label className="relative flex min-w-0 flex-1 items-center rounded-lg border border-slate-200 bg-white text-slate-700 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
					<CalendarDays aria-hidden="true" className="pointer-events-none ml-3 size-5 shrink-0 text-slate-500" strokeWidth={1.8} />
					<span className="sr-only">Periode pengajuan</span>
					<select value={period} onChange={event => setPeriod(event.target.value)} className="h-11 min-w-0 flex-1 appearance-none bg-transparent pl-3 pr-8 text-sm font-medium outline-none">
						<option value="all">Semua periode</option>
						{period !== 'all' && !periods.includes(period) ? <option value={period}>{monthLabel(period)}</option> : null}
						{periods.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}
					</select>
					<ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 size-4 text-slate-500" />
				</label>
				<button type="button" onClick={() => setShowStatus(open => !open)} aria-label="Filter status" aria-expanded={showStatus} aria-controls="reimbursement-status-filter" className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600', (showStatus || status !== 'all') && 'bg-emerald-50 text-emerald-700')}>
					<ListFilter className="size-5" strokeWidth={1.8} />
				</button>
			</div>
			{showStatus ? (
				<label id="reimbursement-status-filter" className="mt-3 block text-xs font-semibold text-slate-600">
					Status pengajuan
					<select value={status} onChange={event => setStatus(event.target.value as 'all' | ReimbursementStatus)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
						<option value="all">Semua status</option>
						<option value="pending">Menunggu persetujuan</option>
						<option value="approved">Disetujui</option>
						<option value="rejected">Ditolak</option>
						<option value="paid">Dibayar</option>
					</select>
				</label>
			) : null}

			{loadError ? (
				<div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700">
					<span>Gagal memperbarui pengajuan. Status yang ditampilkan mungkin belum terbaru.</span>
					<button type="button" onClick={refresh} className="font-semibold underline">Coba lagi</button>
				</div>
			) : null}

			{loading ? (
				<p className="py-20 text-center text-sm text-slate-500">Memuat pengajuan…</p>
			) : visible.length === 0 && !loadError ? (
				<div className="flex flex-col items-center px-3 pb-14 pt-8 text-center">
					<img src={EMPTY_ILLUSTRATION} srcSet="https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/0b783747-417e-4f87-8710-ba49d08cdafe.png?width=375 375w, https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/0b783747-417e-4f87-8710-ba49d08cdafe.png?width=768 768w, https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/0b783747-417e-4f87-8710-ba49d08cdafe.png 1024w" sizes="160px" alt="" className="size-40 object-contain" />
					<h2 className="mt-3 text-lg font-bold tracking-tight text-slate-900">{filtered ? 'Tidak ada pengajuan yang sesuai' : 'Belum ada pengajuan reimbursement'}</h2>
					<p className="mt-2 max-w-[290px] text-sm leading-relaxed text-slate-500">{filtered ? 'Coba pilih periode atau status lain untuk melihat pengajuan Anda.' : 'Anda dapat mengajukan reimbursement dengan menekan tombol di bawah ini.'}</p>
					<div className="mt-5 flex flex-wrap justify-center gap-2">
						{filtered ? <button type="button" onClick={() => { setPeriod('all'); setStatus('all'); }} className="min-h-11 rounded-xl border border-emerald-600 px-5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Tampilkan semua</button> : null}
						{!showForm ? <button type="button" onClick={onRequest} className="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98]">Ajukan reimbursement</button> : null}
					</div>
				</div>
			) : visible.length > 0 ? (
				<>
					<div className="flex items-center justify-between gap-2 pb-2 pt-5">
						<h2 className="text-sm font-bold text-slate-800">Riwayat pengajuan</h2>
						{!showForm ? <button type="button" onClick={onRequest} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.98]"><Plus className="size-4" /> Ajukan</button> : null}
					</div>
					<ul className="divide-y divide-slate-100">
						{visible.map(request => {
							return (
								<li key={request.id} className="space-y-3 py-4">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0"><p className="break-words text-sm font-bold text-slate-900">{request.description || '—'}</p><p className="mt-1 text-xs text-slate-500">{dateLabel(request.date)}</p></div>
										<div className="flex shrink-0 flex-col items-end gap-1.5">
											<p className="text-sm font-bold tabular-nums text-slate-900">{formatRupiah(request.amount || 0)}</p>
											<button
												type="button"
												onClick={() => setExpandedApproval(prev => ({ ...prev, [request.id]: !prev[request.id] }))}
												aria-expanded={Boolean(expandedApproval[request.id])}
												className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
											>
												<Workflow className="size-4" strokeWidth={1.8} />
												{expandedApproval[request.id] ? 'Sembunyikan proses persetujuan' : 'Lihat proses persetujuan'}
												<ChevronDown className={cn('size-3.5 transition-transform', expandedApproval[request.id] && 'rotate-180')} strokeWidth={1.8} />
											</button>
										</div>
									</div>
									{request.status !== 'approved' ? (
									<div className="flex flex-wrap items-center gap-2">
										<span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', request.status === 'pending' && 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80', request.status === 'rejected' && 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80', request.status === 'paid' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80')}>
											{request.status === 'pending' ? 'Menunggu persetujuan' : REIMBURSEMENT_STATUS_LABELS[request.status] ?? (request.status || 'Status tidak tersedia')}
										</span>
									</div>
									) : null}
								{expandedApproval[request.id] ? (
									<div className="mt-1">
										<ReimbursementApprovalDetails request={request} names={actorNames} loadingNames={loadingActorNames} />
									</div>
								) : null}
								</li>
							);
						})}
					</ul>
				</>
			) : null}
			{!loading && loadError && !showForm && visible.length === 0 ? <button type="button" onClick={onRequest} className="mt-5 min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"><Plus className="mr-1 inline size-4" /> Ajukan reimbursement</button> : null}
		</section>
	);
}
