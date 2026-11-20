import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { todayIso } from '@/lib/accounting';
import {
	STAGE_CONFIG,
	DIRECTION_CONFIG,
	buildDocumentNumber,
	computeDocumentTotals,
	type DocumentDirection,
	type DocumentStage,
	type DocumentItem,
} from '@/lib/documents';
import logger from '@/lib/logger.server';

/**
 * POST /api/documents-import — mengimpor dokumen penjualan/pembelian dari
 * baris CSV ke dalam koleksi `documents`. Server memverifikasi akses company,
 * mencegah dokumen ganda (berdasarkan nomor dalam company+direction+stage),
 * memposting jurnal untuk invoice/pembayaran, dan memperbarui stok untuk
 * pengiriman yang dikonfirmasi.
 *
 * Body: { companyId, direction, stage, headers, rows }
 */
interface ImportContact {
	id: string;
	name: string;
	type: string;
}
interface ImportAccount {
	id: string;
	code: string;
	name: string;
	type: string;
}
interface ImportWarehouse {
	id: string;
	name: string;
}
interface ImportProduct {
	id: string;
	name: string;
	code: string;
	stock: number;
}
interface ExistingDoc {
	id: string;
	number: string;
}

function cell(row: string[], headers: string[], name: string): string {
	const idx = headers.indexOf(name);
	return idx >= 0 ? (row[idx] ?? '').trim() : '';
}

function parseItems(raw: string): DocumentItem[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
			.map(item => ({
				product: String(item.product ?? ''),
				name: String(item.name ?? ''),
				code: String(item.code ?? ''),
				quantity: Number(item.quantity) || 0,
				unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0) || 0,
				discount: Number(item.discount) || 0,
				taxRate: Number(item.taxRate ?? item.tax_rate ?? 0) || 0,
				total: Number(item.total) || 0,
			}));
	} catch {
		return [];
	}
}

async function requireCompanyMembership(userId: string, companyId: string): Promise<void> {
	const company = await pocketbaseAdmin
		.getRecord<{ id: string; owner: string }>('companies', companyId)
		.catch(() => null);
	if (!company) throw apiError(404, 'Perusahaan tidak ditemukan.');

	if (company.owner === userId) return;

	const members = await pocketbaseAdmin.listRecords<{
		id: string;
		user: string;
		status: string;
	}>('company_members', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('company = {:companyId} && user = {:userId} && status = "active"', { companyId, userId }),
	});
	if (!members.items[0]) {
		throw apiError(403, 'Anda tidak memiliki akses ke perusahaan ini.');
	}
}

