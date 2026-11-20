export interface Product {
	id: string;
	company: string;
	name: string;
	code: string;
	unit: string;
	price: number;
	cost: number;
	stock: number;
	image?: string;
	barcode?: string;
	category?: string;
	description?: string;
	product_type?: 'barang' | 'jasa' | '';
	buy_enabled?: boolean;
	sell_enabled?: boolean;
	purchase_account?: string;
	sales_account?: string;
	track_stock?: boolean;
	inventory_account?: string;
	buy_tax?: string;
	sell_tax?: string;
	owner: string;
	created: string;
}
