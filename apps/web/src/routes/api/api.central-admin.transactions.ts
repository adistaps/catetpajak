import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

type TransactionRecord = {
	id: string;
	company: string;
	category: string;
	date: string;
	description: string;
	amount: number;
	partner: string;
	debit_account: string;
	credit_account: string;
	contact: string;
	product: string;
	quantity: number;
	unit_price: number;
	discount: number;
	tax_rate: number;
	tax_amount: number;
	owner: string;
	created: string;
	warehouse?: string;
	expand?: {
		company?: { id: string; name: string; code?: string };
		debit_account?: { id: string; code: string; name: string };
		credit_account?: { id: string; code: string; name: string };
		contact?: { id: string; name: string };
		product?: { id: string; name: string; code?: string };
	};
};

export type TransactionCategory =
	| 'penjualan'
	| 'pembelian'
	| 'kas_bank'
	| 'aset'
	| 'biaya';

const CATEGORY_VALUES: TransactionCategory[] = [
	'penjualan',
	'pembelian',
	'kas_bank',
	'aset',
	'biaya',
];

export const CATEGORY_LABELS: Record<string, string> = {
	penjualan: 'Penjualan',
	pembelian: 'Pembelian',
	kas_bank: 'Kas & Bank',
	aset: 'Aset',
	biaya: 'Biaya',
	produk: 'Produk / Persediaan',
};

type TransactionListItem = {
	id: string;
	company: { id: string; name: string; code: string };
	category: string;
	date: string;
	description: string;
	amount: number;
	partner: string;
	product: string;
	quantity: number;
	unit_price: number;
	tax_amount: number;
	debit_account: string;
	credit_account: string;
	created: string;
};

type CompanyOption = { id: string; name: string; code: string };

type TransactionsResponse = {
	transactions: TransactionListItem[];
	companies: CompanyOption[];
	summary: {
		total: number;
		totalAmount: number;
		byCategory: { category: string; label: string; count: number; amount: number }[];
		byCompany: { id: string; name: string; count: number; amount: number }[];
	};
};

function escapeFilter(value: string): string {
	return value.replace(/"/g, '\\"');
}

/**
 * POST /api/central-admin/transactions — daftar seluruh transaksi keuangan
 * lintas perusahaan untuk monitoring Admin Pusat, dengan filter perusahaan,
 * kategori, periode, dan pencarian, plus ringkasan agregat.
 *
 * Deliberately non-GET so per-admin responses are never edge-cached.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	const body = await readJsonBody<{
		companyId?: string;
		category?: string;
		dateFrom?: string;
		dateTo?: string;
		search?: string;
		produkOnly?: boolean;
		page?: number;
		perPage?: number;
	}>(request);

	const filters: string[] = [];
	if (body.companyId) {
		filters.push(`company = "${escapeFilter(body.companyId)}"`);
	}
	if (body.category && CATEGORY_VALUES.includes(body.category as TransactionCategory)) {
		filters.push(`category = "${body.category}"`);
	}
	if (body.dateFrom) {
		filters.push(`date >= "${escapeFilter(body.dateFrom.slice(0, 10))}"`);
	}
	if (body.dateTo) {
		filters.push(`date <= "${escapeFilter(body.dateTo.slice(0, 10))}"`);
	}
	if (body.produkOnly) {
		filters.push(`product != ""`);
	}
	const search = (body.search ?? '').trim();
	if (search) {
		const q = escapeFilter(search);
		filters.push(`(description ~ "${q}" || partner ~ "${q}")`);
	}

	const filter = filters.length > 0 ? filters.join(' && ') : '';

	const page = Math.min(Math.max(Number(body.page ?? 1) || 1, 1), 200);
	const perPage = Math.min(Math.max(Number(body.perPage ?? 200) || 200, 1), 1000);

	const [result, companiesResult] = await Promise.all([
		pocketbaseAdmin.listRecords<TransactionRecord>('transactions', {
			page,
			perPage,
			sort: '-date,-created',
			filter,
			expand: 'company,debit_account,credit_account,contact,product',
		}),
		pocketbaseAdmin.listRecords<CompanyOption>('companies', {
			page: 1,
			perPage: 500,
			sort: 'name',
		}),
	]);

	const transactions: TransactionListItem[] = result.items.map(record => ({
		id: record.id,
		company: {
			id: record.expand?.company?.id ?? record.company,
			name: record.expand?.company?.name ?? '—',
			code: record.expand?.company?.code ?? '',
		},
		category: record.category,
		date: record.date,
		description: record.description,
		amount: Number(record.amount) || 0,
		partner: record.partner || record.expand?.contact?.name || '',
		product: record.expand?.product?.name || '',
		quantity: Number(record.quantity) || 0,
		unit_price: Number(record.unit_price) || 0,
		tax_amount: Number(record.tax_amount) || 0,
		debit_account: record.expand?.debit_account
			? `${record.expand.debit_account.code} · ${record.expand.debit_account.name}`
			: '',
		credit_account: record.expand?.credit_account
			? `${record.expand.credit_account.code} · ${record.expand.credit_account.name}`
			: '',
		created: record.created,
	}));

	// Ringkasan agregat dari seluruh halaman data yang cocok (bukan hanya halaman ini).
	const allItems =
		result.totalPages > 1 || result.totalItems > result.items.length
			? await pocketbaseAdmin
					.listRecords<TransactionRecord>('transactions', {
						page: 1,
						perPage: 1000,
						sort: '-date',
						filter,
					})
					.then(r => r.items)
					.catch(() => result.items)
			: result.items;

	const byCategoryMap = new Map<string, { count: number; amount: number }>();
	const byCompanyMap = new Map<string, { name: string; count: number; amount: number }>();
	let totalAmount = 0;
	for (const item of allItems) {
		const amount = Number(item.amount) || 0;
		totalAmount += amount;
		const cat = item.category || 'lainnya';
		const catEntry = byCategoryMap.get(cat) ?? { count: 0, amount: 0 };
		catEntry.count += 1;
		catEntry.amount += amount;
		byCategoryMap.set(cat, catEntry);

		const companyId = item.expand?.company?.id ?? item.company;
		const companyName = item.expand?.company?.name ?? '—';
		const compEntry = byCompanyMap.get(companyId) ?? { name: companyName, count: 0, amount: 0 };
		compEntry.count += 1;
		compEntry.amount += amount;
		byCompanyMap.set(companyId, compEntry);
	}

	const byCategory = [...byCategoryMap.entries()]
		.map(([category, val]) => ({
			category,
			label: CATEGORY_LABELS[category] ?? category,
			count: val.count,
			amount: val.amount,
		}))
		.sort((a, b) => b.amount - a.amount);

	const byCompany = [...byCompanyMap.entries()]
		.map(([id, val]) => ({ id, name: val.name, count: val.count, amount: val.amount }))
		.sort((a, b) => b.amount - a.amount)
		.slice(0, 10);

	const response: TransactionsResponse = {
		transactions,
		companies: companiesResult.items.map(c => ({
			id: c.id,
			name: c.name,
			code: c.code ?? '',
		})),
		summary: {
			total: result.totalItems,
			totalAmount,
			byCategory,
			byCompany,
		},
	};

	return json(response);
});
