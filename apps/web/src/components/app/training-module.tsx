import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import { useLanguage } from '@/hooks/use-language';
import { cn } from '@/lib/utils';
import {
	type Training,
	type TrainingCategory,
	type TrainingStatus,
	TRAINING_CATEGORY_OPTIONS,
	TRAINING_STATUS_OPTIONS,
	trainingCategoryLabelKey,
	trainingStatusLabelKey,
} from '@/lib/management';

interface TrainingModuleProps {
	company: Company;
}

interface FormState {
	title: string;
	description: string;
	category: TrainingCategory | '';
	start_date: string;
	end_date: string;
	trainer: string;
	location: string;
	status: TrainingStatus;
	participants: string[];
}

const emptyForm = (): FormState => ({
	title: '',
	description: '',
	category: '',
	start_date: '',
	end_date: '',
	trainer: '',
	location: '',
	status: 'planned',
	participants: [],
});

export function TrainingModule({ company }: TrainingModuleProps) {
	const { t } = useLanguage();
	const [trainings, setTrainings] = useState<Training[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(emptyForm());
	const [saving, setSaving] = useState(false);

	const refresh = useCallback(async () => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		const [list, empList] = await Promise.all([
			pb.collection('trainings').getFullList<Training>({
				filter,
				sort: '-start_date,-created',
				expand: 'participants',
				requestKey: null,
			}),
			pb.collection('employees').getFullList<Employee>({
				filter,
				sort: 'name',
				requestKey: null,
			}),
		]);
		setTrainings(list);
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

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return trainings;
		return trainings.filter(item =>
			item.title.toLowerCase().includes(q) ||
			(item.trainer ?? '').toLowerCase().includes(q) ||
			(item.category ?? '').toLowerCase().includes(q),
		);
	}, [trainings, search]);

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyForm());
		setShowForm(true);
	};

	const openEdit = (training: Training) => {
		setEditingId(training.id);
		setForm({
			title: training.title,
			description: training.description ?? '',
			category: training.category ?? '',
			start_date: (training.start_date ?? '').slice(0, 10),
			end_date: (training.end_date ?? '').slice(0, 10),
			trainer: training.trainer ?? '',
			location: training.location ?? '',
			status: training.status,
			participants: training.participants ?? [],
		});
		setShowForm(true);
	};

	const toggleParticipant = (id: string) => {
		setForm(f => ({
			...f,
			participants: f.participants.includes(id)
				? f.participants.filter(p => p !== id)
				: [...f.participants, id],
		}));
	};

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.title.trim()) {
			toast.error(t('mgmt.title_required'));
			return;
		}
		setSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const payload = {
				company: company.id,
				title: form.title.trim(),
				description: form.description,
				category: form.category || null,
				start_date: form.start_date || null,
				end_date: form.end_date || null,
				trainer: form.trainer,
				location: form.location,
				status: form.status,
				participants: form.participants,
				owner: ownerId,
			};
			if (editingId) {
				await pb.collection('trainings').update(editingId, payload);
			} else {
				await pb.collection('trainings').create(payload);
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

	const remove = async (training: Training) => {
		if (!window.confirm(t('mgmt.delete_confirm'))) return;
		try {
			await pb.collection('trainings').delete(training.id);
			await refresh();
			toast.success(t('mgmt.deleted'));
		} catch {
			toast.error(t('mgmt.delete_failed'));
		}
	};

	const statusBadgeClass = (status: TrainingStatus) => {
		switch (status) {
			case 'completed':
				return 'bg-emerald-100 text-emerald-700';
			case 'ongoing':
				return 'bg-sky-100 text-sky-700';
			case 'cancelled':
				return 'bg-red-100 text-red-700';
			default:
				return 'bg-amber-100 text-amber-700';
		}
	};

	return (
		<div className="space-y-5">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
						{t('mgmt.training')}
					</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						{t('mgmt.training.subtitle')} · {company.name}
					</p>
				</div>
				{!showForm ? (
					<button
						type="button"
						onClick={openCreate}
						className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98]"
					>
						<Plus className="size-4" /> {t('mgmt.create')}
					</button>
				) : null}
			</header>

			{showForm ? (
				<form
					onSubmit={submit}
					className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft-sm"
				>
					<div className="flex items-center justify-between">
						<h2 className="text-base font-bold text-foreground">
							{editingId ? t('mgmt.edit') : t('mgmt.create')} · {t('mgmt.training')}
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
							<label htmlFor="train-title" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.title')} <span className="text-red-500">*</span>
							</label>
							<input
								id="train-title"
								required
								value={form.title}
								onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5 md:col-span-2">
							<label htmlFor="train-desc" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.description')}
							</label>
							<textarea
								id="train-desc"
								value={form.description}
								onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
								rows={2}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="train-category" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.category')}
							</label>
							<select
								id="train-category"
								value={form.category}
								onChange={e => setForm(f => ({ ...f, category: e.target.value as TrainingCategory | '' }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							>
								<option value="">—</option>
								{TRAINING_CATEGORY_OPTIONS.map(c => (
									<option key={c} value={c}>
										{t(trainingCategoryLabelKey(c))}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="train-status" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.status')}
							</label>
							<select
								id="train-status"
								value={form.status}
								onChange={e => setForm(f => ({ ...f, status: e.target.value as TrainingStatus }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							>
								{TRAINING_STATUS_OPTIONS.map(s => (
									<option key={s} value={s}>
										{t(trainingStatusLabelKey(s))}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="train-start" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.start_date')}
							</label>
							<input
								id="train-start"
								type="date"
								value={form.start_date}
								onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="train-end" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.end_date')}
							</label>
							<input
								id="train-end"
								type="date"
								value={form.end_date}
								onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="train-trainer" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.trainer')}
							</label>
							<input
								id="train-trainer"
								value={form.trainer}
								onChange={e => setForm(f => ({ ...f, trainer: e.target.value }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="train-location" className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.location')}
							</label>
							<input
								id="train-location"
								value={form.location}
								onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5 md:col-span-2">
							<label className="text-xs font-semibold text-muted-foreground">
								{t('mgmt.form.participants')}
							</label>
							{employees.length === 0 ? (
								<p className="text-[11px] text-muted-foreground">{t('mgmt.no_employees')}</p>
							) : (
								<div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
									{employees.map(emp => {
										const checked = form.participants.includes(emp.id);
										return (
											<button
												key={emp.id}
												type="button"
												onClick={() => toggleParticipant(emp.id)}
												className={cn(
													'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
													checked
														? 'bg-emerald-100 text-emerald-700'
														: 'bg-secondary text-muted-foreground hover:bg-secondary/70',
												)}
											>
												{emp.name}
											</button>
										);
									})}
								</div>
							)}
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
				<div className="flex items-center gap-2">
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

			{isLoading ? (
				<p className="text-sm font-semibold text-muted-foreground">{t('mgmt.loading')}</p>
			) : filtered.length === 0 ? (
				<div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
					{t('mgmt.empty_train')}
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft-sm">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[680px] text-sm">
							<thead className="border-b border-border bg-secondary/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3">{t('mgmt.col.title')}</th>
									<th className="px-4 py-3">{t('mgmt.col.category')}</th>
									<th className="px-4 py-3">{t('mgmt.col.date')}</th>
									<th className="px-4 py-3">{t('mgmt.col.trainer')}</th>
									<th className="px-4 py-3">{t('mgmt.col.status')}</th>
									<th className="px-4 py-3 text-right">{t('mgmt.col.action')}</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{filtered.map(training => (
									<tr key={training.id} className="hover:bg-secondary/40">
										<td className="px-4 py-3">
											<p className="font-medium text-foreground">{training.title}</p>
											{training.description ? (
												<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
													{training.description}
												</p>
											) : null}
										</td>
										<td className="px-4 py-3 text-muted-foreground">
											{training.category ? t(trainingCategoryLabelKey(training.category)) : '—'}
										</td>
										<td className="px-4 py-3 text-muted-foreground">
											{training.start_date || '—'}
											{training.end_date ? ` → ${training.end_date}` : ''}
										</td>
										<td className="px-4 py-3 text-muted-foreground">{training.trainer || '—'}</td>
										<td className="px-4 py-3">
											<span
												className={cn(
													'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
													statusBadgeClass(training.status),
												)}
											>
												{t(trainingStatusLabelKey(training.status))}
											</span>
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center justify-end gap-1">
												<button
													type="button"
													onClick={() => openEdit(training)}
													className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
													aria-label={t('mgmt.edit')}
												>
													<Pencil className="size-4" />
												</button>
												<button
													type="button"
													onClick={() => void remove(training)}
													className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
													aria-label={t('mgmt.delete')}
												>
													<Trash2 className="size-4" />
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
