import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Printer, Search, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import { useLanguage } from '@/hooks/use-language';
import { cn } from '@/lib/utils';
import {
	type PerformanceCriterion,
	type PerformanceReview,
	PERFORMANCE_CRITERIA,
	REVIEW_STATUS_OPTIONS,
	averageCriteriaRating,
	emptyCriteria,
	reviewStatusLabelKey,
} from '@/lib/management';
import { PerformanceCycleModule } from '@/components/app/performance-cycle-module';

interface PerformanceModuleProps {
	company: Company;
}

interface FormState {
	title: string;
	employee: string;
	period: string;
	review_date: string;
	rating: string;
	criteria: PerformanceCriterion[];
	goals: string;
	strengths: string;
	improvements: string;
	notes: string;
	status: 'draft' | 'completed';
}

const emptyForm = (): FormState => ({
	title: '',
	employee: '',
	period: '',
	review_date: new Date().toISOString().slice(0, 10),
	rating: '3',
	criteria: emptyCriteria(),
	goals: '',
	strengths: '',
	improvements: '',
	notes: '',
	status: 'draft',
});

function StarRow({
	value,
	onChange,
	disabled,
}: {
	value: number;
	onChange: (v: number) => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
			{[1, 2, 3, 4, 5].map(n => (
				<button
					key={n}
					type="button"
					role="radio"
					aria-checked={value === n}
					aria-label={`${n}`}
					disabled={disabled}
					onClick={() => onChange(n)}
					className={cn(
						'p-0.5 transition-transform active:scale-90 disabled:cursor-not-allowed',
						n <= value ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-300',
					)}
				>
					<Star className={cn('size-5', n <= value && 'fill-amber-400')} strokeWidth={2} />
				</button>
			))}
		</div>
	);
}

