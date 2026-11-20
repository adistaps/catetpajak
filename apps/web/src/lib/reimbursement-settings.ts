import { todayIso } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import type { MemberRole } from '@/data/user-roles';
import type { ReimbursementStatus } from '@/lib/reimbursements';

export type ReimbursementAssignmentType = 'all' | 'employees' | 'role';

export type ReimbursementEligibilityType = 'immediate' | 'after_probation' | 'after_date';

export interface ReimbursementSetting {
	id: string;
	company: string;
	name: string;
	description: string;
	/** Batas nominal maksimal per pengajuan. 0 atau null = tanpa batas. */
	amount_limit: number;
	/** Total alokasi/saldo per jenis reimbursement (company-wide). 0 = tanpa pelacakan saldo. */
	budget: number;
	/** Batas nominal per level karyawan, mis. { Manager: 1000000, Staff: 500000 }. */
	level_limits: Record<string, number>;
	assignment_type: ReimbursementAssignmentType;
	/** Daftar id karyawan ketika assignment_type = 'employees'. */
	assigned_employees: string[];
	/** Daftar role ketika assignment_type = 'role'. */
	assigned_roles: string[];
	eligibility_type: ReimbursementEligibilityType;
	/** Jumlah bulan masa probation sebelum eligibility berlaku. */
	probation_months: number;
	/** Tanggal mulai eligibility ketika eligibility_type = 'after_date'. */
	effective_date: string;
	active: boolean;
	owner: string;
	created: string;
	updated: string;
	expand?: { assigned_employees?: Employee[] };
}

export const ASSIGNMENT_TYPE_LABELS: Record<ReimbursementAssignmentType, string> = {
	all: 'Semua karyawan',
	employees: 'Karyawan tertentu',
	role: 'Per role',
};

export const ELIGIBILITY_TYPE_LABELS: Record<ReimbursementEligibilityType, string> = {
	immediate: 'Langsung',
	after_probation: 'Setelah probation',
	after_date: 'Setelah tanggal',
};

export function emptyReimbursementSetting(): Omit<
	ReimbursementSetting,
	'id' | 'company' | 'owner' | 'created' | 'updated' | 'expand'
> {
	return {
		name: '',
		description: '',
		amount_limit: 0,
		budget: 0,
		level_limits: {},
		assignment_type: 'all',
		assigned_employees: [],
		assigned_roles: [],
		eligibility_type: 'immediate',
		probation_months: 3,
		effective_date: '',
		active: true,
	};
}

/** Normalisasi nilai `level_limits` dari PocketBase (bisa null/string/object). */
export function normalizeLevelLimits(raw: unknown): Record<string, number> {
	if (!raw || typeof raw !== 'object') return {};
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof k === 'string' && k.trim()) {
			const n = Number(v);
			if (!Number.isNaN(n)) out[k.trim()] = n;
		}
	}
	return out;
}

/** Tambah sejumlah bulan ke tanggal ISO; kembalikan ISO YYYY-MM-DD. */
function addMonths(iso: string, months: number): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	d.setMonth(d.getMonth() + months);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface EligibilityResult {
	eligible: boolean;
	/** Alasan singkat bila belum memenuhi syarat. */
	reason: string;
	/** Batas nominal yang berlaku untuk karyawan ini (0 = tanpa batas). Hanya diisi bila eligible. */
	amountLimit?: number;
	/** Sumber batas nominal: 'level' (batas per level), 'default' (batas umum), atau 'none'. */
	limitSource?: 'level' | 'default' | 'none';
	/** Keterangan batas nominal untuk ditampilkan kepada karyawan. */
	limitNote?: string;
}

/**
 * Periksa apakah seorang karyawan memenuhi syarat untuk pengaturan
 * reimbursement ini, berdasarkan penugasan dan saat eligibility berlaku.
 */
export function checkEligibility(
	setting: ReimbursementSetting,
	employee: Employee,
	memberRole: MemberRole | null,
	today: string = todayIso(),
): EligibilityResult {
	// 1. Penugasan
	if (setting.assignment_type === 'employees') {
		const ids = Array.isArray(setting.assigned_employees) ? setting.assigned_employees : [];
		if (!ids.includes(employee.id)) {
			return { eligible: false, reason: 'Jenis reimbursement ini tidak ditugaskan untuk Anda.' };
		}
	} else if (setting.assignment_type === 'role') {
		const roles = Array.isArray(setting.assigned_roles) ? setting.assigned_roles : [];
		if (!memberRole || !roles.includes(memberRole)) {
			return { eligible: false, reason: 'Jenis reimbursement ini tidak berlaku untuk role Anda.' };
		}
	}

	// 2. Saat eligibility berlaku
	if (setting.eligibility_type === 'after_probation') {
		const months = Number(setting.probation_months) || 0;
		const joinDate = (employee.join_date || '').slice(0, 10);
		if (!joinDate) {
			return {
				eligible: false,
				reason: 'Tanggal bergabung Anda belum diisi. Hubungi admin untuk mengaturnya.',
			};
		}
		const eligibleSince = addMonths(joinDate, months);
		if (today < eligibleSince) {
			return {
				eligible: false,
				reason: `Baru dapat mengajukan setelah masa probation (${months} bulan dari tanggal bergabung), yaitu mulai ${eligibleSince}.`,
			};
		}
	} else if (setting.eligibility_type === 'after_date') {
		const effective = (setting.effective_date || '').slice(0, 10);
		if (!effective) {
			return { eligible: false, reason: 'Tanggal mulai reimbursement belum diatur.' };
		}
		if (today < effective) {
			return {
				eligible: false,
				reason: `Baru dapat mengajukan mulai tanggal ${effective}.`,
			};
		}
	}

	return { eligible: true, reason: '', ...computeAmountLimit(setting, employee) };
}

