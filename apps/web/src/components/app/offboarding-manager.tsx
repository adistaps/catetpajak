import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
	ArrowLeft,
	CheckCircle2,
	ChevronRight,
	Pencil,
	Plus,
	Trash2,
	X,
	XCircle,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, todayIso, type Company } from '@/lib/accounting';
import type { Employee } from '@/lib/payroll';
import { useLanguage } from '@/hooks/use-language';
import { cn } from '@/lib/utils';

export type OffboardingStatus = 'in_progress' | 'completed' | 'cancelled';

export interface OffboardingRecord {
	id: string;
	company: string;
	employee: string;
	resignation_date: string;
	last_working_day: string;
	reason: string;
	exit_interview: boolean;
	handover: boolean;
	asset_return: boolean;
	documents_signed: boolean;
	final_pay_settled: boolean;
	access_revoked: boolean;
	clearance_completed: boolean;
	notes: string;
	status: OffboardingStatus;
	completed_date: string;
	owner: string;
	created: string;
	updated: string;
	expand?: { employee?: Employee };
}

const STEP_KEYS = [
	'exit_interview',
	'handover',
	'asset_return',
	'documents_signed',
	'final_pay_settled',
	'access_revoked',
	'clearance_completed',
] as const;

type StepKey = (typeof STEP_KEYS)[number];

interface OffboardingManagerProps {
	company: Company;
	employees: Employee[];
}

const emptyForm = () => ({
	employee: '',
	resignation_date: todayIso(),
	last_working_day: '',
	reason: '',
	notes: '',
	exit_interview: false,
	handover: false,
	asset_return: false,
	documents_signed: false,
	final_pay_settled: false,
	access_revoked: false,
	clearance_completed: false,
});

