import { useCallback, useEffect, useState } from 'react';
import {
	BadgeCheck,
	Ban,
	Building2,
	CalendarClock,
	CircleDollarSign,
	FileText,
	Loader2,
	NotebookPen,
	ShieldCheck,
	Trash2,
	Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PLAN_OPTIONS, planLabel } from '@/data/plan-options';
import { ROLE_DEFINITIONS } from '@/data/user-roles';
import { formatDate } from '@/lib/accounting';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	deleteCentralAdminCompany,
	fetchCentralAdminCompanyDetail,
	updateCentralAdminCompany,
	type CentralAdminCompanyDetail,
} from '@/lib/central-admin';

function roleLabel(role: string): string {
	if (role === 'custom') return 'Custom';
	const definition = (ROLE_DEFINITIONS as Record<string, { label: string } | undefined>)[role];
	return definition?.label ?? role;
}

function memberStatusLabel(status: string): string {
	if (status === 'active') return 'Aktif';
	if (status === 'invited') return 'Terundang';
	if (status === 'disabled') return 'Nonaktif';
	return status;
}

function subscriptionLabel(subscription: CentralAdminCompanyDetail['subscription']): string {
	if (!subscription) return 'Belum berlangganan';
	const status =
		subscription.status === 'active'
			? 'Aktif'
			: subscription.status === 'trialing'
				? 'Uji coba'
				: subscription.status;
	return `${subscription.title} — ${status} s.d. ${formatDate(subscription.currentPeriodEnd)}`;
}

const PLAN_BADGE_CLASSES: Record<string, string> = {
	starter: 'bg-secondary text-secondary-foreground',
	pro: 'bg-emerald-100 text-emerald-800',
	enterprise: 'bg-emerald-600 text-white',
};

interface CompanyDetailSheetProps {
	companyId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Dipanggil setelah paket/status akses berhasil diubah, untuk menyegarkan daftar. */
	onChanged: () => void;
}

