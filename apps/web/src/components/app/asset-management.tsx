import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Archive, Boxes, Clock3, Loader2, Plus, Search, TrendingDown, Trash2 } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	formatDate,
	formatRupiah,
	todayIso,
	type Company,
} from '@/lib/accounting';
import {
	ASSET_STATUS_LABELS,
	bookValue,
	METHOD_SHORT,
	type Depreciation,
	type FixedAsset,
	type FixedAssetStatus,
} from '@/lib/depreciation';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { NoCompany } from '@/components/app/no-company';
import { AssetDepreciation } from '@/components/app/asset-depreciation';
import { AssetInvoiceModal } from '@/components/app/asset-invoice-modal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useLanguage } from '@/hooks/use-language';

type AssetTab = 'pending' | 'active' | 'disposed' | 'depreciation';

const TABS = [
	{ id: 'pending', label: 'Aset Tertunda', icon: Clock3 },
	{ id: 'active', label: 'Aset Aktif', icon: Boxes },
	{ id: 'disposed', label: 'Dijual/Dilepas', icon: Archive },
	{ id: 'depreciation', label: 'Penyusutan', icon: TrendingDown },
] satisfies { id: AssetTab; label: string; icon: typeof Clock3 }[];

function accumulatedFor(assetId: string, depreciations: Depreciation[]): number {
	return depreciations
		.filter(d => d.fixed_asset === assetId)
		.reduce((sum, d) => sum + (d.amount || 0), 0);
}

interface AssetManagementProps {
	activeCompany: Company | null;
}