export const action = withApi(async ({ request }) => {
	const userId = await requireUserId(request);
	const body = await readJsonBody<{
		companyId: string;
		direction: DocumentDirection;
		stage: DocumentStage;
		headers: string[];
		rows: string[][];
	}>(request);

	const { companyId, direction, stage, headers, rows } = body;
	if (!companyId) throw apiError(422, 'ID perusahaan wajib diisi.');
	if (direction !== 'penjualan' && direction !== 'pembelian') {
		throw apiError(422, 'Arah dokumen tidak valid.');
	}
	if (!STAGE_CONFIG[stage]) throw apiError(422, 'Tahap dokumen tidak valid.');
	if (!Array.isArray(rows) || rows.length === 0) {
		throw apiError(422, 'Tidak ada baris data untuk diimpor.');
	}

	await requireCompanyMembership(userId, companyId);

	const dir = DIRECTION_CONFIG[direction];
	const stageCfg = STAGE_CONFIG[stage];

	// Muat entitas referensi sekali untuk seluruh batch.
	const [contactsRes, accountsRes, warehousesRes, productsRes, existingRes] = await Promise.all([
		pocketbaseAdmin.listRecords<ImportContact>('contacts', {
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('company = {:companyId} && type = {:contactType}', { companyId, contactType: dir.contactType }),
		}),
		pocketbaseAdmin.listRecords<ImportAccount>('accounts', {
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('company = {:companyId}', { companyId }),
		}),
		pocketbaseAdmin.listRecords<ImportWarehouse>('warehouses', {
			page: 1,
			perPage: 200,
			filter: pocketbaseAdmin.filter('company = {:companyId}', { companyId }),
		}),
		pocketbaseAdmin.listRecords<ImportProduct>('products', {
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('company = {:companyId}', { companyId }),
		}),
		pocketbaseAdmin.listRecords<ExistingDoc>('documents', {
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('company = {:companyId} && direction = {:direction} && stage = {:stage}', { companyId, direction, stage }),
		}),
	]);

	const contacts = contactsRes.items;
	const accounts = accountsRes.items;
	const warehouses = warehousesRes.items;
	const products = productsRes.items;
	const existingNumbers = new Set(
		existingRes.items.map(d => (d.number || '').trim().toLowerCase()).filter(Boolean),
	);

	const findContact = (name: string): ImportContact | undefined => {
		const target = name.trim().toLowerCase();
		if (!target) return undefined;
		return contacts.find(c => (c.name || '').trim().toLowerCase() === target);
	};
	const findAccount = (code: string): ImportAccount | undefined => {
		const target = code.trim().toLowerCase();
		if (!target) return undefined;
		return accounts.find(a => (a.code || '').trim().toLowerCase() === target);
	};
	const findWarehouse = (name: string): ImportWarehouse | undefined => {
		const target = name.trim().toLowerCase();
		if (!target) return undefined;
		return warehouses.find(w => (w.name || '').trim().toLowerCase() === target);
	};
	const findProduct = (item: DocumentItem): ImportProduct | undefined => {
		if (item.product) {
			const byId = products.find(p => p.id === item.product);
			if (byId) return byId;
		}
		if (item.code) {
			const target = item.code.trim().toLowerCase();
			return products.find(p => (p.code || '').trim().toLowerCase() === target);
		}
		return undefined;
	};

	let created = 0;
	let skipped = 0;
	const errors: string[] = [];
	let sequence = existingRes.items.length;

	for (let i = 0; i < rows.length; i += 1) {
		const row = rows[i];
		const number = cell(row, headers, 'Nomor');
		const date = cell(row, headers, 'Tanggal') || todayIso();
		const partnerName = cell(row, headers, 'Pelanggan');
		const description = cell(row, headers, 'Keterangan');
		const statusRaw = cell(row, headers, 'Status').toLowerCase();
		const status = statusRaw === 'draft' ? 'draft' : 'confirmed';
		const itemsRaw = cell(row, headers, 'Items');
		const items = parseItems(itemsRaw);
		const warehouseName = cell(row, headers, 'Gudang');
		const paymentTerms = cell(row, headers, 'Syarat Pembayaran');
		const debitCode = cell(row, headers, 'Akun Debit');
		const creditCode = cell(row, headers, 'Akun Kredit');
		const paidRaw = cell(row, headers, 'Nominal Pembayaran');

		const rowNum = i + 2; // header is row 1

		// Cegah dokumen ganda berdasarkan nomor.
		if (number && existingNumbers.has(number.trim().toLowerCase())) {
			skipped += 1;
			continue;
		}

		const contact = findContact(partnerName);
		const totals = computeDocumentTotals(items);
		let subtotal = Number(cell(row, headers, 'Subtotal')) || totals.subtotal;
		const discountTotal = Number(cell(row, headers, 'Diskon')) || totals.discountTotal;
		const taxTotal = Number(cell(row, headers, 'Pajak')) || totals.taxTotal;
		let total = Number(cell(row, headers, 'Total')) || totals.total;
		let paidAmount = 0;

		if (stageCfg.isPayment) {
			paidAmount = Number(paidRaw) || total;
			// Untuk pembayaran, total = nominal pembayaran.
			if (!paidAmount) paidAmount = total || 0;
			total = paidAmount;
			subtotal = paidAmount;
		}

		if (items.length === 0 && !stageCfg.isPayment) {
			errors.push(`Baris ${rowNum}: tidak ada item, dilewati.`);
			skipped += 1;
			continue;
		}
		if (total <= 0) {
			errors.push(`Baris ${rowNum}: total nol, dilewati.`);
			skipped += 1;
			continue;
		}

		// Akun untuk posting jurnal.
		let debitAccount = '';
		let creditAccount = '';
		if (stageCfg.postsJournal) {
			const debit = findAccount(debitCode);
			const credit = findAccount(creditCode);
			if (!debit) {
				errors.push(`Baris ${rowNum}: akun debit "${debitCode}" tidak ditemukan, dilewati.`);
				skipped += 1;
				continue;
			}
			if (!credit) {
				errors.push(`Baris ${rowNum}: akun kredit "${creditCode}" tidak ditemukan, dilewati.`);
				skipped += 1;
				continue;
			}
			if (debit.id === credit.id) {
				errors.push(`Baris ${rowNum}: akun debit dan kredit sama, dilewati.`);
				skipped += 1;
				continue;
			}
			debitAccount = debit.id;
			creditAccount = credit.id;
		}

		const warehouse = findWarehouse(warehouseName);

		// Susun item dengan product ter-resolve.
		const lineItems: DocumentItem[] = items.map(item => {
			const product = findProduct(item);
			const next = { ...item };
			if (product) {
				next.product = product.id;
				if (!next.name) next.name = product.name;
				if (!next.code) next.code = product.code;
			} else {
				next.product = '';
			}
			// Hitung ulang total baris bila nol.
			if (!next.total) {
				const afterDiscount = Math.max(0, (next.quantity || 0) * (next.unitPrice || 0) - (next.discount || 0));
				next.total = afterDiscount + Math.round((afterDiscount * (next.taxRate || 0)) / 100);
			}
			return next;
		});

		sequence += 1;
		const docNumber = number || buildDocumentNumber(stageCfg.numberPrefix, sequence - 1);
		existingNumbers.add(docNumber.trim().toLowerCase());

		try {
			const docPayload: Record<string, unknown> = {
				company: companyId,
				direction,
				stage,
				number: docNumber,
				date,
				contact: contact?.id || '',
				partner: contact?.name || partnerName,
				description,
				items: lineItems,
				subtotal,
				discount_total: discountTotal,
				tax_total: taxTotal,
				total,
				paid_amount: stageCfg.isPayment ? paidAmount : 0,
				debit_account: stageCfg.postsJournal ? debitAccount : '',
				credit_account: stageCfg.postsJournal ? creditAccount : '',
				status,
				owner: userId,
				warehouse: warehouse?.id || '',
				payment_terms: stage === 'invoice' ? paymentTerms || '' : '',
			};

			const doc = await pocketbaseAdmin.createRecord<{ id: string }>('documents', docPayload);

			// Posting jurnal untuk invoice & pembayaran.
			if (stageCfg.postsJournal && debitAccount && creditAccount) {
				const txCategory = stageCfg.isPayment ? 'kas_bank' : direction;
				const txPayload: Record<string, unknown> = {
					company: companyId,
					category: txCategory,
					date,
					description: description || `${stageCfg.singular} ${docNumber}`,
					amount: paidAmount || total,
					partner: contact?.name || partnerName,
					debit_account: debitAccount,
					credit_account: creditAccount,
					owner: userId,
				};
				if (contact) txPayload.contact = contact.id;
				if (lineItems.length === 1 && lineItems[0].product) {
					txPayload.product = lineItems[0].product;
					txPayload.quantity = lineItems[0].quantity;
					txPayload.unit_price = lineItems[0].unitPrice;
					txPayload.discount = lineItems[0].discount;
					txPayload.tax_rate = lineItems[0].taxRate;
					txPayload.tax_amount =
						lineItems[0].total -
						Math.max(0, lineItems[0].quantity * lineItems[0].unitPrice - lineItems[0].discount);
				}
				const tx = await pocketbaseAdmin.createRecord<{ id: string }>('transactions', txPayload);

				const baseEntry: Record<string, unknown> = {
					company: companyId,
					date,
					description: description || stageCfg.singular,
					owner: userId,
					transaction: tx.id,
				};
				await pocketbaseAdmin.createRecord('entries', {
					...baseEntry,
					account: debitAccount,
					debit: paidAmount || total,
					credit: 0,
				});
				await pocketbaseAdmin.createRecord('entries', {
					...baseEntry,
					account: creditAccount,
					debit: 0,
					credit: paidAmount || total,
				});

				await pocketbaseAdmin.updateRecord('documents', doc.id, { transaction: tx.id });
			}

			// Pengiriman: perbarui stok untuk dokumen yang dikonfirmasi.
			if (stage === 'pengiriman' && status === 'confirmed' && warehouse) {
				const sign = direction === 'pembelian' ? 1 : -1;
				for (let j = 0; j < lineItems.length; j += 1) {
					const item = lineItems[j];
					if (!item.product || item.quantity <= 0) continue;
					try {
						const product = products.find(p => p.id === item.product);
						const current = product?.stock ?? 0;
						const newStock = Math.max(0, current + sign * item.quantity);
						await pocketbaseAdmin.updateRecord('products', item.product, { stock: newStock });
						// Upsert stok per gudang.
						const stockFilter = `company = "${companyId}" && product = "${item.product}" && warehouse = "${warehouse.id}"`;
						const stockList = await pocketbaseAdmin.listRecords<{ id: string; quantity: number }>(
							'product_stocks',
							{ page: 1, perPage: 1, filter: stockFilter },
						);
						const existing = stockList.items[0];
						const nextQty = Math.max(0, (Number(existing?.quantity ?? 0) || 0) + sign * item.quantity);
						if (existing) {
							await pocketbaseAdmin.updateRecord('product_stocks', existing.id, { quantity: nextQty });
						} else {
							await pocketbaseAdmin.createRecord('product_stocks', {
								company: companyId,
								product: item.product,
								warehouse: warehouse.id,
								quantity: nextQty,
								owner: userId,
							});
						}
					} catch (error) {
						logger.error(
							{ error, productId: item.product, docNumber },
							'document import: stock update failed',
						);
					}
				}
			}

			created += 1;
		} catch (error) {
			logger.error({ error, docNumber, rowNum }, 'document import: row failed');
			errors.push(`Baris ${rowNum}: gagal menyimpan (${docNumber}).`);
			skipped += 1;
		}
	}

	logger.info(
		{ userId, companyId, direction, stage, created, skipped },
		'documents import completed',
	);

	return json({ ok: true, created, skipped, errors });
});
