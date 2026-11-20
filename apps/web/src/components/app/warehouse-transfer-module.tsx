import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, type Company } from '@/lib/accounting';
import type { Product } from '@/lib/products';
import type {
	Warehouse,
	WarehouseTransfer,
	WarehouseTransferItem,
} from '@/lib/warehouses';
import { getProductStockAt, moveProductStock } from '@/lib/warehouse-stock';
import { NoCompany } from '@/components/app/no-company';
import { ProductTabs } from '@/components/app/product-tabs';
import { useLanguage } from '@/hooks/use-language';

interface WarehouseTransferModuleProps {
	activeCompany: Company | null;
}

interface DraftItem {
	product: string;
	product_name: string;
	quantity: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const EMPTY_ITEM: DraftItem = { product: '', product_name: '', quantity: '1' };

export function WarehouseTransferModule({ activeCompany }: WarehouseTransferModuleProps) {
	const { t } = useLanguage();
	const [transfers, setTransfers] = useState<WarehouseTransfer[]>([]);
	const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [viewing, setViewing] = useState<WarehouseTransfer | null>(null);

	const [fromWarehouse, setFromWarehouse] = useState('');
	const [toWarehouse, setToWarehouse] = useState('');
	const [date, setDate] = useState(todayIso());
	const [description, setDescription] = useState('');
	const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setTransfers([]);
			setWarehouses([]);
			setProducts([]);
			return;
		}
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		pb
			.collection('warehouse_transfers')
			.getFullList<WarehouseTransfer>({
				filter: companyFilter,
				sort: '-date,-created',
				expand: 'from_warehouse,to_warehouse',
				requestKey: `transfers-${activeCompany.id}`,
			})
			.then(list => {
				if (!cancelled) setTransfers(list);
			})
			.catch(() => {});
		pb
			.collection('warehouses')
			.getFullList<Warehouse>({
				filter: companyFilter,
				sort: 'name',
				requestKey: `warehouses-${activeCompany.id}`,
			})
			.then(list => {
				if (!cancelled) {
					setWarehouses(list);
					setFromWarehouse(list[0]?.id ?? '');
					setToWarehouse(list[1]?.id ?? list[0]?.id ?? '');
				}
			})
			.catch(() => {});
		pb
			.collection('products')
			.getFullList<Product>({
				filter: companyFilter,
				sort: 'name',
				requestKey: `products-${activeCompany.id}`,
			})
			.then(list => {
				if (!cancelled) setProducts(list);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	const computedItems = useMemo(
		() =>
			items
				.filter(item => item.product)
				.map(item => ({
					product: item.product,
					product_name: item.product_name,
					quantity: Number(item.quantity) || 0,
				}))
				.filter(item => item.quantity > 0),
		[items],
	);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const openCreate = () => {
		setDate(todayIso());
		setDescription('');
		setItems([{ ...EMPTY_ITEM }]);
		setError('');
		setViewing(null);
		setIsFormOpen(true);
	};

	const closeForm = () => {
		setIsFormOpen(false);
		setError('');
	};

	const updateItem = (index: number, patch: Partial<DraftItem>) => {
		setItems(prev => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
	};

	const handleProductPick = (index: number, productId: string) => {
		const selected = products.find(p => p.id === productId);
		updateItem(index, {
			product: productId,
			product_name: selected?.name ?? '',
		});
	};

	const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
	const removeItem = (index: number) =>
		setItems(prev => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));

	const buildPayload = (status: 'draft' | 'posted') => {
		const seq = transfers.length + 1;
		return {
			company: activeCompany.id,
			from_warehouse: fromWarehouse,
			to_warehouse: toWarehouse,
			number: `TR-${new Date().getFullYear()}-${String(seq).padStart(3, '0')}`,
			date,
			description,
			status,
			items: computedItems as WarehouseTransferItem[],
			owner: pb.authStore.record?.id ?? '',
		};
	};

	const persist = async (status: 'draft' | 'posted') => {
		setError('');
		if (!fromWarehouse || !toWarehouse) {
			setError(t('transfer.from_required'));
			return;
		}
		if (fromWarehouse === toWarehouse) {
			setError(t('transfer.same_warehouse'));
			return;
		}
		if (computedItems.length === 0) {
			setError(t('transfer.need_item'));
			return;
		}
		setIsSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			// Validasi stok sumber cukup sebelum menyimpan (untuk posting).
			if (status === 'posted') {
				for (const item of computedItems) {
					const available = await getProductStockAt(
						activeCompany.id,
						item.product,
						fromWarehouse,
					);
					if (available < item.quantity) {
						const prod = products.find(p => p.id === item.product);
						setError(
							t('transfer.insufficient', { name: prod?.name ?? item.product_name, available, needed: item.quantity }),
						);
						setIsSaving(false);
						return;
					}
				}
			}

			const rec = await pb
				.collection('warehouse_transfers')
				.create<WarehouseTransfer>(buildPayload(status), {
					requestKey: `create-transfer-${Date.now()}`,
				});

			if (status === 'posted') {
				await Promise.all(
					computedItems.map((item, index) =>
						moveProductStock(
							activeCompany.id,
							item.product,
							fromWarehouse,
							toWarehouse,
							item.quantity,
							ownerId,
							`transfer-${rec.id}-${index}`,
						),
					),
				);
			}

			setTransfers(previous =>
				[{ ...rec, expand: { from_warehouse: warehouses.find(w => w.id === fromWarehouse), to_warehouse: warehouses.find(w => w.id === toWarehouse) } }, ...previous].sort(
					(a, b) => b.date.localeCompare(a.date),
				),
			);
			closeForm();
		} catch {
			setError(t('transfer.save_failed'));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (transfer: WarehouseTransfer) => {
		if (!window.confirm(t('transfer.delete_confirm', { name: transfer.number || formatDate(transfer.date) }))) return;
		try {
			await pb.collection('warehouse_transfers').delete(transfer.id, {
				requestKey: `delete-transfer-${transfer.id}`,
			});
			setTransfers(previous => previous.filter(item => item.id !== transfer.id));
			if (viewing?.id === transfer.id) setViewing(null);
		} catch {
			window.alert(t('transfer.delete_failed'));
		}
	};

	const statusBadge = (status: WarehouseTransfer['status']) =>
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
						<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t('transfer.title')}</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							{t('transfer.subtitle')}
						</p>
					</div>
					<button
						type="button"
						onClick={openCreate}
						disabled={warehouses.length < 2 || products.length === 0}
						className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
					>
						<Plus className="size-4" /> {t('transfer.create')}
					</button>
				</div>
				<div className="mt-4">
					<ProductTabs />
				</div>
			</header>

			{warehouses.length < 2 ? (
				<p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
					{t('transfer.need_two')}
				</p>
			) : null}

			{isFormOpen ? (
				<div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-bold">{t('transfer.new')}</h2>
						<button
							type="button"
							onClick={closeForm}
							aria-label="Tutup"
							className="border border-border p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
						>
							<X className="size-4" />
						</button>
					</div>

					<div className="grid gap-4 md:grid-cols-4">
						<div className="flex flex-col gap-2">
							<label htmlFor="tr-from" className="text-xs font-semibold">
								{t('transfer.from')}
							</label>
							<select
								id="tr-from"
								value={fromWarehouse}
								onChange={event => setFromWarehouse(event.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								<option value="">{t('transfer.pick_from')}</option>
								{warehouses.map(warehouse => (
									<option key={warehouse.id} value={warehouse.id}>
										{warehouse.name}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="tr-to" className="text-xs font-semibold">
								{t('transfer.to')}
							</label>
							<select
								id="tr-to"
								value={toWarehouse}
								onChange={event => setToWarehouse(event.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								<option value="">{t('transfer.pick_to')}</option>
								{warehouses.map(warehouse => (
									<option key={warehouse.id} value={warehouse.id}>
										{warehouse.name}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="tr-date" className="text-xs font-semibold">
								{t('transfer.date')}
							</label>
							<input
								id="tr-date"
								type="date"
								required
								value={date}
								onChange={event => setDate(event.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="tr-desc" className="text-xs font-semibold">
								{t('transfer.description')}
							</label>
							<input
								id="tr-desc"
								value={description}
								onChange={event => setDescription(event.target.value)}
								placeholder="Keterangan transfer"
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<h2 className="text-sm font-bold">{t('transfer.items')}</h2>
							<button
								type="button"
								onClick={addItem}
								className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-accent"
							>
								<Plus className="size-3.5" /> {t('transfer.add_item')}
							</button>
						</div>
						<div className="overflow-x-auto rounded-xl border border-border">
							<table className="w-full min-w-[560px] text-sm">
								<thead>
									<tr className="border-b border-border bg-secondary/50 text-left text-[11px] font-semibold uppercase tracking-wide">
										<th className="px-4 py-2.5">{t('transfer.col.product')}</th>
										<th className="px-4 py-2.5 text-right">{t('transfer.col.qty')}</th>
										<th className="px-4 py-2.5" aria-label="Aksi" />
									</tr>
								</thead>
								<tbody>
									{items.map((item, idx) => (
										<tr key={idx} className="border-b border-foreground/10 last:border-0">
											<td className="px-4 py-2">
												<select
													value={item.product}
													onChange={e => handleProductPick(idx, e.target.value)}
													className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
												>
														<option value="">{t('sales.form.pick_product')}</option>
														{products.map(p => (
															<option key={p.id} value={p.id}>
																{p.name} {p.code ? `(${p.code})` : ''}
															</option>
														))}
													</select>
											</td>
											<td className="px-4 py-2 text-right">
												<input
													type="number"
													min="1"
													value={item.quantity}
													onChange={e => updateItem(idx, { quantity: e.target.value })}
													className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm outline-none ring-primary/30 focus:ring-2"
												/>
											</td>
											<td className="px-4 py-2 text-right">
												<button
													type="button"
													onClick={() => removeItem(idx)}
													aria-label="Hapus item"
													className="border border-border p-1 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
												>
													<Trash2 className="size-3.5" />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<button
							type="button"
							onClick={() => persist('draft')}
							disabled={isSaving}
							className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
						>
							{isSaving ? t('warehouse.saving') : t('transfer.save_draft')}
						</button>
						<button
							type="button"
							onClick={() => persist('posted')}
							disabled={isSaving}
							className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
						>
							{t('transfer.post')}
						</button>
						{error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
					</div>
				</div>
			) : null}

			{viewing ? (
				<div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-sm font-bold">{t('transfer.detail')}</h2>
							<p className="text-xs text-muted-foreground">
								{viewing.number} · {formatDate(viewing.date)}
							</p>
							<p className="text-xs text-muted-foreground">
								{viewing.expand?.from_warehouse?.name ?? '—'} → {viewing.expand?.to_warehouse?.name ?? '—'}
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
						<table className="w-full min-w-[420px] text-sm">
							<thead>
								<tr className="border-b border-border bg-secondary/50 text-left text-[11px] font-semibold uppercase tracking-wide">
									<th className="px-4 py-2.5">{t('transfer.col.product')}</th>
									<th className="px-4 py-2.5 text-right">{t('transfer.col.qty')}</th>
								</tr>
							</thead>
							<tbody>
								{(viewing.items ?? []).map(item => (
									<tr key={item.product} className="border-b border-foreground/10 last:border-0">
										<td className="px-4 py-2 font-semibold">{item.product_name}</td>
										<td className="px-4 py-2 text-right">{item.quantity}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : null}

			<section>
				<div className="mb-2 flex items-center justify-between px-1">
					<h2 className="text-[13px] font-semibold text-slate-900">{t('transfer.history')}</h2>
				</div>
				{transfers.length === 0 ? (
					<p className="px-1 py-8 text-sm text-slate-500">
						{t('transfer.empty')}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
							<thead className="sticky top-0 z-20">
								<tr className="text-left text-[13px] font-semibold text-slate-900">
									<th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">{t('transfer.col.number')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('transfer.col.date')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('transfer.col.from')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('transfer.col.to')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('transfer.col.items')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('opname.col.status')}</th>
									<th className="w-12 border-b border-slate-200 px-2 py-2.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{transfers.map(transfer => (
									<tr key={transfer.id} className="hover:bg-slate-50">
										<td className="px-5 py-2 align-middle font-medium whitespace-nowrap">
											<button
												type="button"
												onClick={() => setViewing(transfer)}
												className="text-[#8b5cf6] hover:underline"
											>
												{transfer.number || formatDate(transfer.date)}
											</button>
										</td>
										<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">
											{formatDate(transfer.date)}
										</td>
										<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">
											{transfer.expand?.from_warehouse?.name || '—'}
										</td>
										<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">
											{transfer.expand?.to_warehouse?.name || '—'}
										</td>
										<td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">
											{(transfer.items ?? []).length}
										</td>
										<td className="px-2 py-2 align-middle text-right">{statusBadge(transfer.status)}</td>
										<td className="px-2 py-2 align-middle text-right">
											<button
												type="button"
												onClick={() => handleDelete(transfer)}
												aria-label={`Hapus ${transfer.number || formatDate(transfer.date)}`}
												className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
											>
												<Trash2 className="size-3.5" />
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<p className="text-xs text-muted-foreground">{t('transfer.total', { count: transfers.length })}</p>
		</div>
	);
}
