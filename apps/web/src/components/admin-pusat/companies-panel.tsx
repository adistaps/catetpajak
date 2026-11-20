import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowLeft,
	Ban,
	BadgeCheck,
	Building2,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_OPTIONS, planLabel } from '@/data/plan-options';
import { formatDate } from '@/lib/accounting';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	createCentralAdminCompany,
	fetchCentralAdminCompanies,
	fetchCentralAdminUsers,
	type CentralAdminCompanySummary,
	type CentralAdminUserSummary,
} from '@/lib/central-admin';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CompanyDetailSheet } from './company-detail-sheet';

const PLAN_BADGE_CLASSES: Record<string, string> = {
	starter: 'bg-secondary text-secondary-foreground',
	pro: 'bg-emerald-100 text-emerald-800',
	enterprise: 'bg-emerald-600 text-white',
};

const PLAN_FILTERS = [
	{ value: 'all', label: 'Semua paket' },
	...PLAN_OPTIONS.map(option => ({ value: option.key, label: option.title })),
];

const STATUS_FILTERS = [
	{ value: 'all', label: 'Semua status akses' },
	{ value: 'active', label: 'Aktif' },
	{ value: 'suspended', label: 'Ditangguhkan' },
];

function subscriptionLabel(subscription: CentralAdminCompanySummary['subscription']): string {
	if (!subscription) return 'Belum berlangganan';
	const status =
		subscription.status === 'active'
			? 'Aktif'
			: subscription.status === 'trialing'
				? 'Uji coba'
				: subscription.status;
	return `${subscription.title} · ${status}`;
}