function Stars({ value }: { value: number }) {
	return (
		<span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
			{[1, 2, 3, 4, 5].map(n => (
				<Star
					key={n}
					className={cn('size-3.5', n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')}
					strokeWidth={2}
				/>
			))}
		</span>
	);
}

export function PerformanceModule({ company }: PerformanceModuleProps) {
	const { t } = useLanguage();
	const [reviews, setReviews] = useState<PerformanceReview[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [periodFilter, setPeriodFilter] = useState('all');
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [detailId, setDetailId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(emptyForm());
	const [saving, setSaving] = useState(false);
	const [tab, setTab] = useState<'reviews' | 'cycles'>('reviews');

	const refresh = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const [list, empList] = await Promise.all([
			pb.collection('performance_reviews').getFullList<PerformanceReview>({
				filter,
				sort: '-review_date,-created',
				expand: 'employee',
				requestKey: null,
			}),
			pb.collection('employees').getFullList<Employee>({
				filter,
				sort: 'name',
				requestKey: null,
			}),
		]);
		setReviews(list);
		setEmployees(empList);
	}, [company.id]);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		refresh()
			.catch(() => {
				if (!cancelled) toast.error(t('mgmt.save_failed'));
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [refresh, t]);

	const employeeName = useCallback(
		(id: string) => employees.find(e => e.id === id)?.name ?? '',
		[employees],
	);
	const employeeById = useCallback(
		(id: string) => employees.find(e => e.id === id),
		[employees],
	);

	const periods = useMemo(() => {
		const set = new Set<string>();
		for (const r of reviews) {
			if (r.period) set.add(r.period);
		}
		return Array.from(set).sort((a, b) => b.localeCompare(a));
	}, [reviews]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return reviews.filter(r => {
			if (periodFilter !== 'all') {
				if (periodFilter === 'none' && r.period) return false;
				if (periodFilter !== 'none' && r.period !== periodFilter) return false;
			}
			if (!q) return true;
			const name = r.expand?.employee?.name ?? employeeName(r.employee) ?? '';
			return (
				r.title.toLowerCase().includes(q) ||
				(r.period ?? '').toLowerCase().includes(q) ||
				name.toLowerCase().includes(q)
			);
		});
	}, [reviews, search, periodFilter, employeeName]);

	const stats = useMemo(() => {
		const total = reviews.length;
		const completed = reviews.filter(r => r.status === 'completed').length;
		const avg = averageCriteriaRating(
			reviews.flatMap(r => r.criteria ?? []),
		);
		return { total, completed, avg };
	}, [reviews]);

	const detail = detailId ? reviews.find(r => r.id === detailId) ?? null : null;

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyForm());
		setShowForm(true);
	};

	const openEdit = (review: PerformanceReview) => {
		setEditingId(review.id);
		setForm({
			title: review.title,
			employee: review.employee,
			period: review.period ?? '',
			review_date: (review.review_date || '').slice(0, 10),
			rating: review.rating,
			criteria: review.criteria?.length ? review.criteria : emptyCriteria(),
			goals: review.goals ?? '',
			strengths: review.strengths ?? '',
			improvements: review.improvements ?? '',
			notes: review.notes ?? '',
			status: review.status,
		});
		setShowForm(true);
		setDetailId(null);
	};

	const setCriterion = (key: string, rating: number) => {
		setForm(f => ({
			...f,
			criteria: f.criteria.map(c => (c.key === key ? { ...c, rating } : c)),
			rating: String(averageCriteriaRating(
				f.criteria.map(c => (c.key === key ? { ...c, rating } : c)),
			) ?? f.rating),
		}));
	};

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.title.trim()) {
			toast.error(t('mgmt.title_required'));
			return;
		}
		if (!form.employee) {
			toast.error(t('mgmt.employee_required'));
			return;
		}
		setSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const payload = {
				company: company.id,
				employee: form.employee,
				title: form.title.trim(),
				period: form.period.trim() || null,
				review_date: form.review_date,
				rating: form.rating,
				criteria: form.criteria,
				goals: form.goals,
				strengths: form.strengths,
				improvements: form.improvements,
				notes: form.notes,
				status: form.status,
				owner: ownerId,
			};
			if (editingId) {
				await pb.collection('performance_reviews').update(editingId, payload);
			} else {
				await pb.collection('performance_reviews').create(payload);
			}
			setShowForm(false);
			setEditingId(null);
			await refresh();
			toast.success(t('mgmt.saved'));
		} catch {
			toast.error(t('mgmt.save_failed'));
		} finally {
			setSaving(false);
		}
	};

	const remove = async (review: PerformanceReview) => {
		if (!window.confirm(t('mgmt.delete_confirm'))) return;
		try {
			await pb.collection('performance_reviews').delete(review.id);
			if (detailId === review.id) setDetailId(null);
			await refresh();
			toast.success(t('mgmt.deleted'));
		} catch {
			toast.error(t('mgmt.delete_failed'));
		}
	};

	const ratingColor = (rating: number) => {
		if (rating >= 4) return 'text-emerald-600';
		if (rating >= 3) return 'text-amber-600';
		return 'text-red-600';
	};

	return (
		<div className="space-y-5">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
						{t('mgmt.performance')}
					</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						{t('mgmt.performance.subtitle')} · {company.name}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-soft-sm">
						<button
							type="button"
							onClick={() => setTab('reviews')}
							className={cn(
								'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
								tab === 'reviews' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground',
							)}
						>
							{t('mgmt.cycle.tab_reviews')}
						</button>
						<button
							type="button"
							onClick={() => setTab('cycles')}
							className={cn(
								'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
								tab === 'cycles' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground',
							)}
						>
							{t('mgmt.cycle.tab_cycles')}
						</button>
					</div>
					{tab === 'reviews' && !showForm ? (
						<button
							type="button"
							onClick={openCreate}
							className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98]"
						>
							<Plus className="size-4" /> {t('mgmt.perf.create')}
						</button>
					) : null}
				</div>
			</header>

			{tab === 'cycles' ? (
				<PerformanceCycleModule company={company} />
			) : (
				<>

			{/* Ringkasan */}
			{!showForm && !isLoading ? (
				<div className="grid grid-cols-3 gap-3">
					<div className="rounded-xl border border-border bg-card p-4 shadow-soft-sm">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t('mgmt.perf.total')}
						</p>
						<p className="mt-1 text-2xl font-bold text-foreground">{stats.total}</p>
					</div>
					<div className="rounded-xl border border-border bg-card p-4 shadow-soft-sm">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t('mgmt.perf.completed')}
						</p>
						<p className="mt-1 text-2xl font-bold text-emerald-600">{stats.completed}</p>
					</div>
					<div className="rounded-xl border border-border bg-card p-4 shadow-soft-sm">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t('mgmt.perf.avg')}
						</p>
						<p className={cn('mt-1 text-2xl font-bold', ratingColor(stats.avg ?? 0))}>
							{stats.avg !== null ? stats.avg.toFixed(1) : '—'}
						</p>
					</div>
				</div>
			) : null}

			{showForm ? (
				<form
					onSubmit={submit}
					className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft-sm"
				>
					<div className="flex items-center justify-between">
						<h2 className="text-base font-bold text-foreground">
							{editingId ? t('mgmt.edit') : t('mgmt.perf.create')}
						</h2>
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
							}}
							className="text-muted-foreground hover:text-foreground"
							aria-label={t('mgmt.cancel')}
						>
							<X className="size-4" />
						</button>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-1.5 md:col-span-2">
							<label htmlFor="perf-title" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.title')} <span className="text-red-500">*</span>
							</label>
							<input
								id="perf-title"
								required
								value={form.title}
								onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
								placeholder={t('mgmt.form.title')}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="perf-employee" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.employee')} <span className="text-red-500">*</span>
							</label>
							<select
								id="perf-employee"
								value={form.employee}
								onChange={e => setForm(f => ({ ...f, employee: e.target.value }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							>
								<option value="">{t('mgmt.form.employee')}</option>
								{employees.map(emp => (
									<option key={emp.id} value={emp.id}>
										{emp.name}
										{emp.position ? ` — ${emp.position}` : ''}
									</option>
								))}
							</select>
							{employees.length === 0 ? (
								<p className="text-[11px] text-muted-foreground">{t('mgmt.no_employees')}</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<label htmlFor="perf-period" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.period')}
							</label>
							<input
								id="perf-period"
								value={form.period}
								onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
								placeholder="Q1 2026"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="perf-date" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.review_date')}
							</label>
							<input
								id="perf-date"
								type="date"
								value={form.review_date}
								onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="perf-status" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.status')}
							</label>
							<select
								id="perf-status"
								value={form.status}
								onChange={e => setForm(f => ({ ...f, status: e.target.value as 'draft' | 'completed' }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							>
								{REVIEW_STATUS_OPTIONS.map(s => (
									<option key={s} value={s}>
										{t(reviewStatusLabelKey(s))}
									</option>
								))}
							</select>
						</div>
					</div>

					{/* Penilaian multi-kriteria */}
					<div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-4">
						<div>
							<h3 className="text-sm font-bold text-foreground">{t('mgmt.perf.criteria')}</h3>
							<p className="mt-0.5 text-xs text-muted-foreground">{t('mgmt.perf.criteria_hint')}</p>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							{PERFORMANCE_CRITERIA.map(crit => {
								const item = form.criteria.find(c => c.key === crit.key);
								const val = item?.rating ?? 3;
								return (
									<div key={crit.key} className="space-y-1.5">
										<div className="flex items-center justify-between gap-2">
											<span className="text-xs font-semibold text-foreground">{t(crit.labelKey)}</span>
											<span className={cn('text-xs font-bold', ratingColor(val))}>{val}/5</span>
										</div>
										<StarRow value={val} onChange={v => setCriterion(crit.key, v)} />
									</div>
								);
							})}
						</div>
						<div className="flex items-center justify-between border-t border-border pt-3">
							<span className="text-sm font-bold text-foreground">{t('mgmt.perf.overall')}</span>
							<div className="flex items-center gap-2">
								<StarRow
									value={Number(form.rating) || 0}
									onChange={v => setForm(f => ({ ...f, rating: String(v) }))}
								/>
								<span className={cn('text-sm font-bold', ratingColor(Number(form.rating) || 0))}>
									{Number(form.rating).toFixed(1)}
								</span>
							</div>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-1.5">
							<label htmlFor="perf-goals" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.goals')}
							</label>
							<textarea
								id="perf-goals"
								value={form.goals}
								onChange={e => setForm(f => ({ ...f, goals: e.target.value }))}
								rows={2}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="perf-strengths" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.strengths')}
							</label>
							<textarea
								id="perf-strengths"
								value={form.strengths}
								onChange={e => setForm(f => ({ ...f, strengths: e.target.value }))}
								rows={2}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="perf-improvements" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.improvements')}
							</label>
							<textarea
								id="perf-improvements"
								value={form.improvements}
								onChange={e => setForm(f => ({ ...f, improvements: e.target.value }))}
								rows={2}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="perf-notes" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.notes')}
							</label>
							<textarea
								id="perf-notes"
								value={form.notes}
								onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
								rows={2}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="submit"
							disabled={saving}
							className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
						>
							{saving ? t('common.loading') : t('mgmt.save')}
						</button>
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
							}}
							className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
						>
							{t('mgmt.cancel')}
						</button>
					</div>
				</form>
			) : null}

			{!showForm ? (
				<div className="flex flex-wrap items-center gap-2">
					<select
						value={periodFilter}
						onChange={e => setPeriodFilter(e.target.value)}
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none ring-primary/20 focus:ring-2"
						aria-label={t('mgmt.col.period')}
					>
						<option value="all">{t('mgmt.perf.all_periods')}</option>
						{periods.map(p => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
						<option value="none">{t('mgmt.perf.no_period')}</option>
					</select>
					<div className="relative ml-auto">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<input
							value={search}
							onChange={e => setSearch(e.target.value)}
							placeholder={t('mgmt.search')}
							className="w-40 rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm outline-none ring-primary/20 focus:ring-2 md:w-56"
						/>
					</div>
				</div>
			) : null}

			{!showForm && !isLoading ? (
				filtered.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
						{t('mgmt.empty_perf')}
					</div>
				) : (
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{filtered.map(review => {
							const name = review.expand?.employee?.name ?? employeeName(review.employee) ?? '—';
							const emp = employeeById(review.employee);
							const avg = averageCriteriaRating(review.criteria);
							const overall = avg ?? Number(review.rating);
							return (
								<div
									key={review.id}
									className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-soft-sm transition-shadow hover:shadow-soft"
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate text-sm font-bold text-foreground">{review.title}</p>
											<p className="mt-0.5 truncate text-xs text-muted-foreground">
												{name}
												{emp?.position ? ` · ${emp.position}` : ''}
											</p>
										</div>
										<span
											className={cn(
												'inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
												review.status === 'completed'
													? 'bg-emerald-100 text-emerald-700'
													: 'bg-amber-100 text-amber-700',
											)}
										>
											{t(reviewStatusLabelKey(review.status))}
										</span>
									</div>

									<div className="mt-3 flex items-center justify-between">
										<div className="flex items-center gap-2">
											<Stars value={overall} />
											<span className={cn('text-sm font-bold', ratingColor(overall))}>
												{overall.toFixed(1)}
											</span>
										</div>
										<span className="text-[11px] text-muted-foreground">
											{review.period || t('mgmt.perf.no_period')}
										</span>
									</div>

									{review.criteria && review.criteria.length > 0 ? (
										<div className="mt-3 grid grid-cols-4 gap-1.5">
											{review.criteria.map(c => (
												<div
													key={c.key}
													className="rounded-md bg-secondary/60 px-1.5 py-1 text-center"
													title={t(PERFORMANCE_CRITERIA.find(p => p.key === c.key)?.labelKey ?? c.key)}
												>
													<p className="text-[9px] font-semibold uppercase text-muted-foreground">
														{t(PERFORMANCE_CRITERIA.find(p => p.key === c.key)?.labelKey ?? c.key).slice(0, 3)}
													</p>
													<p className={cn('text-xs font-bold', ratingColor(c.rating))}>{c.rating}</p>
												</div>
											))}
										</div>
									) : null}

									<p className="mt-3 text-[11px] text-muted-foreground">
										{t('mgmt.form.review_date')}: {review.review_date || '—'}
									</p>

									<div className="mt-auto flex items-center justify-end gap-1 border-t border-border pt-3">
										<button
											type="button"
											onClick={() => setDetailId(review.id)}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
											aria-label={t('mgmt.perf.view_detail')}
											title={t('mgmt.perf.view_detail')}
										>
											<Eye className="size-4" />
										</button>
										<button
											type="button"
											onClick={() => openEdit(review)}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
											aria-label={t('mgmt.edit')}
										>
											<Pencil className="size-4" />
										</button>
										<button
											type="button"
											onClick={() => void remove(review)}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
											aria-label={t('mgmt.delete')}
										>
											<Trash2 className="size-4" />
										</button>
									</div>
								</div>
							);
						})}
					</div>
				)
			) : null}

			{isLoading ? (
				<p className="text-sm font-semibold text-muted-foreground">{t('mgmt.loading')}</p>
			) : null}

			{/* Detail penilaian */}
			{detail ? (
				<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
					<div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-soft sm:rounded-2xl">
						<div className="flex items-start justify-between gap-3 border-b border-border p-5">
							<div className="min-w-0">
								<h2 className="text-base font-bold text-foreground">{t('mgmt.perf.detail')}</h2>
								<p className="mt-0.5 truncate text-sm text-muted-foreground">
									{t('mgmt.perf.employee_review', {
										name: detail.expand?.employee?.name ?? employeeName(detail.employee) ?? '—',
									})}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setDetailId(null)}
								className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
								aria-label={t('mgmt.perf.close_detail')}
							>
								<X className="size-4" />
							</button>
						</div>

						<div className="flex-1 space-y-4 overflow-y-auto p-5">
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-4">
								<div>
									<p className="text-xs font-semibold uppercase text-muted-foreground">
										{t('mgmt.perf.overall')}
									</p>
									<div className="mt-1 flex items-center gap-2">
										<Stars value={averageCriteriaRating(detail.criteria) ?? Number(detail.rating)} />
										<span
											className={cn(
												'text-xl font-bold',
												ratingColor(averageCriteriaRating(detail.criteria) ?? Number(detail.rating)),
											)}
										>
											{(averageCriteriaRating(detail.criteria) ?? Number(detail.rating)).toFixed(1)}
										</span>
									</div>
								</div>
								<div className="text-right text-xs text-muted-foreground">
									<p>{t('mgmt.form.review_date')}: {detail.review_date || '—'}</p>
									<p>{t('mgmt.col.period')}: {detail.period || t('mgmt.perf.no_period')}</p>
									<p>
										{t('mgmt.col.status')}:{' '}
										<span
											className={cn(
												'font-semibold',
												detail.status === 'completed' ? 'text-emerald-600' : 'text-amber-600',
											)}
										>
											{t(reviewStatusLabelKey(detail.status))}
										</span>
									</p>
								</div>
							</div>

							<div>
								<h3 className="mb-2 text-sm font-bold text-foreground">{t('mgmt.perf.criteria')}</h3>
								{detail.criteria && detail.criteria.length > 0 ? (
									<div className="space-y-2">
										{detail.criteria.map(c => {
											const labelKey = PERFORMANCE_CRITERIA.find(p => p.key === c.key)?.labelKey ?? c.key;
											return (
												<div
													key={c.key}
													className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
												>
													<span className="text-sm font-medium text-foreground">{t(labelKey)}</span>
													<div className="flex items-center gap-2">
														<Stars value={c.rating} />
														<span className={cn('text-sm font-bold', ratingColor(c.rating))}>
															{c.rating}/5
														</span>
													</div>
												</div>
											);
										})}
									</div>
								) : (
									<p className="text-sm text-muted-foreground">{t('mgmt.perf.no_criteria')}</p>
								)}
							</div>

							{detail.goals ? (
								<div>
									<h3 className="mb-1 text-sm font-bold text-foreground">{t('mgmt.form.goals')}</h3>
									<p className="whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 text-sm text-foreground">
										{detail.goals}
									</p>
								</div>
							) : null}
							{detail.strengths ? (
								<div>
									<h3 className="mb-1 text-sm font-bold text-foreground">{t('mgmt.form.strengths')}</h3>
									<p className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm text-foreground">
										{detail.strengths}
									</p>
								</div>
							) : null}
							{detail.improvements ? (
								<div>
									<h3 className="mb-1 text-sm font-bold text-foreground">{t('mgmt.form.improvements')}</h3>
									<p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-foreground">
										{detail.improvements}
									</p>
								</div>
							) : null}
							{detail.notes ? (
								<div>
									<h3 className="mb-1 text-sm font-bold text-foreground">{t('mgmt.form.notes')}</h3>
									<p className="whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 text-sm text-foreground">
										{detail.notes}
									</p>
								</div>
							) : null}
						</div>

						<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4">
							<button
								type="button"
								onClick={() => window.print()}
								className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
							>
								<Printer className="size-4" /> {t('mgmt.perf.print')}
							</button>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => openEdit(detail)}
									className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
								>
									<Pencil className="size-4" /> {t('mgmt.edit')}
								</button>
								<button
									type="button"
									onClick={() => setDetailId(null)}
									className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
								>
									{t('mgmt.perf.close_detail')}
								</button>
							</div>
						</div>
					</div>
				</div>
			) : null}
			</>
		)}
		</div>
	);
}
