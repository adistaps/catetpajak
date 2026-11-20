import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatRupiah } from '@/lib/accounting';
import { formatLeaveRange, LEAVE_TYPE_LABELS, type LeaveRequest } from '@/lib/leave';
import type { OvertimeRequest } from '@/lib/overtime';
import type { Reimbursement } from '@/lib/reimbursements';
import { loadReimbursementActorNames, ReimbursementApprovalDetails } from '@/components/app/reimbursement-approval-details';
import { cn } from '@/lib/utils';

type UpdatedLeave = LeaveRequest & { updated?: string };
type UpdatedOvertime = OvertimeRequest & { updated?: string };
type ApprovalItem = {
	key: string;
	kind: 'leave' | 'overtime' | 'reimbursement';
	title: string;
	detail: string;
	date: string;
	sortDate: string;
	status: string;
	reimbursement?: Reimbursement;
};

const statusLabels: Record<string, string> = {
	awaiting_approval: 'Menunggu persetujuan',
	pending: 'Menunggu persetujuan',
	approved: 'Disetujui',
	rejected: 'Ditolak',
	cancelled: 'Dibatalkan',
	paid: 'Dibayar',
};

function dateLabel(value: string): string {
	const day = value?.slice(0, 10) || '';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
	const date = new Date(`${day}T12:00:00`);
	return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function EmployeeApprovals({ companyId, employeeId, onOpen }: {
	companyId: string;
	employeeId: string;
	onOpen: (key: 'leave' | 'overtime' | 'reimbursement') => void;
}) {
	const [items, setItems] = useState<ApprovalItem[]>([]);
	const [names, setNames] = useState<Record<string, string>>({});
	const [loadingNames, setLoadingNames] = useState(false);
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState<string[]>([]);
	const requestVersion = useRef(0);

	const refresh = useCallback(async (quiet = false) => {
		const version = ++requestVersion.current;
		if (!quiet) setLoading(true);
		const filter = pb.filter('company = {:company} && employee = {:employee}', { company: companyId, employee: employeeId });
		const [leaveResult, overtimeResult, reimbursementResult] = await Promise.allSettled([
			pb.collection('leave_requests').getFullList<UpdatedLeave>({ filter, requestKey: null }),
			pb.collection('overtime_requests').getFullList<UpdatedOvertime>({ filter, requestKey: null }),
			pb.collection('reimbursements').getFullList<Reimbursement>({ filter, expand: 'processed_by', requestKey: null }),
		]);
		if (version !== requestVersion.current) return;
		const errors: string[] = [];
		if (leaveResult.status === 'rejected') errors.push('cuti');
		if (overtimeResult.status === 'rejected') errors.push('lembur');
		if (reimbursementResult.status === 'rejected') errors.push('reimbursement');
		const leave = leaveResult.status === 'fulfilled' ? leaveResult.value : [];
		const overtime = overtimeResult.status === 'fulfilled' ? overtimeResult.value : [];
		const reimbursements = reimbursementResult.status === 'fulfilled' ? reimbursementResult.value : [];
		const rows: ApprovalItem[] = [
			...leave.map(request => ({
				key: `leave-${request.id}`, kind: 'leave' as const,
				title: LEAVE_TYPE_LABELS[request.leave_type] || 'Pengajuan cuti',
				detail: formatLeaveRange(request.start_date, request.end_date),
				date: request.requested_date || request.created,
				sortDate: request.updated || request.created || request.requested_date,
				status: request.status,
			})),
			...overtime.map(request => ({
				key: `overtime-${request.id}`, kind: 'overtime' as const,
				title: 'Pengajuan lembur',
				detail: [dateLabel(request.overtime_date), request.duration_minutes ? `${request.duration_minutes} menit` : ''].filter(Boolean).join(' · '),
				date: request.requested_date || request.created,
				sortDate: request.updated || request.created || request.requested_date,
				status: request.status,
			})),
			...reimbursements.map(request => ({
				key: `reimbursement-${request.id}`, kind: 'reimbursement' as const,
				title: 'Pengajuan reimbursement',
				detail: [request.description, formatRupiah(request.amount || 0)].filter(Boolean).join(' · '),
				date: request.created || request.date,
				sortDate: request.updated || request.created || request.date,
				status: request.status,
				reimbursement: request,
			})),
		];
		rows.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''));
		setItems(rows);
		setFailed(errors);
		setLoading(false);
		setLoadingNames(true);
		try {
			const actorNames = await loadReimbursementActorNames(companyId, reimbursements);
			if (version === requestVersion.current) setNames(actorNames);
		} catch {
			if (version === requestVersion.current) setNames({});
		} finally {
			if (version === requestVersion.current) setLoadingNames(false);
		}
	}, [companyId, employeeId]);

	useEffect(() => {
		void refresh();
		const focus = () => { void refresh(true); };
		window.addEventListener('focus', focus);
		let active = true;
		const unsubscribers: (() => Promise<void>)[] = [];
		for (const collection of ['leave_requests', 'overtime_requests', 'reimbursements']) {
			void pb.collection(collection).subscribe('*', event => {
				if (active && event.record.company === companyId && event.record.employee === employeeId) void refresh(true);
			}).then(unsubscribe => {
				if (active) unsubscribers.push(unsubscribe);
				else void unsubscribe();
			}).catch(() => {});
		}
		return () => {
			active = false;
			requestVersion.current++;
			window.removeEventListener('focus', focus);
			unsubscribers.forEach(unsubscribe => { void unsubscribe(); });
		};
	}, [companyId, employeeId, refresh]);

	return (
		<section aria-label="Informasi persetujuan" className="px-4 pb-6">
			<div className="flex items-start justify-between gap-3 pb-4">
				<div>
					<h2 className="text-lg font-bold text-slate-900">Informasi persetujuan</h2>
					<p className="mt-1 text-xs leading-relaxed text-slate-500">Pantau status pengajuan cuti, lembur, dan reimbursement Anda.</p>
				</div>
				<button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Perbarui informasi persetujuan" className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-50">
					<RefreshCw className="size-4" strokeWidth={1.8} />
				</button>
			</div>
			{failed.length > 0 ? <div role="alert" className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-700">Data {failed.join(', ')} belum dapat dimuat. <button type="button" onClick={() => void refresh()} className="font-semibold underline">Coba lagi</button></div> : null}
			{loading ? <p className="py-12 text-center text-sm text-slate-500">Memuat informasi persetujuan…</p> : items.length === 0 ? (
				<div className="flex min-h-[220px] flex-col items-center justify-center px-4 text-center">
					<ClipboardCheck className="size-9 text-slate-400" strokeWidth={1.6} />
					<p className="mt-3 text-sm font-bold text-slate-800">{failed.length ? 'Informasi belum tersedia' : 'Belum ada informasi persetujuan'}</p>
					<p className="mt-1 max-w-[280px] text-xs leading-relaxed text-slate-500">{failed.length ? 'Coba perbarui untuk memuat data pengajuan.' : 'Status pengajuan Anda akan muncul di sini.'}</p>
				</div>
			) : (
				<ul className="divide-y divide-slate-200">
					{items.map(item => (
						<li key={item.key} className="py-4">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="text-sm font-bold text-slate-900">{item.title}</p>
									{item.detail ? <p className="mt-1 break-words text-xs leading-relaxed text-slate-600">{item.detail}</p> : null}
									{dateLabel(item.date) ? <p className="mt-1 text-xs text-slate-400">Diajukan {dateLabel(item.date)}</p> : null}
								</div>
								<span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold', item.status === 'approved' || item.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : item.status === 'rejected' ? 'bg-rose-100 text-rose-700' : item.status === 'cancelled' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800')}>
									{statusLabels[item.status] || 'Status tidak tersedia'}
								</span>
							</div>
							{item.reimbursement ? <div className="mt-3"><ReimbursementApprovalDetails request={item.reimbursement} names={names} loadingNames={loadingNames} /></div> : item.status === 'approved' || item.status === 'rejected' ? <p className="mt-2 text-xs text-slate-500">Nama pemberi keputusan tidak tersedia.</p> : null}
							<button type="button" onClick={() => onOpen(item.kind)} className="mt-2 min-h-9 text-xs font-semibold text-emerald-700 hover:underline">Lihat pengajuan</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
