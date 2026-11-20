import type { Employee } from '@/lib/payroll';

export type AttendanceCode =
	| 'on_time'
	| 'late_clock_in'
	| 'early_clock_out'
	| 'no_clock_out'
	| 'no_clock_in'
	| 'invalid'
	| 'absent'
	| 'day_off'
	| 'time_off';

export interface AttendanceRecord {
	id: string;
	company: string;
	employee: string;
	date: string;
	shift: string;
	schedule_in: string;
	schedule_out: string;
	clock_in: string;
	clock_out: string;
	attendance_code: AttendanceCode;
	notes: string;
	owner: string;
	created: string;
	expand?: { employee?: Employee };
}

export const ATTENDANCE_CODE_LABELS: Record<AttendanceCode, string> = {
	on_time: 'On time',
	late_clock_in: 'Late clock in',
	early_clock_out: 'Early clock out',
	no_clock_out: 'No clock out',
	no_clock_in: 'No clock in',
	invalid: 'Invalid',
	absent: 'Absent',
	day_off: 'Day off',
	time_off: 'Time off',
};

export const ATTENDANCE_CODES: AttendanceCode[] = [
	'on_time',
	'late_clock_in',
	'early_clock_out',
	'no_clock_out',
	'no_clock_in',
	'invalid',
	'absent',
	'day_off',
	'time_off',
];

export function emptyAttendance(date: string): Partial<AttendanceRecord> {
	return {
		date,
		shift: '',
		schedule_in: '08:00',
		schedule_out: '17:00',
		clock_in: '',
		clock_out: '',
		attendance_code: 'on_time',
		notes: '',
	};
}

export function formatAttendanceDate(iso: string): string {
	if (!iso) return '—';
	const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

export function toDateInputValue(d = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function countByCode(records: AttendanceRecord[]): Record<AttendanceCode, number> {
	const counts = Object.fromEntries(ATTENDANCE_CODES.map(c => [c, 0])) as Record<
		AttendanceCode,
		number
	>;
	for (const r of records) {
		if (r.attendance_code in counts) counts[r.attendance_code] += 1;
	}
	return counts;
}
