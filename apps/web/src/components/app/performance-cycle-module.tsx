import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ChevronDown,
	ChevronRight,
	Copy,
	Eye,
	Pencil,
	Plus,
	Trash2,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import { useLanguage } from '@/hooks/use-language';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
	type AttendanceConditionType,
	type CycleEmployeeSelection,
	type CyclePurpose,
	type CycleStatus,
	type CycleTimeFrame,
	type DeductionAssigned,
	type DeductionConfig,
	type DeductionFormula,
	type PerformanceCycle,
	type PublishScoreAfter,
	type ReviewMethodConfig,
	type ReviewMethodKey,
	type ReprimandTypeScore,
	ATTENDANCE_CONDITION_TYPES,
	CYCLE_PURPOSE_OPTIONS,
	CYCLE_STATUS_OPTIONS,
	CYCLE_TIMEFRAME_OPTIONS,
	DEDUCTION_ASSIGNED_OPTIONS,
	DEDUCTION_FORMULA_OPTIONS,
	PUBLISH_SCORE_OPTIONS,
	REVIEW_METHOD_KEYS,
	activeMethodCount,
	attendanceConditionLabelKey,
	cycleStatusLabelKey,
	cyclePurposeLabelKey,
	cycleTimeFrameLabelKey,
	cycleTimeline,
	deductionAssignedLabelKey,
	deductionFormulaLabelKey,
	emptyDeduction,
	emptyMethods,
	publishScoreLabelKey,
	reviewMethodLabelKey,
} from '@/lib/management';

interface PerformanceCycleModuleProps {
	company: Company;
}

interface CycleForm {
	name: string;
	purpose: CyclePurpose;
	duplicate: 'yes' | 'no';
	duplicate_from: string;
	employee_selection: CycleEmployeeSelection;
	selected_employees: string[];
	time_frame: CycleTimeFrame;
	performance_start: string;
	performance_end: string;
	review_start: string;
	review_end: string;
	extend_deadline: boolean;
	repeat_cycle: boolean;
	lock_edit: boolean;
	methods: Record<ReviewMethodKey, ReviewMethodConfig>;
	use_weight: boolean;
	deduction: DeductionConfig;
	publish_score_after: PublishScoreAfter;
	status: CycleStatus;
}

