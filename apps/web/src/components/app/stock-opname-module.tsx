import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, type Company } from '@/lib/accounting';
import type { Product } from '@/lib/products';
import type { StockOpname, StockOpnameItem, Warehouse } from '@/lib/warehouses';
import { loadProductStocks, loadWarehouseStockOverview, type WarehouseStockOverview } from '@/lib/warehouse-stock';
import { NoCompany } from '@/components/app/no-company';
import { ProductTabs } from '@/components/app/product-tabs';
import { useLanguage } from '@/hooks/use-language';

interface StockOpnameModuleProps {
	activeCompany: Company | null;
}

interface DraftItem {
	product: string;
	product_name: string;
	system_stock: string;
	actual_stock: string;
	needsBaseline: boolean;
	opnameEstimate?: number;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function StockOpnameModule({ activeCompany }: StockOpnameModuleProps) {
	const { t } = useLanguage();
	const [opnames, setOpnames] = useState<StockOpname[]>([]);
	const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStockOverview[]>([]);
	const [stockLoadError, setStockLoadError] = useState('');
	const [stocksLoading, setStocksLoading] = useState(true);
	const [referenceDataLoading, setReferenceDataLoading] = useState(true);
	const [referenceDataError, setReferenceDataError] = useState('');
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [viewing, setViewing] = useState<StockOpname | null>(null);

	const [warehouseId, setWarehouseId] = useState('');
	const [date, setDate] = useState(todayIso());
	const [description, setDescription] = useState('');
	const [items, setItems] = useState<DraftItem[]>([]);
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [saveUncertain, setSaveUncertain] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setOpnames([]);
			setWarehouses([]);
			setProducts([]);
			setWarehouseStocks([]);
			setIsFormOpen(false);
			return;
		}
		let cancelled = false;
		setIsFormOpen(false);
		setError('');
		setViewing(null);
		setStocksLoading(true);
		setReferenceDataLoading(true);
		setReferenceDataError('');
		setProducts([]);
		setWarehouses([]);
		setStockLoadError('');
		setWarehouseStocks([]);
		loadWarehouseStockOverview(activeCompany.id).then(list => {
			if (!cancelled) setWarehouseStocks(list);
		}).catch(() => {
			if (!cancelled) setStockLoadError('Stok gudang tidak dapat dimuat. Muat ulang halaman sebelum membuat stock opname.');
		}).finally(() => {
			if (!cancelled) setStocksLoading(false);
		});
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		pb
			.collection('stock_opnames')
			.getFullList<StockOpname>({
				filter: companyFilter,
				sort: '-date',
				expand: 'warehouse',
			})
			.then(list => {
				if (!cancelled) setOpnames(list);
			})
			.catch(() => {});
		Promise.all([
			pb.collection('warehouses').getFullList<Warehouse>({ filter: companyFilter, sort: 'name', requestKey: null }),
			pb.collection('products').getFullList<Product>({ filter: companyFilter, sort: 'name', requestKey: null }),
		]).then(([warehouseList, productList]) => {
			if (!cancelled) {
				setWarehouses(warehouseList);
				setProducts(productList);
			}
		}).catch(() => {
			if (!cancelled) setReferenceDataError('Daftar produk atau gudang tidak dapat dimuat. Muat ulang halaman sebelum membuat stock opname.');
		}).finally(() => {
			if (!cancelled) setReferenceDataLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	const computedItems = useMemo(
		() =>
			items.map(item => {
				const actual = Number(item.actual_stock) || 0;
				return {
					product: item.product,
					product_name: item.product_name,
					system_stock: Number(item.system_stock) || 0,
					actual_stock: actual,
					difference: actual - (Number(item.system_stock) || 0),
				};
			}),
		[items],
	);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const itemsForWarehouse = (selectedWarehouse: string): DraftItem[] => products.map(product => {
		if (!selectedWarehouse) {
			const stock = String(product.stock ?? 0);
			return { product: product.id, product_name: product.name, system_stock: stock, actual_stock: stock, needsBaseline: false };
		}
		const row = warehouseStocks.find(stock => stock.warehouse === selectedWarehouse && stock.product === product.id);
		const needsBaseline = !row || Boolean(row.opnameEstimate);
		const stock = row && !row.opnameEstimate ? String(row.quantity) : '';
		return {
			product: product.id,
			product_name: product.name,
			system_stock: stock,
			actual_stock: stock,
			needsBaseline,
			opnameEstimate: row?.opnameEstimate ? row.quantity : undefined,
		};
	});

	const openCreate = () => {
		if (saveUncertain) return;
		const selectedWarehouse = warehouses[0]?.id ?? '';
		setWarehouseId(selectedWarehouse);
		setDate(todayIso());
		setDescription('');
		setItems(itemsForWarehouse(selectedWarehouse));
		setError('');
		setViewing(null);
		setIsFormOpen(true);
	};

	const closeForm = () => {
		if (isSaving) return;
		setIsFormOpen(false);
		setError('');
	};

	const totalDifference = computedItems.reduce((sum, item) => sum + item.difference, 0);
	const adjustedCount = computedItems.filter(item => item.difference !== 0).length;

	const buildPayload = (status: 'draft' | 'posted') => ({
		company: activeCompany.id,
		warehouse: warehouseId || null,
		date,
		description,
		status,
		items: computedItems as StockOpnameItem[],
		total_difference: totalDifference,
		owner: pb.authStore.record?.id ?? '',
	});

	const persist = async (status: 'draft' | 'posted') => {
		setError('');
		if (isSaving || saveUncertain) return;
		if (!date) {
			setError(t('opname.date') + ' ');
			return;
		}
		if (items.some(item => item.system_stock.trim() === '' || item.actual_stock.trim() === '' || !Number.isFinite(Number(item.system_stock)) || !Number.isFinite(Number(item.actual_stock)) || Number(item.system_stock) < 0 || Number(item.actual_stock) < 0)) {
			setError(t('opname.system_required'));
			return;
		}
		if (status === 'posted' && warehouseId && computedItems.some(item => {
			const total = Number(products.find(product => product.id === item.product)?.stock ?? 0);
			const otherStocks = warehouseStocks.filter(stock => stock.product === item.product && stock.warehouse !== warehouseId && !stock.opnameEstimate).reduce((sum, stock) => sum + Number(stock.quantity || 0), 0);
			return item.system_stock + otherStocks > total || total + item.difference < 0;
		})) {
			setError(t('opname.stock_mismatch'));
			return;
		}
		setIsSaving(true);
		let requestStarted = false;
		try {
			if (status === 'posted') {
				const [freshProducts, freshStocks] = await Promise.all([
					pb.collection('products').getFullList<Product>({ filter: pb.filter('company = {:company}', { company: activeCompany.id }), requestKey: null }),
					loadWarehouseStockOverview(activeCompany.id),
				]);
				const stockKey = (stock: WarehouseStockOverview) => `${stock.warehouse}:${stock.product}:${stock.quantity}:${stock.updated}:${stock.opnameEstimate?.date ?? ''}`;
				const before = warehouseStocks.map(stockKey).sort().join('|');
				const after = freshStocks.map(stockKey).sort().join('|');
				if (before !== after || products.length !== freshProducts.length || products.some(product => !freshProducts.some(fresh => fresh.id === product.id && Number(fresh.stock ?? 0) === Number(product.stock ?? 0)))) {
					setError(t('opname.stock_changed'));
					return;
				}
			}
			if (warehouseId && !warehouses.some(warehouse => warehouse.id === warehouseId && warehouse.company === activeCompany.id)) {
				setError(t('opname.warehouse_invalid'));
				return;
			}
			let rec: StockOpname;
			if (status === 'draft') {
				requestStarted = true;
				rec = await pb.collection('stock_opnames').create<StockOpname>(buildPayload(status), { requestKey: null });
			} else {
				const ownerId = pb.authStore.record?.id ?? '';
				const rawStocks = warehouseId ? await loadProductStocks(activeCompany.id) : [];
				const batch = pb.createBatch();
				batch.collection('stock_opnames').create(buildPayload(status));
				for (const item of computedItems) {
					const product = products.find(candidate => candidate.id === item.product);
					if (!product) throw new Error('Produk tidak ditemukan');
					if (warehouseId) {
						const stock = rawStocks.find(row => row.warehouse === warehouseId && row.product === item.product);
						if (stock) batch.collection('product_stocks').update(stock.id, { quantity: item.actual_stock });
						else batch.collection('product_stocks').create({ company: activeCompany.id, product: item.product, warehouse: warehouseId, quantity: item.actual_stock, owner: ownerId });
					}
					if (item.difference !== 0) {
						const total = warehouseId ? Number(product.stock ?? 0) + item.difference : item.actual_stock;
						batch.collection('products').update(item.product, { stock: total });
					}
				}
				requestStarted = true;
				const result = await batch.send({ requestKey: null });
				rec = result[0].body as StockOpname;
				setProducts(previous => previous.map(product => {
					const item = computedItems.find(candidate => candidate.product === product.id);
					if (!item) return product;
					return { ...product, stock: warehouseId ? Number(product.stock ?? 0) + item.difference : item.actual_stock };
				}));
				try {
					setWarehouseStocks(await loadWarehouseStockOverview(activeCompany.id));
				} catch {
					setStockLoadError('Stok gudang tidak dapat dimuat. Muat ulang halaman sebelum membuat stock opname.');
				}
			}

			setOpnames(previous => [rec, ...previous].sort((a, b) => b.date.localeCompare(a.date)));
			setIsFormOpen(false);
			setError('');
		} catch (failure) {
			const statusCode = typeof failure === 'object' && failure !== null && 'status' in failure ? Number(failure.status) : 0;
			if (requestStarted && (statusCode === 0 || statusCode >= 500)) {
				setSaveUncertain(true);
				setError(t('opname.uncertain'));
			} else {
				setError(t('opname.save_failed'));
			}
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (opname: StockOpname) => {
		if (!window.confirm(t('opname.delete_confirm', { name: opname.number || formatDate(opname.date) }))) return;
		try {
			await pb.collection('stock_opnames').delete(opname.id, { requestKey: `delete-opname-${opname.id}` });
			setOpnames(previous => previous.filter(item => item.id !== opname.id));
			if (viewing?.id === opname.id) setViewing(null);
		} catch {
			window.alert(t('opname.delete_failed'));
		}
	};

	const statusBadge = (status: StockOpname['status']) =>
		status === 'posted' ? (
			<span className="inline-flex rounded-md bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">
				Posted
			</span>
		) : (
			<span className="inline-flex rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
				Draft
			</span>
		);

	return (
		<div className="flex flex-col gap-8">
			<header>
				<div className="mt-2 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t('opname.title')}</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							{t('opname.subtitle')}
						</p>
					</div>
					<button
						type="button"
						onClick={openCreate}
						disabled={products.length === 0 || stocksLoading || referenceDataLoading || Boolean(stockLoadError) || Boolean(referenceDataError) || saveUncertain}
						className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
					>
						<Plus className="size-4" /> {t('opname.create')}
					</button>
				</div>
				<div className="mt-4">
					<ProductTabs />
				</div>
			</header>

			{stockLoadError ? <p role="alert" className="text-sm text-destructive">{stockLoadError}</p> : null}
			{referenceDataError ? <p role="alert" className="text-sm text-destructive">{referenceDataError}</p> : null}
			{saveUncertain && !isFormOpen ? <p role="alert" className="text-sm text-destructive">{t('opname.uncertain')}</p> : null}
			{isFormOpen ? (
				<div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
					<fieldset disabled={isSaving} className="flex flex-col gap-4 disabled:opacity-70">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-bold">{t('opname.new')}</h2>
						<button
							type="button"
							onClick={closeForm}
							aria-label="Tutup"
							className="border border-border p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
						>
							<X className="size-4" />
						</button>
					</div>

					<div className="grid gap-4 md:grid-cols-3">
						<div className="flex flex-col gap-2">
							<label htmlFor="opname-warehouse" className="text-xs font-semibold">
								{t('opname.warehouse')}
							</label>
							<select
								id="opname-warehouse"
								value={warehouseId}
								onChange={event => {
									if (!window.confirm('Mengganti gudang akan mengatur ulang angka pada formulir. Lanjutkan?')) return;
									setWarehouseId(event.target.value);
									setItems(itemsForWarehouse(event.target.value));
								}}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								<option value="">{t('opname.no_warehouse')}</option>
								{warehouses.map(warehouse => (
									<option key={warehouse.id} value={warehouse.id}>
										{warehouse.name}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="opname-date" className="text-xs font-semibold">
								{t('opname.date')}
							</label>
							<input
								id="opname-date"
								type="date"
								required
								value={date}
								onChange={event => setDate(event.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="opname-description" className="text-xs font-semibold">
								{t('opname.description')}
							</label>
							<input
								id="opname-description"
								value={description}
								onChange={event => setDescription(event.target.value)}
								placeholder="Opname akhir bulan"
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
					</div>

					{warehouseId && items.some(item => item.needsBaseline) ? <p className="text-xs text-amber-800">{t('opname.baseline_note')}</p> : null}
					<div className="overflow-x-auto rounded-xl border border-border">
						<table className="w-full min-w-[640px] text-sm">
							<thead>
								<tr className="border-b border-border bg-secondary/50 text-left text-[11px] font-semibold uppercase tracking-wide">
									<th className="px-4 py-2.5">{t('opname.col.product')}</th>
									<th className="px-4 py-2.5 text-right">{t('opname.col.system')}</th>
									<th className="px-4 py-2.5 text-right">{t('opname.col.actual')}</th>
									<th className="px-4 py-2.5 text-right">{t('opname.col.diff')}</th>
								</tr>
							</thead>
							<tbody>
								{computedItems.map((item, index) => (
									<tr key={item.product} className="border-b border-foreground/10 last:border-0">
										<td className="px-4 py-2 font-semibold">{item.product_name}{items[index].opnameEstimate !== undefined ? <span className="block text-xs font-normal text-amber-800">Opname terakhir: {items[index].opnameEstimate} (perlu cek)</span> : null}</td>
										<td className="px-4 py-2 text-right text-muted-foreground">
											{items[index].needsBaseline ? <input type="number" min="0" step="any" aria-label={`Stok sistem sebelumnya ${item.product_name}`} value={items[index].system_stock} onChange={event => setItems(previous => previous.map((row, i) => i === index ? { ...row, system_stock: event.target.value } : row))} className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm outline-none ring-primary/30 focus:ring-2" /> : item.system_stock}
										</td>
										<td className="px-4 py-2 text-right">
											<input
												type="number"
												min="0"
												step="any"
												aria-label={`Stok fisik ${item.product_name}`}
												value={items[index].actual_stock}
												onChange={event =>
													setItems(previous =>
														previous.map((row, i) =>
															i === index ? { ...row, actual_stock: event.target.value } : row,
														),
													)
												}
												className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm outline-none ring-primary/30 focus:ring-2"
											/>
										</td>
										<td
											className={`px-4 py-2 text-right font-semibold ${
												item.difference > 0
													? 'text-primary'
													: item.difference < 0
														? 'text-destructive'
														: 'text-muted-foreground'
											}`}
										>
											{item.difference > 0 ? '+' : ''}
											{item.difference}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">
								{adjustedCount} {t('product.col.product').toLowerCase()} · {t('opname.total_diff')}{' '}
							<span
								className={`font-bold ${
									totalDifference > 0
										? 'text-primary'
										: totalDifference < 0
											? 'text-destructive'
											: 'text-foreground'
								}`}
							>
								{totalDifference > 0 ? '+' : ''}
								{totalDifference}
							</span>
						</p>
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => persist('draft')}
								disabled={isSaving || saveUncertain}
								className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
							>
								{isSaving ? t('warehouse.saving') : t('opname.save_draft')}
							</button>
							<button
								type="button"
								onClick={() => persist('posted')}
								disabled={isSaving || saveUncertain}
								className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
							>
								{t('opname.post')}
							</button>
						</div>
					</div>
					</fieldset>
					{error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
				</div>
			) : null}

			{viewing ? (
				<div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-sm font-bold">{t('opname.detail')}</h2>
							<p className="text-xs text-muted-foreground">
								{formatDate(viewing.date)} · {viewing.expand?.warehouse?.name ?? 'Tanpa gudang'}
							</p>
						</div>
						<div className="flex items-center gap-2">
							{statusBadge(viewing.status)}
							<button
								type="button"
								onClick={() => setViewing(null)}
								aria-label="Tutup"
								className="border border-border p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							>
								<X className="size-4" />
							</button>
						</div>
					</div>
					{viewing.description ? (
						<p className="text-sm text-muted-foreground">{viewing.description}</p>
					) : null}
					<div className="overflow-x-auto rounded-xl border border-border">
						<table className="w-full min-w-[640px] text-sm">
							<thead>
								<tr className="border-b border-border bg-secondary/50 text-left text-[11px] font-semibold uppercase tracking-wide">
									<th className="px-4 py-2.5">Produk</th>
									<th className="px-4 py-2.5 text-right">Stok Sistem</th>
									<th className="px-4 py-2.5 text-right">Stok Fisik</th>
									<th className="px-4 py-2.5 text-right">Selisih</th>
								</tr>
							</thead>
							<tbody>
								{(viewing.items ?? []).map(item => (
									<tr key={item.product} className="border-b border-foreground/10 last:border-0">
										<td className="px-4 py-2 font-semibold">{item.product_name}</td>
										<td className="px-4 py-2 text-right text-muted-foreground">
											{item.system_stock}
										</td>
										<td className="px-4 py-2 text-right">{item.actual_stock}</td>
										<td
											className={`px-4 py-2 text-right font-semibold ${
												item.difference > 0
													? 'text-primary'
													: item.difference < 0
														? 'text-destructive'
														: 'text-muted-foreground'
											}`}
										>
											{item.difference > 0 ? '+' : ''}
											{item.difference}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : null}

			<section data-stock-opname-history="product-list">
				<div className="mb-2 flex items-center justify-between px-1">
					<h2 className="text-[13px] font-semibold text-slate-900">{t('opname.history')}</h2>
				</div>
				{opnames.length === 0 ? (
					<p className="px-1 py-8 text-sm text-slate-500">
						{t('opname.empty')}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
							<thead className="sticky top-0 z-20">
								<tr className="text-left text-[13px] font-semibold text-slate-900">
									<th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">{t('opname.col.number')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('opname.col.date')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('opname.col.warehouse')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('opname.description')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('opname.col.total_diff')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('opname.col.status')}</th>
									<th className="w-12 border-b border-slate-200 px-2 py-2.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{opnames.map(opname => {
									const diff = opname.total_difference ?? 0;
									return (
										<tr key={opname.id} className="hover:bg-slate-50">
											<td className="px-5 py-2 align-middle font-medium whitespace-nowrap">
												<button
													type="button"
													onClick={() => setViewing(opname)}
													className="text-[#8b5cf6] hover:underline"
												>
													{opname.number || formatDate(opname.date)}
												</button>
											</td>
											<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">
												{formatDate(opname.date)}
											</td>
											<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">
												{opname.expand?.warehouse?.name || '—'}
											</td>
											<td className="max-w-[280px] truncate px-2 py-2 align-middle text-slate-600" title={opname.description || ''}>
												{opname.description || '—'}
											</td>
											<td
												className={`px-2 py-2 align-middle text-right whitespace-nowrap font-medium tabular-nums ${
													diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-800'
												}`}
											>
												{diff > 0 ? '+' : ''}
												{diff}
											</td>
											<td className="px-2 py-2 align-middle text-right">{statusBadge(opname.status)}</td>
											<td className="px-2 py-2 align-middle text-right">
												<button
													type="button"
													onClick={() => handleDelete(opname)}
													aria-label={`Hapus ${opname.number || formatDate(opname.date)}`}
													className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
												>
													<Trash2 className="size-3.5" />
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<p className="text-xs text-muted-foreground">{t('opname.total', { count: opnames.length })}</p>
		</div>
	);
}
