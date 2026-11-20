import { useCallback, useEffect, useRef, useState } from 'react';
import pb from '@/lib/pocketbase-client';
import type { AttendanceRecord } from '@/lib/attendance';
import type { PayrollSettings } from '@/lib/payroll';
import {
	activeAttendancePeriod,
	calculatePayrollAttendance,
	nextCalendarDay,
	type AttendancePeriod,
	type PayrollAttendanceProgress,
} from '@/lib/payroll-attendance-progress';

type ProgressState =
	| { scope: string; status: 'loading' }
	| { scope: string; status: 'error' }
	| { scope: string; status: 'invalid-period' }
	| { scope: string; status: 'ready'; period: AttendancePeriod; progress: PayrollAttendanceProgress };

function percent(count: number, total: number): string {
	return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(count * 100 / total)}%`;
}

function CombinedProgressBar({ clockInCount, clockOutCount, total }: { clockInCount: number | null; clockOutCount: number | null; total: number | null }) {
	const inValue = clockInCount !== null && total !== null && total > 0 ? clockInCount * 100 / total : null;
	const outValue = clockOutCount !== null && total !== null && total > 0 ? clockOutCount * 100 / total : null;
	const combined = inValue !== null && outValue !== null ? (inValue + outValue) / 2 : null;
	const inText = inValue !== null && clockInCount !== null && total !== null ? percent(clockInCount, total) : '—';
	const outText = outValue !== null && clockOutCount !== null && total !== null ? percent(clockOutCount, total) : '—';
	return (
		<div>
			<div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-white">
				<span className="font-semibold">Clock in<span className="font-normal text-white/80"> · {clockInCount !== null && total !== null && total > 0 ? `${clockInCount}/${total} hari` : clockInCount !== null ? `${clockInCount} hari tercatat` : '—'}</span></span>
				<span className="font-bold tabular-nums">{inText}</span>
			</div>
			<div role="progressbar" aria-label="Kehadiran periode payroll (Clock in & Clock out)" aria-valuemin={0} aria-valuemax={100} aria-valuenow={combined === null ? undefined : Math.min(100, Math.round(combined * 10) / 10)} aria-valuetext={combined === null ? 'Persentase belum tersedia' : `Rata-rata ${Math.round(combined)}%, Clock in ${inText}, Clock out ${outText}`} className="h-2.5 w-full overflow-hidden rounded-full bg-[#d1fae5]">
				<div className="h-full rounded-full bg-[#065f46] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${combined === null ? 0 : Math.min(100, combined)}%` }} />
			</div>
			<div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-white">
				<span className="font-semibold">Clock out<span className="font-normal text-white/80"> · {clockOutCount !== null && total !== null && total > 0 ? `${clockOutCount}/${total} hari` : clockOutCount !== null ? `${clockOutCount} hari tercatat` : '—'}</span></span>
				<span className="font-bold tabular-nums">{outText}</span>
			</div>
		</div>
	);
}

export function PayrollAttendanceProgressBar({ companyId, employeeId, today, attendanceVersion }: {
	companyId: string;
	employeeId: string;
	today: string;
	attendanceVersion: string;
}) {
	const scope = `${companyId}:${employeeId}:${today}:${attendanceVersion}`;
	const [state, setState] = useState<ProgressState>({ scope: '', status: 'loading' });
	const version = useRef(0);

	const refresh = useCallback(async () => {
		const current = ++version.current;
		try {
			const settings = await pb.collection('payroll_settings').getFullList<PayrollSettings>({
				filter: pb.filter('company = {:company}', { company: companyId }),
				requestKey: null,
			});
			const period = activeAttendancePeriod(today, settings[0] ?? null);
			if (!period) {
				if (current === version.current) setState({ scope, status: 'invalid-period' });
				return;
			}
			const records = await pb.collection('attendance_records').getFullList<AttendanceRecord>({
				filter: pb.filter('company = {:company} && employee = {:employee} && date >= {:start} && date < {:end}', {
					company: companyId,
					employee: employeeId,
					start: `${period.start} 00:00:00.000Z`,
					end: `${nextCalendarDay(period.end)} 00:00:00.000Z`,
				}),
				requestKey: null,
			});
			if (current === version.current) setState({ scope, status: 'ready', period, progress: calculatePayrollAttendance(period, today, records) });
		} catch {
			if (current === version.current) setState({ scope, status: 'error' });
		}
	}, [companyId, employeeId, scope, today]);

	useEffect(() => {
		void refresh();
		return () => { version.current++; };
	}, [refresh]);

	useEffect(() => {
		let cancelled = false;
		const unsubscribers: Array<() => void> = [];
		const register = (collection: string, matches: (record: Record<string, unknown>) => boolean) => {
			void pb.collection(collection).subscribe('*', event => {
				if (!cancelled && (matches(event.record) || event.action === 'delete')) void refresh();
			}).then(unsubscribe => {
				if (cancelled) unsubscribe();
				else unsubscribers.push(unsubscribe);
			}).catch(() => {});
		};
		register('attendance_records', record => record.company === companyId && record.employee === employeeId);
		register('payroll_settings', record => record.company === companyId);
		const onFocus = () => { void refresh(); };
		window.addEventListener('focus', onFocus);
		const timer = window.setInterval(onFocus, 60_000);
		return () => {
			cancelled = true;
			unsubscribers.forEach(unsubscribe => unsubscribe());
			window.removeEventListener('focus', onFocus);
			window.clearInterval(timer);
		};
	}, [companyId, employeeId, refresh]);

	const loading = state.scope !== scope || state.status === 'loading';
	const ready = state.scope === scope && state.status === 'ready' ? state : null;
	const progress = ready?.progress;
	const total = progress?.complete && progress.scheduledDays > 0 ? progress.scheduledDays : null;
	return (
		<div className="my-4 space-y-3" aria-label="Kehadiran periode payroll" aria-busy={loading}>
			<div className="space-y-3">
				<CombinedProgressBar clockInCount={progress?.clockInDays ?? null} clockOutCount={progress?.clockOutDays ?? null} total={total} />
			</div>
			{loading ? (
				<p className="text-xs text-white/90" aria-live="polite">Memuat kehadiran periode payroll…</p>
			) : state.status === 'error' ? (
				<p className="text-xs text-white" role="alert">Kehadiran periode payroll tidak dapat dimuat. <button type="button" onClick={() => void refresh()} className="font-semibold underline">Coba lagi</button></p>
			) : state.status === 'invalid-period' ? (
				<p className="text-xs text-white" role="status">Periode payroll untuk hari ini tidak tersedia. Periksa pengaturan cut-off.</p>
			) : progress?.complete && progress.scheduledDays === 0 ? (
				<p className="text-xs text-white/90">Tidak ada hari kerja yang dijadwalkan pada periode ini.</p>
			) : null}
		</div>
	);
}
