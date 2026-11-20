import type { AttendanceRecord } from '@/lib/attendance';
import { computeCutoffRange, type PayrollSettings } from '@/lib/payroll';

type CutoffSettings = Pick<PayrollSettings, 'use_cutoff' | 'cutoff_start_day' | 'cutoff_end_day' | 'pay_day'>;
export interface AttendancePeriod { start: string; end: string }

/** Gunakan periode penggajian yang benar-benar mencakup tanggal setempat hari ini. */
export function activeAttendancePeriod(today: string, settings: CutoffSettings | null): AttendancePeriod | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
	if (settings?.use_cutoff && ![settings.cutoff_start_day, settings.cutoff_end_day].every(day => Number.isInteger(day) && day >= 1 && day <= 31)) return null;
	const year = Number(today.slice(0, 4));
	const month = Number(today.slice(5, 7));
	const candidates: AttendancePeriod[] = [];
	for (const offset of [-1, 0, 1]) {
		const date = new Date(Date.UTC(year, month - 1 + offset, 1));
		const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
		const range = computeCutoffRange(period, settings);
		if (range.start <= today && today <= range.end) candidates.push({ start: range.start, end: range.end });
	}
	return candidates.sort((a, b) => b.start.localeCompare(a.start))[0] ?? null;
}

export function nextCalendarDay(day: string): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

function isTime(value: string | undefined): boolean {
	const match = (value ?? '').trim().match(/^(\d{1,2})[:.](\d{2})$|^(\d{2})(\d{2})$/);
	if (!match) return false;
	return Number(match[1] ?? match[3]) <= 23 && Number(match[2] ?? match[4]) <= 59;
}

function isDayOff(record: AttendanceRecord): boolean {
	return record.attendance_code === 'day_off' || /^(day[\s_-]*off|libur)$/i.test((record.shift ?? '').trim());
}

export interface PayrollAttendanceProgress {
	calendarDays: number;
	coveredDays: number;
	scheduledDays: number;
	clockInDays: number;
	clockOutDays: number;
	complete: boolean;
}

/**
 * Faktor kehadiran satu karyawan untuk sebuah periode: jumlah hari terjadwal
 * (scheduledDays) dan hari benar-benar masuk kerja (attendedDays = clock-in).
 * Dipakai untuk menghitung tunjangan berbasis kehadiran.
 */
export function employeeAttendanceFactor(
	period: AttendancePeriod,
	today: string,
	records: AttendanceRecord[],
): { scheduledDays: number; attendedDays: number } {
	const result = calculatePayrollAttendance(period, today, records);
	return { scheduledDays: result.scheduledDays, attendedDays: result.clockInDays };
}

/**
 * attendance_records adalah satu-satunya sumber jadwal harian di aplikasi ini.
 * Tanggal tanpa shift/jam atau tanda libur tidak diasumsikan sebagai hari kerja.
 * Persentase baru dapat dihitung jika seluruh tanggal periode telah ditetapkan.
 */
export function calculatePayrollAttendance(
	period: AttendancePeriod,
	today: string,
	records: AttendanceRecord[],
): PayrollAttendanceProgress {
	const byDay = new Map<string, AttendanceRecord>();
	const duplicateDays = new Set<string>();
	for (const row of records) {
		const day = row.date?.slice(0, 10);
		if (!day || day < period.start || day > period.end) continue;
		if (byDay.has(day)) duplicateDays.add(day);
		byDay.set(day, row);
	}
	let calendarDays = 0;
	let coveredDays = 0;
	let scheduledDays = 0;
	let clockInDays = 0;
	let clockOutDays = 0;
	for (let day = period.start; day <= period.end; day = nextCalendarDay(day)) {
		calendarDays++;
		const row = byDay.get(day);
		if (!row || duplicateDays.has(day)) continue;
		if (isDayOff(row)) {
			coveredDays++;
			continue;
		}
		// Jam aktual tetap ditampilkan sebagai catatan sementara jika jadwal belum lengkap.
		if (day <= today && row.attendance_code !== 'invalid') {
			if (isTime(row.clock_in)) clockInDays++;
			if (isTime(row.clock_out)) clockOutDays++;
		}
		if (!isTime(row.schedule_in) || !isTime(row.schedule_out)) continue;
		coveredDays++;
		scheduledDays++;
	}
	return { calendarDays, coveredDays, scheduledDays, clockInDays, clockOutDays, complete: calendarDays > 0 && coveredDays === calendarDays };
}