export function CompaniesPanel() {
	const [companies, setCompanies] = useState<CentralAdminCompanySummary[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [isDenied, setIsDenied] = useState(false);
	const [search, setSearch] = useState('');
	const [planFilter, setPlanFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState('all');
	const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
	const [isDetailOpen, setIsDetailOpen] = useState(false);
	const [showCreate, setShowCreate] = useState(false);
	const [createName, setCreateName] = useState('');
	const [createCode, setCreateCode] = useState('');
	const [createAddress, setCreateAddress] = useState('');
	const [createPlan, setCreatePlan] = useState('starter');
	const [createOwnerId, setCreateOwnerId] = useState('');
	const [ownerOptions, setOwnerOptions] = useState<CentralAdminUserSummary[]>([]);
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState('');

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		setIsDenied(false);
		try {
			const data = await fetchCentralAdminCompanies();
			setCompanies(data);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				if (err.status === 403) {
					setIsDenied(true);
					setCompanies([]);
					return;
				}
				setError(err.message);
			} else {
				setError('Gagal memuat daftar perusahaan. Periksa koneksi lalu coba lagi.');
			}
			setCompanies([]);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const filteredCompanies = useMemo(() => {
		if (!companies) return [];
		const query = search.trim().toLowerCase();
		return companies.filter(company => {
			const matchesQuery =
				!query ||
				company.name.toLowerCase().includes(query) ||
				company.code.toLowerCase().includes(query) ||
				company.owner.email.toLowerCase().includes(query);
			const matchesPlan = planFilter === 'all' || company.plan === planFilter;
			const matchesStatus = statusFilter === 'all' || company.access_status === statusFilter;
			return matchesQuery && matchesPlan && matchesStatus;
		});
	}, [companies, search, planFilter, statusFilter]);

	const summary = useMemo(() => {
		const list = companies ?? [];
		return {
			total: list.length,
			suspended: list.filter(company => company.access_status === 'suspended').length,
			pro: list.filter(company => company.plan === 'pro').length,
			enterprise: list.filter(company => company.plan === 'enterprise').length,
		};
	}, [companies]);

	const openDetail = (id: string) => {
		setSelectedCompanyId(id);
		setIsDetailOpen(true);
	};

	const openCreate = async () => {
		setShowCreate(true);
		setCreateName('');
		setCreateCode('');
		setCreateAddress('');
		setCreatePlan('starter');
		setCreateOwnerId('');
		setCreateError('');
		try {
			const users = await fetchCentralAdminUsers();
			setOwnerOptions(users);
		} catch {
			setOwnerOptions([]);
		}
	};

	const handleCreate = async () => {
		if (!createName.trim()) {
			setCreateError('Nama perusahaan wajib diisi.');
			return;
		}
		if (!createOwnerId) {
			setCreateError('Pemilik perusahaan wajib dipilih.');
			return;
		}
		setIsCreating(true);
		setCreateError('');
		try {
			await createCentralAdminCompany({
				name: createName,
				code: createCode,
				address: createAddress,
				plan: createPlan,
				ownerId: createOwnerId,
			});
			toast.success('Perusahaan berhasil ditambahkan.');
			setShowCreate(false);
			await load(true);
		} catch (err) {
			setCreateError(
				err instanceof CentralAdminApiError ? err.message : 'Gagal menambah perusahaan.',
			);
		} finally {
			setIsCreating(false);
		}
	};

	if (isDenied) {
		return (
			<section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-16 text-center shadow-soft">
				<span className="flex size-14 items-center justify-center rounded-full bg-red-50">
					<ShieldOff className="size-7 text-red-600" strokeWidth={2} />
				</span>
				<h1 className="text-2xl font-extrabold tracking-tight">Akses tidak diizinkan</h1>
				<p className="max-w-md text-sm text-muted-foreground">
					Panel Admin Pusat hanya dapat diakses oleh admin pusat Catet Pajak. Admin
					perusahaan biasa tidak memiliki akses ke panel ini. Jika Anda merasa ini
					kekeliruan, hubungi admin pusat.
				</p>
				<Link
					to="/app"
					className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
				>
					<ArrowLeft className="size-3.5" /> Kembali ke aplikasi
				</Link>
			</section>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						[ Panel pusat Catet Pajak ]
					</p>
					<h1 className="mt-2 flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<Building2 className="size-7 text-primary" strokeWidth={2} />
						Admin Pusat
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Kelola database seluruh perusahaan terdaftar: paket, status akses, dan pengguna.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => void openCreate()}
						className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
					>
						<Plus className="size-3.5" /> Tambah perusahaan
					</button>
					<Link
						to="/app"
						className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
					>
						<ArrowLeft className="size-3.5" /> Kembali ke aplikasi
					</Link>
				</div>
			</header>

			<section className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{[
					{ label: 'Total perusahaan', value: summary.total },
					{ label: 'Paket Pro', value: summary.pro },
					{ label: 'Paket Enterprise', value: summary.enterprise },
					{ label: 'Akses ditangguhkan', value: summary.suspended },
				].map(stat => (
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

			<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
				<div className="flex flex-col gap-3 md:flex-row md:items-center">
					<div className="relative flex-1">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<input
							type="search"
							value={search}
							onChange={event => setSearch(event.target.value)}
							placeholder="Cari nama, kode, atau email pemilik…"
							className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-primary/20 focus:ring-2"
						/>
					</div>
					<select
						value={planFilter}
						onChange={event => setPlanFilter(event.target.value)}
						aria-label="Filter paket"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
					>
						{PLAN_FILTERS.map(filter => (
							<option key={filter.value} value={filter.value}>
								{filter.label}
							</option>
						))}
					</select>
					<select
						value={statusFilter}
						onChange={event => setStatusFilter(event.target.value)}
						aria-label="Filter status akses"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
					>
						{STATUS_FILTERS.map(filter => (
							<option key={filter.value} value={filter.value}>
								{filter.label}
							</option>
						))}
					</select>
					<button
						type="button"
						onClick={() => void load(true)}
						disabled={isRefreshing}
						className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
					>
						{isRefreshing ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<RefreshCw className="size-4" />
						)}
						Muat ulang
					</button>
				</div>

				{error ? (
					<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
						{error}
					</p>
				) : null}

				{isLoading ? (
					<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" /> Memuat daftar perusahaan…
					</div>
				) : filteredCompanies.length === 0 ? (
					<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
						{companies && companies.length > 0
							? 'Tidak ada perusahaan yang cocok dengan pencarian atau filter.'
							: 'Belum ada perusahaan terdaftar.'}
					</p>
				) : (
					<div className="overflow-x-auto rounded-xl border border-border">
						<table className="w-full min-w-[52rem] text-left text-sm">
							<thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3 font-semibold">Perusahaan</th>
									<th className="px-4 py-3 font-semibold">Paket</th>
									<th className="px-4 py-3 font-semibold">Langganan pemilik</th>
									<th className="px-4 py-3 font-semibold">Pengguna</th>
									<th className="px-4 py-3 font-semibold">Status akses</th>
									<th className="px-4 py-3 font-semibold">Terdaftar</th>
									<th className="px-4 py-3" />
								</tr>
							</thead>
							<tbody className="divide-y divide-border bg-background">
								{filteredCompanies.map(company => (
									<tr key={company.id} className="transition-colors hover:bg-secondary/30">
										<td className="px-4 py-3">
											<span className="font-semibold">{company.name}</span>
											<span className="block text-xs text-muted-foreground">
												{company.code || 'Tanpa kode'} · {company.owner.email}
											</span>
										</td>
										<td className="px-4 py-3">
											<span
												className={cn(
													'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
													PLAN_BADGE_CLASSES[company.plan] ?? PLAN_BADGE_CLASSES.starter,
												)}
											>
												{planLabel(company.plan)}
											</span>
										</td>
										<td className="px-4 py-3 text-xs">{subscriptionLabel(company.subscription)}</td>
										<td className="px-4 py-3 font-semibold">{company.memberCount}</td>
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
										<td className="px-4 py-3 text-xs text-muted-foreground">
											{formatDate(company.created)}
										</td>
										<td className="px-4 py-3 text-right">
											<button
												type="button"
												onClick={() => openDetail(company.id)}
												className="rounded-full border border-border bg-secondary px-4 py-1.5 text-xs font-bold transition-colors hover:text-primary"
											>
												Detail
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<CompanyDetailSheet
				companyId={selectedCompanyId}
				open={isDetailOpen}
				onOpenChange={setIsDetailOpen}
				onChanged={() => void load(true)}
			/>

			<Dialog open={showCreate} onOpenChange={setShowCreate}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Tambah perusahaan</DialogTitle>
						<DialogDescription>
							Buat perusahaan baru dan tetapkan pemilik serta paketnya.
						</DialogDescription>
					</DialogHeader>
					<form
						className="flex flex-col gap-3"
						onSubmit={event => {
							event.preventDefault();
							void handleCreate();
						}}
					>
						<label className="flex flex-col gap-1">
							<span className="text-xs font-semibold">Nama perusahaan</span>
							<input
								type="text"
								value={createName}
								onChange={event => setCreateName(event.target.value)}
								required
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className="text-xs font-semibold">Kode perusahaan (opsional)</span>
							<input
								type="text"
								value={createCode}
								onChange={event => setCreateCode(event.target.value)}
								maxLength={20}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className="text-xs font-semibold">Alamat (opsional)</span>
							<input
								type="text"
								value={createAddress}
								onChange={event => setCreateAddress(event.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className="text-xs font-semibold">Pemilik</span>
							<select
								value={createOwnerId}
								onChange={event => setCreateOwnerId(event.target.value)}
								required
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
							>
								<option value="">Pilih pengguna…</option>
								{ownerOptions.map(user => (
									<option key={user.id} value={user.id}>
										{user.name || user.email} — {user.email}
									</option>
								))}
							</select>
						</label>
						<div className="flex flex-col gap-2">
							<span className="text-xs font-semibold">Paket</span>
							<div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Paket perusahaan">
								{PLAN_OPTIONS.map(option => {
									const isSelected = createPlan === option.key;
									return (
										<button
											key={option.key}
											type="button"
											role="radio"
											aria-checked={isSelected}
											onClick={() => setCreatePlan(option.key)}
											className={cn(
												'flex flex-col rounded-xl border px-3 py-2.5 text-left transition-colors',
												isSelected
													? 'border-primary bg-accent/50 ring-1 ring-primary/30'
													: 'border-border bg-background hover:border-primary/40',
											)}
										>
											<span className="text-sm font-bold tracking-tight">{option.title}</span>
										</button>
									);
								})}
							</div>
						</div>
						{createError ? (
							<p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
								{createError}
							</p>
						) : null}
						<div className="flex items-center justify-end gap-2 pt-1">
							<button
								type="button"
								onClick={() => setShowCreate(false)}
								className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
							>
								Batal
							</button>
							<button
								type="submit"
								disabled={isCreating}
								className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
							>
								{isCreating ? <Loader2 className="size-3.5 animate-spin" /> : null}
								Tambah perusahaan
							</button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
