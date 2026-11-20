import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	BadgeCheck,
	Ban,
	Building2,
	CalendarPlus,
	Clock,
	FileText,
	Loader2,
	RefreshCw,
	Search,
	Sparkles,
	Users,
	Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_OPTIONS, planLabel } from '@/data/plan-options';
import { formatDate } from '@/lib/accounting';
import { planEmployeeLimit, planInvoiceMonthlyLimit } from '@/lib/plan-access';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	extendCentralAdminSubscription,
	fetchCentralAdminCompanies,
	fetchCentralAdminSubscriptions,
	updateCentralAdminCompany,
	type CentralAdminCompanySummary,
	type CentralAdminSubscriptionUser,
} from '@/lib/central-admin';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Category = 'aplikasi' | 'akuntan';

const PLAN_BADGE_CLASSES: Record<string, string> = {
	starter: 'bg-secondary text-secondary-foreground',
	pro: 'bg-emerald-100 text-emerald-800',
	enterprise: 'bg-emerald-600 text-white',
};

function formatDateOrDash(iso: string): string {
	if (!iso) return '—';
	return formatDate(iso);
}

function akuntanStatusBadge(subscription: CentralAdminSubscriptionUser['subscription']) {
	if (!subscription) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
				Belum langganan
			</span>
		);
	}
	if (subscription.status === 'aktif') {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
				<BadgeCheck className="size-3" /> Aktif
			</span>
		);
	}
	if (subscription.status === 'menunggu_verifikasi') {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
				<Clock className="size-3" /> Menunggu
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
			{subscription.status}
		</span>
	);
}

function appSubscriptionBadge(subscription: CentralAdminCompanySummary['subscription']) {
	if (!subscription) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
				Belum berlangganan
			</span>
		);
	}
	if (subscription.status === 'active') {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
				<BadgeCheck className="size-3" /> Aktif
			</span>
		);
	}
	if (subscription.status === 'trialing') {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">
				<Sparkles className="size-3" /> Uji coba
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
			{subscription.status}
		</span>
	);
}

type ActionMode = 'extend' | 'grant_trial' | null;

/** Sel kuota karyawan: menampilkan terpakai / batas, sisa, dan tombol atur. */
function QuotaCell({
	company,
	onEdit,
}: {
	company: CentralAdminCompanySummary;
	onEdit: () => void;
}) {
	const used = company.employee_count ?? 0;
	const hasCustom =
		typeof company.employee_quota === 'number' && (company.employee_quota as number) > 0;
	const limit = hasCustom ? (company.employee_quota as number) : planEmployeeLimit(company.plan);
	const remaining = Math.max(0, limit - used);
	const atLimit = limit > 0 && used >= limit;

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1.5 text-xs">
				<Users className="size-3.5 text-muted-foreground" />
				<span className="font-semibold tabular-nums">{used}</span>
				<span className="text-muted-foreground">/ {limit}</span>
			</div>
			<div className="flex items-center gap-1.5">
				<span
					className={cn(
						'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
						atLimit
							? 'bg-red-50 text-red-700'
							: hasCustom
								? 'bg-emerald-50 text-emerald-700'
								: 'bg-secondary text-muted-foreground',
					)}
				>
					{hasCustom ? 'Kustom' : 'Paket'}
				</span>
				<span className="text-[10px] text-muted-foreground">Sisa {remaining}</span>
			</div>
			<button
				type="button"
				onClick={onEdit}
				className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-bold text-foreground transition-colors hover:bg-secondary"
			>
				Atur kuota
			</button>
		</div>
	);
}