export function CompanyDetailSheet({
	companyId,
	open,
	onOpenChange,
	onChanged,
}: CompanyDetailSheetProps) {
	const [detail, setDetail] = useState<CentralAdminCompanyDetail | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState('');
	const [selectedPlan, setSelectedPlan] = useState('starter');
	const [isSavingPlan, setIsSavingPlan] = useState(false);
	const [isTogglingStatus, setIsTogglingStatus] = useState(false);
	const [subscriptionEnd, setSubscriptionEnd] = useState('');
	const [isSavingSubscriptionEnd, setIsSavingSubscriptionEnd] = useState(false);
	const [showDelete, setShowDelete] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const loadDetail = useCallback(async (id: string) => {
		setIsLoading(true);
		setError('');
		try {
			const data = await fetchCentralAdminCompanyDetail(id);
			setDetail(data);
			setSelectedPlan(data.company.plan);
			setSubscriptionEnd(data.company.subscription_end ? data.company.subscription_end.slice(0, 10) : '');
		} catch (err) {
			setDetail(null);
			setError(
				err instanceof CentralAdminApiError
					? err.message
					: 'Gagal memuat detail perusahaan. Coba lagi.',
			);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open && companyId) {
			void loadDetail(companyId);
		}
		if (!open) {
			setDetail(null);
			setError('');
		}
	}, [open, companyId, loadDetail]);

	const handleSavePlan = async () => {
		if (!detail) return;
		setIsSavingPlan(true);
		setError('');
		try {
			await updateCentralAdminCompany(detail.company.id, { plan: selectedPlan });
			await loadDetail(detail.company.id);
			onChanged();
		} catch (err) {
			setError(
				err instanceof CentralAdminApiError
					? err.message
					: 'Gagal menyimpan paket. Coba lagi.',
			);
		} finally {
			setIsSavingPlan(false);
		}
	};

	const handleToggleStatus = async () => {
		if (!detail) return;
		const nextStatus = detail.company.access_status === 'suspended' ? 'active' : 'suspended';
		if (
			nextStatus === 'suspended' &&
			!window.confirm(
				`Tangguhkan akses perusahaan "${detail.company.name}"? Seluruh pengguna perusahaan tidak dapat membuka data perusahaan ini sampai akses diaktifkan kembali.`,
			)
		) {
			return;
		}
		setIsTogglingStatus(true);
		setError('');
		try {
			await updateCentralAdminCompany(detail.company.id, { access_status: nextStatus });
			await loadDetail(detail.company.id);
			onChanged();
		} catch (err) {
			setError(
				err instanceof CentralAdminApiError
					? err.message
					: 'Gagal mengubah status akses. Coba lagi.',
			);
		} finally {
			setIsTogglingStatus(false);
		}
	};

	const handleSaveSubscriptionEnd = async () => {
		if (!detail) return;
		setIsSavingSubscriptionEnd(true);
		setError('');
		try {
			await updateCentralAdminCompany(detail.company.id, {
				subscription_end: subscriptionEnd || null,
			});
			toast.success('Tanggal berakhir langganan disimpan.');
			await loadDetail(detail.company.id);
			onChanged();
		} catch (err) {
			setError(
				err instanceof CentralAdminApiError
					? err.message
					: 'Gagal menyimpan tanggal berakhir langganan. Coba lagi.',
			);
		} finally {
			setIsSavingSubscriptionEnd(false);
		}
	};

	const handleClearSubscriptionEnd = async () => {
		if (!detail) return;
		setIsSavingSubscriptionEnd(true);
		setError('');
		try {
			await updateCentralAdminCompany(detail.company.id, { subscription_end: null });
			setSubscriptionEnd('');
			toast.success('Tanggal berakhir langganan dihapus.');
			await loadDetail(detail.company.id);
			onChanged();
		} catch (err) {
			setError(
				err instanceof CentralAdminApiError
					? err.message
					: 'Gagal menghapus tanggal berakhir langganan. Coba lagi.',
			);
		} finally {
			setIsSavingSubscriptionEnd(false);
		}
	};

	const handleDelete = async () => {
		if (!detail) return;
		setIsDeleting(true);
		setError('');
		try {
			await deleteCentralAdminCompany(detail.company.id);
			toast.success('Perusahaan berhasil dihapus.');
			setShowDelete(false);
			onOpenChange(false);
			onChanged();
		} catch (err) {
			setError(
				err instanceof CentralAdminApiError
					? err.message
					: 'Gagal menghapus perusahaan. Coba lagi.',
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const company = detail?.company;
	const isSuspended = company?.access_status === 'suspended';

	return (
		<>
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
				<SheetHeader className="border-b border-border bg-secondary/40 px-6 py-5">
					<SheetTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
						<Building2 className="size-5 text-primary" strokeWidth={2} />
						{company ? company.name : 'Detail Perusahaan'}
					</SheetTitle>
					<SheetDescription className="text-xs">
						{company
							? `${company.code || 'Tanpa kode'} · terdaftar ${formatDate(company.created)}`
							: 'Detail perusahaan terdaftar'}
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-col gap-6 px-6 py-6">
					{isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" /> Memuat detail perusahaan…
						</div>
					) : error && !detail ? (
						<p className="text-sm font-semibold text-destructive">{error}</p>
					) : detail ? (
						<>
							{error ? (
								<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
									{error}
								</p>
							) : null}

							<section className="grid gap-3 rounded-2xl border border-border bg-card p-5 text-sm shadow-soft-sm">
								<div className="flex items-center justify-between gap-3">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Paket aktif
									</span>
									<span
										className={cn(
											'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
											PLAN_BADGE_CLASSES[detail.company.plan] ?? PLAN_BADGE_CLASSES.starter,
										)}
									>
										{planLabel(detail.company.plan)}
									</span>
								</div>
								<div className="flex items-center justify-between gap-3">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Status akses
									</span>
									<span
										className={cn(
											'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
											isSuspended
												? 'bg-red-50 text-red-700'
												: 'bg-emerald-50 text-emerald-700',
										)}
									>
										{isSuspended ? <Ban className="size-3" /> : <BadgeCheck className="size-3" />}
										{isSuspended ? 'Ditangguhkan' : 'Aktif'}
									</span>
								</div>
								<div className="flex flex-col gap-1 border-t border-border pt-3">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Status langganan pemilik
									</span>
									<span className="font-medium">{subscriptionLabel(detail.subscription)}</span>
									<span className="text-xs text-muted-foreground">
										Pemilik: {detail.company.owner.name || detail.company.owner.email}
									</span>
								</div>
								<div className="flex items-center justify-between gap-3 border-t border-border pt-3">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Langganan berlaku s.d.
									</span>
									<span
										className={cn(
											'inline-flex items-center gap-1 text-xs font-bold',
											detail.company.subscription_end ? 'text-emerald-700' : 'text-muted-foreground',
										)}
									>
										<CalendarClock className="size-3.5" />
										{detail.company.subscription_end ? formatDate(detail.company.subscription_end) : 'Belum ditetapkan'}
									</span>
								</div>
								{detail.company.address ? (
									<p className="border-t border-border pt-3 text-xs text-muted-foreground">
										{detail.company.address}
									</p>
								) : null}
							</section>

							<section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								{[
									{ icon: Users, label: 'Pengguna', value: detail.members.length },
									{ icon: CircleDollarSign, label: 'Karyawan', value: detail.stats.employees },
									{ icon: FileText, label: 'Dokumen', value: detail.stats.documents },
									{ icon: NotebookPen, label: 'Jurnal', value: detail.stats.entries },
								].map(stat => (
									<div
										key={stat.label}
										className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4"
									>
										<stat.icon className="size-4 text-primary" strokeWidth={2} />
										<span className="text-xl font-extrabold tracking-tight">{stat.value}</span>
										<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											{stat.label}
										</span>
									</div>
								))}
							</section>

							<section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
								<h3 className="text-sm font-extrabold tracking-tight">Kelola paket</h3>
								<p className="text-xs text-muted-foreground">
									Batas fitur perusahaan (menu, invoice, dan jumlah karyawan) otomatis mengikuti
									paket yang dipilih.
								</p>
								<div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Paket perusahaan">
									{PLAN_OPTIONS.map(option => {
										const isSelected = selectedPlan === option.key;
										return (
											<button
												key={option.key}
												type="button"
												role="radio"
												aria-checked={isSelected}
												onClick={() => setSelectedPlan(option.key)}
												className={cn(
													'flex flex-col rounded-xl border px-3 py-2.5 text-left transition-colors',
													isSelected
														? 'border-primary bg-accent/50 ring-1 ring-primary/30'
														: 'border-border bg-background hover:border-primary/40',
												)}
											>
												<span className="text-sm font-bold tracking-tight">{option.title}</span>
												<span className="text-[11px] font-medium text-muted-foreground">
													{option.price} {option.period}
												</span>
											</button>
										);
									})}
								</div>
								<button
									type="button"
									disabled={isSavingPlan || selectedPlan === detail.company.plan}
									onClick={handleSavePlan}
									className="w-fit rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
								>
									{isSavingPlan ? 'Menyimpan…' : 'Simpan paket'}
								</button>
							</section>

							<section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
								<h3 className="flex items-center gap-2 text-sm font-extrabold tracking-tight">
									<CalendarClock className="size-4 text-primary" strokeWidth={2} />
									Tanggal berakhir langganan
								</h3>
								<p className="text-xs text-muted-foreground">
									Tetapkan sampai tanggal berapa langganan perusahaan berlaku. Pengguna perusahaan
									yang masuk tetap dapat membuka aplikasi sampai tanggal ini, lalu kehilangan akses
									setelahnya. Kosongkan untuk menghapus batas yang ditetapkan.
								</p>
								<label className="flex flex-col gap-1">
									<span className="text-xs font-semibold">Berlaku sampai</span>
									<input
										type="date"
										value={subscriptionEnd}
										onChange={event => setSubscriptionEnd(event.target.value)}
										className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
									/>
								</label>
								<div className="flex flex-wrap items-center gap-2">
									<button
										type="button"
										disabled={isSavingSubscriptionEnd || !subscriptionEnd}
										onClick={() => void handleSaveSubscriptionEnd()}
										className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
									>
										{isSavingSubscriptionEnd ? <Loader2 className="size-3.5 animate-spin" /> : null}
										Simpan tanggal
									</button>
									<button
										type="button"
										disabled={isSavingSubscriptionEnd || !detail.company.subscription_end}
										onClick={() => void handleClearSubscriptionEnd()}
										className="rounded-full border border-border bg-background px-5 py-2.5 text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
									>
										Hapus tanggal
									</button>
								</div>
							</section>

							<section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
								<h3 className="text-sm font-extrabold tracking-tight">Status akses perusahaan</h3>
								<p className="text-xs text-muted-foreground">
									Menangguhkan akses memblokir seluruh pengguna perusahaan dari data
									perusahaan ini, tanpa menghapus datanya.
								</p>
								<button
									type="button"
									disabled={isTogglingStatus}
									onClick={handleToggleStatus}
									className={cn(
										'w-fit rounded-full px-5 py-2.5 text-xs font-bold shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60',
										isSuspended
											? 'bg-primary text-primary-foreground'
											: 'bg-destructive text-destructive-foreground',
									)}
								>
									{isTogglingStatus
										? 'Memproses…'
										: isSuspended
											? 'Aktifkan kembali akses'
											: 'Tangguhkan akses'}
								</button>
							</section>

							<section className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-card p-5 shadow-soft-sm">
								<h3 className="text-sm font-extrabold tracking-tight text-red-700">Hapus perusahaan</h3>
								<p className="text-xs text-muted-foreground">
									Menghapus perusahaan menghapus seluruh data terkait (akun, jurnal, dokumen,
									karyawan, dll.) secara permanen. Tindakan ini tidak dapat dibatalkan.
								</p>
								<button
									type="button"
									disabled={isDeleting}
									onClick={() => setShowDelete(true)}
									className="w-fit rounded-full border border-red-200 bg-white px-5 py-2.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
								>
									<Trash2 className="size-3.5" /> Hapus perusahaan
								</button>
							</section>

							<section className="flex flex-col gap-3">
								<h3 className="text-sm font-extrabold tracking-tight">Pengguna &amp; role</h3>
								{detail.members.length === 0 ? (
									<p className="rounded-2xl border border-dashed border-border bg-card px-5 py-6 text-center text-sm text-muted-foreground">
										Belum ada pengguna pada perusahaan ini.
									</p>
								) : (
									<div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft-sm">
										<table className="w-full min-w-[28rem] text-left text-sm">
											<thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
												<tr>
													<th className="px-4 py-3 font-semibold">Nama</th>
													<th className="px-4 py-3 font-semibold">Role</th>
													<th className="px-4 py-3 font-semibold">Status</th>
													<th className="px-4 py-3 font-semibold">Izin</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-border">
												{detail.members.map(member => (
													<tr key={member.id}>
														<td className="px-4 py-3">
															<span className="font-semibold">{member.name}</span>
															<span className="block text-xs text-muted-foreground">
																{member.email}
															</span>
														</td>
														<td className="px-4 py-3">{roleLabel(member.role)}</td>
														<td className="px-4 py-3">{memberStatusLabel(member.status)}</td>
														<td className="px-4 py-3 text-xs text-muted-foreground">
															{member.permissions.length} modul
															{member.can_edit ? ' · dapat mengubah' : ''}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</section>

							<p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
								<ShieldCheck className="size-3.5 shrink-0 text-primary" strokeWidth={2} />
								Perubahan paket dan status akses berlaku segera untuk seluruh pengguna perusahaan.
							</p>
						</>
					) : null}
				</div>
			</SheetContent>
		</Sheet>

		<Dialog open={showDelete} onOpenChange={setShowDelete}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Hapus perusahaan?</DialogTitle>
					<DialogDescription>
						Tindakan ini tidak dapat dibatalkan. Seluruh data perusahaan (akun, jurnal, dokumen,
						karyawan, dll.) akan dihapus permanen.
					</DialogDescription>
				</DialogHeader>
				{detail ? (
					<div className="rounded-xl border border-red-200 bg-red-50/50 p-4 text-sm">
						<p className="font-semibold text-red-700">{detail.company.name}</p>
						<p className="text-xs text-muted-foreground">
							{detail.company.code || 'Tanpa kode'} · {detail.company.owner.email}
						</p>
						<p className="mt-2 text-xs text-muted-foreground">
							{detail.members.length} pengguna · {detail.stats.entries} jurnal · {detail.stats.documents} dokumen
						</p>
					</div>
				) : null}
				{error ? (
					<p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
						{error}
					</p>
				) : null}
				<div className="flex items-center justify-end gap-2">
					<button
						type="button"
						onClick={() => setShowDelete(false)}
						className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
					>
						Batal
					</button>
					<button
						type="button"
						disabled={isDeleting}
						onClick={() => void handleDelete()}
						className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-5 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
					>
						{isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
						Hapus permanen
					</button>
				</div>
			</DialogContent>
		</Dialog>
		</>
	);
}
