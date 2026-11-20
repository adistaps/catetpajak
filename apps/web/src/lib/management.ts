import type { Employee } from '@/lib/payroll';

export interface PerformanceCriterion {
	key: string;
	rating: number;
	comment?: string;
}

export interface PerformanceReview {
	id: string;
	company: string;
	employee: string;
	title: string;
	period?: string;
	review_date: string;
	rating: string;
	criteria?: PerformanceCriterion[];
	goals?: string;
	strengths?: string;
	improvements?: string;
	notes?: string;
	status: 'draft' | 'completed';
	reviewer?: string;
	owner: string;
	created: string;
	updated: string;
	expand?: { employee?: Employee };
}

/** Kriteria penilaian kinerja standar. */
export const PERFORMANCE_CRITERIA: { key: string; labelKey: string }[] = [
	{ key: 'quality', labelKey: 'mgmt.crit.quality' },
	{ key: 'productivity', labelKey: 'mgmt.crit.productivity' },
	{ key: 'attendance', labelKey: 'mgmt.crit.attendance' },
	{ key: 'teamwork', labelKey: 'mgmt.crit.teamwork' },
	{ key: 'communication', labelKey: 'mgmt.crit.communication' },
	{ key: 'initiative', labelKey: 'mgmt.crit.initiative' },
	{ key: 'problem_solving', labelKey: 'mgmt.crit.problem_solving' },
	{ key: 'discipline', labelKey: 'mgmt.crit.discipline' },
];

export function emptyCriteria(): PerformanceCriterion[] {
	return PERFORMANCE_CRITERIA.map(c => ({ key: c.key, rating: 3 }));
}

/** Rata-rata rating dari seluruh kriteria (dibulatkan ke 1 desimal). */
export function averageCriteriaRating(criteria?: PerformanceCriterion[]): number | null {
	if (!criteria || criteria.length === 0) return null;
	const sum = criteria.reduce((acc, c) => acc + (Number(c.rating) || 0), 0);
	return Math.round((sum / criteria.length) * 10) / 10;
}

export interface Training {
	id: string;
	company: string;
	title: string;
	description?: string;
	category?: TrainingCategory;
	start_date?: string;
	end_date?: string;
	trainer?: string;
	location?: string;
	status: TrainingStatus;
	participants?: string[];
	owner: string;
	created: string;
	updated: string;
	expand?: { participants?: Employee[] };
}

export type TrainingCategory =
	| 'onboarding'
	| 'technical'
	| 'soft_skill'
	| 'compliance'
	| 'leadership'
	| 'other';

export type TrainingStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';

export const RATING_OPTIONS = ['1', '2', '3', '4', '5'] as const;

export const TRAINING_CATEGORY_OPTIONS: TrainingCategory[] = [
	'onboarding',
	'technical',
	'soft_skill',
	'compliance',
	'leadership',
	'other',
];

export const TRAINING_STATUS_OPTIONS: TrainingStatus[] = [
	'planned',
	'ongoing',
	'completed',
	'cancelled',
];

export const REVIEW_STATUS_OPTIONS = ['draft', 'completed'] as const;

// ── Performance Review Cycle ────────────────────────────────────────────────

export type CyclePurpose = 'performance' | 'competency' | 'evaluation';
export type CycleTimeFrame = 'custom' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
export type CycleEmployeeSelection = 'selected' | 'all';
export type CycleStatus = 'draft' | 'active' | 'completed' | 'archived';
export type PublishScoreAfter = 'complete_review' | 'review_period_end' | 'both';
export type ReviewMethodKey = 'manager' | '360' | 'team' | 'self';
export type DeductionFormula = 'per_period' | 'percentage';
export type DeductionAssigned = 'all' | 'job_level' | 'job_position';
export type AttendanceConditionType =
	| 'absent'
	| 'no_clock_in'
	| 'no_clock_out'
	| 'late_clock_in'
	| 'early_clock_out';

export interface AttendanceCondition {
	type: AttendanceConditionType;
	threshold: number;
	deduct: number;
}

export interface ReprimandTypeScore {
	type: string;
	deduct: number;
}

export interface DeductionConfig {
	enabled: boolean;
	formula: DeductionFormula;
	assigned: DeductionAssigned;
	job_levels: string[];
	job_positions: string[];
	attendance_conditions: AttendanceCondition[];
	reprimand_enabled: boolean;
	reprimand_types: ReprimandTypeScore[];
}

export interface ReviewMethodConfig {
	enabled: boolean;
	template: string;
	// General
	auto_assign_manager?: boolean;
	display_result_detail?: boolean;
	layering?: boolean;
	display_for_manager?: boolean;
	let_member_pick_coworker?: boolean;
	allow_reject?: boolean;
	comment_only?: boolean;
	show_on_manager_form?: boolean;
	must_submit_before_manager?: boolean;
	// Goals
	include_goals?: boolean;
	goal_types?: string[];
	employee_pick_goals?: boolean;
	auto_score_goals?: boolean;
	goal_achievement_pct?: number;
	allow_edit_auto_score?: boolean;
	use_9box?: boolean;
	// Attendance
	include_attendance?: boolean;
	attendance_score_pct?: number;
	// Reprimand
	include_reprimand?: boolean;
	reprimand_as?: 'info' | 'score';
	reprimand_scores?: Record<string, number>;
	// Weight
	weight?: number;
}

