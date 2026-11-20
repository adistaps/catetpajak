import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Trash2 } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, type Company } from '@/lib/accounting';
import type { Product } from '@/lib/products';
import { NoCompany } from '@/components/app/no-company';
import { ProductTabs } from '@/components/app/product-tabs';
import { ImportExportBar } from '@/components/app/import-export-bar';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { useLanguage } from '@/hooks/use-language';

const PRODUCT_EXPORT_HEADERS = ['Nama', 'Kode', 'Satuan', 'Harga Pokok', 'Harga Jual', 'Stok'];

interface ProductModuleProps {
	activeCompany: Company | null;
}

export function ProductModule({ activeCompany }: ProductModuleProps) {
	const { t } = useLanguage();
	const [products, setProducts] = useState<Product[]>([]);

	useEffect(() => {
		if (!activeCompany) {
			setProducts([]);
			return;
		}
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		pb
			.collection('products')
			.getFullList<Product>({ filter: companyFilter, sort: 'name' })
			.then(list => {
				if (!cancelled) setProducts(list);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const handleExport = () => {
		const rows = [PRODUCT_EXPORT_HEADERS, ...products.map(p => [
			p.name,
			p.code ?? '',
			p.unit ?? '',
			String(p.cost ?? 0),
			String(p.price ?? 0),
			String(p.stock ?? 0),
		])];
		exportCsv(timestampedFilename('produk'), rows);
	};

	const handleImport = async (rows: string[][]) => {
		const ownerId = pb.authStore.record?.id ?? '';
		let created = 0;
		let skipped = 0;
		for (const row of rows) {
			const [rawName, rawCode, rawUnit, rawCost, rawPrice, rawStock] = row;
			const name = (rawName ?? '').trim();
			if (!name) { skipped += 1; continue; }
			try {
				const rec = await pb.collection('products').create<Product>(
					{
						company: activeCompany.id,
						name,
						code: (rawCode ?? '').trim(),
						unit: (rawUnit ?? '').trim() || 'pcs',
						cost: Number(rawCost) || 0,
						price: Number(rawPrice) || 0,
						stock: Number(rawStock) || 0,
						owner: ownerId,
					},
					{ requestKey: `import-product-${created}-${name}` },
				);
				setProducts(previous =>
					[...previous, rec].sort((a, b) => a.name.localeCompare(b.name)),
				);
				created += 1;
			} catch {
				skipped += 1;
			}
		}
		if (created === 0) throw new Error('Tidak ada produk baru yang berhasil diimpor.');
		return { created, skipped };
	};

	const handleDelete = async (product: Product) => {
		if (!window.confirm(`Hapus produk ${product.name}?`)) return;
		await pb.collection('products').delete(product.id);
		setProducts(previous => previous.filter(item => item.id !== product.id));
	};

	const totalStockValue = products.reduce(
		(sum, product) => sum + (product.stock || 0) * (product.cost || 0),
		0,
	);

	return (
		<div className="flex flex-col gap-8">
			<header>
				<div className="mt-2">
					<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t('product.title')}</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{t('product.subtitle')}
					</p>
				</div>
				<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
					<ImportExportBar
						importLabel={t('product.import')}
						showImportIcon={false}
						exportLabel={t('product.export')}
						controlVariant="pill"
						onExport={() => handleExport()}
						onImport={async (_headers, rows) => { await handleImport(rows); }}
					/>
					<Link
						to="/app/produk/buat"
						className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						<Plus className="size-4" /> {t('product.create')}
					</Link>
				</div>
				<div className="mt-4">
					<ProductTabs />
				</div>
			</header>

			<section>
				<div className="mb-2 flex items-center justify-between px-1">
					<h2 className="text-[13px] font-semibold text-slate-900">{t('product.list')}</h2>
					<p className="text-xs font-medium text-slate-500">
						{t('product.stock_value')}: <span className="font-semibold text-slate-900">{formatRupiah(totalStockValue)}</span>
					</p>
				</div>
				{products.length === 0 ? (
					<p className="px-1 py-8 text-sm text-slate-500">
						{t('product.empty')}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
							<thead className="sticky top-0 z-20">
								<tr className="text-left text-[13px] font-semibold text-slate-900">
									<th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">{t('product.col.product')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('product.col.code')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('product.col.category')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('product.col.unit')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('product.col.type')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('product.col.monitor')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('product.col.cost')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('product.col.price')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('product.col.stock')}</th>
									<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('product.col.status')}</th>
									<th className="w-12 border-b border-slate-200 px-2 py-2.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{products.map(product => {
									const out = (product.stock || 0) <= 0;
									const typeLabel = product.product_type === 'jasa' ? t('product.type.service') : product.product_type === 'barang' ? t('product.type.goods') : '—';
									return (
										<tr key={product.id} className="hover:bg-slate-50">
											<td className="px-5 py-2 align-middle font-medium whitespace-nowrap">
												<Link to={`/app/produk/ubah/${product.id}`} className="text-[#8b5cf6] hover:underline">{product.name}</Link>
											</td>
											<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">{product.code || '—'}</td>
											<td className="max-w-[160px] truncate px-2 py-2 align-middle" title={product.category || ''}>
												{product.category || '—'}
											</td>
											<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">{product.unit || '—'}</td>
											<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">{typeLabel}</td>
											<td className="px-2 py-2 align-middle whitespace-nowrap">
												<span
													className={
														product.track_stock
															? 'inline-flex rounded-md bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white'
															: 'inline-flex rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700'
													}
												>
													{product.track_stock ? t('product.stock.yes') : t('product.stock.no')}
												</span>
											</td>
											<td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">
												{formatRupiah(product.cost || 0)}
											</td>
											<td className="px-2 py-2 align-middle text-right whitespace-nowrap font-medium tabular-nums">
												{formatRupiah(product.price || 0)}
											</td>
											<td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">
												{product.stock || 0}
											</td>
											<td className="px-2 py-2 align-middle text-right">
												<span
													className={
														out
															? 'inline-flex rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700'
															: 'inline-flex rounded-md bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white'
													}
												>
													{out ? t('product.status.out') : t('product.status.available')}
												</span>
											</td>
											<td className="px-2 py-2 align-middle text-right">
												<button
													type="button"
													onClick={() => handleDelete(product)}
													aria-label={`Hapus ${product.name}`}
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

			<p className="text-xs text-muted-foreground">
				{t('product.total', { count: products.length })} · {formatDate(new Date().toISOString())}
			</p>
		</div>
	);
}