/** Sel kuota invoice bulanan: menampilkan terpakai bulan ini / batas, sisa, dan tombol atur. */
function InvoiceQuotaCell({
	company,
	onEdit,
}: {
	company: CentralAdminCompanySummary;
	onEdit: () => void;
}) {
	const used = company.invoice_count ?? 0;
	const hasCustom =
		typeof company.invoice_quota === 'number' && (company.invoice_quota as number) > 0;
	const planLimit = planInvoiceMonthlyLimit(company.plan);
	const limit = hasCustom ? (company.invoice_quota as number) : planLimit;
	const remaining = limit !== null ? Math.max(0, limit - used) : null;
	const atLimit = limit !== null && used >= limit;

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1.5 text-xs">
				<FileText className="size-3.5 text-muted-foreground" />
				<span className="font-semibold tabular-nums">{used}</span>
				<span className="text-muted-foreground">/ {limit === null ? '∞' : limit}</span>
			</div>
			<div className="flex items-center gap-1.5">
				<span
					className={cn(
						'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
						atLimit
							? 'bg-red-50 text-red-700'
							: hasCustom
								? 'bg-emerald-50 text-emerald-700'
								: 'bg-secondary text-muted-foreground',
					)}
				>
					{hasCustom ? 'Kustom' : limit === null ? 'Tanpa batas' : 'Paket'}
				</span>
				{remaining !== null ? (
					<span className="text-[10px] text-muted-foreground">Sisa {remaining}</span>
				) : null}
			</div>
			<button
				type="button"
				onClick={onEdit}
				className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-bold text-foreground transition-colors hover:bg-secondary"
			>
				Atur kuota
			</button>
		</div>
	);
}

