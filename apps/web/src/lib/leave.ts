import type { Employee } from '@/lib/payroll';

export type LeaveType =
	| 'annual'
	| 'sick'
	| 'personal'
	| 'maternity'
	| 'unpaid'
	| 'other';

export type LeaveStatus =
	| 'awaiting_approval'
	| 'approved'
	| 'rejected'
	| 'cancelled';

export interface LeaveRequest {
	id: string;
	company: string;
	employee: string;
	requested_date: string;
	start_date: string;
	end_date: string;
	days: number;
	leave_type: LeaveType;
	status: LeaveStatus;
	reason: string;
	attachment?: string;
	owner: string;
	created: string;
	expand?: { employee?: Employee };
}

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
	annual: 'Cuti Tahunan',
	sick: 'Sakit',
	personal: 'Keperluan Pribadi',
	maternity: 'Cuti Melahirkan',
	unpaid: 'Cuti Tanpa Bayaran',
	other: 'Lainnya',
};

export const LEAVE_TYPE_OPTIONS = Object.keys(
	LEAVE_TYPE_LABELS,
) as LeaveType[];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
	awaiting_approval: 'Menunggu Persetujuan',
	approved: 'Disetujui',
	rejected: 'Ditolak',
	cancelled: 'Dibatalkan',
};

export const LEAVE_STATUS_OPTIONS = Object.keys(
	LEAVE_STATUS_LABELS,
) as LeaveStatus[];

export function emptyLeaveRequest(today: string): Partial<LeaveRequest> {
	return {
		requested_date: today,
		start_date: today,
		end_date: today,
		days: 1,
		leave_type: 'annual',
		status: 'awaiting_approval',
		reason: '',
	};
}

/** Hitung jumlah hari cuti (inklusif) dari rentang tanggal. */
export function calcLeaveDays(
	start: string | undefined,
	end: string | undefined,
): number {
	if (!start || !end) return 0;
	const s = new Date(`${start.slice(0, 10)}T00:00:00`);
	const e = new Date(`${end.slice(0, 10)}T00:00:00`);
	if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
	const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
	return Math.max(0, diff + 1);
}

export function formatLeaveDate(iso: string | undefined): string {
	if (!iso) return '—';
	const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
	return d.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

/** Rentang tanggal singkat, mis. "12 – 15 Mei 2026". */
export function formatLeaveRange(
	start: string | undefined,
	end: string | undefined,
): string {
	if (!start || !end) return '—';
	const s = new Date(`${start.slice(0, 10)}T12:00:00`);
	const e = new Date(`${end.slice(0, 10)}T12:00:00`);
	if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
		return `${start.slice(0, 10)} – ${end.slice(0, 10)}`;
	}
	const sameMonth =
		s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
	const day = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric' });
	const monthYear = (d: Date) =>
		d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
	if (sameMonth) return `${day(s)} – ${day(e)} ${monthYear(e)}`;
	return `${formatLeaveDate(start)} – ${formatLeaveDate(end)}`;
}

/* ----------------------------- Leave Settings ----------------------------- */

export interface LeaveSettings {
	id: string;
	company: string;
	annual_quota: number;
	sick_quota: number;
	personal_quota: number;
	maternity_quota: number;
	unpaid_quota: number;
	require_attachment: boolean;
	auto_approve: boolean;
	carry_forward: boolean;
	year_start_month: number;
	owner: string;
}

export function defaultLeaveSettings(): Omit<
	LeaveSettings,
	'id' | 'company' | 'owner'
> {
	return {
		annual_quota: 12,
		sick_quota: 12,
		personal_quota: 12,
		maternity_quota: 90,
		unpaid_quota: 0,
		require_attachment: false,
		auto_approve: false,
		carry_forward: false,
		year_start_month: 1,
	};
}

/** Kuota default per jenis cuti, dipakai saat membuat saldo cuti baru. */
export function quotaForType(
	settings: LeaveSettings | null,
	type: LeaveType,
): number {
	const s = settings ?? defaultLeaveSettings();
	switch (type) {
		case 'annual':
			return s.annual_quota ?? 0;
		case 'sick':
			return s.sick_quota ?? 0;
		case 'personal':
			return s.personal_quota ?? 0;
		case 'maternity':
			return s.maternity_quota ?? 0;
		case 'unpaid':
			return s.unpaid_quota ?? 0;
		default:
			return 0;
	}
}

/* ----------------------------- Leave Balances ----------------------------- */

export interface LeaveBalance {
	id: string;
	company: string;
	employee: string;
	year: string;
	annual_entitlement: number;
	annual_carry_forward: number;
	sick_entitlement: number;
	personal_entitlement: number;
	maternity_entitlement: number;
	owner: string;
	expand?: { employee?: Employee };
}

export interface LeaveUsage {
	annual: number;
	sick: number;
	personal: number;
	maternity: number;
	unpaid: number;
	other: number;
}

/** Total hari cuti disetujui per jenis cuti untuk karyawan pada tahun tertentu. */
export function computeLeaveUsage(
	requests: LeaveRequest[],
	employeeId: string,
	year: string,
): LeaveUsage {
	const usage: LeaveUsage = {
		annual: 0,
		sick: 0,
		personal: 0,
		maternity: 0,
		unpaid: 0,
		other: 0,
	};
	for (const r of requests) {
		if (r.employee !== employeeId) continue;
		if (r.status !== 'approved') continue;
		const y = (r.start_date || '').slice(0, 4);
		if (y !== year) continue;
		const days = r.days || calcLeaveDays(r.start_date, r.end_date);
		const key = r.leave_type ?? 'other';
		usage[key] += days;
	}
	return usage;
}

/** Sisa cuti tahunan = hak + carry forward − terpakai. */
export function annualRemaining(b: LeaveBalance, usage: LeaveUsage): number {
	const ent = b.annual_entitlement ?? 0;
	const carry = b.annual_carry_forward ?? 0;
	return Math.max(0, ent + carry - usage.annual);
}

/** Buat payload saldo cuti default dari pengaturan perusahaan. */
export function defaultBalanceFromSettings(
	settings: LeaveSettings | null,
	year: string,
): Omit<
	LeaveBalance,
	'id' | 'company' | 'employee' | 'owner' | 'expand'
> {
	const s = settings ?? defaultLeaveSettings();
	return {
		year,
		annual_entitlement: s.annual_quota ?? 0,
		annual_carry_forward: 0,
		sick_entitlement: s.sick_quota ?? 0,
		personal_entitlement: s.personal_quota ?? 0,
		maternity_entitlement: s.maternity_quota ?? 0,
	};
}
