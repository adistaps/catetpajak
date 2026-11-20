import { useState } from 'react';
import { ArrowLeft, Info, MapPin } from 'lucide-react';
import type { AttendanceRecord } from '@/lib/attendance';
import type { AttendanceSettings } from '@/lib/attendance-settings';
import type { ResolvedSchedule } from '@/lib/work-schedules';
import { LiveAttendanceLog } from '@/components/app/live-attendance-log';
import { EssGreeting } from '@/components/app/karyawan-ess-chrome';

interface LiveAttendanceState {
	record: AttendanceRecord | null;
	workSchedule: ResolvedSchedule | null;
	now: Date;
	busy: 'in' | 'out' | null;
	loading: boolean;
	failed: boolean;
	geoSettings: AttendanceSettings | null;
	canClockIn: boolean;
	canClockOut: boolean;
	refresh: () => Promise<void>;
	upsert: (field: 'clock_in' | 'clock_out') => Promise<void>;
}

export function LiveAttendancePage({
	attendance,
	companyId,
	employeeId,
	companyName,
	name,
	photoUrl,
	onGift,
	onBack,
	onViewLog,
}: {
	attendance: LiveAttendanceState;
	companyId: string;
	employeeId: string;
	companyName: string;
	name: string;
	photoUrl: string;
	onGift: () => void;
	onBack: () => void;
	onViewLog: () => void;
}) {
	const [showLocation, setShowLocation] = useState(false);
	const { record, workSchedule, now, busy, loading, failed, geoSettings, canClockIn, canClockOut } = attendance;
	const currentRecord = !loading && !failed ? record : null;
	const date = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now);
	const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(now);
	const locationEnabled = !loading && Boolean(geoSettings?.geofence_enabled);
	const disabled = loading || failed || busy !== null;
	const displayedShift = record?.clock_in ? { shift: record.shift, start: record.schedule_in, end: record.schedule_out, work: true, breakStart: workSchedule?.work && workSchedule.shift === record.shift && workSchedule.start === record.schedule_in && workSchedule.end === record.schedule_out ? workSchedule.breakStart : '', breakEnd: workSchedule?.work && workSchedule.shift === record.shift && workSchedule.start === record.schedule_in && workSchedule.end === record.schedule_out ? workSchedule.breakEnd : '' } : workSchedule;

	return (
		<div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#f4f5f7] pb-24 text-[#202124]">
			<EssGreeting name={name} companyName={companyName} photoUrl={photoUrl} onGift={onGift} />
			<section className="bg-transparent px-4 pb-6 text-[#202124]">
				<header className="relative flex min-h-14 items-center justify-center">
					<button type="button" onClick={onBack} aria-label="Kembali ke beranda" className="absolute left-0 flex size-11 items-center justify-start rounded-lg text-[#202124] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#059669]">
						<ArrowLeft className="size-6" strokeWidth={2} />
					</button>
					<h1 className="text-base font-semibold">Live Attendance</h1>
				</header>

				<div className="pb-4 pt-3 text-center">
					<p className="text-[32px] font-bold leading-tight tabular-nums tracking-tight">{time}</p>
					<p className="mt-1 text-base">{date}</p>
				</div>

				<div className="rounded-2xl bg-transparent px-4 pb-4 pt-4 text-center text-[#202124]">
					{!loading && !failed && displayedShift ? <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><p className="font-semibold">{displayedShift.work ? displayedShift.shift : 'Hari libur'}</p>{displayedShift.work ? <p>{displayedShift.start} – {displayedShift.end}{displayedShift.breakStart && displayedShift.breakEnd ? ` · Istirahat ${displayedShift.breakStart} – ${displayedShift.breakEnd}` : ''}</p> : null}</div> : null}
					{locationEnabled && geoSettings ? (
						<>
							<button type="button" onClick={() => setShowLocation(open => !open)} aria-expanded={showLocation} className="mt-2 min-h-9 text-sm font-medium text-[#075dca] hover:underline">
								{showLocation ? 'Sembunyikan lokasi absensi' : 'Lihat lokasi absensi'}
							</button>
							{showLocation ? (
								<div className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
									<p className="flex items-center justify-center gap-1 font-semibold"><MapPin className="size-3.5" /> Lokasi kerja</p>
									<p className="mt-1">{geoSettings.work_latitude}, {geoSettings.work_longitude} · Radius {geoSettings.geofence_radius} m</p>
								</div>
							) : null}
						</>
					) : null}

					<div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-[#e1edf6] px-3 py-2 text-xs leading-snug text-[#687887]">
						<Info className="size-4 shrink-0" aria-hidden="true" />
						<span>{loading ? 'Memuat pengaturan absensi…' : failed ? 'Pengaturan atau data absensi tidak dapat dimuat.' : locationEnabled ? 'Clock in/out memerlukan verifikasi lokasi.' : 'Verifikasi lokasi tidak diwajibkan.'}</span>
					</div>
					{failed ? (
						<p className="mt-2 text-xs text-red-700">Gagal memuat absensi. <button type="button" onClick={() => void attendance.refresh()} className="font-semibold underline">Coba lagi</button></p>
					) : null}
					<div className="mt-4 grid grid-cols-2 gap-4">
						<button type="button" disabled={disabled || !canClockIn} onClick={() => void attendance.upsert('clock_in')} className="min-h-12 rounded-xl bg-[#075ab8] px-2 py-3 text-base font-semibold text-white transition-colors hover:bg-[#064d9b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075ab8] disabled:cursor-not-allowed disabled:opacity-50">
							{busy === 'in' ? 'Memproses…' : 'Clock in'}
						</button>
						<button type="button" disabled={disabled || !canClockOut} onClick={() => void attendance.upsert('clock_out')} className="min-h-12 rounded-xl bg-[#075ab8] px-2 py-3 text-base font-semibold text-white transition-colors hover:bg-[#064d9b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075ab8] disabled:cursor-not-allowed disabled:opacity-50">
							{busy === 'out' ? 'Memproses…' : 'Clock out'}
						</button>
					</div>
				</div>
			</section>

			<LiveAttendanceLog companyId={companyId} employeeId={employeeId} record={currentRecord} onViewLog={onViewLog} />
		</div>
	);
}