/**
 * Hitung batas nominal yang berlaku untuk karyawan berdasarkan level-nya.
 * - Jika karyawan punya level dan level tersebut ada di `level_limits`, pakai
 *   batas level itu (0 = tanpa batas untuk level ini).
 * - Jika level karyawan tidak punya batas khusus (atau level belum diatur),
 *   jatuh ke batas umum `amount_limit`. Jangan menerapkan batas level lain.
 * - Jika tidak ada batas sama sekali, kembalikan 0 (tanpa batas).
 */
export function computeAmountLimit(
	setting: ReimbursementSetting,
	employee: Pick<Employee, 'level'>,
): { amountLimit: number; limitSource: 'level' | 'default' | 'none'; limitNote: string } {
	const level = (employee.level || '').trim();
	const levelLimits = normalizeLevelLimits(setting.level_limits);
	if (level && Object.prototype.hasOwnProperty.call(levelLimits, level)) {
		const limit = Number(levelLimits[level]) || 0;
		return {
			amountLimit: limit,
			limitSource: 'level',
			limitNote: limit > 0 ? `Batas level ${level}: ${limit}` : `Level ${level}: tanpa batas khusus`,
		};
	}
	const general = Number(setting.amount_limit) || 0;
	if (general > 0) {
		return {
			amountLimit: general,
			limitSource: 'default',
			limitNote: level
				? `Batas umum (level ${level} belum memiliki batas khusus)`
				: 'Batas umum (level karyawan belum diatur)',
		};
	}
	return {
		amountLimit: 0,
		limitSource: 'none',
		limitNote: level ? `Tanpa batas nominal (level ${level})` : 'Tanpa batas nominal (level karyawan belum diatur)',
	};
}

/** Alias ringkas: batas nominal yang berlaku untuk karyawan. */
export function applicableAmountLimit(
	setting: ReimbursementSetting,
	employee: Pick<Employee, 'level'>,
): number {
	return computeAmountLimit(setting, employee).amountLimit;
}

/** Label ringkas untuk syarat eligibility. */
export function eligibilityLabel(setting: ReimbursementSetting): string {
	if (setting.eligibility_type === 'after_probation') {
		const months = Number(setting.probation_months) || 0;
		return `Setelah ${months} bulan probation`;
	}
	if (setting.eligibility_type === 'after_date') {
		return `Mulai ${setting.effective_date || '—'}`;
	}
	return 'Langsung';
}

/** Label ringkas untuk penugasan. */
export function assignmentLabel(setting: ReimbursementSetting): string {
	if (setting.assignment_type === 'employees') {
		const count = Array.isArray(setting.assigned_employees) ? setting.assigned_employees.length : 0;
		return `${count} karyawan`;
	}
	if (setting.assignment_type === 'role') {
		const roles = Array.isArray(setting.assigned_roles) ? setting.assigned_roles : [];
		return roles.length ? roles.join(', ') : '—';
	}
	return 'Semua karyawan';
}

/* ----------------------------- Saldo per jenis ----------------------------- */

/** Status pengajuan yang mengurangi saldo reimbursement (bukan ditolak). */
export const SALDO_STATUSES: ReimbursementStatus[] = ['pending', 'approved', 'paid'];

export interface ReimbursementSaldo {
	settingId: string;
	/** Total alokasi/saldo per jenis. 0 = belum diatur (tanpa pelacakan saldo). */
	budget: number;
	/** Total terpakai dari pengajuan yang belum ditolak. */
	used: number;
	/** Sisa saldo = budget - used (minimal 0). */
	remaining: number;
}

/** true bila jenis ini melacak saldo (budget > 0). */
export function saldoTracked(saldo: ReimbursementSaldo | undefined): boolean {
	return Boolean(saldo && saldo.budget > 0);
}

/**
 * Hitung sisa saldo untuk sebuah jenis berdasarkan budget dan pengajuan yang
 * belum ditolak. `reimbursements` adalah daftar pengajuan (minimal berisi
 * field `setting`, `amount`, `status`) — biasanya seluruh pengajuan perusahaan.
 */
export function computeSaldo(
	setting: ReimbursementSetting,
	reimbursements: { setting?: string; amount: number; status: ReimbursementStatus }[],
): ReimbursementSaldo {
	const budget = Number(setting.budget) || 0;
	const used = reimbursements
		.filter(r => r.setting === setting.id && SALDO_STATUSES.includes(r.status))
		.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
	return {
		settingId: setting.id,
		budget,
		used,
		remaining: Math.max(0, budget - used),
	};
}

/** Ubah respons API `/api/reimbursement-saldo` menjadi peta settingId → saldo. */
export function indexSaldos(
	rows: { settingId: string; budget: number; used: number; remaining: number }[] | undefined,
): Record<string, ReimbursementSaldo> {
	const out: Record<string, ReimbursementSaldo> = {};
	for (const row of rows ?? []) {
		out[row.settingId] = {
			settingId: row.settingId,
			budget: Number(row.budget) || 0,
			used: Number(row.used) || 0,
			remaining: Number(row.remaining) || 0,
		};
	}
	return out;
}
