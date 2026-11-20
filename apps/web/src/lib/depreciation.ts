import type { Account } from '@/lib/accounting';

export type DepreciationMethod = 'straight_line' | 'reducing_balance' | 'production';

export type FixedAssetStatus =
	| 'pending'
	| 'active'
	| 'fully_depreciated'
	| 'sold'
	| 'disposed';

export interface FixedAsset {
	id: string;
	company: string;
	name: string;
	asset_account: string;
	expense_account: string;
	accum_dep_account: string;
	acquisition_cost: number;
	salvage_value: number;
	acquisition_date: string;
	method: DepreciationMethod;
	useful_life: number;
	rate: number;
	production_capacity: number;
	status: FixedAssetStatus;
	invoice_number?: string;
	source_transaction?: string;
	source_document?: string;
	product?: string;
	disposal_date?: string;
	disposal_notes?: string;
	owner: string;
	created: string;
	expand?: {
		asset_account?: Account;
		expense_account?: Account;
		accum_dep_account?: Account;
		product?: { id: string; name: string; code?: string };
	};
}

export const ASSET_STATUS_LABELS: Record<FixedAssetStatus, string> = {
	pending: 'Tertunda',
	active: 'Aktif',
	fully_depreciated: 'Habis',
	sold: 'Dijual',
	disposed: 'Dilepas',
};

export interface Depreciation {
	id: string;
	company: string;
	fixed_asset: string;
	date: string;
	period_label: string;
	amount: number;
	method: DepreciationMethod;
	units: number;
	debit_entry: string;
	credit_entry: string;
	owner: string;
	created: string;
}

export const METHOD_LABELS: Record<DepreciationMethod, string> = {
	straight_line: 'Straight Line',
	reducing_balance: 'Reducing Balance',
	production: 'Produksi (Units of Production)',
};

export interface AssetRevaluation {
	id: string;
	company: string;
	fixed_asset: string;
	date: string;
	previous_value: number;
	new_value: number;
	adjustment: number;
	revaluation_account: string;
	debit_entry: string;
	credit_entry: string;
	owner: string;
	created: string;
	expand?: {
		revaluation_account?: Account;
	};
}

export const METHOD_SHORT: Record<DepreciationMethod, string> = {
	straight_line: 'Straight Line',
	reducing_balance: 'Reducing Balance',
	production: 'Produksi',
};

/** Nilai buku saat ini = harga perolehan - akumulasi penyusutan. */
export function bookValue(asset: FixedAsset, accumulated: number): number {
	return Math.max(0, (asset.acquisition_cost || 0) - accumulated);
}

/** Penyusutan per tahun — Straight Line. */
export function straightLineAnnual(asset: FixedAsset): number {
	const years = asset.useful_life || 0;
	if (years <= 0) return 0;
	const depreciable = Math.max(0, (asset.acquisition_cost || 0) - (asset.salvage_value || 0));
	return depreciable / years;
}

/** Penyusutan per bulan — Straight Line. */
export function straightLineMonthly(asset: FixedAsset): number {
	return straightLineAnnual(asset) / 12;
}

/** Penyusutan per unit — metode produksi. */
export function productionPerUnit(asset: FixedAsset): number {
	const capacity = asset.production_capacity || 0;
	if (capacity <= 0) return 0;
	const depreciable = Math.max(0, (asset.acquisition_cost || 0) - (asset.salvage_value || 0));
	return depreciable / capacity;
}

/**
 * Hitung nilai penyusutan untuk satu periode dengan metode Reducing Balance.
 * Penyusutan = nilai buku × rate. Tidak boleh menurunkan nilai buku di bawah nilai sisa.
 */
export function reducingBalanceAmount(asset: FixedAsset, accumulated: number): number {
	const rate = (asset.rate || 0) / 100;
	if (rate <= 0) return 0;
	const currentBook = bookValue(asset, accumulated);
	const floor = asset.salvage_value || 0;
	const candidate = currentBook * rate;
	return Math.max(0, Math.min(candidate, currentBook - floor));
}

/** Format label periode YYYY-MM → "Bulan YYYY-MM". */
export function periodLabel(isoDate: string): string {
	return isoDate.slice(0, 7);
}
