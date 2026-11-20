import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Power, RefreshCw, RotateCcw, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	fetchCentralAdminCompanies,
	fetchCentralAdminCompanyFeatureFlags,
	fetchCentralAdminFeatureFlags,
	resetCentralAdminCompanyFeatureFlag,
	updateCentralAdminCompanyFeatureFlag,
	updateCentralAdminFeatureFlag,
	type CentralAdminCompanySummary,
	type CentralAdminFeatureFlag,
} from '@/lib/central-admin';
import type { FeatureCategory } from '@/lib/feature-flags';

const CATEGORY_ORDER: FeatureCategory[] = ['Operasional', 'Akuntansi', 'SDM', 'Lainnya'];

/**
 * Panel pengaturan fitur untuk Admin Pusat. Admin dapat mengonfigurasi modul
 * aplikasi (Payroll, POS, Portal Parent, dll) secara global (default) maupun
 * per perusahaan. Override per perusahaan menang atas default global. Fitur
 * yang dinonaktifkan disembunyikan dari navigasi dan rutenya dijaga — tidak
 * dapat diakses lewat URL langsung.
 */
export function FeatureFlagsPanel() {
	const [scope, setScope] = useState<string>('global');
	const [companies, setCompanies] = useState<CentralAdminCompanySummary[]>([]);
	const [features, setFeatures] = useState<CentralAdminFeatureFlag[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
	const [error, setError] = useState('');
	const [busyFeature, setBusyFeature] = useState<string | null>(null);

	const loadCompanies = useCallback(async () => {
		setIsLoadingCompanies(true);
		try {
			const data = await fetchCentralAdminCompanies();
			setCompanies(data);
		} catch {
			setCompanies([]);
		} finally {
			setIsLoadingCompanies(false);
		}
	}, []);

	const load = useCallback(
		async (isRefresh = false) => {
			if (isRefresh) setIsRefreshing(true);
			else setIsLoading(true);
			setError('');
			try {
				const data =
					scope === 'global'
						? await fetchCentralAdminFeatureFlags()
						: await fetchCentralAdminCompanyFeatureFlags(scope);
				setFeatures(data);
			} catch (err) {
				if (err instanceof CentralAdminApiError) {
					if (err.status === 401) {
						window.location.href = '/login';
						return;
					}
					setError(err.message);
				} else {
					setError('Gagal memuat daftar fitur. Periksa koneksi lalu coba lagi.');
				}
				setFeatures([]);
			} finally {
				setIsLoading(false);
				setIsRefreshing(false);
			}
		},
		[scope],
	);

	useEffect(() => {
		void loadCompanies();
	}, [loadCompanies]);

	useEffect(() => {
		void load();
	}, [load]);

	const grouped = useMemo(() => {
		const list = features ?? [];
		const map = new Map<FeatureCategory, CentralAdminFeatureFlag[]>();
		for (const category of CATEGORY_ORDER) map.set(category, []);
		for (const feature of list) {
			const bucket = map.get(feature.category as FeatureCategory);
			if (bucket) bucket.push(feature);
		}
		return CATEGORY_ORDER.map(category => ({
			category,
			items: map.get(category) ?? [],
		})).filter(group => group.items.length > 0);
	}, [features]);

	const summary = useMemo(() => {
		const list = features ?? [];
		return {
			total: list.length,
			enabled: list.filter(f => f.enabled).length,
			disabled: list.filter(f => !f.enabled).length,
			customized: list.filter(f => f.customized).length,
		};
	}, [features]);

	async function handleToggle(feature: CentralAdminFeatureFlag) {
		const next = !feature.enabled;
		setBusyFeature(feature.feature);
		try {
			if (scope === 'global') {
				const result = await updateCentralAdminFeatureFlag(feature.feature, next);
				setFeatures(prev =>
					prev?.map(item =>
						item.feature === feature.feature ? { ...item, enabled: result.enabled } : item,
					) ?? null,
				);
				toast.success(`${result.label} ${result.enabled ? 'diaktifkan' : 'dinonaktifkan'} (default global).`);
			} else {
				const result = await updateCentralAdminCompanyFeatureFlag(scope, feature.feature, next);
				setFeatures(prev =>
					prev?.map(item =>
						item.feature === feature.feature
							? { ...item, enabled: result.enabled, customized: true }
							: item,
					) ?? null,
				);
				toast.success(`${result.label} ${result.enabled ? 'diaktifkan' : 'dinonaktifkan'} untuk perusahaan ini.`);
			}
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal memperbarui status fitur.',
			);
		} finally {
			setBusyFeature(null);
		}
	}

	async function handleReset(feature: CentralAdminFeatureFlag) {
		setBusyFeature(feature.feature);
		try {
			const result = await resetCentralAdminCompanyFeatureFlag(scope, feature.feature);
			setFeatures(prev =>
				prev?.map(item =>
					item.feature === feature.feature
						? { ...item, enabled: result.enabled, customized: false }
						: item,
				) ?? null,
			);
			toast.success(`${feature.label} dikembalikan ke default global.`);
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal mereset status fitur.',
			);
		} finally {
			setBusyFeature(null);
		}
	}

	const isCompanyScope = scope !== 'global';
	const activeCompany = companies.find(company => company.id === scope) ?? null;

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<Power className="size-7 text-primary" strokeWidth={2} />
						Pengaturan Fitur
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Aktifkan atau nonaktifkan modul aplikasi. Atur default global, lalu sesuaikan per
						perusahaan bila perlu. Fitur nonaktif sembunyi dari navigasi dan rutenya dijaga.
					</p>
				</div>
				<button
					type="button"
					onClick={() => void load(true)}
					disabled={isRefreshing}
					className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
				>
					{isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
					Muat ulang
				</button>
			</header>

			<section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
				<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="feature-scope"
							className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Cakupan pengaturan
						</label>
						<select
							id="feature-scope"
							value={scope}
							onChange={event => setScope(event.target.value)}
							className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2 md:w-80"
						>
							<option value="global">Default global (semua perusahaan)</option>
							{isLoadingCompanies ? (
								<option value="global" disabled>
									Memuat perusahaan…
								</option>
							) : null}
							{companies.map(company => (
								<option key={company.id} value={company.id}>
									{company.name} {company.code ? `(${company.code})` : ''}
								</option>
							))}
						</select>
					</div>
					<p className="text-xs text-muted-foreground">
						{isCompanyScope ? (
							<>
								Mengatur fitur untuk{' '}
								<span className="font-semibold text-foreground">{activeCompany?.name ?? 'perusahaan'}</span>.
								Override menang atas default global.
							</>
						) : (
							'Mengatur default global. Perusahaan tanpa override mengikuti pengaturan ini.'
						)}
					</p>
				</div>
			</section>

			<section className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{[
					{ label: 'Total fitur', value: summary.total },
					{ label: 'Aktif', value: summary.enabled },
					{ label: 'Nonaktif', value: summary.disabled },
					{ label: isCompanyScope ? 'Override kustom' : 'Kustom', value: summary.customized },
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

			{error ? (
				<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
					{error}
				</p>
			) : null}

			{isLoading ? (
				<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat daftar fitur…
				</div>
			) : features && features.length === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-background px-5 py-12 text-center">
					<Building2 className="size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">Belum ada fitur termuat.</p>
				</div>
			) : (
				<div className="flex flex-col gap-6">
					{grouped.map(group => (
						<section
							key={group.category}
							className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft"
						>
							<h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
								{group.category}
							</h2>
							<div className="grid gap-3 md:grid-cols-2">
								{group.items.map(feature => {
									const busy = busyFeature === feature.feature;
									return (
										<div
											key={feature.feature}
											className={cn(
												'flex items-start justify-between gap-3 rounded-xl border bg-background p-4 transition-colors',
												feature.enabled ? 'border-border' : 'border-dashed border-border',
											)}
										>
											<div className="min-w-0">
												<div className="flex flex-wrap items-center gap-1.5">
													<p className="text-sm font-bold text-foreground">{feature.label}</p>
													{isCompanyScope && feature.customized ? (
														<span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-foreground">
															Override
														</span>
													) : null}
												</div>
												<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
													{feature.description}
												</p>
												<span
													className={cn(
														'mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
														feature.enabled
															? 'bg-emerald-50 text-emerald-700'
															: 'bg-secondary text-muted-foreground',
													)}
												>
													{feature.enabled ? 'Aktif' : 'Nonaktif'}
												</span>
											</div>
											<div className="flex shrink-0 flex-col items-end gap-1.5">
												<button
													type="button"
													onClick={() => void handleToggle(feature)}
													disabled={busy}
													aria-pressed={feature.enabled}
													aria-label={`${feature.enabled ? 'Nonaktifkan' : 'Aktifkan'} ${feature.label}`}
													className={cn(
														'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors disabled:opacity-60',
														feature.enabled
															? 'bg-primary text-primary-foreground hover:bg-primary/90'
															: 'border border-border bg-background text-muted-foreground hover:bg-secondary',
													)}
												>
													{busy ? (
														<Loader2 className="size-3.5 animate-spin" />
													) : feature.enabled ? (
														<ToggleRight className="size-3.5" />
													) : (
														<ToggleLeft className="size-3.5" />
													)}
													{feature.enabled ? 'Nonaktifkan' : 'Aktifkan'}
												</button>
												{isCompanyScope && feature.customized ? (
													<button
														type="button"
														onClick={() => void handleReset(feature)}
														disabled={busy}
														className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
													>
														<RotateCcw className="size-3" />
														Reset
													</button>
												) : null}
											</div>
										</div>
									);
								})}
							</div>
						</section>
					))}
				</div>
			)}
		</div>
	);
}