export interface PerformanceCycle {
	id: string;
	company: string;
	name: string;
	purpose: CyclePurpose;
	duplicate_from?: string;
	employee_selection: CycleEmployeeSelection;
	selected_employees?: string[];
	time_frame: CycleTimeFrame;
	performance_start: string;
	performance_end: string;
	review_start: string;
	review_end: string;
	extend_deadline?: boolean;
	repeat_cycle?: boolean;
	lock_edit?: boolean;
	methods?: Record<ReviewMethodKey, ReviewMethodConfig>;
	use_weight?: boolean;
	deduction?: DeductionConfig;
	publish_score_after: PublishScoreAfter;
	status: CycleStatus;
	owner: string;
	created: string;
	updated: string;
	expand?: {
		selected_employees?: Employee[];
		duplicate_from?: PerformanceCycle;
	};
}

export const CYCLE_PURPOSE_OPTIONS: CyclePurpose[] = ['performance', 'competency', 'evaluation'];
export const CYCLE_TIMEFRAME_OPTIONS: CycleTimeFrame[] = [
	'custom',
	'monthly',
	'quarterly',
	'half_yearly',
	'yearly',
];
export const CYCLE_STATUS_OPTIONS: CycleStatus[] = ['draft', 'active', 'completed', 'archived'];
export const PUBLISH_SCORE_OPTIONS: PublishScoreAfter[] = [
	'complete_review',
	'review_period_end',
	'both',
];
export const REVIEW_METHOD_KEYS: ReviewMethodKey[] = ['manager', '360', 'team', 'self'];
export const DEDUCTION_FORMULA_OPTIONS: DeductionFormula[] = ['per_period', 'percentage'];
export const DEDUCTION_ASSIGNED_OPTIONS: DeductionAssigned[] = ['all', 'job_level', 'job_position'];
export const ATTENDANCE_CONDITION_TYPES: AttendanceConditionType[] = [
	'absent',
	'no_clock_in',
	'no_clock_out',
	'late_clock_in',
	'early_clock_out',
];

export function cyclePurposeLabelKey(purpose: string): string {
	return `mgmt.cycle.purpose.${purpose}`;
}
export function cycleTimeFrameLabelKey(tf: string): string {
	return `mgmt.cycle.timeframe.${tf}`;
}
export function cycleStatusLabelKey(status: string): string {
	return `mgmt.cycle.status.${status}`;
}
export function publishScoreLabelKey(p: string): string {
	return `mgmt.cycle.publish.${p}`;
}
export function reviewMethodLabelKey(m: string): string {
	return `mgmt.cycle.method.${m}`;
}
export function deductionFormulaLabelKey(f: string): string {
	return `mgmt.cycle.deduction.formula.${f}`;
}
export function deductionAssignedLabelKey(a: string): string {
	return `mgmt.cycle.deduction.assigned.${a}`;
}
export function attendanceConditionLabelKey(c: string): string {
	return `mgmt.cycle.deduction.attendance.${c}`;
}

export function emptyMethodConfig(): ReviewMethodConfig {
	return {
		enabled: false,
		template: '',
		weight: 0,
	};
}

export function emptyMethods(): Record<ReviewMethodKey, ReviewMethodConfig> {
	return {
		manager: emptyMethodConfig(),
		'360': emptyMethodConfig(),
		team: emptyMethodConfig(),
		self: emptyMethodConfig(),
	};
}

export function emptyDeduction(): DeductionConfig {
	return {
		enabled: false,
		formula: 'per_period',
		assigned: 'all',
		job_levels: [],
		job_positions: [],
		attendance_conditions: [],
		reprimand_enabled: false,
		reprimand_types: [],
	};
}

/** Hitung jumlah metode review yang aktif pada sebuah cycle. */
export function activeMethodCount(methods?: Record<ReviewMethodKey, ReviewMethodConfig>): number {
	if (!methods) return 0;
	return REVIEW_METHOD_KEYS.filter(k => methods[k]?.enabled).length;
}

/**
 * Progres timeline cycle berdasarkan tanggal periode kinerja & review vs hari ini.
 * Mengembalikan fase saat ini dan persentase 0–100 untuk ditampilkan di overview.
 */
export function cycleTimeline(
	cycle: Pick<PerformanceCycle, 'performance_start' | 'performance_end' | 'review_start' | 'review_end' | 'status'>,
): { phase: 'preparing' | 'performance' | 'review' | 'ended'; progress: number } {
	const now = new Date();
	const start = new Date(cycle.performance_start);
	const perfEnd = new Date(cycle.performance_end);
	const reviewStart = new Date(cycle.review_start);
	const reviewEnd = new Date(cycle.review_end);

	if (now < start) return { phase: 'preparing', progress: 0 };
	if (now <= perfEnd) {
		const total = perfEnd.getTime() - start.getTime();
		const done = now.getTime() - start.getTime();
		return { phase: 'performance', progress: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0 };
	}
	if (now <= reviewEnd) {
		const total = reviewEnd.getTime() - reviewStart.getTime();
		const done = now.getTime() - reviewStart.getTime();
		return { phase: 'review', progress: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0 };
	}
	return { phase: 'ended', progress: 100 };
}

export function ratingLabelKey(rating: string): string {
	return `mgmt.rating.${rating}`;
}

export function trainingCategoryLabelKey(category: string): string {
	return `mgmt.cat.${category}`;
}

export function trainingStatusLabelKey(status: string): string {
	return `mgmt.train.status.${status}`;
}

export function reviewStatusLabelKey(status: string): string {
	return `mgmt.status.${status}`;
}