export function OffboardingManager({ company, employees }: OffboardingManagerProps) {
	const { t } = useLanguage();
	const [records, setRecords] = useState<OffboardingRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [detailId, setDetailId] = useState<string | null>(null);
	const [form, setForm] = useState(emptyForm());
	const [saving, setSaving] = useState(false);

	const ownerId = pb.authStore.record?.id ?? '';

	const refresh = useCallback(async () => {
		setLoading(true);
		setLoadError(false);
		try {
			const filter = pb.filter('company = {:company}', { company: company.id });
			const list = await pb.collection('employee_offboardings').getFullList<OffboardingRecord>({
				filter,
				sort: '-created',
				expand: 'employee',
				requestKey: null,
			});
			setRecords(list);
		} catch (error) {
			if ((error as { status?: number })?.status !== 0) {
				setLoadError(true);
			}
		} finally {
			setLoading(false);
		}
	}, [company.id]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const activeEmployees = useMemo(
		() => employees.filter(emp => emp.status === 'aktif'),
		[employees],
	);

	const employeesWithActiveOffboarding = useMemo(() => {
		const ids = new Set<string>();
		for (const rec of records) {
			if (!rec.status || rec.status === 'in_progress') ids.add(rec.employee);
		}
		return ids;
	}, [records]);

	const employeeName = useCallback(
		(id: string) => {
			const emp = employees.find(e => e.id === id);
			return emp?.name ?? recEmployeeName(id);
		},
		[employees],
	);

	const recEmployeeName = (id: string) => {
		const rec = records.find(r => r.employee === id);
		return rec?.expand?.employee?.name ?? '—';
	};

	const stepCount = (rec: OffboardingRecord): { done: number; total: number } => ({
		done: STEP_KEYS.filter(key => rec[key]).length,
		total: STEP_KEYS.length,
	});

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyForm());
		setShowForm(true);
	};

	const openEdit = (rec: OffboardingRecord) => {
		setEditingId(rec.id);
		setForm({
			employee: rec.employee,
			resignation_date: (rec.resignation_date || todayIso()).slice(0, 10),
			last_working_day: (rec.last_working_day || '').slice(0, 10),
			reason: rec.reason ?? '',
			notes: rec.notes ?? '',
			exit_interview: Boolean(rec.exit_interview),
			handover: Boolean(rec.handover),
			asset_return: Boolean(rec.asset_return),
			documents_signed: Boolean(rec.documents_signed),
			final_pay_settled: Boolean(rec.final_pay_settled),
			access_revoked: Boolean(rec.access_revoked),
			clearance_completed: Boolean(rec.clearance_completed),
		});
		setShowForm(true);
	};

	const closeForm = () => {
		setShowForm(false);
		setEditingId(null);
	};

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!form.employee) {
			toast.error(t('offboarding.no_employee_selected'));
			return;
		}
		if (!form.resignation_date) {
			toast.error(t('offboarding.resignation_required'));
			return;
		}
		if (
			!editingId &&
			employeesWithActiveOffboarding.has(form.employee)
		) {
			toast.error(t('offboarding.already_offboarded'));
			return;
		}
		setSaving(true);
		try {
			const payload = {
				company: company.id,
				employee: form.employee,
				resignation_date: form.resignation_date,
				last_working_day: form.last_working_day || '',
				reason: form.reason,
				notes: form.notes,
				exit_interview: form.exit_interview,
				handover: form.handover,
				asset_return: form.asset_return,
				documents_signed: form.documents_signed,
				final_pay_settled: form.final_pay_settled,
				access_revoked: form.access_revoked,
				clearance_completed: form.clearance_completed,
				status: 'in_progress' as OffboardingStatus,
				owner: ownerId,
			};
			if (editingId) {
				await pb.collection('employee_offboardings').update(editingId, payload, {
					requestKey: `update-offboarding-${editingId}`,
				});
				toast.success(t('offboarding.updated'));
			} else {
				await pb.collection('employee_offboardings').create(payload, {
					requestKey: `create-offboarding-${form.employee}`,
				});
				toast.success(t('offboarding.saved'));
			}
			closeForm();
			await refresh();
		} catch {
			toast.error(editingId ? t('offboarding.update_failed') : t('offboarding.save_failed'));
		} finally {
			setSaving(false);
		}
	};

	const toggleStep = async (rec: OffboardingRecord, key: StepKey) => {
		if (rec.status && rec.status !== 'in_progress') return;
		const next = !rec[key];
		try {
			await pb.collection('employee_offboardings').update(
				rec.id,
				{ [key]: next },
				{ requestKey: `toggle-step-${rec.id}-${key}` },
			);
			setRecords(prev =>
				prev.map(r => (r.id === rec.id ? { ...r, [key]: next } : r)),
			);
		} catch {
			toast.error(t('offboarding.update_failed'));
		}
	};

	const markCompleted = async (rec: OffboardingRecord) => {
		if (!window.confirm(t('offboarding.mark_completed_confirm'))) return;
		try {
			await pb.collection('employee_offboardings').update(
				rec.id,
				{ status: 'completed', completed_date: todayIso() },
				{ requestKey: `complete-offboarding-${rec.id}` },
			);
			setRecords(prev =>
				prev.map(r =>
					r.id === rec.id
						? { ...r, status: 'completed', completed_date: todayIso() }
						: r,
				),
			);
			toast.success(t('offboarding.completed'));
		} catch {
			toast.error(t('offboarding.update_failed'));
		}
	};

	const cancelProcess = async (rec: OffboardingRecord) => {
		if (!window.confirm(t('offboarding.cancel_confirm'))) return;
		try {
			await pb.collection('employee_offboardings').update(
				rec.id,
				{ status: 'cancelled' },
				{ requestKey: `cancel-offboarding-${rec.id}` },
			);
			setRecords(prev =>
				prev.map(r => (r.id === rec.id ? { ...r, status: 'cancelled' } : r)),
			);
			toast.success(t('offboarding.cancelled'));
		} catch {
			toast.error(t('offboarding.update_failed'));
		}
	};

	const deleteRecord = async (rec: OffboardingRecord) => {
		if (!window.confirm(t('offboarding.delete_confirm'))) return;
		try {
			await pb.collection('employee_offboardings').delete(rec.id, {
				requestKey: `delete-offboarding-${rec.id}`,
			});
			setRecords(prev => prev.filter(r => r.id !== rec.id));
			if (detailId === rec.id) setDetailId(null);
			toast.success(t('offboarding.deleted'));
		} catch {
			toast.error(t('offboarding.delete_failed'));
		}
	};

	const statusBadge = (status: OffboardingStatus | '') => {
		const effective = status || 'in_progress';
		const map: Record<OffboardingStatus, string> = {
			in_progress: 'bg-amber-100 text-amber-700',
			completed: 'bg-emerald-100 text-emerald-700',
			cancelled: 'bg-slate-200 text-slate-600',
		};
		return (
			<span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', map[effective])}>
				{t(`offboarding.status.${effective}`)}
			</span>
		);
	};

	const detail = detailId ? records.find(r => r.id === detailId) : null;

	if (detail) {
		const progress = stepCount(detail);
		const detailStatus: OffboardingStatus = detail.status || 'in_progress';
		return (
			<div className="px-5 py-8">
				<div className="mx-auto max-w-2xl space-y-5">
					<button
						type="button"
						onClick={() => setDetailId(null)}
						className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
					>
						<ArrowLeft className="size-3.5" /> {t('offboarding.back')}
					</button>
					<div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 className="text-lg font-bold text-slate-900">{employeeName(detail.employee)}</h2>
								<p className="mt-1 text-sm text-slate-500">
									{t('offboarding.resignation_date')}: {formatDate(detail.resignation_date)}
									{detail.last_working_day ? ` · ${t('offboarding.last_working_day')}: ${formatDate(detail.last_working_day)}` : ''}
								</p>
							</div>
							{statusBadge(detail.status)}
						</div>

						{detail.reason ? (
							<p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
								{detail.reason}
							</p>
						) : null}

						<div className="mt-5">
							<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
								{t('offboarding.steps')} ({t('offboarding.progress', { done: progress.done, total: progress.total })})
							</p>
							<ul className="space-y-2">
								{STEP_KEYS.map(key => {
									const done = Boolean(detail[key]);
									return (
										<li key={key}>
											<label
												className={cn(
													'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
													done
														? 'border-emerald-200 bg-emerald-50'
														: 'border-slate-200 bg-white hover:bg-slate-50',
													detailStatus !== 'in_progress' && 'cursor-default opacity-80',
												)}
											>
												<input
													type="checkbox"
													checked={done}
													disabled={detailStatus !== 'in_progress'}
													onChange={() => void toggleStep(detail, key)}
													className="size-4 rounded border-slate-300 accent-emerald-600"
												/>
												<span className={cn('flex-1', done && 'text-slate-400 line-through')}>
													{t(`offboarding.step.${key}`)}
												</span>
												{done ? (
													<CheckCircle2 className="size-4 text-emerald-600" />
												) : null}
											</label>
										</li>
									);
								})}
							</ul>
						</div>

						{detail.notes ? (
							<div className="mt-4">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('offboarding.notes')}</p>
								<p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{detail.notes}</p>
							</div>
						) : null}

						{detail.status === 'completed' && detail.completed_date ? (
							<p className="mt-4 text-xs text-slate-500">
								{t('offboarding.completed_date')}: {formatDate(detail.completed_date)}
							</p>
						) : null}

						<div className="mt-5 flex flex-wrap gap-2">
							{detailStatus === 'in_progress' ? (
								<>
									<button
										type="button"
										onClick={() => openEdit(detail)}
										className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
									>
										<Pencil className="size-3.5" /> {t('offboarding.edit')}
									</button>
									<button
										type="button"
										onClick={() => void markCompleted(detail)}
										className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
									>
										<CheckCircle2 className="size-3.5" /> {t('offboarding.mark_completed')}
									</button>
									<button
										type="button"
										onClick={() => void cancelProcess(detail)}
										className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
									>
										<XCircle className="size-3.5" /> {t('offboarding.cancel_process')}
									</button>
								</>
							) : null}
							<button
								type="button"
								onClick={() => void deleteRecord(detail)}
								className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
							>
								<Trash2 className="size-3.5" /> {t('offboarding.delete')}
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (showForm) {
		return (
			<div className="px-5 py-8">
				<form
					onSubmit={submit}
					className="mx-auto max-w-2xl space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
				>
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-bold text-slate-900">
							{editingId ? t('offboarding.edit') : t('offboarding.new')}
						</h2>
						<button
							type="button"
							onClick={closeForm}
							className="text-slate-400 hover:text-slate-700"
							aria-label={t('offboarding.cancel')}
						>
							<X className="size-4" />
						</button>
					</div>

					<div className="space-y-1.5">
						<label htmlFor="off-employee" className="text-xs font-semibold text-slate-600">
							{t('offboarding.employee')} <span className="text-red-500">*</span>
						</label>
						<select
							id="off-employee"
							value={form.employee}
							onChange={e => setForm(f => ({ ...f, employee: e.target.value }))}
							disabled={Boolean(editingId)}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2 disabled:bg-slate-50"
						>
							<option value="">{t('offboarding.pick_employee')}</option>
							{activeEmployees.map(emp => (
								<option key={emp.id} value={emp.id}>
									{emp.name}
									{emp.position ? ` — ${emp.position}` : ''}
								</option>
							))}
						</select>
						{!editingId && activeEmployees.length === 0 ? (
							<p className="text-[11px] text-slate-400">{t('offboarding.no_active')}</p>
						) : null}
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<label htmlFor="off-resign" className="text-xs font-semibold text-slate-600">
								{t('offboarding.resignation_date')} <span className="text-red-500">*</span>
							</label>
							<input
								id="off-resign"
								type="date"
								required
								value={form.resignation_date}
								onChange={e => setForm(f => ({ ...f, resignation_date: e.target.value }))}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="off-last" className="text-xs font-semibold text-slate-600">
								{t('offboarding.last_working_day')}
							</label>
							<input
								id="off-last"
								type="date"
								value={form.last_working_day}
								onChange={e => setForm(f => ({ ...f, last_working_day: e.target.value }))}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label htmlFor="off-reason" className="text-xs font-semibold text-slate-600">
							{t('offboarding.reason')}
						</label>
						<input
							id="off-reason"
							value={form.reason}
							onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
							placeholder={t('offboarding.reason_placeholder')}
							className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
						/>
					</div>

					<div>
						<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
							{t('offboarding.steps')}
						</p>
						<div className="grid gap-2 sm:grid-cols-2">
							{STEP_KEYS.map(key => (
								<label
									key={key}
									className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
								>
									<input
										type="checkbox"
										checked={Boolean(form[key])}
										onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
										className="size-4 rounded border-slate-300 accent-emerald-600"
									/>
									{t(`offboarding.step.${key}`)}
								</label>
							))}
						</div>
					</div>

					<div className="space-y-1.5">
						<label htmlFor="off-notes" className="text-xs font-semibold text-slate-600">
							{t('offboarding.notes')}
						</label>
						<textarea
							id="off-notes"
							value={form.notes}
							onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
							placeholder={t('offboarding.notes_placeholder')}
							rows={3}
							className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
						/>
					</div>

					<p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
						{t('offboarding.note')}
					</p>

					<div className="flex flex-wrap gap-2">
						<button
							type="submit"
							disabled={saving}
							className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
						>
							{saving ? t('offboarding.saving') : t('offboarding.save')}
						</button>
						<button
							type="button"
							onClick={closeForm}
							className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
						>
							{t('offboarding.cancel')}
						</button>
					</div>
				</form>
			</div>
		);
	}

	return (
		<div className="space-y-4 px-4 pb-6 md:px-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
						{t('offboarding.title')}
					</h2>
					<p className="mt-1 max-w-xl text-sm text-slate-500">{t('offboarding.subtitle')}</p>
				</div>
				<button
					type="button"
					onClick={openCreate}
					className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98]"
				>
					<Plus className="size-4" /> {t('offboarding.start')}
				</button>
			</div>

			{loading ? (
				<div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
					{t('offboarding.loading')}
				</div>
			) : loadError ? (
				<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					{t('offboarding.load_failed')}
				</div>
			) : records.length === 0 ? (
				<div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
					{t('offboarding.empty')}
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[760px] text-left text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
									<th className="px-4 py-3">{t('offboarding.col.employee')}</th>
									<th className="px-4 py-3">{t('offboarding.col.resignation_date')}</th>
									<th className="px-4 py-3">{t('offboarding.col.last_working_day')}</th>
									<th className="px-4 py-3">{t('offboarding.col.progress')}</th>
									<th className="px-4 py-3">{t('offboarding.col.status')}</th>
									<th className="px-4 py-3">{t('offboarding.col.completed_date')}</th>
									<th className="px-4 py-3 text-right">{t('offboarding.col.action')}</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{records.map(rec => {
									const progress = stepCount(rec);
									return (
										<tr key={rec.id} className="hover:bg-slate-50/80">
											<td className="px-4 py-3 font-semibold text-slate-900">
												{employeeName(rec.employee)}
											</td>
											<td className="px-4 py-3 text-slate-600">{formatDate(rec.resignation_date)}</td>
											<td className="px-4 py-3 text-slate-600">
												{rec.last_working_day ? formatDate(rec.last_working_day) : '—'}
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center gap-2">
													<div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
														<div
															className="h-full rounded-full bg-emerald-500"
															style={{ width: `${(progress.done / progress.total) * 100}%` }}
														/>
													</div>
													<span className="text-xs tabular-nums text-slate-500">
														{t('offboarding.progress', { done: progress.done, total: progress.total })}
													</span>
												</div>
											</td>
											<td className="px-4 py-3">{statusBadge(rec.status)}</td>
											<td className="px-4 py-3 text-slate-600">
												{rec.completed_date ? formatDate(rec.completed_date) : '—'}
											</td>
											<td className="px-4 py-3">
												<div className="flex justify-end gap-1">
													<button
														type="button"
														onClick={() => setDetailId(rec.id)}
														aria-label={t('offboarding.view_detail')}
														title={t('offboarding.view_detail')}
														className="rounded-md border border-slate-200 p-1.5 text-emerald-600 hover:bg-emerald-50"
													>
														<ChevronRight className="size-3.5" />
													</button>
													{!rec.status || rec.status === 'in_progress' ? (
														<button
															type="button"
															onClick={() => openEdit(rec)}
															aria-label={t('offboarding.edit')}
															title={t('offboarding.edit')}
															className="rounded-md border border-slate-200 p-1.5 text-indigo-600 hover:bg-indigo-50"
														>
															<Pencil className="size-3.5" />
														</button>
													) : null}
													<button
														type="button"
														onClick={() => void deleteRecord(rec)}
														aria-label={t('offboarding.delete')}
														title={t('offboarding.delete')}
														className="rounded-md border border-slate-200 p-1.5 text-red-600 hover:bg-red-50"
													>
														<Trash2 className="size-3.5" />
													</button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
