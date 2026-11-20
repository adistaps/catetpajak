import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ListFilter } from 'lucide-react';
import { calcLeaveDays, formatLeaveRange, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, type LeaveRequest, type LeaveStatus } from '@/lib/leave';
import { cn } from '@/lib/utils';

function monthLabel(value: string) {
	const [year, month] = value.split('-').map(Number);
	return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function requestMonths(requests: LeaveRequest[]) {
	const months = new Set<string>();
	for (const request of requests) {
		const start = (request.start_date || '').slice(0, 7);
		const end = (request.end_date || '').slice(0, 7);
		if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)) continue;
		const [year, month] = start.split('-').map(Number);
		const last = /^\d{4}-(0[1-9]|1[0-2])$/.test(end) && end >= start ? end : start;
		for (let i = 0; i < 240; i++) {
			const offset = month - 1 + i;
			const current = `${year + Math.floor(offset / 12)}-${String(offset % 12 + 1).padStart(2, '0')}`;
			if (current > last) break;
			months.add(current);
		}
	}
	return [...months].sort().reverse();
}

export function LeaveHistory({ requests, loading, loadError, onRetry }: {
	requests: LeaveRequest[];
	loading: boolean;
	loadError: boolean;
	onRetry: () => void;
}) {
	const [period, setPeriod] = useState('all');
	const [status, setStatus] = useState<'all' | LeaveStatus>('all');
	const [showStatus, setShowStatus] = useState(false);
	const periods = useMemo(() => requestMonths(requests), [requests]);
	const visible = useMemo(() => requests.filter(request => {
		const start = (request.start_date || '').slice(0, 7);
		const end = (request.end_date || request.start_date || '').slice(0, 7);
		return (period === 'all' || (start <= period && end >= period)) && (status === 'all' || request.status === status);
	}), [requests, period, status]);
	const filtered = period !== 'all' || status !== 'all';

	return (
		<section aria-label="Riwayat pengajuan cuti" className="rounded-xl bg-transparent p-4">
			<div className="flex items-center gap-2">
				<label className="relative flex min-w-0 flex-1 items-center rounded-lg border border-slate-200 text-slate-700 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
					<CalendarDays className="pointer-events-none ml-3 size-5 shrink-0 text-slate-500" strokeWidth={1.8} aria-hidden="true" />
					<span className="sr-only">Periode cuti</span>
					<select value={period} onChange={event => setPeriod(event.target.value)} className="h-11 min-w-0 flex-1 appearance-none bg-transparent pl-3 pr-8 text-sm outline-none">
						<option value="all">Semua periode</option>
						{period !== 'all' && !periods.includes(period) ? <option value={period}>{monthLabel(period)}</option> : null}
						{periods.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}
					</select>
					<ChevronDown className="pointer-events-none absolute right-3 size-4 text-slate-500" aria-hidden="true" />
				</label>
				<button type="button" onClick={() => setShowStatus(value => !value)} aria-label="Filter status pengajuan" aria-expanded={showStatus} aria-controls="filter-status-cuti" className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600', (showStatus || status !== 'all') && 'bg-emerald-50 text-emerald-700')}><ListFilter className="size-5" strokeWidth={1.8} /></button>
			</div>
			{showStatus ? <label id="filter-status-cuti" className="mt-3 block text-xs font-semibold text-slate-600">Status pengajuan<select value={status} onChange={event => setStatus(event.target.value as 'all' | LeaveStatus)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"><option value="all">Semua status</option>{(Object.keys(LEAVE_STATUS_LABELS) as LeaveStatus[]).map(value => <option key={value} value={value}>{LEAVE_STATUS_LABELS[value]}</option>)}</select></label> : null}
			{loadError ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700"><span>Data cuti belum dapat diperbarui. Silakan coba lagi.</span><button type="button" onClick={onRetry} className="font-semibold underline">Coba lagi</button></div> : null}
			{loading ? <p className="py-20 text-center text-sm text-slate-500">Memuat pengajuan cuti…</p> : visible.length === 0 && !loadError ? (
				<div className="flex min-h-[275px] flex-col items-center justify-center px-2 py-8 text-center">
					<h2 className="mt-3 text-lg font-bold tracking-tight text-slate-900">{filtered ? 'Tidak ada pengajuan yang sesuai' : 'Belum ada pengajuan cuti'}</h2>
					<p className="mt-2 max-w-[280px] text-sm leading-relaxed text-slate-500">{filtered ? 'Coba pilih periode atau status lain untuk melihat pengajuan Anda.' : 'Pengajuan cuti Anda akan muncul di sini.'}</p>
					{filtered ? <button type="button" onClick={() => { setPeriod('all'); setStatus('all'); }} className="mt-4 min-h-11 text-sm font-semibold text-emerald-700 hover:underline">Tampilkan semua</button> : null}
				</div>
			) : visible.length > 0 ? <div className="pt-5"><h2 className="text-sm font-bold text-slate-800">Riwayat pengajuan</h2><ul className="mt-1 divide-y divide-slate-100">{visible.map(request => <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-4"><div className="min-w-0"><p className="text-sm font-bold text-slate-900">{LEAVE_TYPE_LABELS[request.leave_type] ?? request.leave_type}</p><p className="mt-1 text-xs text-slate-500">{formatLeaveRange(request.start_date, request.end_date)}</p><span className={cn('mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', request.status === 'awaiting_approval' && 'bg-amber-50 text-amber-700', request.status === 'approved' && 'bg-emerald-50 text-emerald-700', request.status === 'rejected' && 'bg-rose-50 text-rose-700', request.status === 'cancelled' && 'bg-slate-100 text-slate-600')}>{LEAVE_STATUS_LABELS[request.status] ?? request.status}</span></div><p className="text-sm font-bold text-slate-800">{request.days || calcLeaveDays(request.start_date, request.end_date)} hari</p></li>)}</ul></div> : null}
		</section>
	);
}