function addDays(iso: string, days: number): string {
	if (!iso) return '';
	const d = new Date(iso + 'T00:00:00');
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

function endOfMonth(iso: string): string {
	if (!iso) return '';
	const d = new Date(iso + 'T00:00:00');
	d.setMonth(d.getMonth() + 1, 0);
	return d.toISOString().slice(0, 10);
}

function emptyCycleForm(): CycleForm {
	const today = new Date().toISOString().slice(0, 10);
	return {
		name: '',
		purpose: 'performance',
		duplicate: 'no',
		duplicate_from: '',
		employee_selection: 'selected',
		selected_employees: [],
		time_frame: 'yearly',
		performance_start: today,
		performance_end: '',
		review_start: '',
		review_end: '',
		extend_deadline: false,
		repeat_cycle: false,
		lock_edit: false,
		methods: emptyMethods(),
		use_weight: false,
		deduction: emptyDeduction(),
		publish_score_after: 'complete_review',
		status: 'draft',
	};
}

function fromCycle(c: PerformanceCycle): CycleForm {
	return {
		name: c.name,
		purpose: c.purpose,
		duplicate: 'no',
		duplicate_from: c.duplicate_from ?? '',
		employee_selection: c.employee_selection,
		selected_employees: c.selected_employees ?? [],
		time_frame: c.time_frame,
		performance_start: (c.performance_start || '').slice(0, 10),
		performance_end: (c.performance_end || '').slice(0, 10),
		review_start: (c.review_start || '').slice(0, 10),
		review_end: (c.review_end || '').slice(0, 10),
		extend_deadline: c.extend_deadline ?? false,
		repeat_cycle: c.repeat_cycle ?? false,
		lock_edit: c.lock_edit ?? false,
		methods: c.methods ?? emptyMethods(),
		use_weight: c.use_weight ?? false,
		deduction: c.deduction ?? emptyDeduction(),
		publish_score_after: c.publish_score_after,
		status: c.status,
	};
}

function Section({
	title,
	children,
	defaultOpen = true,
}: {
	title: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="rounded-xl border border-border bg-card shadow-soft-sm">
			<button
				type="button"
				onClick={() => setOpen(o => !o)}
				className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
			>
				<h3 className="text-sm font-bold text-foreground">{title}</h3>
				{open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
			</button>
			{open ? <div className="space-y-3 border-t border-border p-4">{children}</div> : null}
		</div>
	);
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
	return (
		<div className="space-y-1.5">
			<label className="text-xs font-semibold text-muted-foreground">{label}</label>
			{children}
			{hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
		</div>
	);
}

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2';

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
	return (
		<label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 hover:bg-secondary/40">
			<input
				type="checkbox"
				checked={checked}
				onChange={e => onChange(e.target.checked)}
				className="mt-0.5 size-4 accent-emerald-600"
			/>
			<span className="text-xs font-medium text-foreground">{label}</span>
		</label>
	);
}

function MethodCard({
	methodKey,
	config,
	form,
	setForm,
	t,
}: {
	methodKey: ReviewMethodKey;
	config: ReviewMethodConfig;
	form: CycleForm;
	setForm: React.Dispatch<React.SetStateAction<CycleForm>>;
	t: (k: string, v?: Record<string, string | number>) => string;
}) {
	const [open, setOpen] = useState(false);
	const update = (patch: Partial<ReviewMethodConfig>) => {
		setForm(f => ({
			...f,
			methods: { ...f.methods, [methodKey]: { ...f.methods[methodKey], ...patch } },
		}));
	};

	return (
		<div className={cn('rounded-lg border', config.enabled ? 'border-emerald-300 bg-emerald-50/40' : 'border-border bg-background')}>
			<div className="flex items-center justify-between gap-2 px-3 py-2.5">
				<div className="min-w-0">
					<p className="text-sm font-bold text-foreground">{t(reviewMethodLabelKey(methodKey))}</p>
					<p className="text-[11px] text-muted-foreground">{t(`mgmt.cycle.method.desc.${methodKey}`)}</p>
				</div>
				<Switch checked={config.enabled} onCheckedChange={v => update({ enabled: v })} aria-label={t(reviewMethodLabelKey(methodKey))} />
			</div>
			{config.enabled ? (
				<div className="border-t border-border/60 px-3 py-2">
					<button
						type="button"
						onClick={() => setOpen(o => !o)}
						className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
					>
						{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
						{t('mgmt.cycle.section.general')}
					</button>
					{open ? (
						<div className="mt-2 space-y-3">
							<Field label={t('mgmt.cycle.field.template')}>
								<input
									value={config.template ?? ''}
									onChange={e => update({ template: e.target.value })}
									placeholder={t('mgmt.cycle.field.template_placeholder')}
									className={inputCls}
								/>
							</Field>
							<div className="grid gap-2 md:grid-cols-2">
								{methodKey === 'manager' ? (
									<>
										<CheckRow checked={!!config.auto_assign_manager} onChange={v => update({ auto_assign_manager: v })} label={t('mgmt.cycle.field.auto_assign_manager')} />
										<CheckRow checked={!!config.display_result_detail} onChange={v => update({ display_result_detail: v })} label={t('mgmt.cycle.field.display_result_detail')} />
										<CheckRow checked={!!config.layering} onChange={v => update({ layering: v })} label={t('mgmt.cycle.field.layering')} />
									</>
								) : null}
								{methodKey === '360' ? (
									<>
										<CheckRow checked={!!config.display_for_manager} onChange={v => update({ display_for_manager: v })} label={t('mgmt.cycle.field.display_for_manager')} />
										<CheckRow checked={!!config.let_member_pick_coworker} onChange={v => update({ let_member_pick_coworker: v })} label={t('mgmt.cycle.field.let_member_pick')} />
										<CheckRow checked={!!config.allow_reject} onChange={v => update({ allow_reject: v })} label={t('mgmt.cycle.field.allow_reject')} />
									</>
								) : null}
								{methodKey === 'team' ? (
									<CheckRow checked={!!config.display_for_manager} onChange={v => update({ display_for_manager: v })} label={t('mgmt.cycle.field.display_for_manager')} />
								) : null}
								{methodKey === 'self' ? (
									<>
										<CheckRow checked={!!config.comment_only} onChange={v => update({ comment_only: v })} label={t('mgmt.cycle.field.comment_only')} />
										<CheckRow checked={!!config.show_on_manager_form} onChange={v => update({ show_on_manager_form: v })} label={t('mgmt.cycle.field.show_on_manager')} />
										{config.show_on_manager_form ? (
											<div className="md:col-span-2 space-y-1.5 rounded-lg border border-border bg-background p-2.5">
												<label className="flex items-center gap-2 text-xs font-medium text-foreground">
													<input
														type="radio"
														checked={config.must_submit_before_manager === true}
														onChange={() => update({ must_submit_before_manager: true })}
														className="size-4 accent-emerald-600"
													/>
													{t('mgmt.cycle.field.must_submit_self')}
												</label>
												<label className="flex items-center gap-2 text-xs font-medium text-foreground">
													<input
														type="radio"
														checked={config.must_submit_before_manager === false}
														onChange={() => update({ must_submit_before_manager: false })}
														className="size-4 accent-emerald-600"
													/>
													{t('mgmt.cycle.field.no_need_submit_self')}
												</label>
											</div>
										) : null}
									</>
								) : null}
							</div>

							{/* Goals */}
							<div className="rounded-lg border border-border bg-secondary/30 p-2.5">
								<p className="mb-1.5 text-[11px] font-bold uppercase text-muted-foreground">Goals</p>
								<div className="grid gap-2 md:grid-cols-2">
									<CheckRow checked={!!config.include_goals} onChange={v => update({ include_goals: v })} label={t('mgmt.cycle.field.include_goals')} />
									{config.include_goals ? (
										<>
											<CheckRow checked={!!config.employee_pick_goals} onChange={v => update({ employee_pick_goals: v })} label={t('mgmt.cycle.field.employee_pick_goals')} />
											<CheckRow checked={!!config.auto_score_goals} onChange={v => update({ auto_score_goals: v })} label={t('mgmt.cycle.field.auto_score_goals')} />
											{config.auto_score_goals ? (
												<>
													<Field label={t('mgmt.cycle.field.goal_achievement')}>
														<input
															type="number"
															min={0}
															max={100}
															value={config.goal_achievement_pct ?? 0}
															onChange={e => update({ goal_achievement_pct: Number(e.target.value) })}
															className={inputCls}
														/>
													</Field>
													<CheckRow checked={!!config.allow_edit_auto_score} onChange={v => update({ allow_edit_auto_score: v })} label={t('mgmt.cycle.field.allow_edit_auto_score')} />
												</>
											) : null}
											{methodKey === 'manager' ? (
												<CheckRow checked={!!config.use_9box} onChange={v => update({ use_9box: v })} label={t('mgmt.cycle.field.use_9box')} />
											) : null}
										</>
									) : null}
								</div>
								{config.include_goals ? (
									<p className="mt-1.5 text-[11px] text-amber-600">{t('mgmt.cycle.field.goal_types_hint')}</p>
								) : null}
							</div>

							{/* Attendance (manager only) */}
							{methodKey === 'manager' ? (
								<div className="rounded-lg border border-border bg-secondary/30 p-2.5">
									<p className="mb-1.5 text-[11px] font-bold uppercase text-muted-foreground">Attendance</p>
									<CheckRow checked={!!config.include_attendance} onChange={v => update({ include_attendance: v })} label={t('mgmt.cycle.field.include_attendance')} />
									{config.include_attendance ? (
										<Field label={t('mgmt.cycle.field.attendance_score')}>
											<input
												type="number"
												min={0}
												max={100}
												value={config.attendance_score_pct ?? 0}
												onChange={e => update({ attendance_score_pct: Number(e.target.value) })}
												className={inputCls}
											/>
										</Field>
									) : null}
								</div>
							) : null}

							{/* Reprimand (manager only) */}
							{methodKey === 'manager' ? (
								<div className="rounded-lg border border-border bg-secondary/30 p-2.5">
									<p className="mb-1.5 text-[11px] font-bold uppercase text-muted-foreground">Reprimand</p>
									<CheckRow checked={!!config.include_reprimand} onChange={v => update({ include_reprimand: v })} label={t('mgmt.cycle.field.include_reprimand')} />
									{config.include_reprimand ? (
										<div className="space-y-1.5">
											<Field label={t('mgmt.cycle.field.reprimand_as')}>
												<select
													value={config.reprimand_as ?? 'info'}
													onChange={e => update({ reprimand_as: e.target.value as 'info' | 'score' })}
													className={inputCls}
												>
													<option value="info">{t('mgmt.cycle.field.reprimand_as_info')}</option>
													<option value="score">{t('mgmt.cycle.field.reprimand_as_score')}</option>
												</select>
											</Field>
										</div>
									) : null}
								</div>
							) : null}

							{/* Weight */}
							{form.use_weight ? (
								<Field label={t('mgmt.cycle.field.weight')}>
									<input
										type="number"
										min={0}
										max={100}
										value={config.weight ?? 0}
										onChange={e => update({ weight: Number(e.target.value) })}
										className={inputCls}
									/>
								</Field>
							) : null}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export function PerformanceCycleModule({ company }: PerformanceCycleModuleProps) {
	const { t } = useLanguage();
	const [cycles, setCycles] = useState<PerformanceCycle[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [jobLevels, setJobLevels] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [detailId, setDetailId] = useState<string | null>(null);
	const [form, setForm] = useState<CycleForm>(emptyCycleForm());
	const [saving, setSaving] = useState(false);

	const refresh = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const [list, empList, jlList] = await Promise.all([
			pb.collection('performance_cycles').getFullList<PerformanceCycle>({
				filter,
				sort: '-created',
				expand: 'selected_employees',
				requestKey: null,
			}),
			pb.collection('employees').getFullList<Employee>({
				filter,
				sort: 'name',
				requestKey: null,
			}),
			pb.collection('job_levels').getFullList<{ name: string }>({
				filter,
				sort: 'sort,name',
				requestKey: null,
			}).catch(() => [] as { name: string }[]),
		]);
		setCycles(list);
		setEmployees(empList);
		setJobLevels(jlList.map(j => j.name));
	}, [company.id]);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		refresh()
			.catch(() => {
				if (!cancelled) toast.error(t('mgmt.cycle.save_failed'));
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [refresh, t]);

	const positions = useMemo(() => {
		const set = new Set<string>();
		for (const e of employees) if (e.position) set.add(e.position);
		return Array.from(set).sort();
	}, [employees]);

	const detail = detailId ? cycles.find(c => c.id === detailId) ?? null : null;

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyCycleForm());
		setShowForm(true);
	};

	const openEdit = (c: PerformanceCycle) => {
		setEditingId(c.id);
		setForm(fromCycle(c));
		setShowForm(true);
		setDetailId(null);
	};

	const duplicateCycle = (c: PerformanceCycle) => {
		const f = fromCycle(c);
		f.name = `${c.name} (copy)`;
		f.status = 'draft';
		f.duplicate_from = c.id;
		setEditingId(null);
		setForm(f);
		setShowForm(true);
		toast.success(t('mgmt.cycle.duplicated', { name: c.name }));
	};

	const onTimeFrameChange = (tf: CycleTimeFrame) => {
		setForm(f => {
			const start = f.performance_start;
			let end = f.performance_end;
			if (start && tf !== 'custom') {
				if (tf === 'monthly') end = endOfMonth(start);
				else if (tf === 'quarterly') end = addDays(start, 89);
				else if (tf === 'half_yearly') end = addDays(start, 179);
				else if (tf === 'yearly') end = addDays(start, 364);
			}
			const reviewStart = end ? addDays(end, 1) : f.review_start;
			return { ...f, time_frame: tf, performance_end: end, review_start: reviewStart };
		});
	};

	const onPerfEndChange = (end: string) => {
		setForm(f => ({ ...f, performance_end: end, review_start: end ? addDays(end, 1) : f.review_start }));
	};

	const toggleEmployee = (id: string) => {
		setForm(f => {
			const has = f.selected_employees.includes(id);
			return {
				...f,
				selected_employees: has
					? f.selected_employees.filter(x => x !== id)
					: [...f.selected_employees, id],
			};
		});
	};

	const updateDeduction = (patch: Partial<DeductionConfig>) => {
		setForm(f => ({ ...f, deduction: { ...f.deduction, ...patch } }));
	};

	const addAttendanceCondition = () => {
		setForm(f => ({
			...f,
			deduction: {
				...f.deduction,
				attendance_conditions: [
					...f.deduction.attendance_conditions,
					{ type: 'absent' as AttendanceConditionType, threshold: 0, deduct: 0 },
				],
			},
		}));
	};

	const updateAttendanceCondition = (idx: number, patch: Partial<{ type: AttendanceConditionType; threshold: number; deduct: number }>) => {
		setForm(f => ({
			...f,
			deduction: {
				...f.deduction,
				attendance_conditions: f.deduction.attendance_conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
			},
		}));
	};

	const removeAttendanceCondition = (idx: number) => {
		setForm(f => ({
			...f,
			deduction: {
				...f.deduction,
				attendance_conditions: f.deduction.attendance_conditions.filter((_, i) => i !== idx),
			},
		}));
	};

	const addReprimandType = () => {
		setForm(f => ({
			...f,
			deduction: {
				...f.deduction,
				reprimand_types: [...f.deduction.reprimand_types, { type: '', deduct: 0 } as ReprimandTypeScore],
			},
		}));
	};

	const updateReprimandType = (idx: number, patch: Partial<ReprimandTypeScore>) => {
		setForm(f => ({
			...f,
			deduction: {
				...f.deduction,
				reprimand_types: f.deduction.reprimand_types.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
			},
		}));
	};

	const removeReprimandType = (idx: number) => {
		setForm(f => ({
			...f,
			deduction: {
				...f.deduction,
				reprimand_types: f.deduction.reprimand_types.filter((_, i) => i !== idx),
			},
		}));
	};

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.name.trim()) {
			toast.error(t('mgmt.cycle.name_required'));
			return;
		}
		if (!form.performance_start || !form.performance_end || !form.review_start || !form.review_end) {
			toast.error(t('mgmt.cycle.dates_required'));
			return;
		}
		if (new Date(form.review_start) <= new Date(form.performance_end)) {
			toast.error(t('mgmt.cycle.review_after_perf'));
			return;
		}
		if (activeMethodCount(form.methods) === 0) {
			toast.error(t('mgmt.cycle.need_method'));
			return;
		}
		if (form.employee_selection === 'selected' && form.selected_employees.length === 0) {
			toast.error(t('mgmt.cycle.need_employees'));
			return;
		}
		setSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const payload = {
				company: company.id,
				name: form.name.trim(),
				purpose: form.purpose,
				duplicate_from: form.duplicate_from || null,
				employee_selection: form.employee_selection,
				selected_employees: form.employee_selection === 'all' ? [] : form.selected_employees,
				time_frame: form.time_frame,
				performance_start: form.performance_start,
				performance_end: form.performance_end,
				review_start: form.review_start,
				review_end: form.review_end,
				extend_deadline: form.extend_deadline,
				repeat_cycle: form.repeat_cycle,
				lock_edit: form.lock_edit,
				methods: form.methods,
				use_weight: activeMethodCount(form.methods) > 1 ? form.use_weight : false,
				deduction: form.deduction,
				publish_score_after: form.publish_score_after,
				status: form.status,
				owner: ownerId,
			};
			if (editingId) {
				await pb.collection('performance_cycles').update(editingId, payload);
			} else {
				await pb.collection('performance_cycles').create(payload);
			}
			setShowForm(false);
			setEditingId(null);
			await refresh();
			toast.success(t('mgmt.cycle.saved'));
		} catch {
			toast.error(t('mgmt.cycle.save_failed'));
		} finally {
			setSaving(false);
		}
	};

	const changeStatus = async (c: PerformanceCycle, status: CycleStatus) => {
		try {
			await pb.collection('performance_cycles').update(c.id, { status });
			await refresh();
			toast.success(t('mgmt.cycle.status_changed'));
		} catch {
			toast.error(t('mgmt.cycle.save_failed'));
		}
	};

	const toggleLock = async (c: PerformanceCycle) => {
		try {
			await pb.collection('performance_cycles').update(c.id, { lock_edit: !c.lock_edit });
			await refresh();
			toast.success(t('mgmt.cycle.status_changed'));
		} catch {
			toast.error(t('mgmt.cycle.save_failed'));
		}
	};

	const remove = async (c: PerformanceCycle) => {
		if (!window.confirm(t('mgmt.cycle.delete_confirm'))) return;
		try {
			await pb.collection('performance_cycles').delete(c.id);
			if (detailId === c.id) setDetailId(null);
			await refresh();
			toast.success(t('mgmt.cycle.deleted'));
		} catch {
			toast.error(t('mgmt.cycle.delete_failed'));
		}
	};

	const statusColor = (s: CycleStatus) => {
		if (s === 'active') return 'bg-emerald-100 text-emerald-700';
		if (s === 'completed') return 'bg-blue-100 text-blue-700';
		if (s === 'archived') return 'bg-gray-100 text-gray-600';
		return 'bg-amber-100 text-amber-700';
	};

	const phaseColor = (phase: string) => {
		if (phase === 'performance') return 'bg-emerald-500';
		if (phase === 'review') return 'bg-blue-500';
		if (phase === 'ended') return 'bg-gray-400';
		return 'bg-amber-400';
	};

	return (
		<div className="space-y-5">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
						{t('mgmt.cycle.title')}
					</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						{t('mgmt.cycle.subtitle')} · {company.name}
					</p>
				</div>
				{!showForm ? (
					<button
						type="button"
						onClick={openCreate}
						className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98]"
					>
						<Plus className="size-4" /> {t('mgmt.cycle.create')}
					</button>
				) : null}
			</header>

			{!showForm && cycles.length === 0 && !isLoading ? (
				<div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
					{t('mgmt.cycle.empty')}
				</div>
			) : null}

			{!showForm && cycles.length > 0 ? (
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{cycles.map(c => {
						const tl = cycleTimeline(c);
						const methodsActive = activeMethodCount(c.methods);
						const empCount = c.employee_selection === 'all' ? employees.length : (c.selected_employees?.length ?? 0);
						return (
							<div key={c.id} className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-soft-sm transition-shadow hover:shadow-soft">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="truncate text-sm font-bold text-foreground">{c.name}</p>
										<p className="mt-0.5 text-xs text-muted-foreground">{t(cyclePurposeLabelKey(c.purpose))}</p>
									</div>
									<span className={cn('inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', statusColor(c.status))}>
										{t(cycleStatusLabelKey(c.status))}
									</span>
								</div>

								<div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
									<p>{t('mgmt.cycle.field.perf_period')}: {c.performance_start} → {c.performance_end}</p>
									<p>{t('mgmt.cycle.field.review_period')}: {c.review_start} → {c.review_end}</p>
									<p>{t('mgmt.cycle.col.methods')}: {methodsActive > 0 ? t('mgmt.cycle.methods_count', { count: methodsActive }) : t('mgmt.cycle.no_methods')}</p>
									<p>{t('mgmt.cycle.col.employees')}: {c.employee_selection === 'all' ? t('mgmt.cycle.all_employees') : t('mgmt.cycle.employees_count', { count: empCount })}</p>
								</div>

								<div className="mt-3">
									<div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
										<span>{t(`mgmt.cycle.phase.${tl.phase}`)}</span>
										<span>{tl.progress}%</span>
									</div>
									<div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
										<div className={cn('h-full rounded-full transition-all', phaseColor(tl.phase))} style={{ width: `${tl.progress}%` }} />
									</div>
								</div>

								<div className="mt-2 flex flex-wrap gap-1.5">
									{c.lock_edit ? (
										<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{t('mgmt.cycle.lock_edit_on')}</span>
									) : null}
									{c.repeat_cycle ? (
										<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{t('mgmt.cycle.repeat_on')}</span>
									) : null}
								</div>

								<div className="mt-auto flex items-center justify-end gap-1 border-t border-border pt-3">
									<button type="button" onClick={() => setDetailId(c.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={t('mgmt.cycle.detail_title')} title={t('mgmt.cycle.detail_title')}>
										<Eye className="size-4" />
									</button>
									<button type="button" onClick={() => duplicateCycle(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={t('mgmt.cycle.duplicate')} title={t('mgmt.cycle.duplicate')}>
										<Copy className="size-4" />
									</button>
									<button type="button" onClick={() => openEdit(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={t('mgmt.edit')}>
										<Pencil className="size-4" />
									</button>
									<button type="button" onClick={() => void remove(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t('mgmt.delete')}>
										<Trash2 className="size-4" />
									</button>
								</div>
							</div>
						);
					})}
				</div>
			) : null}

			{isLoading ? <p className="text-sm font-semibold text-muted-foreground">{t('mgmt.loading')}</p> : null}

			{/* Form */}
			{showForm ? (
				<form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft-sm">
					<div className="flex items-center justify-between">
						<h2 className="text-base font-bold text-foreground">
							{editingId ? t('mgmt.cycle.edit_title') : t('mgmt.cycle.create_title')}
						</h2>
						<button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="text-muted-foreground hover:text-foreground" aria-label={t('mgmt.cancel')}>
							<X className="size-4" />
						</button>
					</div>

					<Section title={t('mgmt.cycle.section.general')}>
						<div className="grid gap-3 md:grid-cols-2">
							<Field label={`${t('mgmt.cycle.field.name')} *`}>
								<input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
							</Field>
							<Field label={t('mgmt.cycle.field.purpose')}>
								<select value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value as CyclePurpose }))} className={inputCls}>
									{CYCLE_PURPOSE_OPTIONS.map(p => <option key={p} value={p}>{t(cyclePurposeLabelKey(p))}</option>)}
								</select>
							</Field>
							{!editingId ? (
								<Field label={t('mgmt.cycle.field.duplicate')}>
									<div className="flex gap-4 pt-1">
										<label className="flex items-center gap-1.5 text-sm"><input type="radio" checked={form.duplicate === 'no'} onChange={() => setForm(f => ({ ...f, duplicate: 'no' }))} className="size-4 accent-emerald-600" /> {t('mgmt.cycle.field.duplicate_no')}</label>
										<label className="flex items-center gap-1.5 text-sm"><input type="radio" checked={form.duplicate === 'yes'} onChange={() => setForm(f => ({ ...f, duplicate: 'yes' }))} className="size-4 accent-emerald-600" /> {t('mgmt.cycle.field.duplicate_yes')}</label>
									</div>
								</Field>
							) : null}
							{!editingId && form.duplicate === 'yes' ? (
								<Field label={t('mgmt.cycle.field.duplicate_source')}>
									<select value={form.duplicate_from} onChange={e => setForm(f => ({ ...f, duplicate_from: e.target.value }))} className={inputCls}>
										<option value="">{t('mgmt.cycle.field.template_placeholder')}</option>
										{cycles.length === 0 ? <option value="" disabled>{t('mgmt.cycle.field.duplicate_none')}</option> : null}
										{cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
									</select>
								</Field>
							) : null}
							<Field label={t('mgmt.cycle.field.status')}>
								<select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CycleStatus }))} className={inputCls}>
									{CYCLE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(cycleStatusLabelKey(s))}</option>)}
								</select>
							</Field>
						</div>
						<div className="grid gap-2 md:grid-cols-2">
							<CheckRow checked={form.lock_edit} onChange={v => setForm(f => ({ ...f, lock_edit: v }))} label={t('mgmt.cycle.field.lock_edit')} />
							<CheckRow checked={form.repeat_cycle} onChange={v => setForm(f => ({ ...f, repeat_cycle: v }))} label={t('mgmt.cycle.field.repeat')} />
						</div>
					</Section>

					<Section title={t('mgmt.cycle.section.employees')}>
						<Field label={t('mgmt.cycle.field.who')}>
							<div className="flex gap-4 pt-1">
								<label className="flex items-center gap-1.5 text-sm"><input type="radio" checked={form.employee_selection === 'selected'} onChange={() => setForm(f => ({ ...f, employee_selection: 'selected' }))} className="size-4 accent-emerald-600" /> {t('mgmt.cycle.field.select_employees')}</label>
								<label className="flex items-center gap-1.5 text-sm"><input type="radio" checked={form.employee_selection === 'all'} onChange={() => setForm(f => ({ ...f, employee_selection: 'all' }))} className="size-4 accent-emerald-600" /> {t('mgmt.cycle.field.select_all')}</label>
							</div>
						</Field>
						{form.employee_selection === 'selected' ? (
							employees.length === 0 ? (
								<p className="text-xs text-muted-foreground">{t('mgmt.no_employees')}</p>
							) : (
								<div>
									<p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t('mgmt.cycle.field.selected_count', { count: form.selected_employees.length })}</p>
									<div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
										{employees.map(emp => (
											<label key={emp.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-secondary/50">
												<input type="checkbox" checked={form.selected_employees.includes(emp.id)} onChange={() => toggleEmployee(emp.id)} className="size-4 accent-emerald-600" />
												<span className="text-sm text-foreground">{emp.name}{emp.position ? ` — ${emp.position}` : ''}</span>
											</label>
										))}
									</div>
								</div>
							)
						) : null}
					</Section>

					<Section title={t('mgmt.cycle.section.timeframe')}>
						<Field label={t('mgmt.cycle.field.timeframe')}>
							<select value={form.time_frame} onChange={e => onTimeFrameChange(e.target.value as CycleTimeFrame)} className={inputCls}>
								{CYCLE_TIMEFRAME_OPTIONS.map(tf => <option key={tf} value={tf}>{t(cycleTimeFrameLabelKey(tf))}</option>)}
							</select>
						</Field>
						<div className="grid gap-3 md:grid-cols-2">
							<Field label={`${t('mgmt.cycle.field.perf_start')} *`}>
								<input type="date" required value={form.performance_start} onChange={e => setForm(f => ({ ...f, performance_start: e.target.value }))} className={inputCls} />
							</Field>
							<Field label={`${t('mgmt.cycle.field.perf_end')} *`}>
								<input type="date" required value={form.performance_end} onChange={e => onPerfEndChange(e.target.value)} className={inputCls} />
							</Field>
							<Field label={`${t('mgmt.cycle.field.review_start')} *`} hint={t('mgmt.cycle.field.review_start')}>
								<input type="date" required value={form.review_start} onChange={e => setForm(f => ({ ...f, review_start: e.target.value }))} className={inputCls} />
							</Field>
							<Field label={`${t('mgmt.cycle.field.review_end')} *`}>
								<input type="date" required value={form.review_end} onChange={e => setForm(f => ({ ...f, review_end: e.target.value }))} className={inputCls} />
							</Field>
						</div>
						<div className="grid gap-2 md:grid-cols-2">
							<CheckRow checked={form.extend_deadline} onChange={v => setForm(f => ({ ...f, extend_deadline: v }))} label={t('mgmt.cycle.field.extend')} />
						</div>
					</Section>

					<Section title={t('mgmt.cycle.section.methods')}>
						<div className="space-y-2">
							{REVIEW_METHOD_KEYS.map(mk => (
								<MethodCard key={mk} methodKey={mk} config={form.methods[mk]} form={form} setForm={setForm} t={t} />
							))}
						</div>
						{activeMethodCount(form.methods) > 1 ? (
							<CheckRow checked={form.use_weight} onChange={v => setForm(f => ({ ...f, use_weight: v }))} label={t('mgmt.cycle.field.use_weight')} />
						) : null}
					</Section>

					<Section title={t('mgmt.cycle.section.deduction')} defaultOpen={false}>
						<CheckRow checked={form.deduction.enabled} onChange={v => updateDeduction({ enabled: v })} label={t('mgmt.cycle.field.deduction_enabled')} />
						{form.deduction.enabled ? (
							<>
								<div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-700">
									{t('mgmt.cycle.data_unavailable_desc')}
								</div>
								<div className="grid gap-3 md:grid-cols-2">
									<Field label={t('mgmt.cycle.field.deduction_formula')}>
										<select value={form.deduction.formula} onChange={e => updateDeduction({ formula: e.target.value as DeductionFormula })} className={inputCls}>
											{DEDUCTION_FORMULA_OPTIONS.map(f => <option key={f} value={f}>{t(deductionFormulaLabelKey(f))}</option>)}
										</select>
									</Field>
									<Field label={t('mgmt.cycle.field.deduction_assigned')}>
										<select value={form.deduction.assigned} onChange={e => updateDeduction({ assigned: e.target.value as DeductionAssigned })} className={inputCls}>
											{DEDUCTION_ASSIGNED_OPTIONS.map(a => <option key={a} value={a}>{t(deductionAssignedLabelKey(a))}</option>)}
										</select>
									</Field>
								</div>
								{form.deduction.assigned === 'job_level' ? (
									<Field label={t('mgmt.cycle.field.select_job_level')}>
										<select multiple value={form.deduction.job_levels} onChange={e => updateDeduction({ job_levels: Array.from(e.target.selectedOptions).map(o => o.value) })} className={cn(inputCls, 'h-28')}>
											{jobLevels.length === 0 ? <option disabled>{t('mgmt.cycle.data_unavailable')}</option> : null}
											{jobLevels.map(l => <option key={l} value={l}>{l}</option>)}
										</select>
									</Field>
								) : null}
								{form.deduction.assigned === 'job_position' ? (
									<Field label={t('mgmt.cycle.field.select_job_position')}>
										<select multiple value={form.deduction.job_positions} onChange={e => updateDeduction({ job_positions: Array.from(e.target.selectedOptions).map(o => o.value) })} className={cn(inputCls, 'h-28')}>
											{positions.length === 0 ? <option disabled>{t('mgmt.cycle.data_unavailable')}</option> : null}
											{positions.map(p => <option key={p} value={p}>{p}</option>)}
										</select>
									</Field>
								) : null}

								<div>
									<div className="flex items-center justify-between">
										<p className="text-xs font-bold text-foreground">{t('mgmt.cycle.field.attendance_conditions')}</p>
										<button type="button" onClick={addAttendanceCondition} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary/70">
											<Plus className="size-3" /> {t('mgmt.cycle.field.add_condition')}
										</button>
									</div>
									<div className="mt-1.5 space-y-1.5">
										{form.deduction.attendance_conditions.map((cond, idx) => (
											<div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
												<select value={cond.type} onChange={e => updateAttendanceCondition(idx, { type: e.target.value as AttendanceConditionType })} className={inputCls}>
													{ATTENDANCE_CONDITION_TYPES.map(ct => <option key={ct} value={ct}>{t(attendanceConditionLabelKey(ct))}</option>)}
												</select>
												<input type="number" min={0} value={cond.threshold} onChange={e => updateAttendanceCondition(idx, { threshold: Number(e.target.value) })} placeholder={t('mgmt.cycle.field.condition_threshold')} className={inputCls} />
												<input type="number" min={0} value={cond.deduct} onChange={e => updateAttendanceCondition(idx, { deduct: Number(e.target.value) })} placeholder={t('mgmt.cycle.field.condition_deduct')} className={inputCls} />
												<button type="button" onClick={() => removeAttendanceCondition(idx)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
													<Trash2 className="size-4" />
												</button>
											</div>
										))}
									</div>
								</div>

								<div>
									<div className="flex items-center justify-between">
										<p className="text-xs font-bold text-foreground">{t('mgmt.cycle.field.reprimand_data')}</p>
										<CheckRow checked={form.deduction.reprimand_enabled} onChange={v => updateDeduction({ reprimand_enabled: v })} label={t('mgmt.cycle.field.include_reprimand')} />
									</div>
									{form.deduction.reprimand_enabled ? (
										<div className="mt-1.5 space-y-1.5">
											{form.deduction.reprimand_types.map((rt, idx) => (
												<div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-[1fr_1fr_auto]">
													<input value={rt.type} onChange={e => updateReprimandType(idx, { type: e.target.value })} placeholder={t('mgmt.cycle.field.reprimand_type')} className={inputCls} />
													<input type="number" min={0} value={rt.deduct} onChange={e => updateReprimandType(idx, { deduct: Number(e.target.value) })} placeholder={t('mgmt.cycle.field.reprimand_deduct')} className={inputCls} />
													<button type="button" onClick={() => removeReprimandType(idx)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
														<Trash2 className="size-4" />
													</button>
												</div>
											))}
											<button type="button" onClick={addReprimandType} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary/70">
												<Plus className="size-3" /> {t('mgmt.cycle.field.add_reprimand_type')}
											</button>
										</div>
									) : null}
								</div>
							</>
						) : null}
					</Section>

					<Section title={t('mgmt.cycle.section.publish')}>
						<Field label={t('mgmt.cycle.field.publish_after')}>
							<select value={form.publish_score_after} onChange={e => setForm(f => ({ ...f, publish_score_after: e.target.value as PublishScoreAfter }))} className={inputCls}>
								{PUBLISH_SCORE_OPTIONS.map(p => <option key={p} value={p}>{t(publishScoreLabelKey(p))}</option>)}
							</select>
						</Field>
					</Section>

					<div className="flex flex-wrap gap-2">
						<button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
							{saving ? t('common.loading') : t('mgmt.save')}
						</button>
						<button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
							{t('mgmt.cancel')}
						</button>
					</div>
				</form>
			) : null}

			{/* Detail */}
			{detail ? (
				<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
					<div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-soft sm:rounded-2xl">
						<div className="flex items-start justify-between gap-3 border-b border-border p-5">
							<div className="min-w-0">
								<h2 className="text-base font-bold text-foreground">{t('mgmt.cycle.detail_title')}</h2>
								<p className="mt-0.5 truncate text-sm text-muted-foreground">{detail.name}</p>
							</div>
							<button type="button" onClick={() => setDetailId(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={t('mgmt.cancel')}>
								<X className="size-4" />
							</button>
						</div>
						<div className="flex-1 space-y-4 overflow-y-auto p-5">
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-4">
								<div>
									<p className="text-xs font-semibold uppercase text-muted-foreground">{t('mgmt.cycle.field.purpose')}</p>
									<p className="mt-0.5 text-sm font-bold text-foreground">{t(cyclePurposeLabelKey(detail.purpose))}</p>
								</div>
								<span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', statusColor(detail.status))}>
									{t(cycleStatusLabelKey(detail.status))}
								</span>
							</div>

							<div>
								<h3 className="mb-2 text-sm font-bold text-foreground">{t('mgmt.cycle.timeline')}</h3>
								<div className="space-y-1 text-xs text-muted-foreground">
									<p>{t('mgmt.cycle.field.perf_period')}: {detail.performance_start} → {detail.performance_end}</p>
									<p>{t('mgmt.cycle.field.review_period')}: {detail.review_start} → {detail.review_end}</p>
									<p>{t('mgmt.cycle.field.timeframe')}: {t(cycleTimeFrameLabelKey(detail.time_frame))}</p>
									{detail.extend_deadline ? <p>✓ {t('mgmt.cycle.field.extend')}</p> : null}
									{detail.repeat_cycle ? <p>✓ {t('mgmt.cycle.field.repeat')}</p> : null}
									{detail.lock_edit ? <p>✓ {t('mgmt.cycle.field.lock_edit')}</p> : null}
								</div>
							</div>

							<div>
								<h3 className="mb-2 text-sm font-bold text-foreground">{t('mgmt.cycle.review_methods')}</h3>
								<div className="space-y-1.5">
									{REVIEW_METHOD_KEYS.filter(mk => detail.methods?.[mk]?.enabled).map(mk => (
										<div key={mk} className="rounded-lg border border-border px-3 py-2 text-sm">
											<p className="font-semibold text-foreground">{t(reviewMethodLabelKey(mk))}</p>
											<p className="text-[11px] text-muted-foreground">{t(`mgmt.cycle.method.desc.${mk}`)}</p>
										</div>
									))}
									{activeMethodCount(detail.methods) === 0 ? <p className="text-xs text-muted-foreground">{t('mgmt.cycle.no_methods')}</p> : null}
								</div>
							</div>

							{detail.deduction?.enabled ? (
								<div>
									<h3 className="mb-2 text-sm font-bold text-foreground">{t('mgmt.cycle.deduction_config')}</h3>
									<div className="space-y-1 text-xs text-muted-foreground">
										<p>{t('mgmt.cycle.field.deduction_formula')}: {t(deductionFormulaLabelKey(detail.deduction.formula))}</p>
										<p>{t('mgmt.cycle.field.deduction_assigned')}: {t(deductionAssignedLabelKey(detail.deduction.assigned))}</p>
										{detail.deduction.attendance_conditions.length > 0 ? (
											<div>
												<p className="mt-1 font-semibold text-foreground">{t('mgmt.cycle.field.attendance_conditions')}:</p>
												<ul className="ml-3 list-disc">
													{detail.deduction.attendance_conditions.map((c, i) => (
														<li key={i}>{t(attendanceConditionLabelKey(c.type))} ≥ {c.threshold} → −{c.deduct}</li>
													))}
												</ul>
											</div>
										) : null}
									</div>
								</div>
							) : null}

							<div>
								<h3 className="mb-2 text-sm font-bold text-foreground">{t('mgmt.cycle.publish_rule')}</h3>
								<p className="text-xs text-muted-foreground">{t(publishScoreLabelKey(detail.publish_score_after))}</p>
							</div>
						</div>

						<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4">
							<div className="flex flex-wrap gap-1.5">
								{detail.status === 'draft' ? (
									<button type="button" onClick={() => void changeStatus(detail, 'active')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">{t('mgmt.cycle.activate')}</button>
								) : null}
								{detail.status === 'active' ? (
									<button type="button" onClick={() => void changeStatus(detail, 'completed')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">{t('mgmt.cycle.complete')}</button>
								) : null}
								{detail.status === 'completed' ? (
									<button type="button" onClick={() => void changeStatus(detail, 'archived')} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary">{t('mgmt.cycle.archive')}</button>
								) : null}
								{detail.status === 'archived' || detail.status === 'completed' ? (
									<button type="button" onClick={() => void changeStatus(detail, 'active')} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary">{t('mgmt.cycle.reopen')}</button>
								) : null}
								<button type="button" onClick={() => void toggleLock(detail)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary">
									{detail.lock_edit ? t('mgmt.cycle.field.lock_edit') : t('mgmt.cycle.field.lock_edit')}
								</button>
							</div>
							<div className="flex items-center gap-2">
								<button type="button" onClick={() => openEdit(detail)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
									{t('mgmt.edit')}
								</button>
								<button type="button" onClick={() => setDetailId(null)} className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
									{t('mgmt.cancel')}
								</button>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
