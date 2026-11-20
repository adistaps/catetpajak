import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { annualRemaining, computeLeaveUsage, type LeaveBalance, type LeaveRequest } from '@/lib/leave';
import { cn } from '@/lib/utils';

export function LeaveBalancePanel({ balance, requests, employeeId, year, loading, unavailable }: {
	balance: LeaveBalance | null;
	requests: LeaveRequest[];
	employeeId: string;
	year: string;
	loading: boolean;
	unavailable: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const usage = useMemo(() => computeLeaveUsage(requests, employeeId, year), [requests, employeeId, year]);
	const ready = !loading && !unavailable && Boolean(balance);
	const annualTotal = (balance?.annual_entitlement ?? 0) + (balance?.annual_carry_forward ?? 0);

	return (
		<section aria-label="Saldo cuti" className="overflow-hidden rounded-xl border border-[#059669] bg-[#059669] shadow-[0_8px_20px_rgba(5,150,105,0.12)]">
			<h2 className="px-4 py-2.5 text-center text-sm font-bold text-white">Saldo cuti saya · {year}</h2>
			<div className="rounded-[11px] bg-[#ecfdf5] px-4 py-4 text-slate-800">
				<div className="flex items-end justify-between gap-4">
					<div><h3 className="text-base font-bold">Cuti Tahunan</h3><p className="mt-1 text-sm text-slate-600">Saldo tersedia</p></div>
					<p className="text-lg font-bold tabular-nums">{loading ? 'Memuat…' : ready && balance ? `${annualRemaining(balance, usage)} hari` : 'Belum tersedia'}</p>
				</div>
				{!loading && !ready ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{unavailable ? 'Data saldo atau pengajuan belum dapat dimuat.' : 'Saldo cuti tahun ini belum tersedia.'}</p> : null}
				<button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="rincian-saldo-cuti" className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#6ee7b7] bg-white px-4 text-sm font-bold text-slate-800 transition-colors hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
					{expanded ? 'Sembunyikan rincian saldo' : 'Lihat rincian saldo cuti'}
					<ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
				</button>
				{expanded ? (
					<div id="rincian-saldo-cuti" className="mt-4 space-y-3 border-t border-[#a7f3d0] pt-4 text-sm">
						{ready && balance ? (
							<>
								<div className="flex justify-between gap-3"><span>Hak cuti tahunan</span><strong>{annualTotal} hari</strong></div>
								<div className="flex justify-between gap-3"><span>Cuti tahunan terpakai</span><strong>{usage.annual} hari</strong></div>
								<div className="flex justify-between gap-3"><span>Cuti sakit terpakai</span><strong>{usage.sick} hari <span className="font-normal text-slate-500">{balance.sick_entitlement ? `dari ${balance.sick_entitlement} hari` : '· tanpa batas'}</span></strong></div>
								<div className="flex justify-between gap-3"><span>Cuti pribadi terpakai</span><strong>{usage.personal} hari <span className="font-normal text-slate-500">{balance.personal_entitlement ? `dari ${balance.personal_entitlement} hari` : '· tanpa batas'}</span></strong></div>
								<p className="text-xs leading-relaxed text-slate-500">Pemakaian berdasarkan pengajuan yang disetujui.</p>
							</>
						) : <p className="text-slate-600">{loading ? 'Memuat rincian saldo…' : 'Rincian saldo belum tersedia.'}</p>}
					</div>
				) : null}
			</div>
		</section>
	);
}
