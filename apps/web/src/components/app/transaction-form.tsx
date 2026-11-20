import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	createNumberedJournalLines,
	describeSaveError,
	journalIsBalanced,
	rollbackTransaction,
	type JournalLineDraft,
} from '@/lib/journal-numbers';
import {
	formatRupiah,
	isCashAccount,
	todayIso,
	type Account,
	type AccountType,
	type Company,
} from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import type { Product } from '@/lib/products';
import type { Transaction } from '@/lib/transactions';
import type { Warehouse } from '@/lib/warehouses';
import type { TransactionModuleConfig } from '@/data/transaction-modules';
import { loadTaxTypes, type TaxType } from '@/lib/tax';
import { adjustProductStock } from '@/lib/warehouse-stock';
import { NoCompany } from '@/components/app/no-company';
import { AmountInput } from '@/components/ui/amount-input';

function pickDefaultAccount(accounts: Account[], pref: AccountType[]): string {
	for (const type of pref) {
		const found = accounts.find(account => account.type === type);
		if (found) return found.id;
	}
	return accounts[0]?.id ?? '';
}

interface SplitLine {
	key: string;
	accountId: string;
	description: string;
	taxTypeId: string;
	taxRate: string;
	amount: string;
}

function newSplitLine(accountId = ''): SplitLine {
	return {
		key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		accountId,
		description: '',
		taxTypeId: '',
		taxRate: '0',
		amount: '',
	};
}

function lineMoney(line: SplitLine) {
	const amount = Number(line.amount) || 0;
	const taxRate = Number(line.taxRate) || 0;
	const taxAmount = Math.round((amount * taxRate) / 100);
	return { amount, taxRate, taxAmount, total: amount + taxAmount };
}

function SplitLineEditor({
	title,
	accountPlaceholder,
	lines,
	accounts,
	taxTypes,
	onChange,
	single = false,
}: {
	title: string;
	accountPlaceholder: string;
	lines: SplitLine[];
	accounts: Account[];
	taxTypes: TaxType[];
	onChange: (lines: SplitLine[]) => void;
	single?: boolean;
}) {
	const fieldClass =
		'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2';
	const total = lines.reduce((sum, line) => sum + lineMoney(line).total, 0);
	const gridCols = single
		? 'grid-cols-[1.35fr_1.35fr_1fr_0.95fr]'
		: 'grid-cols-[1.35fr_1.35fr_1fr_0.95fr_2.75rem]';

	return (
		<div className="flex flex-col gap-2 md:col-span-6">
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs font-semibold">{title}</p>
				{single ? null : (
					<button
						type="button"
						onClick={() => onChange([...lines, newSplitLine()])}
						className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-bold text-primary hover:bg-primary/10"
					>
						<Plus className="size-3.5" /> Tambah baris
					</button>
				)}
			</div>
			<div className="overflow-x-auto rounded-xl border border-border">
				<div className="min-w-[680px]">
					<div className={`${gridCols} bg-primary/10 px-2 py-2.5 text-xs font-bold`}>
						<span className="px-1">Akun</span>
						<span className="px-1">Deskripsi</span>
						<span className="px-1">Pajak</span>
						<span className="px-1">Jumlah</span>
						{single ? null : <span />}
					</div>
					{lines.map(line => (
						<div
							key={line.key}
							className={`${gridCols} items-center gap-2 border-t border-border px-2 py-2`}
						>
							<select
								aria-label={accountPlaceholder}
								value={line.accountId}
								onChange={event =>
									onChange(
										lines.map(item =>
											item.key === line.key ? { ...item, accountId: event.target.value } : item,
										),
									)
								}
								className={fieldClass}
							>
								<option value="">{accountPlaceholder}</option>
								{accounts.map(account => (
									<option key={account.id} value={account.id}>
										{account.code} — {account.name}
									</option>
								))}
							</select>
							<textarea
								aria-label="Deskripsi"
								rows={1}
								value={line.description}
								onChange={event =>
									onChange(
										lines.map(item =>
											item.key === line.key ? { ...item, description: event.target.value } : item,
										),
									)
								}
								placeholder="Deskripsi"
								className={`${fieldClass} min-h-10 resize-y`}
							/>
							<select
								aria-label="Pilih pajak"
								value={line.taxTypeId}
								onChange={event => {
									const taxTypeId = event.target.value;
									const tax = taxTypes.find(item => item.id === taxTypeId);
									onChange(
										lines.map(item =>
											item.key === line.key
												? { ...item, taxTypeId, taxRate: String(tax?.rate ?? 0) }
												: item,
										),
									);
								}}
								className={fieldClass}
							>
								<option value="">Pilih pajak</option>
								{taxTypes.map(tax => (
									<option key={tax.id} value={tax.id}>
										{tax.name} ({Number(tax.rate || 0)}%)
									</option>
								))}
							</select>
							<div className="flex items-center rounded-lg border border-border bg-background ring-primary/30 focus-within:ring-2">
								<span className="pl-3 text-sm text-muted-foreground">Rp</span>
								<AmountInput
									aria-label="Jumlah"
									value={line.amount}
									onValueChange={v =>
										onChange(
											lines.map(item =>
												item.key === line.key ? { ...item, amount: String(v) } : item,
											),
										)
									}
									placeholder="0,00"
									className="w-full bg-transparent px-2 py-2 text-sm outline-none"
								/>
							</div>
							{single ? null : (
								<button
									type="button"
									aria-label="Hapus baris"
									disabled={lines.length === 1}
									onClick={() => onChange(lines.filter(item => item.key !== line.key))}
									className="inline-flex size-9 items-center justify-center rounded-lg text-primary hover:bg-primary/10 disabled:opacity-30"
								>
									<Minus className="size-4" strokeWidth={2.5} />
								</button>
							)}
						</div>
					))}
				</div>
			</div>
			<p className="text-right text-xs text-muted-foreground">
				Total {title}: <span className="font-bold text-foreground">{formatRupiah(total)}</span>
			</p>
		</div>
	);
}