export function SubscriptionsPanel() {
	const [category, setCategory] = useState<Category>('aplikasi');

	// ── Akuntan (Pencari Akuntan) state ───────────────────────────────────────
	const [users, setUsers] = useState<CentralAdminSubscriptionUser[] | null>(null);
	const [isLoadingUsers, setIsLoadingUsers] = useState(true);
	const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
	const [usersError, setUsersError] = useState('');
	const [search, setSearch] = useState('');
	const [actionMode, setActionMode] = useState<ActionMode>(null);
	const [actionTarget, setActionTarget] = useState<CentralAdminSubscriptionUser | null>(null);
	const [days, setDays] = useState('30');
	const [isSaving, setIsSaving] = useState(false);

	// ── Aplikasi (perusahaan) state ────────────────────────────────────────────
	const [companies, setCompanies] = useState<CentralAdminCompanySummary[] | null>(null);
	const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
	const [isRefreshingCompanies, setIsRefreshingCompanies] = useState(false);
	const [companiesError, setCompaniesError] = useState('');
	const [companySearch, setCompanySearch] = useState('');
	const [planBusyId, setPlanBusyId] = useState<string | null>(null);
	const [quotaTarget, setQuotaTarget] = useState<CentralAdminCompanySummary | null>(null);
	const [quotaValue, setQuotaValue] = useState('');
	const [quotaSaving, setQuotaSaving] = useState(false);
	const [invoiceQuotaTarget, setInvoiceQuotaTarget] = useState<CentralAdminCompanySummary | null>(null);
	const [invoiceQuotaValue, setInvoiceQuotaValue] = useState('');
	const [invoiceQuotaSaving, setInvoiceQuotaSaving] = useState(false);

	const loadUsers = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshingUsers(true);
		else setIsLoadingUsers(true);
		setUsersError('');
		try {
			const data = await fetchCentralAdminSubscriptions();
			setUsers(data);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				setUsersError(err.message);
			} else {
				setUsersError('Gagal memuat data langganan. Periksa koneksi lalu coba lagi.');
			}
			setUsers([]);
		} finally {
			setIsLoadingUsers(false);
			setIsRefreshingUsers(false);
		}
	}, []);

	const loadCompanies = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshingCompanies(true);
		else setIsLoadingCompanies(true);
		setCompaniesError('');
		try {
			const data = await fetchCentralAdminCompanies();
			setCompanies(data);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				setCompaniesError(err.message);
			} else {
				setCompaniesError('Gagal memuat data langganan aplikasi. Periksa koneksi lalu coba lagi.');
			}
			setCompanies([]);
		} finally {
			setIsLoadingCompanies(false);
			setIsRefreshingCompanies(false);
		}
	}, []);

	useEffect(() => {
		void loadUsers();
	}, [loadUsers]);

	useEffect(() => {
		void loadCompanies();
	}, [loadCompanies]);

	const filteredUsers = useMemo(() => {
		if (!users) return [];
		const query = search.trim().toLowerCase();
		if (!query) return users;
		return users.filter(
			user =>
				user.name.toLowerCase().includes(query) ||
				user.email.toLowerCase().includes(query),
		);
	}, [users, search]);

	const filteredCompanies = useMemo(() => {
		if (!companies) return [];
		const query = companySearch.trim().toLowerCase();
		if (!query) return companies;
		return companies.filter(
			company =>
				company.name.toLowerCase().includes(query) ||
				company.owner.email.toLowerCase().includes(query),
		);
	}, [companies, companySearch]);

	const akuntanSummary = useMemo(() => {
		const list = users ?? [];
		return {
			total: list.length,
			active: list.filter(user => user.subscription?.status === 'aktif').length,
			pending: list.filter(user => user.subscription?.status === 'menunggu_verifikasi').length,
			inactive: list.filter(user => !user.subscription || user.subscription.status !== 'aktif').length,
		};
	}, [users]);

	const aplikasiSummary = useMemo(() => {
		const list = companies ?? [];
		return {
			total: list.length,
			active: list.filter(company => company.subscription?.status === 'active').length,
			trialing: list.filter(company => company.subscription?.status === 'trialing').length,
			none: list.filter(company => !company.subscription).length,
		};
	}, [companies]);

	function openAction(mode: ActionMode, user: CentralAdminSubscriptionUser) {
		setActionMode(mode);
		setActionTarget(user);
		setDays(mode === 'grant_trial' ? '14' : '30');
	}

	async function handleApply() {
		if (!actionMode || !actionTarget) return;
		const daysNum = Number(days);
		if (!Number.isFinite(daysNum) || daysNum <= 0 || daysNum > 3650) {
			setUsersError('Jumlah hari harus antara 1 dan 3650.');
			return;
		}
		setIsSaving(true);
		setUsersError('');
		try {
			const { subscription } = await extendCentralAdminSubscription({
				userId: actionTarget.id,
				days: daysNum,
				action: actionMode,
			});
			setUsers(prev =>
				prev?.map(user =>
					user.id === actionTarget.id
						? { ...user, subscription: { ...subscription, method: 'manual' } }
						: user,
				) ?? null,
			);
			toast.success(
				actionMode === 'grant_trial'
					? `Masa trial ${daysNum} hari berhasil diberikan.`
					: `Langganan berhasil diperpanjang ${daysNum} hari.`,
			);
			setActionMode(null);
			setActionTarget(null);
		} catch (err) {
			setUsersError(
				err instanceof CentralAdminApiError ? err.message : 'Gagal memperpanjang langganan.',
			);
		} finally {
			setIsSaving(false);
		}
	}

	async function handlePlanChange(company: CentralAdminCompanySummary, newPlan: string) {
		if (newPlan === company.plan) return;
		setPlanBusyId(company.id);
		try {
			await updateCentralAdminCompany(company.id, { plan: newPlan });
			setCompanies(prev =>
				prev?.map(item => (item.id === company.id ? { ...item, plan: newPlan } : item)) ?? null,
			);
			toast.success(`Paket ${company.name} diubah ke ${planLabel(newPlan)}.`);
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal mengubah paket perusahaan.',
			);
		} finally {
			setPlanBusyId(null);
		}
	}

	async function handleToggleAccess(company: CentralAdminCompanySummary) {
		const nextStatus = company.access_status === 'suspended' ? 'active' : 'suspended';
		setPlanBusyId(company.id);
		try {
			await updateCentralAdminCompany(company.id, { access_status: nextStatus });
			setCompanies(prev =>
				prev?.map(item =>
					item.id === company.id ? { ...item, access_status: nextStatus } : item,
				) ?? null,
			);
			toast.success(
				nextStatus === 'suspended'
					? `Akses ${company.name} ditangguhkan.`
					: `Akses ${company.name} diaktifkan kembali.`,
			);
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal mengubah status akses.',
			);
		} finally {
			setPlanBusyId(null);
		}
	}

	function openQuotaEditor(company: CentralAdminCompanySummary) {
		setQuotaTarget(company);
		// Tampilkan kuota kustom bila aktif, jika tidak kosong (pakai batas paket).
		setQuotaValue(
			typeof company.employee_quota === 'number' && company.employee_quota > 0
				? String(company.employee_quota)
				: '',
		);
	}

	async function handleApplyQuota() {
		if (!quotaTarget) return;
		const trimmed = quotaValue.trim();
		// String kosong = nonaktifkan kuota kustom, kembali ke batas paket.
		const parsed = trimmed === '' ? null : Number(trimmed);
		if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000)) {
			toast.error('Kuota karyawan harus antara 0 dan 100000.');
			return;
		}
		const nextQuota = parsed === null ? null : Math.floor(parsed);
		setQuotaSaving(true);
		try {
			await updateCentralAdminCompany(quotaTarget.id, { employee_quota: nextQuota });
			setCompanies(prev =>
				prev?.map(item =>
					item.id === quotaTarget.id ? { ...item, employee_quota: nextQuota } : item,
				) ?? null,
			);
			toast.success(
				nextQuota === null
					? `Kuota kustom ${quotaTarget.name} dinonaktifkan. Kembali ke batas paket.`
					: `Kuota karyawan ${quotaTarget.name} diatur menjadi ${nextQuota}.`,
			);
			setQuotaTarget(null);
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal mengatur kuota karyawan.',
			);
		} finally {
			setQuotaSaving(false);
		}
	}

	function openInvoiceQuotaEditor(company: CentralAdminCompanySummary) {
		setInvoiceQuotaTarget(company);
		// Tampilkan kuota invoice kustom bila aktif, jika tidak kosong (pakai batas paket).
		setInvoiceQuotaValue(
			typeof company.invoice_quota === 'number' && company.invoice_quota > 0
				? String(company.invoice_quota)
				: '',
		);
	}

	async function handleApplyInvoiceQuota() {
		if (!invoiceQuotaTarget) return;
		const trimmed = invoiceQuotaValue.trim();
		// String kosong = nonaktifkan kuota invoice kustom, kembali ke batas paket.
		const parsed = trimmed === '' ? null : Number(trimmed);
		if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000)) {
			toast.error('Kuota invoice harus antara 0 dan 100000.');
			return;
		}
		const nextQuota = parsed === null ? null : Math.floor(parsed);
		setInvoiceQuotaSaving(true);
		try {
			await updateCentralAdminCompany(invoiceQuotaTarget.id, { invoice_quota: nextQuota });
			setCompanies(prev =>
				prev?.map(item =>
					item.id === invoiceQuotaTarget.id ? { ...item, invoice_quota: nextQuota } : item,
				) ?? null,
			);
			toast.success(
				nextQuota === null
					? `Kuota invoice kustom ${invoiceQuotaTarget.name} dinonaktifkan. Kembali ke batas paket.`
					: `Kuota invoice ${invoiceQuotaTarget.name} diatur menjadi ${nextQuota} per bulan.`,
			);
			setInvoiceQuotaTarget(null);
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal mengatur kuota invoice.',
			);
		} finally {
			setInvoiceQuotaSaving(false);
		}
	}

	const summary = category === 'akuntan' ? akuntanSummary : aplikasiSummary;
	const summaryCards =
		category === 'akuntan'
			? [
					{ label: 'Total Pencari', value: summary.total },
					{ label: 'Langganan aktif', value: (summary as typeof akuntanSummary).active },
					{ label: 'Menunggu verifikasi', value: (summary as typeof akuntanSummary).pending },
					{ label: 'Belum berlangganan', value: (summary as typeof akuntanSummary).inactive },
				]
			: [
					{ label: 'Total perusahaan', value: summary.total },
					{ label: 'Langganan aktif', value: (summary as typeof aplikasiSummary).active },
					{ label: 'Masa uji coba', value: (summary as typeof aplikasiSummary).trialing },
					{ label: 'Belum berlangganan', value: (summary as typeof aplikasiSummary).none },
				];

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<Wallet className="size-7 text-primary" strokeWidth={2} />
						Langganan
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Kelola langganan aplikasi perusahaan dan langganan akun Pencari Akuntan.
					</p>
				</div>
				<button
					type="button"
					onClick={() => (category === 'akuntan' ? void loadUsers(true) : void loadCompanies(true))}
					disabled={category === 'akuntan' ? isRefreshingUsers : isRefreshingCompanies}
					className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
				>
					{category === 'akuntan' && isRefreshingUsers ? (
						<Loader2 className="size-4 animate-spin" />
					) : category === 'aplikasi' && isRefreshingCompanies ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<RefreshCw className="size-4" />
					)}
					Muat ulang
				</button>
			</header>

			{/* Category toggle */}
			<div className="inline-flex w-full max-w-md gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft-sm">
				<button
					type="button"
					onClick={() => setCategory('aplikasi')}
					className={cn(
						'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors',
						category === 'aplikasi'
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>
					<Building2 className="size-3.5" /> Langganan Aplikasi
				</button>
				<button
					type="button"
					onClick={() => setCategory('akuntan')}
					className={cn(
						'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors',
						category === 'akuntan'
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>
					<Sparkles className="size-3.5" /> Langganan Akuntan
				</button>
			</div>

			<section className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{summaryCards.map(stat => (
					<div
						key={stat.label}
						className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-soft-sm"
					>
						<span className="text-2xl font-extrabold tracking-tight">{stat.value}</span>
						<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							{stat.label}
						</span>
					</div>
				))}
			</section>

			{category === 'aplikasi' ? (
				<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<h2 className="text-lg font-extrabold tracking-tight">Langganan Aplikasi</h2>
							<p className="mt-0.5 text-sm text-muted-foreground">
							Status langganan paket aplikasi Catet Pajak tiap perusahaan (Starter / Pro / Enterprise).
							</p>
						</div>
						<div className="relative md:w-72">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="search"
								value={companySearch}
								onChange={event => setCompanySearch(event.target.value)}
								placeholder="Cari nama perusahaan atau email…"
								className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
					</div>

					{companiesError ? (
						<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
							{companiesError}
						</p>
					) : null}

					{isLoadingCompanies ? (
						<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" /> Memuat data langganan aplikasi…
						</div>
					) : filteredCompanies.length === 0 ? (
						<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
							{companies && companies.length > 0
								? 'Tidak ada perusahaan yang cocok dengan pencarian.'
								: 'Belum ada perusahaan terdaftar.'}
						</p>
					) : (
						<div className="overflow-x-auto rounded-xl border border-border">
							<table className="w-full min-w-[68rem] text-left text-sm">
								<thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
									<tr>
										<th className="px-4 py-3 font-semibold">Perusahaan</th>
										<th className="px-4 py-3 font-semibold">Paket</th>
										<th className="px-4 py-3 font-semibold">Status langganan</th>
										<th className="px-4 py-3 font-semibold">Berakhir</th>
										<th className="px-4 py-3 font-semibold">Kuota karyawan</th>
										<th className="px-4 py-3 font-semibold">Kuota invoice/bulan</th>
										<th className="px-4 py-3 font-semibold">Akses</th>
										<th className="px-4 py-3" />
									</tr>
								</thead>
								<tbody className="divide-y divide-border bg-background">
									{filteredCompanies.map(company => (
										<tr key={company.id} className="transition-colors hover:bg-secondary/30">
											<td className="px-4 py-3">
												<span className="font-semibold">{company.name}</span>
												<span className="block text-xs text-muted-foreground">{company.owner.email}</span>
											</td>
											<td className="px-4 py-3">
												<select
													value={company.plan}
													onChange={event => void handlePlanChange(company, event.target.value)}
													disabled={planBusyId === company.id}
													aria-label={`Paket ${company.name}`}
													className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold outline-none ring-primary/20 focus:ring-2 disabled:opacity-60"
												>
													{PLAN_OPTIONS.map(option => (
														<option key={option.key} value={option.key}>
															{option.title}
														</option>
													))}
												</select>
											</td>
											<td className="px-4 py-3">
												<div className="flex flex-col gap-1">
													{appSubscriptionBadge(company.subscription)}
													{company.subscription ? (
														<span className="text-[11px] text-muted-foreground">
															{company.subscription.title}
														</span>
													) : null}
												</div>
											</td>
											<td className="px-4 py-3 text-xs text-muted-foreground">
												{company.subscription?.currentPeriodEnd
													? formatDateOrDash(company.subscription.currentPeriodEnd)
													: '—'}
											</td>
											<td className="px-4 py-3">
												<QuotaCell company={company} onEdit={() => openQuotaEditor(company)} />
											</td>
											<td className="px-4 py-3">
												<InvoiceQuotaCell company={company} onEdit={() => openInvoiceQuotaEditor(company)} />
											</td>
											<td className="px-4 py-3">
												<span
													className={cn(
														'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
														company.access_status === 'suspended'
															? 'bg-red-50 text-red-700'
															: 'bg-emerald-50 text-emerald-700',
													)}
												>
													{company.access_status === 'suspended' ? (
														<Ban className="size-3" />
													) : (
														<BadgeCheck className="size-3" />
													)}
													{company.access_status === 'suspended' ? 'Ditangguhkan' : 'Aktif'}
												</span>
											</td>
											<td className="px-4 py-3 text-right">
												<button
													type="button"
													onClick={() => void handleToggleAccess(company)}
													disabled={planBusyId === company.id}
													className={cn(
														'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60',
														company.access_status === 'suspended'
															? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
															: 'border-red-200 bg-white text-red-700 hover:bg-red-50',
													)}
												>
													{planBusyId === company.id ? (
														<Loader2 className="size-3.5 animate-spin" />
													) : company.access_status === 'suspended' ? (
														<BadgeCheck className="size-3.5" />
													) : (
														<Ban className="size-3.5" />
													)}
													{company.access_status === 'suspended' ? 'Aktifkan' : 'Tangguhkan'}
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			) : (
				<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<h2 className="text-lg font-extrabold tracking-tight">Langganan Akuntan</h2>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Langganan Pencari Akuntan Rp49.000/bulan — perpanjang jangka waktu atau beri masa trial.
							</p>
						</div>
						<div className="relative md:w-72">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="search"
								value={search}
								onChange={event => setSearch(event.target.value)}
								placeholder="Cari nama atau email Pencari Akuntan…"
								className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</div>
					</div>

					{usersError ? (
						<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
							{usersError}
						</p>
					) : null}

					{isLoadingUsers ? (
						<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" /> Memuat data langganan…
						</div>
					) : filteredUsers.length === 0 ? (
						<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
							{users && users.length > 0
								? 'Tidak ada Pencari Akuntan yang cocok dengan pencarian.'
								: 'Belum ada Pencari Akuntan terdaftar.'}
						</p>
					) : (
						<div className="overflow-x-auto rounded-xl border border-border">
							<table className="w-full min-w-[48rem] text-left text-sm">
								<thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
									<tr>
										<th className="px-4 py-3 font-semibold">Pencari Akuntan</th>
										<th className="px-4 py-3 font-semibold">Status</th>
										<th className="px-4 py-3 font-semibold">Periode aktif</th>
										<th className="px-4 py-3 font-semibold">Berakhir</th>
										<th className="px-4 py-3" />
									</tr>
								</thead>
								<tbody className="divide-y divide-border bg-background">
									{filteredUsers.map(user => (
										<tr key={user.id} className="transition-colors hover:bg-secondary/30">
											<td className="px-4 py-3">
												<span className="font-semibold">{user.name || user.email}</span>
												<span className="block text-xs text-muted-foreground">{user.email}</span>
											</td>
											<td className="px-4 py-3">{akuntanStatusBadge(user.subscription)}</td>
											<td className="px-4 py-3 text-xs text-muted-foreground">
												{user.subscription?.period_start
													? formatDateOrDash(user.subscription.period_start)
													: '—'}
											</td>
											<td className="px-4 py-3 text-xs text-muted-foreground">
												{user.subscription?.period_end
													? formatDateOrDash(user.subscription.period_end)
													: '—'}
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center justify-end gap-2">
													<button
														type="button"
														onClick={() => openAction('grant_trial', user)}
														className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-accent/40 px-3 py-1.5 text-xs font-bold text-accent-foreground transition-colors hover:bg-accent"
													>
														<Sparkles className="size-3.5" /> Beri trial
													</button>
													<button
														type="button"
														onClick={() => openAction('extend', user)}
														className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
													>
														<CalendarPlus className="size-3.5" /> Perpanjang
													</button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			)}

			{/* Extend / grant trial dialog */}
			<Dialog
				open={actionMode !== null}
				onOpenChange={open => !open && setActionMode(null)}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>
							{actionMode === 'grant_trial' ? 'Beri masa trial' : 'Perpanjang langganan'}
						</DialogTitle>
						<DialogDescription>
							{actionMode === 'grant_trial'
								? 'Beri masa akses trial gratis kepada Pencari Akuntan ini.'
								: 'Tambah jangka waktu langganan Pencari Akuntan ini.'}
						</DialogDescription>
					</DialogHeader>
					{actionTarget ? (
						<div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
							<p className="font-semibold">{actionTarget.name || actionTarget.email}</p>
							<p className="text-xs text-muted-foreground">{actionTarget.email}</p>
							{actionTarget.subscription?.status === 'aktif' ? (
								<p className="mt-2 text-xs text-muted-foreground">
									Langganan aktif berakhir pada {formatDateOrDash(actionTarget.subscription.period_end)}.
								</p>
							) : null}
						</div>
					) : null}
					<label className="flex flex-col gap-1">
						<span className="text-xs font-semibold">Jumlah hari</span>
						<input
							type="number"
							value={days}
							onChange={event => setDays(event.target.value)}
							min={1}
							max={3650}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
						/>
						<span className="text-[11px] text-muted-foreground">
							{actionMode === 'grant_trial'
								? 'Masa trial aktif mulai hari ini hingga tanggal yang ditentukan.'
								: 'Hari ditambahkan ke akhir periode langganan saat ini.'}
						</span>
					</label>
					{usersError ? (
						<p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
							{usersError}
						</p>
					) : null}
					<div className="flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={() => setActionMode(null)}
							className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={isSaving}
							onClick={() => void handleApply()}
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold text-white shadow-soft-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60',
								actionMode === 'grant_trial' ? 'bg-emerald-600' : 'bg-primary',
							)}
						>
							{isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
							{actionMode === 'grant_trial' ? 'Beri trial' : 'Perpanjang'}
						</button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Quota editor dialog */}
			<Dialog
				open={quotaTarget !== null}
				onOpenChange={open => {
					if (!open) {
						setQuotaTarget(null);
						setQuotaValue('');
					}
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Atur kuota karyawan</DialogTitle>
						<DialogDescription>
							Tetapkan jumlah maksimal karyawan aktif yang dapat ditambahkan perusahaan ini.
							Kosongkan untuk kembali ke batas bawaan paket.
						</DialogDescription>
					</DialogHeader>
					{quotaTarget ? (
						<div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
							<p className="font-semibold">{quotaTarget.name}</p>
							<p className="text-xs text-muted-foreground">{quotaTarget.owner.email}</p>
							<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
								<span>Paket: <span className="font-semibold text-foreground">{planLabel(quotaTarget.plan)}</span></span>
								<span>Batas paket: <span className="font-semibold text-foreground">{planEmployeeLimit(quotaTarget.plan)}</span></span>
								<span>Terpakai: <span className="font-semibold text-foreground">{quotaTarget.employee_count ?? 0}</span></span>
							</div>
						</div>
					) : null}
					<label className="flex flex-col gap-1">
						<span className="text-xs font-semibold">Kuota karyawan kustom</span>
						<input
							type="number"
							value={quotaValue}
							onChange={event => setQuotaValue(event.target.value)}
							min={0}
							max={100000}
							placeholder={`Batas paket (${quotaTarget ? planEmployeeLimit(quotaTarget.plan) : 0})`}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
						/>
						<span className="text-[11px] text-muted-foreground">
							Isi angka untuk mengaktifkan kuota kustom. Kosongkan untuk menonaktifkan dan kembali ke batas paket.
						</span>
					</label>
					<div className="flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								setQuotaTarget(null);
								setQuotaValue('');
							}}
							className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={quotaSaving}
							onClick={() => void handleApplyQuota()}
							className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-white shadow-soft-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
						>
							{quotaSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
							Simpan kuota
						</button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Invoice quota editor dialog */}
			<Dialog
				open={invoiceQuotaTarget !== null}
				onOpenChange={open => {
					if (!open) {
						setInvoiceQuotaTarget(null);
						setInvoiceQuotaValue('');
					}
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Atur kuota invoice bulanan</DialogTitle>
						<DialogDescription>
							Tetapkan jumlah maksimal invoice yang dapat dibuat per bulan oleh perusahaan ini.
							Kosongkan untuk kembali ke batas bawaan paket.
						</DialogDescription>
					</DialogHeader>
					{invoiceQuotaTarget ? (
						<div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
							<p className="font-semibold">{invoiceQuotaTarget.name}</p>
							<p className="text-xs text-muted-foreground">{invoiceQuotaTarget.owner.email}</p>
							<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
								<span>Paket: <span className="font-semibold text-foreground">{planLabel(invoiceQuotaTarget.plan)}</span></span>
								<span>Batas paket: <span className="font-semibold text-foreground">{planInvoiceMonthlyLimit(invoiceQuotaTarget.plan) === null ? 'Tanpa batas' : planInvoiceMonthlyLimit(invoiceQuotaTarget.plan)}</span></span>
								<span>Terpakai bulan ini: <span className="font-semibold text-foreground">{invoiceQuotaTarget.invoice_count ?? 0}</span></span>
							</div>
						</div>
					) : null}
					<label className="flex flex-col gap-1">
						<span className="text-xs font-semibold">Kuota invoice kustom per bulan</span>
						<input
							type="number"
							value={invoiceQuotaValue}
							onChange={event => setInvoiceQuotaValue(event.target.value)}
							min={0}
							max={100000}
							placeholder={invoiceQuotaTarget ? (planInvoiceMonthlyLimit(invoiceQuotaTarget.plan) === null ? 'Tanpa batas' : `Batas paket (${planInvoiceMonthlyLimit(invoiceQuotaTarget.plan)})`) : 'Batas paket'}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
						/>
						<span className="text-[11px] text-muted-foreground">
							Isi angka untuk mengaktifkan kuota kustom. Kosongkan untuk menonaktifkan dan kembali ke batas paket. Hitungan reset otomatis setiap awal bulan.
						</span>
					</label>
					<div className="flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								setInvoiceQuotaTarget(null);
								setInvoiceQuotaValue('');
							}}
							className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={invoiceQuotaSaving}
							onClick={() => void handleApplyInvoiceQuota()}
							className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-white shadow-soft-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
						>
							{invoiceQuotaSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
							Simpan kuota
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
