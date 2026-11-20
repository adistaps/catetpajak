import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { type Company } from '@/lib/accounting';
import type { Warehouse } from '@/lib/warehouses';
import { loadWarehouseStockOverview, type WarehouseStockOverview } from '@/lib/warehouse-stock';
import { NoCompany } from '@/components/app/no-company';
import { ProductTabs } from '@/components/app/product-tabs';
import { useLanguage } from '@/hooks/use-language';

interface WarehouseModuleProps {
	activeCompany: Company | null;
}

interface FormState {
	name: string;
	code: string;
	address: string;
}

const EMPTY_FORM: FormState = { name: '', code: '', address: '' };

export function WarehouseModule({ activeCompany }: WarehouseModuleProps) {
	const { t } = useLanguage();
	const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
	const [productStocks, setProductStocks] = useState<WarehouseStockOverview[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState('');
	const [reloadKey, setReloadKey] = useState(0);
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setWarehouses([]);
			setProductStocks([]);
			return;
		}
		let cancelled = false;
		setIsLoading(true);
		setLoadError('');
		setWarehouses([]);
		setProductStocks([]);
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		Promise.all([
			pb.collection('warehouses').getFullList<Warehouse>({ filter: companyFilter, sort: 'name', requestKey: null }),
			loadWarehouseStockOverview(activeCompany.id),
		]).then(([warehouseList, stockList]) => {
			if (!cancelled) {
				setWarehouses(warehouseList);
				setProductStocks(stockList);
			}
		}).catch(() => {
			if (!cancelled) setLoadError(t('warehouse.load_error'));
		}).finally(() => {
			if (!cancelled) setIsLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, reloadKey]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const openCreate = () => {
		setEditingId(null);
		setForm(EMPTY_FORM);
		setError('');
		setIsFormOpen(true);
	};

	const openEdit = (warehouse: Warehouse) => {
		setEditingId(warehouse.id);
		setForm({
			name: warehouse.name,
			code: warehouse.code ?? '',
			address: warehouse.address ?? '',
		});
		setError('');
		setIsFormOpen(true);
	};

	const closeForm = () => {
		setIsFormOpen(false);
		setEditingId(null);
		setForm(EMPTY_FORM);
		setError('');
	};

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		if (!form.name.trim()) {
			setError(t('warehouse.name_required'));
			return;
		}
		setIsSaving(true);
		try {
			const payload = {
				company: activeCompany.id,
				name: form.name.trim(),
				code: form.code.trim(),
				address: form.address.trim(),
				owner: pb.authStore.record?.id ?? '',
			};
			if (editingId) {
				const rec = await pb
					.collection('warehouses')
					.update<Warehouse>(editingId, payload, { requestKey: `update-warehouse-${editingId}` });
				setWarehouses(previous =>
					[...previous.filter(item => item.id !== editingId), rec].sort((a, b) =>
						a.name.localeCompare(b.name),
					),
				);
			} else {
				const rec = await pb
					.collection('warehouses')
					.create<Warehouse>(payload, { requestKey: `create-warehouse-${Date.now()}` });
				setWarehouses(previous => [...previous, rec].sort((a, b) => a.name.localeCompare(b.name)));
			}
			closeForm();
		} catch {
			setError(t('warehouse.save_failed'));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (warehouse: Warehouse) => {
		if (!window.confirm(t('warehouse.delete_confirm', { name: warehouse.name }))) return;
		try {
			await pb.collection('warehouses').delete(warehouse.id, { requestKey: `delete-warehouse-${warehouse.id}` });
			setWarehouses(previous => previous.filter(item => item.id !== warehouse.id));
		} catch {
			window.alert(t('warehouse.delete_failed'));
		}
	};

	return (
		<div className="flex flex-col gap-8">
			<header>
				<div className="mt-2 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t('warehouse.title')}</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							{t('warehouse.subtitle')}
						</p>
					</div>
					<button
						type="button"
						onClick={openCreate}
						className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						<Plus className="size-4" /> {t('warehouse.add')}
					</button>
				</div>
				<div className="mt-4">
					<ProductTabs />
				</div>
			</header>

			{isFormOpen ? (
				<form
					onSubmit={handleSave}
					className="grid gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft md:grid-cols-3"
				>
					<div className="flex items-center justify-between md:col-span-3">
						<h2 className="text-sm font-bold">{editingId ? t('warehouse.edit') : t('warehouse.new')}</h2>
						<button
							type="button"
							onClick={closeForm}
							aria-label="Tutup"
							className="border border-border p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
						>
							<X className="size-4" />
						</button>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="warehouse-name" className="text-xs font-semibold">
							{t('warehouse.name')}
						</label>
						<input
							id="warehouse-name"
							required
							value={form.name}
							onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))}
							placeholder="Gudang Pusat"
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="warehouse-code" className="text-xs font-semibold">
							{t('warehouse.code')}
						</label>
						<input
							id="warehouse-code"
							value={form.code}
							onChange={event => setForm(previous => ({ ...previous, code: event.target.value }))}
							placeholder="GD-01"
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="warehouse-address" className="text-xs font-semibold">
							{t('warehouse.address')}
						</label>
						<input
							id="warehouse-address"
							value={form.address}
							onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))}
							placeholder="Jl. Industri No. 1"
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
					<div className="md:col-span-3 flex items-center gap-3">
						<button
							type="submit"
							disabled={isSaving}
							className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
						>
							{isSaving ? t('warehouse.saving') : t('warehouse.save')}
						</button>
						{error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
					</div>
				</form>
			) : null}

			{loadError ? (
				<div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
					<span>{loadError}</span>
					<button type="button" onClick={() => setReloadKey(value => value + 1)} className="font-semibold underline">{t('common.retry')}</button>
				</div>
			) : null}
			{isLoading ? <p className="text-sm text-muted-foreground">{t('warehouse.loading')}</p> : null}
			{!isLoading && !loadError ? <>
			<section>
				<div className="mb-2 flex items-center justify-between px-1">
					<h2 className="text-[13px] font-semibold text-slate-900">{t('warehouse.list')}</h2>
				</div>
				{warehouses.length === 0 ? (
					<p className="px-1 py-8 text-sm text-slate-500">
						{t('warehouse.empty')}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
							<thead className="sticky top-0 z-20">
								<tr className="text-left text-[13px] font-semibold text-slate-900">
									<th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">{t('warehouse.col.warehouse')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('warehouse.code')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('warehouse.address')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('warehouse.col.products')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('warehouse.col.stock')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('warehouse.col.status')}</th>
									<th className="w-12 border-b border-slate-200 px-2 py-2.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{warehouses.map(warehouse => {
									const rows = productStocks.filter(
										stock => stock.warehouse === warehouse.id && Number(stock.quantity ?? 0) !== 0,
									);
									const total = rows.reduce((sum, stock) => sum + Number(stock.quantity ?? 0), 0);
									const estimated = productStocks.some(stock => stock.warehouse === warehouse.id && stock.opnameEstimate);
									const empty = total <= 0;
									return (
										<tr key={warehouse.id} className="hover:bg-slate-50">
											<td className="px-5 py-2 align-middle font-medium whitespace-nowrap">
												<button
													type="button"
													onClick={() => openEdit(warehouse)}
													className="text-[#8b5cf6] hover:underline"
												>
													{warehouse.name}
												</button>
											</td>
											<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">{warehouse.code || '—'}</td>
											<td className="max-w-[280px] truncate px-2 py-2 align-middle text-slate-600" title={warehouse.address || ''}>
												{warehouse.address || '—'}
											</td>
											<td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">{estimated ? '~' : ''}{rows.length}</td>
											<td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">{estimated ? '~' : ''}{total}</td>
											<td className="px-2 py-2 align-middle text-right">
												<span
													className={
														empty || estimated
															? 'inline-flex rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700'
															: 'inline-flex rounded-md bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white'
													}
												>
													{estimated ? t('warehouse.status.needs_check') : empty ? t('warehouse.status.empty') : t('warehouse.status.has_stock')}
												</span>
											</td>
											<td className="px-2 py-2 align-middle text-right">
												<button
													type="button"
													onClick={() => handleDelete(warehouse)}
													aria-label={`Hapus ${warehouse.name}`}
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
				{productStocks.some(stock => stock.opnameEstimate) ? (
					<p className="mt-3 hidden px-1 text-xs text-amber-800">~ termasuk hasil opname terakhir yang belum dapat dipastikan sebagai saldo gudang saat ini. Angka tersebut mungkin berubah setelah opname; periksa dan lakukan opname baru untuk memastikan saldo.</p>
				) : null}
			</section>

			<section className="hidden overflow-hidden rounded-2xl border border-emerald-100/80 bg-white">
				<div className="border-b border-emerald-100/90 px-5 py-4 sm:px-6">
					<h2 className="text-[15px] font-bold tracking-tight text-slate-900">Stok per Gudang</h2>
					<p className="mt-1 text-[13px] leading-relaxed text-emerald-900/70">
						Rincian persediaan di setiap gudang. Bertambah saat pembelian, berkurang saat penjualan, berpindah saat transfer.
					</p>
				</div>
				{warehouses.length === 0 ? (
					<p className="px-5 py-8 text-sm text-emerald-900/60 sm:px-6">
						Belum ada gudang untuk perusahaan ini.
					</p>
				) : (
					<div className="flex flex-col divide-y divide-emerald-100/90">
						{warehouses.map(warehouse => {
							const rows = productStocks.filter(
								stock => stock.warehouse === warehouse.id && Number(stock.quantity ?? 0) !== 0,
							);
							const total = rows.reduce((sum, stock) => sum + Number(stock.quantity ?? 0), 0);
							const estimated = productStocks.some(stock => stock.warehouse === warehouse.id && stock.opnameEstimate);
							return (
								<div key={warehouse.id} className="px-5 py-4 sm:px-6">
									<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
										<h3 className="text-[15px] font-bold text-slate-900">{warehouse.name}</h3>
										<span className="text-[13px] font-medium text-emerald-900/65">
											{estimated ? '~' : ''}{rows.length} produk · {estimated ? '~' : ''}{total} unit
										</span>
									</div>
									{rows.length === 0 ? (
										<p className="mt-1.5 text-[13px] text-emerald-900/55">
											Belum ada saldo stok positif yang tercatat di gudang ini.
										</p>
									) : (
										<div className="mt-3 overflow-x-auto">
											<table className="w-full min-w-[420px] text-sm">
												<thead>
													<tr className="border-b border-emerald-100 text-left text-[11px] font-semibold uppercase tracking-wide text-emerald-900/50">
														<th className="py-2 pr-3">Produk</th>
														<th className="px-3 py-2">Kode</th>
														<th className="px-3 py-2 text-right">Stok</th>
													</tr>
												</thead>
												<tbody>
													{rows.map(stock => (
														<tr key={stock.id} className="border-b border-emerald-50 last:border-0">
															<td className="py-2 pr-3 font-semibold text-slate-900">
																{stock.expand?.product?.name ?? '—'}
																{stock.opnameEstimate ? <span className="ml-2 text-xs font-normal text-amber-800">Hasil opname {stock.opnameEstimate.date.slice(0, 10)} · perlu cek</span> : null}
															</td>
															<td className="px-3 py-2 text-emerald-900/60">
																{stock.expand?.product?.code || '—'}
															</td>
															<td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
																{Number(stock.quantity ?? 0)}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</section>

			<p className="text-xs text-muted-foreground">{t('warehouse.total', { count: warehouses.length })}</p>
			</> : null}
		</div>
	);
}
