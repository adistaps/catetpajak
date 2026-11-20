import pb from '@/lib/pocketbase-client';

/**
 * Metode penilaian persediaan untuk produk yang monitor stoknya aktif.
 * Pilihan istilah mengikuti permintaan pengguna; ejaan antarmuka yang jelas
 * dipetakan lewat INVENTORY_METHOD_LABELS.
 */
export type InventoryMethod = 'fifo' | 'average' | 'reducing_balance' | 'production_per_unit';

/** Pengaturan metode persediaan per perusahaan. */
export interface InventorySettings {
	id: string;
	company: string;
	method: InventoryMethod;
	is_active: boolean;
	owner: string;
	created: string;
	updated: string;
}

/** Nilai awal: aktif dengan metode FIFO (paling umum). */
export const DEFAULT_INVENTORY_SETTINGS = {
	method: 'fifo' as InventoryMethod,
	is_active: true,
};

/** Label antarmuka yang jelas untuk tiap metode. */
export const INVENTORY_METHOD_LABELS: Record<InventoryMethod, string> = {
	fifo: 'FIFO (First In, First Out)',
	average: 'Average (Rata-rata Berbobot)',
	reducing_balance: 'Reducing Balance (Saldo Menurun)',
	production_per_unit: 'Produksi per Unit',
};

/** Deskripsi singkat tiap metode untuk tampilan pengaturan. */
export const INVENTORY_METHOD_DESCRIPTIONS: Record<InventoryMethod, string> = {
	fifo: 'Stok yang masuk lebih dulu dianggap terjual lebih dulu. HPP memakai harga beli paling lama.',
	average: 'HPP memakai rata-rata berbobot dari seluruh stok yang tersedia.',
	reducing_balance: 'Nilai persediaan diturunkan bertahap; HPP memakai harga pokok produk.',
	production_per_unit: 'HPP dihitung berdasarkan biaya produksi per unit produk.',
};

export const INVENTORY_METHOD_OPTIONS: InventoryMethod[] = [
	'fifo',
	'average',
	'reducing_balance',
	'production_per_unit',
];

/** Lapisan pembelian (kartu stok) untuk satu produk: qty + harga pokok satuan. */
export interface InventoryLayer {
	quantity: number;
	unitCost: number;
}

const settingsInFlight = new Map<string, Promise<InventorySettings>>();

/** Ambil atau buat pengaturan persediaan untuk perusahaan aktif. */
export async function getOrCreateInventorySettings(
	companyId: string,
	ownerId: string,
): Promise<InventorySettings> {
	const existing = settingsInFlight.get(companyId);
	if (existing) return existing;

	const promise = (async () => {
		const filter = pb.filter('company = {:c}', { c: companyId });
		try {
			return await pb
				.collection('inventory_settings')
				.getFirstListItem<InventorySettings>(filter);
		} catch {
			try {
				return await pb.collection('inventory_settings').create<InventorySettings>(
					{
						company: companyId,
						...DEFAULT_INVENTORY_SETTINGS,
						owner: ownerId,
					},
					{ requestKey: `inventory-settings-${companyId}` },
				);
			} catch {
				// Race: permintaan paralel membuat record yang sama (company unik).
				return pb
					.collection('inventory_settings')
					.getFirstListItem<InventorySettings>(filter);
			}
		}
	})();

	settingsInFlight.set(companyId, promise);
	promise.finally(() => {
		if (settingsInFlight.get(companyId) === promise) {
			settingsInFlight.delete(companyId);
		}
	});
	return promise;
}

/** Ambil pengaturan persediaan hanya untuk dibaca. Mengembalikan null bila belum ada. */
export async function fetchInventorySettings(
	companyId: string,
): Promise<InventorySettings | null> {
	try {
		const filter = pb.filter('company = {:c}', { c: companyId });
		return await pb
			.collection('inventory_settings')
			.getFirstListItem<InventorySettings>(filter);
	} catch {
		return null;
	}
}