interface LineTotals {
	quantity: number;
	unitPrice: number;
	subtotal: number;
	discount: number;
	taxRate: number;
	taxAmount: number;
	total: number;
}

function computeLineTotals(
	quantityStr: string,
	unitPriceStr: string,
	discountStr: string,
	taxRateStr: string,
): LineTotals {
	const quantity = Number(quantityStr) || 0;
	const unitPrice = Number(unitPriceStr) || 0;
	const discount = Number(discountStr) || 0;
	const taxRate = Number(taxRateStr) || 0;
	const subtotal = quantity * unitPrice;
	const afterDiscount = Math.max(0, subtotal - discount);
	const taxAmount = Math.round((afterDiscount * taxRate) / 100);
	const total = afterDiscount + taxAmount;
	return { quantity, unitPrice, subtotal, discount, taxRate, taxAmount, total };
}

interface TransactionFormProps {
	config: TransactionModuleConfig;
	activeCompany: Company | null;
}

export function TransactionForm({ config, activeCompany }: TransactionFormProps) {
	const navigate = useNavigate();
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [taxTypes, setTaxTypes] = useState<TaxType[]>([]);
	const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

	const [date, setDate] = useState(todayIso());
	const [partner, setPartner] = useState('');
	const [contact, setContact] = useState('');
	const [product, setProduct] = useState('');
	const [warehouseId, setWarehouseId] = useState('');
	const [description, setDescription] = useState('');
	const [amount, setAmount] = useState('');
	const [quantity, setQuantity] = useState('1');
	const [unitPrice, setUnitPrice] = useState('');
	const [discount, setDiscount] = useState('0');
	const [taxRate, setTaxRate] = useState('0');
	const [taxTypeId, setTaxTypeId] = useState('');
	const [debitAccount, setDebitAccount] = useState('');
	const [creditAccount, setCreditAccount] = useState('');
	const accountChoices = config.key === 'kas_bank' ? accounts.filter(isCashAccount) : accounts;
	const [debitLines, setDebitLines] = useState<SplitLine[]>(() => [newSplitLine()]);
	const [creditLines, setCreditLines] = useState<SplitLine[]>(() => [newSplitLine()]);
	const [asFixedAsset, setAsFixedAsset] = useState(false);
	const [invoiceNumber, setInvoiceNumber] = useState('');
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const savingRef = useRef(false);

	useEffect(() => {
		if (!activeCompany) {
			setAccounts([]);
			setContacts([]);
			setProducts([]);
			setTaxTypes([]);
			setWarehouses([]);
			return;
		}
		let cancelled = false;
		const ownerId = pb.authStore.record?.id || activeCompany.owner;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		const tasks: Promise<unknown>[] = [
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code' }),
		];
		if (config.contactType) {
			const contactFilter = pb.filter('company = {:company} && type = {:type}', {
				company: activeCompany.id,
				type: config.contactType,
			});
			tasks.push(
				pb.collection('contacts').getFullList<Contact>({ filter: contactFilter, sort: 'name' }),
			);
		}
		if (config.allowProduct) {
			tasks.push(
				pb.collection('products').getFullList<Product>({ filter: companyFilter, sort: 'name' }),
			);
			tasks.push(
				pb.collection('warehouses').getFullList<Warehouse>({ filter: companyFilter, sort: 'name' }),
			);
		}
		if ((config.allowProduct || config.key === 'biaya') && ownerId) {
			tasks.push(loadTaxTypes(activeCompany.id, ownerId, { activeOnly: true }));
		}
		Promise.all(tasks)
			.then(results => {
				if (cancelled) return;
				const accountList = results[0] as Account[];
				setAccounts(accountList);
				if (config.contactType) setContacts(results[1] as Contact[]);
				if (config.allowProduct) {
					const productIdx = config.contactType ? 2 : 1;
					const warehouseIdx = productIdx + 1;
					const typeIdx = warehouseIdx + 1;
					setProducts((results[productIdx] as Product[]) ?? []);
					const warehouseList = (results[warehouseIdx] as Warehouse[]) ?? [];
					setWarehouses(warehouseList);
					setWarehouseId(prev => prev || warehouseList[0]?.id || '');
					const types = (results[typeIdx] as TaxType[]) ?? [];
					setTaxTypes(types);
					setTaxTypeId(prev => {
						if (prev && types.some(t => t.id === prev)) return prev;
						const zero = types.find(t => Number(t.rate) === 0) || types[0];
						if (zero) {
							setTaxRate(String(zero.rate ?? 0));
							return zero.id;
						}
						return '';
					});
				}
				const selectable =
					config.key === 'kas_bank' ? accountList.filter(isCashAccount) : accountList;
				const defaultDebit = pickDefaultAccount(selectable, config.debitPref);
				const defaultCredit = pickDefaultAccount(selectable, config.creditPref);
				setDebitAccount(previous =>
					previous && selectable.some(account => account.id === previous)
						? previous
						: defaultDebit,
				);
				setCreditAccount(previous =>
					previous && selectable.some(account => account.id === previous)
						? previous
						: defaultCredit,
				);
				if (config.key === 'biaya') {
					const typeIdx = (config.contactType ? 2 : 1);
					const types = (results[typeIdx] as TaxType[]) ?? [];
					if (Array.isArray(types) && types.every(item => item && 'rate' in item)) {
						setTaxTypes(types);
					}
					setDebitLines(previous =>
						previous.some(line => line.accountId)
							? previous
							: [{ ...newSplitLine(defaultDebit) }],
					);
					setCreditLines(previous =>
						previous.some(line => line.accountId)
							? previous
							: [{ ...newSplitLine(defaultCredit) }],
					);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, config]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const totals = computeLineTotals(quantity, unitPrice, discount, taxRate);
	const lineTotal = config.allowProduct ? totals.total : Number(amount) || 0;

	const handleProductChange = (productId: string) => {
		setProduct(productId);
		const selected = products.find(item => item.id === productId);
		if (selected) {
			const basePrice = config.key === 'penjualan' ? selected.price : selected.cost;
			setUnitPrice(String(basePrice || 0));
		}
	};

	const isExpense = config.key === 'biaya';

	const resolveSplit = (lines: SplitLine[], fallbackAmount: number, fallbackAccount: string) => {
		const kept = lines.filter(line => line.accountId || Number(line.amount) > 0);
		const base = kept.length > 0 ? kept : lines.slice(0, 1);
		if (!base.some(line => Number(line.amount) > 0) && base[0] && fallbackAmount > 0) {
			return [
				{
					...base[0],
					accountId: base[0].accountId || fallbackAccount,
					amount: String(fallbackAmount),
				},
			];
		}
		return base;
	};

	const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (savingRef.current) return;
		setError('');
		const nominal = Number(amount) || 0;
		const expenseDebits = isExpense ? resolveSplit(debitLines, nominal || lineTotal, debitAccount) : [];
		const expenseDebitTotal = expenseDebits.reduce((sum, line) => sum + lineMoney(line).total, 0);
		const expenseCredits = isExpense
			? resolveSplit(creditLines, expenseDebitTotal || nominal, creditAccount)
			: [];
		const expenseCreditTotal = expenseCredits.reduce((sum, line) => sum + lineMoney(line).total, 0);
		const postedTotal = isExpense ? expenseDebitTotal : lineTotal;

		if (isExpense) {
			if (expenseDebits.some(line => !line.accountId) || expenseCredits.some(line => !line.accountId)) {
				setError('Pilih akun pada setiap baris beban dan sumber kredit.');
				return;
			}
			if (expenseDebitTotal <= 0) {
				setError('Isi jumlah pada baris akun beban.');
				return;
			}
			if (expenseDebitTotal !== expenseCreditTotal) {
				setError('Total akun beban dan sumber kredit harus sama.');
				return;
			}
		} else if (!debitAccount || !creditAccount) {
			setError('Pilih akun debit dan kredit terlebih dahulu.');
			return;
		} else if (
			config.key === 'kas_bank' &&
			(!accounts.some(account => account.id === debitAccount && isCashAccount(account)) ||
				!accounts.some(account => account.id === creditAccount && isCashAccount(account)))
		) {
			setError('Akun debit dan kredit harus akun kas atau bank.');
			return;
		} else if (debitAccount === creditAccount) {
			setError('Akun debit dan kredit tidak boleh sama.');
			return;
		} else if (lineTotal <= 0) {
			setError('Nominal total harus lebih dari 0.');
			return;
		}
		if (config.contactType && !config.contactOptional && !contact) {
			setError(`Pilih ${config.contactType === 'customer' ? 'pelanggan' : 'pemasok'} terlebih dahulu.`);
			return;
		}
		if (config.key === 'pembelian' && asFixedAsset && !product && !description.trim()) {
			setError('Isi nama aset di deskripsi atau pilih barang/produk.');
			return;
		}
		const ownerId = pb.authStore.record?.id ?? '';
		if (!ownerId) {
			setError('Sesi login tidak ditemukan. Masuk kembali, lalu coba simpan.');
			return;
		}
		const note = description || config.title;
		const planned: JournalLineDraft[] = [];
		if (isExpense) {
			const taxAccount = accounts.find(account => /ppn.*masukan|pajak masukan/i.test(account.name));
			for (const line of expenseDebits) {
				const money = lineMoney(line);
				const lineNote = line.description || note;
				const foldTax = !taxAccount || taxAccount.id === line.accountId;
				planned.push({
					account: line.accountId,
					description: lineNote,
					debit: foldTax ? money.total : money.amount,
					credit: 0,
				});
				if (!foldTax && money.taxAmount > 0 && taxAccount) {
					planned.push({
						account: taxAccount.id,
						description: `Pajak ${lineNote}`,
						debit: money.taxAmount,
						credit: 0,
					});
				}
			}
			for (const line of expenseCredits) {
				const money = lineMoney(line);
				planned.push({
					account: line.accountId,
					description: line.description || note,
					debit: 0,
					credit: money.total,
				});
			}
		} else {
			planned.push(
				{ account: debitAccount, description: note, debit: lineTotal, credit: 0 },
				{ account: creditAccount, description: note, debit: 0, credit: lineTotal },
			);
		}
		if (!journalIsBalanced(planned)) {
			setError('Jurnal tidak seimbang. Transaksi tidak disimpan.');
			return;
		}

		savingRef.current = true;
		setIsSaving(true);
		let createdTxId = '';
		try {
			const contactRecord = contacts.find(item => item.id === contact);
			const txPayload: Record<string, unknown> = {
				company: activeCompany.id,
				category: config.key,
				date,
				description,
				amount: postedTotal,
				partner: contactRecord?.name ?? partner,
				debit_account: isExpense ? expenseDebits[0]?.accountId : debitAccount,
				credit_account: isExpense ? expenseCredits[0]?.accountId : creditAccount,
				owner: ownerId,
			};
			if (config.contactType) {
				txPayload.contact = contact || null;
			}
			if (isExpense) {
				txPayload.expense_detail = {
					debitLines: expenseDebits.map(line => ({ ...line, ...lineMoney(line) })),
					creditLines: expenseCredits.map(line => ({ ...line, ...lineMoney(line) })),
				};
			}
			if (config.allowProduct) {
				txPayload.product = product || null;
				txPayload.quantity = totals.quantity;
				txPayload.unit_price = totals.unitPrice;
				txPayload.discount = totals.discount;
				txPayload.tax_rate = totals.taxRate;
				txPayload.tax_amount = totals.taxAmount;
				txPayload.warehouse = warehouseId || null;
			}
			const tx = await pb.collection('transactions').create<Transaction>(txPayload, {
				requestKey: `tx-create-${activeCompany.id}-${Date.now()}`,
			});
			createdTxId = tx.id;
			try {
				await createNumberedJournalLines({
					companyId: activeCompany.id,
					date,
					ownerId,
					transactionId: tx.id,
					lines: planned,
					requestKeyPrefix: `tx-entries-${tx.id}`,
				});
			} catch (entryError) {
				try {
					await rollbackTransaction(tx.id);
					createdTxId = '';
				} catch {
					setError(
						'Jurnal gagal dicatat dan transaksi tidak berhasil dibatalkan. Jangan simpan ulang sebelum memeriksa daftar transaksi.',
					);
					return;
				}
				throw entryError;
			}
			createdTxId = '';

			if (config.allowProduct && product && totals.quantity > 0 && !(config.key === 'pembelian' && asFixedAsset)) {
				try {
					const current = products.find(item => item.id === product)?.stock ?? 0;
					const delta = config.key === 'pembelian' ? totals.quantity : -totals.quantity;
					const newStock = Math.max(0, current + delta);
					await pb.collection('products').update(product, { stock: newStock });
					if (warehouseId) {
						await adjustProductStock(
							activeCompany.id,
							product,
							warehouseId,
							delta,
							ownerId,
							`tx-${tx.id}`,
						);
					}
				} catch {
					/* stok gagal diperbarui — transaksi tetap tersimpan */
				}
			}

			if (config.key === 'pembelian' && asFixedAsset) {
				try {
					const productName =
						products.find(item => item.id === product)?.name ||
						description ||
						'Aset dari pembelian';
					await pb.collection('fixed_assets').create(
						{
							company: activeCompany.id,
							name: productName,
							acquisition_cost: lineTotal,
							salvage_value: 0,
							acquisition_date: date,
							status: 'pending',
							invoice_number: invoiceNumber || undefined,
							source_transaction: tx.id,
							product: product || undefined,
							asset_account: debitAccount || undefined,
							owner: ownerId,
						},
						{ requestKey: `pending-asset-${tx.id}` },
					);
					navigate('/app/aset?tab=pending');
					return;
				} catch {
					/* aset tertunda gagal — transaksi tetap tersimpan */
				}
			}

			navigate(`/app/${config.key === 'kas_bank' ? 'kas-bank' : config.key}`);
		} catch (err) {
			if (createdTxId) {
				try {
					await rollbackTransaction(createdTxId);
				} catch {
					setError(
						'Penyimpanan gagal di tengah jalan. Periksa daftar transaksi sebelum menyimpan ulang agar tidak ganda.',
					);
					return;
				}
			}
			setError(describeSaveError(err));
		} finally {
			savingRef.current = false;
			setIsSaving(false);
		}
	};

	const contactLabel = config.contactType
		? config.contactType === 'customer'
			? 'Pelanggan'
			: 'Pemasok'
		: null;

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-col gap-3">
				<Link
					to={`/app/${config.key === 'kas_bank' ? 'kas-bank' : config.key}`}
					className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Kembali ke {config.title}
				</Link>
				<div>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
						Catat {config.title}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">{config.subtitle}</p>
				</div>
			</header>

			<form
				onSubmit={handleCreate}
				className={`grid gap-4 p-6 md:grid-cols-6 md:items-end ${
					config.key === 'kas_bank'
						? 'bg-transparent'
						: 'rounded-2xl border border-border bg-card shadow-soft'
				}`}
			>
				<div className="flex flex-col gap-2">
					<label htmlFor="tx-date" className="text-xs font-semibold">
						Tanggal
					</label>
					<input
						id="tx-date"
						type="date"
						required
						value={date}
						onChange={event => setDate(event.target.value)}
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>

				{contactLabel ? (
					<div className="flex flex-col gap-2 md:col-span-2">
						<label htmlFor="tx-contact" className="text-xs font-semibold">
							{contactLabel}
							{config.contactOptional ? (
								<span className="font-normal text-muted-foreground"> (opsional)</span>
							) : null}
						</label>
						<select
							id="tx-contact"
							value={contact}
							onChange={event => setContact(event.target.value)}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						>
							<option value="">Pilih {contactLabel.toLowerCase()}</option>
							{contacts.map(item => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
					</div>
				) : config.partnerLabel ? (
					<div className="flex flex-col gap-2 md:col-span-2">
						<label htmlFor="tx-partner" className="text-xs font-semibold">
							{config.partnerLabel}
						</label>
						<input
							id="tx-partner"
							value={partner}
							onChange={event => setPartner(event.target.value)}
							placeholder={config.partnerLabel}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
				) : null}

				{config.allowProduct ? (
					<div className="flex flex-col gap-2 md:col-span-3">
						<label htmlFor="tx-product" className="text-xs font-semibold">
							{config.key === 'pembelian' && asFixedAsset ? 'Barang / Aset' : 'Produk'}
						</label>
						<select
							id="tx-product"
							value={product}
							onChange={event => handleProductChange(event.target.value)}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						>
							<option value="">
								{config.key === 'pembelian' && asFixedAsset
									? 'Pilih barang (opsional)'
									: 'Pilih produk'}
							</option>
							{products.map(item => (
								<option key={item.id} value={item.id}>
									{item.name} {item.code ? `(${item.code})` : ''} · stok {item.stock || 0}
								</option>
							))}
						</select>
					</div>
				) : null}

				{config.key === 'pembelian' ? (
					<div className="flex flex-col gap-2 md:col-span-6">
						<label className="inline-flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-primary/5 px-4 py-3">
							<input
								type="checkbox"
								checked={asFixedAsset}
								onChange={event => setAsFixedAsset(event.target.checked)}
								className="mt-0.5 size-4 rounded border-border text-primary"
							/>
							<span>
								<span className="block text-sm font-semibold text-foreground">
									Pembelian aset tetap
								</span>
								<span className="mt-0.5 block text-xs text-muted-foreground">
									Catat sebagai aset tertunda di menu Aset (tidak menambah stok produk). Lengkapi
									metode penyusutan lewat &quot;Simpan Aset&quot;.
								</span>
							</span>
						</label>
					</div>
				) : null}

				{config.key === 'pembelian' && asFixedAsset ? (
					<div className="flex flex-col gap-2 md:col-span-2">
						<label htmlFor="tx-invoice" className="text-xs font-semibold">
							Faktur #
						</label>
						<input
							id="tx-invoice"
							value={invoiceNumber}
							onChange={event => setInvoiceNumber(event.target.value)}
							placeholder="Nomor faktur pemasok"
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
				) : null}

				{config.allowProduct && !(config.key === 'pembelian' && asFixedAsset) ? (
					<div className="flex flex-col gap-2 md:col-span-2">
						<label htmlFor="tx-warehouse" className="text-xs font-semibold">
							Gudang
						</label>
						<select
							id="tx-warehouse"
							value={warehouseId}
							onChange={event => setWarehouseId(event.target.value)}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						>
							<option value="">Tanpa gudang</option>
							{warehouses.map(item => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
					</div>
				) : null}

				{config.allowProduct ? (
					<>
						<div className="flex flex-col gap-2">
							<label htmlFor="tx-qty" className="text-xs font-semibold">
								Qty
							</label>
							<input
								id="tx-qty"
								type="number"
								min="1"
								required
								value={quantity}
								onChange={event => setQuantity(event.target.value)}
								placeholder="1"
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="tx-price" className="text-xs font-semibold">
								Harga Satuan (Rp)
							</label>
							<AmountInput
								id="tx-price"
								required
								value={unitPrice}
								onValueChange={v => setUnitPrice(String(v))}
								placeholder="0"
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="tx-discount" className="text-xs font-semibold">
								Diskon (Rp)
							</label>
							<AmountInput
								id="tx-discount"
								value={discount}
								onValueChange={v => setDiscount(String(v))}
								placeholder="0"
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="tx-tax" className="text-xs font-semibold">
								Pajak
							</label>
							{taxTypes.length > 0 ? (
								<select
									id="tx-tax"
									value={taxTypeId}
									onChange={event => {
										const id = event.target.value;
										setTaxTypeId(id);
										const t = taxTypes.find(x => x.id === id);
										setTaxRate(String(t?.rate ?? 0));
									}}
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								>
									{taxTypes.map(t => (
										<option key={t.id} value={t.id}>
											{t.name} ({Number(t.rate || 0)}%)
										</option>
									))}
								</select>
							) : (
								<input
									id="tx-tax"
									type="number"
									min="0"
									value={taxRate}
									onChange={event => setTaxRate(event.target.value)}
									placeholder="0"
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							)}
							{taxTypes.length === 0 ? (
								<p className="text-[10px] text-muted-foreground">
									Atur jenis pajak di menu Pajak → Pengaturan.
								</p>
							) : null}
						</div>
					</>
				) : (
					<div className="flex flex-col gap-2 md:col-span-2">
						<label htmlFor="tx-amount" className="text-xs font-semibold">
							Nominal (Rp)
						</label>
						<AmountInput
							id="tx-amount"
							required={!isExpense}
							value={amount}
							onValueChange={v => setAmount(String(v))}
							placeholder="0"
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
				)}

				<div className="flex flex-col gap-2 md:col-span-2">
					<label htmlFor="tx-description" className="text-xs font-semibold">
						Keterangan
					</label>
					<input
						id="tx-description"
						value={description}
						onChange={event => setDescription(event.target.value)}
						placeholder="Keterangan transaksi"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>

				{config.allowProduct ? (
					<div className="flex flex-col justify-end gap-1 rounded-xl bg-secondary px-4 py-3 text-xs md:col-span-2">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Subtotal</span>
							<span className="font-semibold">{formatRupiah(totals.subtotal)}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Diskon</span>
							<span className="font-semibold">- {formatRupiah(totals.discount)}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Pajak ({totals.taxRate}%)</span>
							<span className="font-semibold">{formatRupiah(totals.taxAmount)}</span>
						</div>
						<div className="mt-1 flex justify-between border-t border-border pt-1">
							<span className="font-bold">Total</span>
							<span className="font-extrabold text-primary">{formatRupiah(totals.total)}</span>
						</div>
					</div>
				) : null}

				{isExpense ? (
					<>
						<SplitLineEditor
							title={config.debitLabel}
							accountPlaceholder="Pilih akun biaya"
							lines={debitLines}
							accounts={accounts}
							taxTypes={taxTypes}
							onChange={setDebitLines}
						/>
						<SplitLineEditor
							title={config.creditLabel}
							accountPlaceholder="Pilih sumber kredit"
							lines={creditLines}
							accounts={accounts}
							taxTypes={taxTypes}
							onChange={setCreditLines}
							single
						/>
					</>
				) : (
					<>
						<div className="flex flex-col gap-2 md:col-span-3">
							<label htmlFor="tx-debit" className="text-xs font-semibold">
								{config.debitLabel}
							</label>
							<select
								id="tx-debit"
								value={debitAccount}
								onChange={event => setDebitAccount(event.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								{accountChoices.length === 0 ? (
									<option value="">
										{config.key === 'kas_bank' ? 'Belum ada akun kas/bank' : 'Belum ada akun'}
									</option>
								) : null}
								{accountChoices.map(account => (
									<option key={account.id} value={account.id}>
										{account.code} — {account.name}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-2 md:col-span-3">
							<label htmlFor="tx-credit" className="text-xs font-semibold">
								{config.creditLabel}
							</label>
							<select
								id="tx-credit"
								value={creditAccount}
								onChange={event => setCreditAccount(event.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								{accountChoices.length === 0 ? (
									<option value="">
										{config.key === 'kas_bank' ? 'Belum ada akun kas/bank' : 'Belum ada akun'}
									</option>
								) : null}
								{accountChoices.map(account => (
									<option key={account.id} value={account.id}>
										{account.code} — {account.name}
									</option>
								))}
							</select>
						</div>
					</>
				)}
				<button
					type="submit"
					disabled={isSaving || accountChoices.length === 0}
					className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 md:col-span-6"
				>
					{isSaving ? 'Menyimpan…' : `Simpan ${config.title}`}
				</button>
				{error ? (
					<p className="text-sm font-semibold text-destructive md:col-span-6">{error}</p>
				) : null}
			</form>
		</div>
	);
}
