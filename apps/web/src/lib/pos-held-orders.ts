/**
 * Item keranjang yang ditahan (held). Bentuk ini dapat diserialisasi ke
 * localStorage tanpa referensi PocketBase langsung.
 */
export interface HeldCartItem {
	product: string;
	name: string;
	code: string;
	quantity: number;
	unitPrice: number;
	discount: number;
	taxRate: number;
	total: number;
	stock: number;
}

export interface HeldOrder {
	id: string;
	label: string;
	cart: HeldCartItem[];
	customerId: string;
	warehouseId: string;
	paymentAccountId: string;
	taxRate: number;
	tableId: string;
	createdAt: string;
}

const KEY_PREFIX = 'pos-held-orders-';

function storage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function key(companyId: string): string {
	return `${KEY_PREFIX}${companyId}`;
}

export function loadHeldOrders(companyId: string): HeldOrder[] {
	const store = storage();
	if (!store) return [];
	try {
		const raw = store.getItem(key(companyId));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as HeldOrder[]) : [];
	} catch {
		return [];
	}
}

export function saveHeldOrders(companyId: string, orders: HeldOrder[]): void {
	const store = storage();
	if (!store) return;
	try {
		store.setItem(key(companyId), JSON.stringify(orders));
	} catch {
		/* penyimpanan penuh atau tidak tersedia — abaikan */
	}
}

export function addHeldOrder(companyId: string, order: HeldOrder): HeldOrder[] {
	const next = [order, ...loadHeldOrders(companyId)];
	saveHeldOrders(companyId, next);
	return next;
}

export function removeHeldOrder(companyId: string, id: string): HeldOrder[] {
	const next = loadHeldOrders(companyId).filter(o => o.id !== id);
	saveHeldOrders(companyId, next);
	return next;
}

/** ID meja yang sedang ditahan oleh pesanan tertahan untuk perusahaan ini. */
export function heldTableIds(companyId: string): string[] {
	const ids = loadHeldOrders(companyId)
		.map(o => o.tableId)
		.filter((id): id is string => Boolean(id));
	return Array.from(new Set(ids));
}