/** Simpan pengaturan persediaan. */
export async function saveInventorySettings(
	id: string,
	data: { method: InventoryMethod; is_active: boolean },
): Promise<InventorySettings> {
	return pb.collection('inventory_settings').update<InventorySettings>(id, data);
}

/**
 * Mengambil lapisan pembelian (kartu stok) per produk dari dokumen pembelian
 * (invoice & pengiriman) perusahaan, urut dari yang paling lama. Dipakai
 * untuk metode FIFO dan Average. Mengembalikan map productId -> layers.
 */
export async function fetchPurchaseLayers(
	companyId: string,
): Promise<Map<string, InventoryLayer[]>> {
	const layers = new Map<string, InventoryLayer[]>();
	try {
		const filter = pb.filter(
			'company = {:c} && direction = "pembelian" && (stage = "invoice" || stage = "pengiriman")',
			{ c: companyId },
		);
		const docs = await pb.collection('documents').getFullList<{
			date: string;
			items?: Array<{ product?: string; quantity?: number; unitPrice?: number }>;
		}>({
			filter,
			sort: 'date,created',
			fields: 'date,items',
			requestKey: `inventory-layers-${companyId}`,
		});
		for (const doc of docs) {
			const items = Array.isArray(doc.items) ? doc.items : [];
			for (const item of items) {
				if (!item.product || !item.quantity || item.quantity <= 0) continue;
				const unitCost = Number(item.unitPrice) || 0;
				const list = layers.get(item.product) ?? [];
				list.push({ quantity: Number(item.quantity), unitCost });
				layers.set(item.product, list);
			}
		}
	} catch {
		// Gagal mengambil lapisan → fallback ke harga pokok produk.
	}
	return layers;
}

/**
 * Menghitung total HPP untuk sebuah produk persediaan berdasarkan metode
 * yang dipilih. `layers` urut dari yang paling lama (untuk FIFO) dan
 * mencakup seluruh pembelian tersedia. Bila lapisan tidak tersedia atau
 * metode tidak berbasis lapisan, fallback ke harga pokok produk (cost).
 *
 * Metode:
 * - fifo: konsumsi lapisan dari yang tertua.
 * - average: rata-rata berbobot seluruh stok tersedia.
 * - reducing_balance: harga pokok produk (tidak berbasis lapisan).
 * - production_per_unit: harga pokok produk (biaya produksi per unit).
 */
export function computeCogsForProduct(
	method: InventoryMethod,
	product: { cost?: number },
	quantity: number,
	layers: InventoryLayer[],
): number {
	const qty = Math.max(0, Number(quantity) || 0);
	if (qty <= 0) return 0;
	const fallbackCost = Number(product.cost) || 0;

	if (method === 'fifo') {
		if (layers.length === 0) {
			return fallbackCost > 0 ? Math.round(fallbackCost * qty) : 0;
		}
		let remaining = qty;
		let total = 0;
		for (const layer of layers) {
			if (remaining <= 0) break;
			const take = Math.min(remaining, layer.quantity);
			total += Math.round(take * (layer.unitCost || 0));
			remaining -= take;
		}
		// Bila stok pembelian kurang dari qty terjual, sisa memakai harga pokok produk.
		if (remaining > 0 && fallbackCost > 0) {
			total += Math.round(remaining * fallbackCost);
		}
		return total;
	}

	if (method === 'average') {
		if (layers.length === 0) {
			return fallbackCost > 0 ? Math.round(fallbackCost * qty) : 0;
		}
		const totalQty = layers.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
		const totalCost = layers.reduce(
			(sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
			0,
		);
		if (totalQty <= 0) {
			return fallbackCost > 0 ? Math.round(fallbackCost * qty) : 0;
		}
		const avg = totalCost / totalQty;
		return Math.round(avg * qty);
	}

	// reducing_balance & production_per_unit: berbasis harga pokok produk.
	return fallbackCost > 0 ? Math.round(fallbackCost * qty) : 0;
}
