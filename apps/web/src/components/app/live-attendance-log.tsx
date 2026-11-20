import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { AttendanceRecord } from '@/lib/attendance';

function logDate(value: string): string {
	const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
	return Number.isNaN(date.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function logTime(value: string): string {
	const match = value.trim().match(/^(\d{1,2})[:.](\d{2})$/);
	if (!match) return value;
	const hour = Number(match[1]);
	if (hour > 23 || Number(match[2]) > 59) return value;
	return `${String(hour % 12 || 12).padStart(2, '0')}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function LiveAttendanceLog({
	companyId,
	employeeId,
	record,
	onViewLog,
}: {
	companyId: string;
	employeeId: string;
	record: AttendanceRecord | null;
	onViewLog: () => void;
}) {
	const [rows, setRows] = useState<AttendanceRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);
	const [retry, setRetry] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		pb.collection('attendance_records').getList<AttendanceRecord>(1, 6, {
			filter: pb.filter('company = {:company} && employee = {:employee} && (clock_in != "" || clock_out != "")', { company: companyId, employee: employeeId }),
			sort: '-date',
			requestKey: null,
		}).then(result => {
			if (!cancelled) {
				setRows(result.items);
				setFailed(false);
			}
		}).catch(() => {
			if (!cancelled) setFailed(true);
		}).finally(() => {
			if (!cancelled) setLoading(false);
		});
		return () => { cancelled = true; };
	}, [companyId, employeeId, record?.id, record?.clock_in, record?.clock_out, retry]);

	const events = rows.flatMap(row => [
		...(row.clock_out ? [{ key: `${row.id}-out`, time: row.clock_out, date: row.date, label: 'Clock out' }] : []),
		...(row.clock_in ? [{ key: `${row.id}-in`, time: row.clock_in, date: row.date, label: 'Clock in' }] : []),
	]).slice(0, 6);

	return (
		<section className="px-4 pb-10 pt-6" aria-labelledby="attendance-log-heading">
			<div className="flex items-center justify-between gap-4">
				<h2 id="attendance-log-heading" className="text-xl font-bold tracking-tight">Attendance Log</h2>
				<button type="button" onClick={onViewLog} className="min-h-11 text-base text-neutral-500 hover:text-[#075ab8]">View Log</button>
			</div>
			{loading ? (
				<p className="py-6 text-sm text-neutral-500">Memuat riwayat absensi…</p>
			) : failed ? (
				<p className="py-6 text-sm text-neutral-500">Riwayat tidak dapat dimuat. <button type="button" onClick={() => setRetry(value => value + 1)} className="font-semibold text-[#075ab8] underline">Coba lagi</button></p>
			) : events.length === 0 ? (
				<p className="py-6 text-sm text-neutral-500">Belum ada riwayat clock in atau clock out.</p>
			) : (
				<ul className="mt-2">
					{events.map(event => (
						<li key={event.key} className="border-b border-neutral-200">
							<button type="button" onClick={onViewLog} className="flex min-h-[64px] w-full items-center gap-4 py-2 text-left hover:bg-neutral-50" aria-label={`${event.label}, ${logTime(event.time)}, ${logDate(event.date)}. Lihat riwayat`}>
								<span className="w-24 shrink-0 text-[15px] font-semibold leading-tight tabular-nums"><span className="block">{logTime(event.time)}</span><span className="mt-0.5 block text-neutral-500">{logDate(event.date)}</span></span>
								<span className="flex-1 text-base">{event.label}</span>
								<ChevronRight className="size-5 text-neutral-400" strokeWidth={1.7} />
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