export function AssetManagement({ activeCompany }: AssetManagementProps) {
	const { t } = useLanguage();
	const [searchParams, setSearchParams] = useSearchParams();
	const tabParam = searchParams.get('tab') as AssetTab | null;
	const activeTab: AssetTab =
		tabParam && TABS.some(t => t.id === tabParam) ? tabParam : 'pending';

	const setTab = (tab: AssetTab) => {
		const next = new URLSearchParams(searchParams);
		next.set('tab', tab);
		setSearchParams(next, { replace: true });
	};

	const [assets, setAssets] = useState<FixedAsset[]>([]);
	const [depreciations, setDepreciations] = useState<Depreciation[]>([]);
	const [query, setQuery] = useState('');
	const debouncedQuery = useDebouncedValue(query.trim().toLowerCase(), 250);
	const [loading, setLoading] = useState(false);
	const [invoiceAsset, setInvoiceAsset] = useState<FixedAsset | null>(null);

	const reload = () => {
		if (!activeCompany) {
			setAssets([]);
			setDepreciations([]);
			return;
		}
		setLoading(true);
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		Promise.all([
			pb.collection('fixed_assets').getFullList<FixedAsset>({
				filter: companyFilter,
				sort: '-acquisition_date,-created',
				expand: 'asset_account,product',
				requestKey: null,
			}),
			pb.collection('depreciations').getFullList<Depreciation>({
				filter: companyFilter,
				sort: '-date',
				requestKey: null,
			}),
		])
			.then(([assetList, depList]) => {
				setAssets(assetList);
				setDepreciations(depList);
			})
			.catch(() => {
				setAssets([]);
				setDepreciations([]);
			})
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		reload();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeCompany?.id]);

	const filtered = useMemo(() => {
		const q = debouncedQuery;
		let list = assets;
		if (activeTab === 'pending') {
			list = assets.filter(a => a.status === 'pending');
		} else if (activeTab === 'active') {
			list = assets.filter(a => a.status === 'active' || a.status === 'fully_depreciated');
		} else if (activeTab === 'disposed') {
			list = assets.filter(a => a.status === 'sold' || a.status === 'disposed');
		}
		if (!q) return list;
		return list.filter(
			a =>
				a.name.toLowerCase().includes(q) ||
				(a.invoice_number || '').toLowerCase().includes(q),
		);
	}, [assets, activeTab, debouncedQuery]);

	const { run: runDelete } = usePendingAction();

	if (!activeCompany) return <NoCompany />;

	const handleExport = () => {
		const rows: (string | number)[][] = [
			['Nama', 'Status', 'Biaya Akuisisi', 'Tanggal', 'Faktur', 'Metode'],
			...assets.map(a => [
				a.name,
				a.status,
				a.acquisition_cost || 0,
				a.acquisition_date?.slice(0, 10) || '',
				a.invoice_number || '',
				a.method || '',
			]),
		];
		exportCsv(timestampedFilename('aset-tetap'), rows);
	};

	const handleDelete = (asset: FixedAsset) => {
		if (!window.confirm(t('asset.delete_confirm', { name: asset.name }))) return;
		void runDelete(asset.id, async () => {
			try {
				await pb.collection('fixed_assets').delete(asset.id, { requestKey: `del-asset-${asset.id}` });
				setAssets(prev => prev.filter(a => a.id !== asset.id));
				toast.success(t('asset.deleted'));
			} catch {
				toast.error(t('asset.delete_failed'));
			}
		});
	};

	const handleDispose = (asset: FixedAsset, kind: 'sold' | 'disposed') => {
		const label = kind === 'sold' ? t('asset.label.sold') : t('asset.label.disposed');
		if (!window.confirm(t('asset.dispose_confirm', { name: asset.name, label }))) return;
		void runDelete(`${asset.id}-${kind}`, async () => {
			try {
				const updated = await pb.collection('fixed_assets').update<FixedAsset>(asset.id, {
					status: kind,
					disposal_date: todayIso(),
				}, { requestKey: `dispose-asset-${asset.id}-${kind}` });
				setAssets(prev => prev.map(a => (a.id === asset.id ? { ...a, ...updated } : a)));
				toast.success(t('asset.disposed_as', { label }));
			} catch {
				toast.error(t('asset.dispose_failed'));
			}
		});
	};

	return (
		<div className="flex flex-col gap-0">
			{/* Header */}
			<div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-1 pb-5">
				<div>
					<p className="text-xs text-muted-foreground">{t('asset.subtitle')}</p>
					<h1 className="mt-0.5 text-2xl font-bold tracking-tight text-primary md:text-3xl">
						{t('asset.title')}
					</h1>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={handleExport}
						className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-bold text-purple-700 transition-colors hover:bg-accent"
					>
						{t('asset.export')}
					</button>
					<Link
						to="/app/aset/daftar"
						className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-colors hover:bg-primary/90"
					>
						<Plus className="size-4" />
						{t('asset.add')}
					</Link>
				</div>
			</div>

			{/* Tabs + search */}
			<div className="mt-4 flex flex-col gap-0">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
					<nav
						className="flex w-full min-w-0 flex-nowrap items-center gap-0 overflow-x-auto rounded-2xl border border-emerald-100 bg-white p-0 shadow-soft-sm md:w-auto"
						aria-label="Tab aset"
					>
						{TABS.map(tab => {
							const Icon = tab.icon;
							const active = activeTab === tab.id;
							return (
								<button
									key={tab.id}
									type="button"
									onClick={() => setTab(tab.id)}
									aria-current={active ? 'page' : undefined}
									className={cn(
										'inline-flex shrink-0 items-center gap-2 px-3.5 py-2 text-sm font-semibold transition-colors',
										active
											? 'rounded-none bg-primary text-primary-foreground shadow-soft-sm'
											: 'rounded-xl text-emerald-900/65 hover:bg-emerald-50 hover:text-emerald-900',
									)}
								>
									<Icon className="size-4" strokeWidth={2} />
									{tab.label === 'Aset Tertunda' ? t('asset.tab.pending') : tab.label === 'Aset Aktif' ? t('asset.tab.active') : tab.label === 'Dijual/Dilepas' ? t('asset.tab.disposed') : t('asset.tab.depreciation')}
								</button>
							);
						})}
					</nav>
					{activeTab !== 'depreciation' ? (
						<div className="relative mb-2 mr-1 mt-2 w-full max-w-xs sm:mb-0 sm:mt-0">
							<input
								type="search"
								value={query}
								onChange={e => setQuery(e.target.value)}
								placeholder={t('asset.search')}
								className="w-full rounded-md border border-border bg-background py-1.5 pl-3 pr-9 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
							<Search className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						</div>
					) : null}
				</div>

				{activeTab === 'depreciation' ? (
					<div className="p-4 md:p-6">
						<AssetDepreciation activeCompany={activeCompany} embedded />
					</div>
				) : (
					<div className="flex flex-col">
						{activeTab === 'pending' ? (
							<div className="border-b border-border px-5 py-4">
								<h2 className="text-lg font-semibold text-foreground">
									Aset Tertunda
								</h2>
								<p className="mt-0.5 text-sm text-muted-foreground">
									Buat invoice untuk mengaktifkan aset &amp; melengkapi pengaturan penyusutan.
								</p>
							</div>
						) : null}

						{/* Table header */}
						<div className="overflow-x-auto">
							<table className="w-full min-w-[720px] text-sm">
								<thead>
									<tr className="bg-primary/10 text-left text-xs font-semibold text-foreground">
										{activeTab === 'pending' ? (
											<>
												<th className="px-5 py-3">Tanggal Akuisisi</th>
												<th className="px-5 py-3">Barang</th>
												<th className="px-5 py-3">Faktur #</th>
												<th className="px-5 py-3 text-right">Biaya Akuisisi</th>
												<th className="px-5 py-3 text-right">Action</th>
											</>
										) : activeTab === 'active' ? (
											<>
												<th className="px-5 py-3">Nama Aset</th>
												<th className="px-5 py-3">Tgl. Perolehan</th>
												<th className="px-5 py-3">Metode</th>
												<th className="px-5 py-3 text-right">Perolehan</th>
												<th className="px-5 py-3 text-right">Nilai Buku</th>
												<th className="px-5 py-3">Status</th>
												<th className="px-5 py-3 text-right">Action</th>
											</>
										) : (
											<>
												<th className="px-5 py-3">Nama Aset</th>
												<th className="px-5 py-3">Tgl. Perolehan</th>
												<th className="px-5 py-3">Tgl. Pelepasan</th>
												<th className="px-5 py-3 text-right">Biaya Akuisisi</th>
												<th className="px-5 py-3">Status</th>
												<th className="px-5 py-3 text-right">Action</th>
											</>
										)}
									</tr>
								</thead>
								<tbody>
									{loading ? (
										<tr>
											<td
												colSpan={7}
												className="px-5 py-12 text-center text-sm text-muted-foreground"
											>
												Memuat…
											</td>
										</tr>
									) : filtered.length === 0 ? (
										<tr>
											<td colSpan={7} className="p-0">
												{activeTab === 'pending' ? (
													<div className="bg-muted/40 px-5 py-14 text-center">
														<p className="text-sm font-medium text-primary">
															Belum ada aset tertunda
														</p>
														<p className="mt-2 text-sm text-muted-foreground">
															Baru saja membeli aset baru?{' '}
															<Link
																to="/app/pembelian/buat"
																className="font-semibold text-primary underline-offset-2 hover:underline"
															>
																Tambahkan di sini
															</Link>
														</p>
														<p className="mt-1 text-sm text-muted-foreground">
															Sudah ada sebelum bermigrasi ke jurnal?{' '}
															<Link
																to="/app/aset/daftar"
																className="font-semibold text-primary underline-offset-2 hover:underline"
															>
																Simpan di sini
															</Link>
														</p>
													</div>
												) : (
													<p className="px-5 py-12 text-center text-sm text-muted-foreground">
														{activeTab === 'active'
															? 'Belum ada aset aktif. Simpan aset tertunda atau daftarkan aset baru.'
															: 'Belum ada aset yang dijual atau dilepas.'}
													</p>
												)}
											</td>
										</tr>
									) : (
										filtered.map(asset => {
											const acc = accumulatedFor(asset.id, depreciations);
											const value = bookValue(asset, acc);
											const statusLabel =
												ASSET_STATUS_LABELS[asset.status as FixedAssetStatus] ||
												asset.status;
											return (
												<tr
													key={asset.id}
													className="border-b border-border last:border-0 hover:bg-muted/30"
												>
													{activeTab === 'pending' ? (
														<>
															<td className="px-5 py-3 tabular-nums text-muted-foreground">
																{formatDate(asset.acquisition_date || '')}
															</td>
															<td className="px-5 py-3 font-medium">
																{asset.name}
																{asset.expand?.product?.code ? (
																	<span className="ml-1 text-xs text-muted-foreground">
																		({asset.expand.product.code})
																	</span>
																) : null}
															</td>
															<td className="px-5 py-3 text-muted-foreground">
																{asset.invoice_number || '—'}
															</td>
															<td className="px-5 py-3 text-right font-semibold tabular-nums">
																{formatRupiah(asset.acquisition_cost || 0)}
															</td>
															<td className="px-5 py-3">
																<div className="flex items-center justify-end gap-2">
																	<button
																		type="button"
																		onClick={() => setInvoiceAsset(asset)}
																		className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
																	>
																		Buat Invoice
																	</button>
																	<Link
																		to={`/app/aset/daftar?pending=${asset.id}`}
																		className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
																	>
																		Ubah
																	</Link>
																	<button
																		type="button"
																		onClick={() => handleDelete(asset)}
																		className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
																		aria-label="Hapus"
																	>
																		<Trash2 className="size-3.5" />
																	</button>
																</div>
															</td>
														</>
													) : activeTab === 'active' ? (
														<>
															<td className="px-5 py-3">
																<p className="font-medium">{asset.name}</p>
																{asset.expand?.asset_account ? (
																	<p className="text-[11px] text-muted-foreground">
																		{asset.expand.asset_account.code} —{' '}
																		{asset.expand.asset_account.name}
																	</p>
																) : null}
															</td>
															<td className="px-5 py-3 tabular-nums text-muted-foreground">
																{formatDate(asset.acquisition_date || '')}
															</td>
															<td className="px-5 py-3 text-muted-foreground">
																{asset.method ? METHOD_SHORT[asset.method] : '—'}
															</td>
															<td className="px-5 py-3 text-right tabular-nums">
																{formatRupiah(asset.acquisition_cost || 0)}
															</td>
															<td className="px-5 py-3 text-right font-semibold tabular-nums">
																{formatRupiah(value)}
															</td>
															<td className="px-5 py-3">
																<span
																	className={cn(
																		'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold',
																		asset.status === 'fully_depreciated'
																			? 'bg-muted text-muted-foreground'
																			: 'bg-primary/10 text-primary',
																	)}
																>
																	{statusLabel}
																</span>
															</td>
															<td className="px-5 py-3">
																<div className="flex flex-wrap items-center justify-end gap-1.5">
																	<button
																		type="button"
																		onClick={() => handleDispose(asset, 'sold')}
																		className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold hover:bg-secondary"
																	>
																		Jual
																	</button>
																	<button
																		type="button"
																		onClick={() => handleDispose(asset, 'disposed')}
																		className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold hover:bg-secondary"
																	>
																		Lepas
																	</button>
																	<button
																		type="button"
																		onClick={() => handleDelete(asset)}
																		className="rounded-md border border-border p-1 text-destructive hover:bg-destructive/10"
																		aria-label="Hapus"
																	>
																		<Trash2 className="size-3.5" />
																	</button>
																</div>
															</td>
														</>
													) : (
														<>
															<td className="px-5 py-3 font-medium">{asset.name}</td>
															<td className="px-5 py-3 tabular-nums text-muted-foreground">
																{formatDate(asset.acquisition_date || '')}
															</td>
															<td className="px-5 py-3 tabular-nums text-muted-foreground">
																{asset.disposal_date
																	? formatDate(asset.disposal_date)
																	: '—'}
															</td>
															<td className="px-5 py-3 text-right tabular-nums">
																{formatRupiah(asset.acquisition_cost || 0)}
															</td>
															<td className="px-5 py-3">
																<span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
																	{statusLabel}
																</span>
															</td>
															<td className="px-5 py-3 text-right">
																<button
																	type="button"
																	onClick={() => handleDelete(asset)}
																	className="rounded-md border border-border p-1 text-destructive hover:bg-destructive/10"
																	aria-label="Hapus"
																>
																	<Trash2 className="size-3.5" />
																</button>
															</td>
														</>
													)}
												</tr>
											);
										})
									)}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>

			{invoiceAsset && activeCompany ? (
				<AssetInvoiceModal
					asset={invoiceAsset}
					activeCompany={activeCompany}
					open={Boolean(invoiceAsset)}
					onClose={() => setInvoiceAsset(null)}
					onCreated={() => {
						setInvoiceAsset(null);
						reload();
						setTab('active');
					}}
				/>
			) : null}
		</div>
	);
}


