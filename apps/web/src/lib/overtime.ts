import type { Employee } from '@/lib/payroll';

export type OvertimeCompensation = 'paid_overtime' | 'time_off' | 'unpaid';
export type OvertimeStatus = 'awaiting_approval' | 'approved' | 'rejected' | 'cancelled';

export interface OvertimeRequest {
	id: string;
	company: string;
	employee: string;
	requested_date: string;
	overtime_date: string;
	duration_minutes: number;
	compensation: OvertimeCompensation;
	status: OvertimeStatus;
	hourly_rate: number;
	amount: number;
	reason: string;
	attachment?: string;
	auto_generated?: boolean;
	owner: string;
	created: string;
	expand?: { employee?: Employee };
}

export interface OvertimeSettings {
	id: string;
	company: string;
	weekday_multiplier: number;
	weekend_multiplier: number;
	holiday_multiplier: number;
	require_attachment: boolean;
	auto_approve: boolean;
	min_minutes: number;
	auto_overtime: boolean;
	overtime_before_minutes: number;
	overtime_after_minutes: number;
	owner: string;
}

export const OVERTIME_COMPENSATION_LABELS: Record<OvertimeCompensation, string> = {
	paid_overtime: 'Paid overtime',
	time_off: 'Time off in lieu',
	unpaid: 'Unpaid',
};

export const OVERTIME_STATUS_LABELS: Record<OvertimeStatus, string> = {
	awaiting_approval: 'Awaiting approval',
	approved: 'Approved',
	rejected: 'Rejected',
	cancelled: 'Cancelled',
};

export const OVERTIME_STATUS_OPTIONS = Object.keys(
	OVERTIME_STATUS_LABELS,
) as OvertimeStatus[];

export const OVERTIME_COMPENSATION_OPTIONS = Object.keys(
	OVERTIME_COMPENSATION_LABELS,
) as OvertimeCompensation[];

export function emptyOvertimeRequest(today: string): Partial<OvertimeRequest> {
	return {
		employee: '',
		requested_date: today,
		overtime_date: today,
		duration_minutes: 60,
		compensation: 'paid_overtime',
		status: 'awaiting_approval',
		hourly_rate: 0,
		amount: 0,
		reason: '',
	};
}

export function defaultOvertimeSettings(): Omit<
	OvertimeSettings,
	'id' | 'company' | 'owner'
> {
	return {
		weekday_multiplier: 1.5,
		weekend_multiplier: 2,
		holiday_multiplier: 3,
		require_attachment: false,
		auto_approve: false,
		min_minutes: 30,
		auto_overtime: false,
		overtime_before_minutes: 30,
		overtime_after_minutes: 30,
	};
}

/** Convert "HH:MM" to minutes since midnight. NaN if unparseable. */
export function timeToMinutes(t: string | undefined): number {
	if (!t) return NaN;
	const m = t.match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return NaN;
	return Number(m[1]) * 60 + Number(m[2]);
}

export interface AutoOvertimeInput {
	scheduleIn: string;
	scheduleOut: string;
	clockIn: string;
	clockOut: string;
}

/** Minutes worked before schedule_in (early arrival) and after schedule_out (late departure). */
export function computeAutoOvertimeMinutes(input: AutoOvertimeInput): {
	before: number;
	after: number;
	total: number;
} {
	const schIn = timeToMinutes(input.scheduleIn);
	const schOut = timeToMinutes(input.scheduleOut);
	const clkIn = timeToMinutes(input.clockIn);
	const clkOut = timeToMinutes(input.clockOut);
	const before =
		Number.isFinite(schIn) && Number.isFinite(clkIn) && clkIn < schIn
			? schIn - clkIn
			: 0;
	const after =
		Number.isFinite(schOut) && Number.isFinite(clkOut) && clkOut > schOut
			? clkOut - schOut
			: 0;
	return { before, after, total: before + after };
}

/** Format duration minutes as "X hours Y mins". */
export function formatDuration(minutes: number): string {
	const m = Math.max(0, Math.round(minutes || 0));
	const h = Math.floor(m / 60);
	const mins = m % 60;
	if (h === 0) return `${mins} mins`;
	if (mins === 0) return h === 1 ? '1 hour' : `${h} hours`;
	return `${h} hour${h > 1 ? 's' : ''} ${mins} mins`;
}

/** Parse "2:30" or "2.5" or "150" (minutes) into minutes. */
export function parseDurationInput(value: string): number {
	const v = value.trim().toLowerCase();
	if (!v) return 0;
	const hm = v.match(/^(\d+)\s*[h:]\s*(\d+)?/);
	if (hm) {
		const h = Number(hm[1]) || 0;
		const m = Number(hm[2]) || 0;
		return h * 60 + m;
	}
	const hoursOnly = v.match(/^(\d+(?:\.\d+)?)\s*h/);
	if (hoursOnly) return Math.round(Number(hoursOnly[1]) * 60);
	const minsOnly = v.match(/^(\d+)\s*m/);
	if (minsOnly) return Number(minsOnly[1]) || 0;
	const n = Number(v.replace(',', '.'));
	if (!Number.isFinite(n)) return 0;
	// Values under 24 treated as hours if decimal, else minutes if integer > 24
	if (n > 0 && n < 24 && String(v).includes('.')) return Math.round(n * 60);
	if (n > 0 && n <= 12 && !String(v).includes('.')) return Math.round(n * 60);
	return Math.round(n);
}

/** Estimate paid overtime amount from hourly rate, minutes, and multiplier. */
export function calcOvertimeAmount(
	hourlyRate: number,
	durationMinutes: number,
	multiplier = 1.5,
): number {
	const hours = Math.max(0, durationMinutes) / 60;
	return Math.round(Math.max(0, hourlyRate) * hours * multiplier);
}

/** Derive a simple employee display code from record id. */
export function employeeDisplayCode(emp: Pick<Employee, 'id'> | undefined): string {
	if (!emp?.id) return '—';
	// Stable numeric-looking code from id chars
	let n = 0;
	for (let i = 0; i < emp.id.length; i++) n = (n * 31 + emp.id.charCodeAt(i)) >>> 0;
	return String(30000000 + (n % 7000000));
}

export function formatOvertimeDate(iso: string | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso.slice(0, 10) + 'T12:00:00');
	if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
	return d.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

/** Avatar initials from name. */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic avatar background from name. */
export function avatarHue(name: string): number {
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * 17) % 360;
	return h;
}
