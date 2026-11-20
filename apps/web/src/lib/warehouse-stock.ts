import pb from '@/lib/pocketbase-client';
import type { ProductStock, StockOpname } from '@/lib/warehouses';
import type { Product } from '@/lib/products';

export interface WarehouseStockOverview extends ProductStock {
	/** Catatan opname lama yang belum memiliki saldo gudang tersimpan. */
	opnameEstimate?: { date: string };
}

/**
 * Mengambil stok sebuah produk di gudang tertentu. Mengembalikan 0 bila belum
 * ada catatan stok (produk belum pernah masuk ke gudang tersebut).
 */
export async function getProductStockAt(
	companyId: string,
	productId: string,
	warehouseId: string,
): Promise<number> {
	try {
		const filter = pb.filter(
			'company = {:company} && product = {:product} && warehouse = {:warehouse}',
			{ company: companyId, product: productId, warehouse: warehouseId },
		);
		const list = await pb.collection('product_stocks').getList<ProductStock>(1, 1, {
			filter,
		});
		return Number(list.items[0]?.quantity ?? 0);
	} catch {
		return 0;
	}
}

/**
 * Mengambil seluruh baris stok per gudang untuk sebuah perusahaan.
 */
export async function loadProductStocks(companyId: string): Promise<ProductStock[]> {
	const filter = pb.filter('company = {:company}', { company: companyId });
	return pb.collection('product_stocks').getFullList<ProductStock>({
		filter,
		expand: 'product,warehouse',
		requestKey: null,
	});
}

/**
 * Saldo tersimpan digunakan bila diperbarui sesudah opname. Opname yang belum
 * tercermin dalam saldo ditampilkan sebagai rujukan, bukan saldo aktual, karena
 * transaksi setelahnya bisa terjadi; tidak ada perubahan data otomatis.
 */
export async function loadWarehouseStockOverview(companyId: string): Promise<WarehouseStockOverview[]> {
	const filter = pb.filter('company = {:company}', { company: companyId });
	const [stocks, opnames, products] = await Promise.all([
		loadProductStocks(companyId),
		pb.collection('stock_opnames').getFullList<StockOpname>({
			filter: pb.filter('company = {:company} && status = "posted" && warehouse != ""', { company: companyId }),
			sort: '-created,-id',
			requestKey: null,
		}),
		pb.collection('products').getFullList<Product>({ filter, requestKey: null }),
	]);
	const productsById = new Map(products.map(product => [product.id, product]));
	const stockByKey = new Map(stocks.map(stock => [`${stock.warehouse}:${stock.product}`, stock]));
	const seen = new Set<string>();
	const estimates: WarehouseStockOverview[] = [];
	for (const opname of opnames) {
		if (opname.company !== companyId || !opname.warehouse || !Array.isArray(opname.items)) continue;
		for (const item of opname.items) {
			const product = productsById.get(item.product);
			const key = `${opname.warehouse}:${item.product}`;
			if (!product || seen.has(key) || item.actual_stock === null || item.actual_stock === undefined || !Number.isFinite(Number(item.actual_stock)) || Number(item.actual_stock) < 0) continue;
			seen.add(key);
			const stock = stockByKey.get(key);
			// Opname yang lebih baru dari saldo bisa jadi belum diterapkan.
			// Jangan mengganti catatan secara diam-diam: tampilkan sebagai rujukan.
			if (stock && stock.updated && opname.created && stock.updated >= opname.created) continue;
			stockByKey.delete(key);
			estimates.push({
				id: `opname-${opname.id}-${item.product}`,
				company: companyId,
				product: product.id,
				warehouse: opname.warehouse,
				quantity: Number(item.actual_stock),
				owner: opname.owner,
				created: opname.created,
				updated: opname.updated,
				expand: { product: { id: product.id, name: product.name, code: product.code, unit: product.unit } },
				opnameEstimate: { date: opname.date },
			});
		}
	}
	return [...stockByKey.values(), ...estimates];
}

/**
 * Menyesuaikan stok produk di gudang tertentu (upsert). `delta` positif untuk
 * menambah, negatif untuk mengurangi. Tidak boleh negatif hasilnya.
 */
export async function adjustProductStock(
	companyId: string,
	productId: string,
	warehouseId: string,
	delta: number,
	ownerId: string,
	requestKey?: string,
): Promise<number> {
	if (!warehouseId || delta === 0) return 0;
	const filter = pb.filter(
		'company = {:company} && product = {:product} && warehouse = {:warehouse}',
		{ company: companyId, product: productId, warehouse: warehouseId },
	);
	const existing = await pb.collection('product_stocks').getList<ProductStock>(1, 1, {
		filter,
		requestKey: requestKey ? `${requestKey}-find` : undefined,
	});
	const current = Number(existing.items[0]?.quantity ?? 0);
	const next = Math.max(0, current + delta);
	if (existing.items[0]) {
		await pb.collection('product_stocks').update(
			existing.items[0].id,
			{ quantity: next },
			{ requestKey: requestKey ? `${requestKey}-upd` : undefined },
		);
	} else {
		await pb.collection('product_stocks').create(
			{
				company: companyId,
				product: productId,
				warehouse: warehouseId,
				quantity: next,
				owner: ownerId,
			},
			{ requestKey: requestKey ? `${requestKey}-crt` : undefined },
		);
	}
	return next;
}

/**
 * Menetapkan stok produk di gudang tertentu ke nilai absolut (upsert).
 * Dipakai stock opname: stok fisik menjadi acuan, bukan delta. Idempoten —
 * menyimpan ulang opname yang sama tidak menambah/mengurangi ganda.
 */
export async function setProductStockAbsolute(
	companyId: string,
	productId: string,
	warehouseId: string,
	quantity: number,
	ownerId: string,
	requestKey?: string,
): Promise<void> {
	if (!warehouseId) return;
	const filter = pb.filter(
		'company = {:company} && product = {:product} && warehouse = {:warehouse}',
		{ company: companyId, product: productId, warehouse: warehouseId },
	);
	const existing = await pb.collection('product_stocks').getList<ProductStock>(1, 1, {
		filter,
		requestKey: requestKey ? `${requestKey}-find` : undefined,
	});
	const next = Math.max(0, Number(quantity) || 0);
	if (existing.items[0]) {
		await pb.collection('product_stocks').update(
			existing.items[0].id,
			{ quantity: next },
			{ requestKey: requestKey ? `${requestKey}-upd` : undefined },
		);
	} else {
		await pb.collection('product_stocks').create(
			{
				company: companyId,
				product: productId,
				warehouse: warehouseId,
				quantity: next,
				owner: ownerId,
			},
			{ requestKey: requestKey ? `${requestKey}-crt` : undefined },
		);
	}
}

/**
 * Memindahkan sejumlah stok produk dari satu gudang ke gudang lain.
 * Mengembalikan false bila stok sumber tidak mencukupi.
 */
export async function moveProductStock(
	companyId: string,
	productId: string,
	fromWarehouseId: string,
	toWarehouseId: string,
	quantity: number,
	ownerId: string,
	requestKey?: string,
): Promise<boolean> {
	if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId || quantity <= 0) {
		return false;
	}
	const available = await getProductStockAt(companyId, productId, fromWarehouseId);
	if (available < quantity) return false;
	await adjustProductStock(
		companyId,
		productId,
		fromWarehouseId,
		-quantity,
		ownerId,
		requestKey ? `${requestKey}-from` : undefined,
	);
	await adjustProductStock(
		companyId,
		productId,
		toWarehouseId,
		quantity,
		ownerId,
		requestKey ? `${requestKey}-to` : undefined,
	);
	return true;
}
