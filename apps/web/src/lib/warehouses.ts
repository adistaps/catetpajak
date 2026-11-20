export interface Warehouse {
	id: string;
	company: string;
	name: string;
	code: string;
	address: string;
	owner: string;
	created: string;
	updated: string;
}

export interface StockOpnameItem {
	product: string;
	product_name: string;
	system_stock: number;
	actual_stock: number;
	difference: number;
}

export interface StockOpname {
	id: string;
	company: string;
	warehouse: string;
	number: string;
	date: string;
	description: string;
	status: 'draft' | 'posted';
	items: StockOpnameItem[];
	total_difference: number;
	owner: string;
	created: string;
	updated: string;
	expand?: { warehouse?: Warehouse };
}

export interface ProductStock {
	id: string;
	company: string;
	product: string;
	warehouse: string;
	quantity: number;
	owner: string;
	created: string;
	updated: string;
	expand?: { product?: ProductLite; warehouse?: Warehouse };
}

export interface ProductLite {
	id: string;
	name: string;
	code: string;
	unit: string;
}

export interface WarehouseTransferItem {
	product: string;
	product_name: string;
	quantity: number;
}

export interface WarehouseTransfer {
	id: string;
	company: string;
	from_warehouse: string;
	to_warehouse: string;
	number: string;
	date: string;
	description: string;
	status: 'draft' | 'posted';
	items: WarehouseTransferItem[];
	owner: string;
	created: string;
	updated: string;
	expand?: { from_warehouse?: Warehouse; to_warehouse?: Warehouse };
}
