import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Banknote, Minus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	formatRupiah,
	formatDate,
	todayIso,
	type Account,
	type AccountType,
	type Company,
} from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import type { Product } from '@/lib/products';
import type { Student } from '@/lib/students';
import type { Transaction } from '@/lib/transactions';
import type { Warehouse } from '@/lib/warehouses';
import { adjustProductStock } from '@/lib/warehouse-stock';
import { ensureSalesDeliveryJournal } from '@/lib/delivery-journal';
import {
	DIRECTION_CONFIG,
	STAGE_CONFIG,
	buildDocumentNumber,
	computeDocumentTotals,
	type BusinessDocument,
	type DocumentDirection,
	type DocumentItem,
	type DocumentStage,
} from '@/lib/documents';
import { loadTaxTypes, type TaxType } from '@/lib/tax';
import {
	countInvoicesThisMonth,
	effectiveInvoiceMonthlyLimit,
	hasCustomInvoiceQuota,
	invoiceLimitMessage,
} from '@/lib/plan-access';
import { NoCompany } from '@/components/app/no-company';
import { DocumentActions } from '@/components/app/document-actions';
import { AmountInput } from '@/components/ui/amount-input';
import { PaymentTermsField } from '@/components/app/payment-terms-field';
import { computePaymentTerms, isValidPaymentTerms } from '@/lib/payment-terms';
import {
	getOrCreatePaymentTermsSettings,
	activeTermsNotation,
} from '@/lib/payment-terms-settings';
import {
	computeLatePenalty,
	getOrCreateLatePenaltySettings,
	type LatePenaltySettings,
} from '@/lib/late-penalty-settings';
import {
	computeCogsForProduct,
	fetchPurchaseLayers,
	getOrCreateInventorySettings,
	type InventoryMethod,
	type InventorySettings,
} from '@/lib/inventory-settings';

/** Membagi nominal diskon syarat pembayaran ke kolom Diskon tiap baris (proporsional). */
function distributeTermsDiscount(items: DocumentItem[], discountAmount: number): DocumentItem[] {
	const bases = items.map(item => Math.max(0, (item.quantity || 0) * (item.unitPrice || 0)));
	const baseTotal = bases.reduce((sum, value) => sum + value, 0);
	let remaining = discountAmount > 0 && baseTotal > 0 ? discountAmount : 0;
	return items.map((item, index) => {
		const isLast = index === items.length - 1;
		const share =
			discountAmount <= 0 || baseTotal <= 0
				? 0
				: isLast
					? remaining
					: Math.min(remaining, Math.round((discountAmount * bases[index]) / baseTotal));
		remaining -= share;
		const next = { ...item, discount: Math.max(0, share) };
		const afterDiscount = Math.max(0, (next.quantity || 0) * (next.unitPrice || 0) - next.discount);
		next.total = afterDiscount + Math.round((afterDiscount * (next.taxRate || 0)) / 100);
		return next;
	});
}

function pickDefaultAccount(accounts: Account[], pref: AccountType[]): string {
	for (const type of pref) {
		const found = accounts.find(account => account.type === type);
		if (found) return found.id;
	}
	return accounts[0]?.id ?? '';
}

function matchAccount(list: Account[], patterns: RegExp[]): Account | undefined {
	for (const pattern of patterns) {
		const found = list.find(account => pattern.test(`${account.code} ${account.name}`));
		if (found) return found;
	}
	return undefined;
}

/** Akun otomatis invoice penjualan: debit piutang, kredit pendapatan penjualan. */
function salesInvoiceAccounts(list: Account[]): { debit?: Account; credit?: Account } {
	return {
		debit:
			matchAccount(list, [/piutang usaha/i, /\b103\b/]) ??
			list.find(
				account =>
					account.type === 'aset' && /piutang/i.test(account.name) && !/pinjaman/i.test(account.name),
			),
		credit:
			matchAccount(list, [/pendapatan penjualan/i, /\b401\b/]) ??
			list.find(account => account.type === 'pendapatan' && !/potongan|denda/i.test(account.name)),
	};
}

function formatQuoteAmount(value: number): string {
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

const EMPTY_ITEM: DocumentItem = {
	product: '',
	name: '',
	code: '',
	quantity: 1,
	unitPrice: 0,
	discount: 0,
	taxRate: 0,
	total: 0,
};

interface DocumentFormProps {
	direction: DocumentDirection;
	activeCompany: Company | null;
	initialStage: DocumentStage;
	editId?: string;
	fromId?: string;
}

export function DocumentForm({ direction, activeCompany, initialStage, editId, fromId }: DocumentFormProps) {
	const navigate = useNavigate();
	const targetStage = initialStage;

	const dir = DIRECTION_CONFIG[direction];
	const stageCfg = STAGE_CONFIG[targetStage];

	const [accounts, setAccounts] = useState<Account[]>([]);
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [students, setStudents] = useState<Student[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [taxTypes, setTaxTypes] = useState<TaxType[]>([]);
	const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
	const [existingCount, setExistingCount] = useState(0);

	const [date, setDate] = useState(todayIso());
	const [dueDate, setDueDate] = useState('');
	const [contact, setContact] = useState('');
	const [partner, setPartner] = useState('');
	const [description, setDescription] = useState('');
	const [items, setItems] = useState<DocumentItem[]>([{ ...EMPTY_ITEM }]);
	const [warehouseId, setWarehouseId] = useState('');
	const [studentId, setStudentId] = useState('');
	const [paidAmount, setPaidAmount] = useState('');
	const [debitAccount, setDebitAccount] = useState('');
	const [creditAccount, setCreditAccount] = useState('');
	const [status, setStatus] = useState<'draft' | 'confirmed' | 'sudah_dikirim'>('confirmed');
	const [paymentTerms, setPaymentTerms] = useState('');
	const [downPayment, setDownPayment] = useState(0);
	const [downPaymentAccount, setDownPaymentAccount] = useState('');
	const [withholdingAccount, setWithholdingAccount] = useState('');
	const [withholdingValue, setWithholdingValue] = useState(0);
	const [withholdingMode, setWithholdingMode] = useState<'percent' | 'amount'>('percent');
	const [withholdingEnabled, setWithholdingEnabled] = useState(true);
	const [message, setMessage] = useState('');
	const [memo, setMemo] = useState('');
	const [headerDiscountValue, setHeaderDiscountValue] = useState(0);
	const [headerDiscountMode, setHeaderDiscountMode] = useState<'percent' | 'amount'>('percent');
	const [shippingCost, setShippingCost] = useState(0);
	const [penaltySettings, setPenaltySettings] = useState<LatePenaltySettings | null>(null);
	const [inventorySettings, setInventorySettings] = useState<InventorySettings | null>(null);
	const [purchaseLayers, setPurchaseLayers] = useState<Map<string, { quantity: number; unitCost: number }[]>>(new Map());
	const [error, setError] = useState('');
	const [loadError, setLoadError] = useState('');
	const [retryKey, setRetryKey] = useState(0);
	const [isSaving, setIsSaving] = useState(false);
	const [editDoc, setEditDoc] = useState<BusinessDocument | null>(null);
	const [sourceInvoice, setSourceInvoice] = useState<{
		id: string;
		payment_terms?: string;
		date: string;
		due_date?: string;
		total: number;
		debit_account: string;
		paid_amount: number;
	} | null>(null);
	const [deliverySourceInvoice, setDeliverySourceInvoice] = useState<BusinessDocument | null>(null);

	const basePath = direction === 'penjualan' ? 'penjualan' : 'pembelian';

	// Melacak syarat pembayaran sebelumnya agar tanggal jatuh tempo hanya diisi
	// ulang saat pengguna mengubah syarat (bukan saat memuat invoice lama).
	const lastTermsRef = useRef('');

	useEffect(() => {
		if (!activeCompany) {
			setAccounts([]);
			setContacts([]);
			setStudents([]);
			setProducts([]);
			setWarehouses([]);
			return;
		}
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		const contactFilter = pb.filter('company = {:company} && type = {:type}', {
			company: activeCompany.id,
			type: dir.contactType,
		});
		const docFilter = pb.filter(
			'company = {:company} && direction = {:dir} && stage = {:stage}',
			{ company: activeCompany.id, dir: direction, stage: targetStage },
		);
		const ownerId = pb.authStore.record?.id || activeCompany.owner;
		Promise.allSettled([
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code' }),
			pb.collection('contacts').getFullList<Contact>({ filter: contactFilter, sort: 'name' }),
			pb.collection('students').getFullList<Student>({ filter: companyFilter, sort: 'student_name' }),
			pb.collection('products').getFullList<Product>({ filter: companyFilter, sort: 'name' }),
			pb.collection('documents').getList<BusinessDocument>(1, 1, { filter: docFilter }),
			ownerId
				? loadTaxTypes(activeCompany.id, ownerId, { activeOnly: true })
				: Promise.resolve([] as TaxType[]),
			pb.collection('warehouses').getFullList<Warehouse>({ filter: companyFilter, sort: 'name' }),
		])
			.then(results => {
				if (cancelled) return;
				const accountList =
					results[0].status === 'fulfilled' ? results[0].value : ([] as Account[]);
				const contactList = results[1].status === 'fulfilled' ? results[1].value : ([] as Contact[]);
				const studentList = results[2].status === 'fulfilled' ? results[2].value : ([] as Student[]);
				const productList = results[3].status === 'fulfilled' ? results[3].value : ([] as Product[]);
				const docCount = results[4].status === 'fulfilled' ? (results[4].value.totalItems ?? 0) : 0;
				const typeList = results[5].status === 'fulfilled' ? results[5].value : ([] as TaxType[]);
				const warehouseList = results[6].status === 'fulfilled' ? results[6].value : ([] as Warehouse[]);
				setAccounts(accountList);
				setContacts(contactList);
				setStudents(studentList);
				setProducts(productList);
				setTaxTypes(typeList);
				setWarehouses(warehouseList);
				setWarehouseId(prev => prev || warehouseList[0]?.id || '');
				setExistingCount(docCount);

				if (stageCfg.postsJournal) {
					const debitPref: AccountType[] =
						targetStage === 'pembayaran'
							? (dir.paymentDebitPref.split(',') as AccountType[])
							: (dir.invoiceDebitPref.split(',') as AccountType[]);
					const creditPref: AccountType[] =
						targetStage === 'pembayaran'
							? (dir.paymentCreditPref.split(',') as AccountType[])
							: (dir.invoiceCreditPref.split(',') as AccountType[]);
					setDebitAccount(prev => prev || pickDefaultAccount(accountList, debitPref));
					setCreditAccount(prev => prev || pickDefaultAccount(accountList, creditPref));
				}
				if (direction === 'pembelian') {
					const pph = accountList.find(account => /utang pph/i.test(account.name));
					if (pph) setWithholdingAccount(prev => prev || pph.id);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, direction, dir, targetStage, stageCfg, retryKey]);

	// Mode edit: muat dokumen yang ada.
	useEffect(() => {
		if (!editId || !activeCompany) return;
		let cancelled = false;
		setLoadError('');
		pb.collection('documents')
			.getOne<BusinessDocument>(editId, { expand: 'contact' })
			.then(doc => {
				if (cancelled) return;
				setEditDoc(doc);
				setDate(doc.date || todayIso());
				setDueDate(doc.due_date || '');
				setContact(doc.contact || '');
				setPartner(doc.partner || '');
				setDescription(doc.description || '');
				setItems(doc.items && doc.items.length > 0 ? doc.items : [{ ...EMPTY_ITEM }]);
				setPaidAmount(doc.paid_amount ? String(doc.paid_amount) : '');
				setDebitAccount(doc.debit_account || '');
				setCreditAccount(doc.credit_account || '');
				setWarehouseId(doc.warehouse || '');
				setStudentId(doc.student || '');
				lastTermsRef.current = doc.payment_terms || '';
				setPaymentTerms(doc.payment_terms || '');
				setDownPayment(Math.max(0, Number(doc.down_payment) || 0));
				setDownPaymentAccount(doc.down_payment_account || '');
				setWithholdingAccount(doc.withholding_account || '');
				setWithholdingValue(Math.max(0, Number(doc.withholding_value) || 0));
				setWithholdingMode(doc.withholding_mode === 'amount' ? 'amount' : 'percent');
				setWithholdingEnabled(Boolean(doc.withholding_value || doc.withholding_account));
				setMessage(doc.message || '');
				setMemo(doc.memo || '');
				setHeaderDiscountValue(Math.max(0, Number(doc.header_discount_value) || 0));
				setHeaderDiscountMode(doc.header_discount_mode === 'amount' ? 'amount' : 'percent');
				setShippingCost(Math.max(0, Number(doc.shipping_cost) || 0));
				setStatus(doc.status === 'cancelled' ? 'draft' : doc.status);
			})
			.catch(() => {
				if (!cancelled) setLoadError('Gagal memuat dokumen. Periksa koneksi lalu coba lagi.');
			});
		return () => {
			cancelled = true;
		};
	}, [editId, activeCompany, retryKey]);

	// Mode konversi: salin item dari dokumen sumber.
	useEffect(() => {
		if (!fromId || !activeCompany) return;
		let cancelled = false;
		setLoadError('');
		pb.collection('documents')
			.getOne<BusinessDocument>(fromId, { expand: 'contact,source_document' })
			.then(doc => {
				if (cancelled) return;
				setDate(todayIso());
				setContact(doc.contact || '');
				setPartner(doc.partner || '');
				setDescription(doc.description || '');
				setItems(doc.items && doc.items.length > 0 ? doc.items : [{ ...EMPTY_ITEM }]);
				// Teruskan uang muka + akun pemetaan dari dokumen sumber (penawaran)
				// ke tahap berikutnya agar tersedia saat invoice diposting ke jurnal.
				const dpSource =
					Number(doc.down_payment) > 0
						? doc
						: doc.expand?.source_document ?? null;
				if (dpSource) {
					setDownPayment(Math.max(0, Number(dpSource.down_payment) || 0));
					setDownPaymentAccount(dpSource.down_payment_account || '');
				}
				setDueDate(doc.due_date || '');
				setMemo(doc.memo || '');
				setMessage(doc.message || '');
				setHeaderDiscountValue(Math.max(0, Number(doc.header_discount_value) || 0));
				setHeaderDiscountMode(doc.header_discount_mode === 'amount' ? 'amount' : 'percent');
				setShippingCost(Math.max(0, Number(doc.shipping_cost) || 0));
				setWithholdingAccount(doc.withholding_account || '');
				setWithholdingValue(Math.max(0, Number(doc.withholding_value) || 0));
				setWithholdingMode(doc.withholding_mode === 'amount' ? 'amount' : 'percent');
				setWithholdingEnabled(Boolean(doc.withholding_value || doc.withholding_account));
				if (targetStage === 'pembayaran') {
					setSourceInvoice({
						id: doc.id,
						payment_terms: doc.payment_terms,
						date: doc.date,
						due_date: doc.due_date || '',
						total: Number(doc.total) || 0,
						debit_account: doc.debit_account || '',
						paid_amount: Number(doc.paid_amount) || 0,
					});
					if (direction === 'penjualan' && doc.debit_account) setCreditAccount(doc.debit_account);
					if (direction === 'pembelian' && doc.credit_account) setDebitAccount(doc.credit_account);
				}
			})
			.catch(() => {
				if (!cancelled)
					setLoadError('Gagal memuat dokumen sumber untuk konversi. Periksa koneksi lalu coba lagi.');
			});
		return () => {
			cancelled = true;
		};
	}, [fromId, activeCompany, retryKey]);

	// Isi otomatis syarat pembayaran default perusahaan saat membuat invoice
	// baru (bukan edit). Invoice lama tidak berubah — syarat tersimpan per
	// invoice dan dipakai pada alur konversi/pembayaran yang sudah ada.
	useEffect(() => {
		if (!activeCompany || targetStage !== 'invoice' || editId) return;
		let cancelled = false;
		const ownerId = pb.authStore.record?.id ?? activeCompany.owner;
		getOrCreatePaymentTermsSettings(activeCompany.id, ownerId)
			.then(settings => {
				if (cancelled) return;
				const notation = activeTermsNotation(settings);
				if (notation) {
					setPaymentTerms(prev => prev || notation);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, targetStage, editId]);

	// Hitung otomatis tanggal jatuh tempo dari syarat pembayaran yang dipilih:
	// mis. N/30 berarti jatuh tempo 30 hari setelah tanggal invoice. Hanya
	// berlaku saat syarat berubah (aksi pengguna) agar tanggal tersimpan pada
	// invoice lama tetap dipertahankan; pengguna masih dapat mengubahnya manual.
	useEffect(() => {
		if (targetStage !== 'invoice' || (direction !== 'penjualan' && direction !== 'pembelian')) return;
		if (paymentTerms === lastTermsRef.current) return;
		lastTermsRef.current = paymentTerms;
		if (!paymentTerms) return;
		const calc = computePaymentTerms(paymentTerms, date, 0);
		if (calc?.dueDate) {
			setDueDate(calc.dueDate);
		}
	}, [paymentTerms, date, targetStage, direction]);

	// Muat pengaturan denda keterlambatan perusahaan untuk alur pembayaran.
	useEffect(() => {
		if (!activeCompany || targetStage !== 'pembayaran') return;
		let cancelled = false;
		const ownerId = pb.authStore.record?.id ?? activeCompany.owner;
		getOrCreateLatePenaltySettings(activeCompany.id, ownerId)
			.then(settings => {
				if (!cancelled) setPenaltySettings(settings);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, targetStage]);

	// Muat pengaturan metode persediaan + lapisan pembelian (kartu stok) untuk
	// perhitungan HPP invoice penjualan pada produk yang monitor stoknya aktif.
	useEffect(() => {
		if (!activeCompany || direction !== 'penjualan' || targetStage !== 'invoice') return;
		let cancelled = false;
		const ownerId = pb.authStore.record?.id ?? activeCompany.owner;
		Promise.all([
			getOrCreateInventorySettings(activeCompany.id, ownerId),
			fetchPurchaseLayers(activeCompany.id),
		])
			.then(([settings, layers]) => {
				if (cancelled) return;
				setInventorySettings(settings);
				setPurchaseLayers(layers);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, direction, targetStage]);

	// Saat mengedit pengiriman penjualan, muat invoice sumber untuk menampilkan
	// tindakan pembayaran terkait dan mencegah pembayaran ganda (invoice yang
	// sudah lunas disembunyikan/tandai lunas).
	useEffect(() => {
		if (targetStage !== 'pengiriman' || direction !== 'penjualan' || !editDoc?.source_document) {
			setDeliverySourceInvoice(null);
			return;
		}
		let cancelled = false;
		pb.collection('documents')
			.getOne<BusinessDocument>(editDoc.source_document)
			.then(invoice => {
				if (!cancelled) setDeliverySourceInvoice(invoice);
			})
			.catch(() => {
				if (!cancelled) setDeliverySourceInvoice(null);
			});
		return () => {
			cancelled = true;
		};
	}, [editDoc, targetStage, direction]);

	// Saat mengubah pembayaran penjualan, pakai akun piutang invoice sumber sebagai kredit.
	useEffect(() => {
		if (targetStage !== 'pembayaran' || !editDoc?.source_document) return;
		if (direction !== 'penjualan' && direction !== 'pembelian') return;
		let cancelled = false;
		pb.collection('documents')
			.getOne<BusinessDocument>(editDoc.source_document)
			.then(doc => {
				if (cancelled) return;
				setSourceInvoice({
					id: doc.id,
					payment_terms: doc.payment_terms,
					date: doc.date,
					due_date: doc.due_date || '',
					total: Number(doc.total) || 0,
					debit_account: doc.debit_account || '',
					paid_amount: Number(doc.paid_amount) || 0,
				});
				if (direction === 'penjualan' && doc.debit_account) setCreditAccount(doc.debit_account);
				if (direction === 'pembelian' && doc.credit_account) setDebitAccount(doc.credit_account);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [editDoc, direction, targetStage]);

	const totals = useMemo(() => computeDocumentTotals(items), [items]);
	const headerDiscountBase = Math.max(0, totals.subtotal - totals.discountTotal);
	const headerDiscountAmount =
		headerDiscountMode === 'percent'
			? Math.round((headerDiscountBase * (Number(headerDiscountValue) || 0)) / 100)
			: Math.min(headerDiscountBase, Math.max(0, Number(headerDiscountValue) || 0));
	const shippingAmount = Math.max(0, Number(shippingCost) || 0);
	const withholdingBase = Math.max(0, totals.subtotal - totals.discountTotal - headerDiscountAmount);
	const withholdingAmount =
		withholdingMode === 'percent'
			? Math.round((withholdingBase * (Number(withholdingValue) || 0)) / 100)
			: Math.min(withholdingBase, Math.max(0, Number(withholdingValue) || 0));
	const downPaymentAmount = Math.max(0, Number(downPayment) || 0);

	const paymentTermsCalc = useMemo(() => {
		if (!sourceInvoice) return null;
		return computePaymentTerms(
			sourceInvoice.payment_terms,
			sourceInvoice.date,
			sourceInvoice.total,
			date,
		);
	}, [sourceInvoice, date]);

	// Terapkan diskon otomatis: bila tanggal pembayaran masih dalam masa diskon,
	// isi nominal bayar dengan jumlah bersih setelah diskon; bila sudah lewat
	// jatuh tempo, tambahkan denda keterlambatan; antara masa diskon dan jatuh
	// tempo, gunakan jumlah penuh.
	useEffect(() => {
		if (editId || targetStage !== 'pembayaran' || !sourceInvoice) return;
		if (!sourceInvoice.payment_terms) {
			setPaidAmount(String(sourceInvoice.total));
			return;
		}
		const active = Boolean(paymentTermsCalc?.discountActive);
		const discount = active ? paymentTermsCalc?.discountAmount ?? 0 : 0;
		setItems(prev => distributeTermsDiscount(prev, discount));
		const penaltyCalc = computeLatePenalty(
			penaltySettings,
			{
				total: sourceInvoice.total,
				payment_terms: sourceInvoice.payment_terms,
				date: sourceInvoice.date,
				paid_amount: sourceInvoice.paid_amount,
			},
			date,
		);
		const penalty = active ? 0 : penaltyCalc?.penalty ?? 0;
		setPaidAmount(
			String(
				active
					? paymentTermsCalc?.payableWithDiscount ?? sourceInvoice.total
					: sourceInvoice.total + penalty,
			),
		);
	}, [paymentTermsCalc, sourceInvoice, targetStage, penaltySettings, date, editId]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const updateItem = (index: number, patch: Partial<DocumentItem>) => {
		setItems(prev =>
			prev.map((item, idx) => {
				if (idx !== index) return item;
				const next = { ...item, ...patch };
				next.total =
					Math.max(0, (next.quantity || 0) * (next.unitPrice || 0) - (next.discount || 0)) +
					Math.round(
						(Math.max(0, (next.quantity || 0) * (next.unitPrice || 0) - (next.discount || 0)) *
							(next.taxRate || 0)) /
							100,
					);
				return next;
			}),
		);
	};

	const handleProductPick = (index: number, productId: string) => {
		const selected = products.find(p => p.id === productId);
		if (!selected) {
			updateItem(index, { product: '', name: '', code: '', unitPrice: 0 });
			return;
		}
		const basePrice = direction === 'penjualan' ? selected.price : selected.cost;
		updateItem(index, {
			product: selected.id,
			name: selected.name,
			code: selected.code,
			unitPrice: basePrice || 0,
		});
	};

	const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
	const removeItem = (index: number) =>
		setItems(prev => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		const autoSalesInvoice = direction === 'penjualan' && targetStage === 'invoice';
		const salesPayment = direction === 'penjualan' && targetStage === 'pembayaran';
		const mappedAccounts = autoSalesInvoice ? salesInvoiceAccounts(accounts) : null;
		const invoiceReceivable = salesPayment
			? sourceInvoice?.debit_account ||
				matchAccount(accounts, [/piutang usaha/i, /\b103\b/])?.id ||
				''
			: '';
		const postingCredit = invoiceReceivable || mappedAccounts?.credit?.id || creditAccount;
		const cashDebit =
			salesPayment && (debitAccount === postingCredit || !debitAccount)
				? matchAccount(accounts, [/\bkas\b/i, /\bbank\b/i, /\b101\b/, /\b102\b/])?.id || debitAccount
				: debitAccount;
		const postingDebit = mappedAccounts?.debit?.id || cashDebit;
		if (stageCfg.postsJournal && (!postingDebit || !postingCredit)) {
			setError(
				autoSalesInvoice
					? 'Akun Piutang Usaha atau Pendapatan Penjualan belum ada di bagan akun.'
					: 'Pilih akun debit dan kredit untuk posting jurnal.',
			);
			return;
		}
		if (stageCfg.postsJournal && postingDebit === postingCredit) {
			setError('Akun debit dan kredit tidak boleh sama.');
			return;
		}
		if (paymentTerms && !isValidPaymentTerms(paymentTerms)) {
			setError('Format syarat pembayaran tidak valid. Gunakan notasi seperti 2/3 N/30.');
			return;
		}
		const lineItems = items
			.filter(item => item.name || item.product)
			.map(item => ({
				product: item.product || '',
				name: item.name || '',
				code: item.code || '',
				quantity: Number(item.quantity) || 0,
				unitPrice: Number(item.unitPrice) || 0,
				discount: Number(item.discount) || 0,
				taxRate: Number(item.taxRate) || 0,
				total: item.total || 0,
			}));
		if ((compactSales || (direction === 'pembelian' && targetStage === 'pembayaran')) && !contact && !studentId) {
			const requiredParty =
				direction === 'pembelian' && (targetStage === 'penawaran' || targetStage === 'pemesanan')
					? 'Pelanggan'
					: dir.partyLabel;
			setError(`${requiredParty} wajib dipilih sebelum menyimpan ${stageCfg.singular.toLowerCase()}.`);
			return;
		}
		if (lineItems.length === 0) {
			setError('Tambahkan minimal satu item.');
			return;
		}
		const netTotal = Math.max(0, totals.total - headerDiscountAmount);
		const amount = stageCfg.isPayment ? Number(paidAmount) || 0 : compactSales ? netTotal : totals.total;
		if (amount <= 0) {
			setError(stageCfg.isPayment ? 'Nominal pembayaran harus lebih dari 0.' : 'Total harus lebih dari 0.');
			return;
		}
		setIsSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';

			// Batas invoice bulanan: kuota kustom Admin Pusat bila aktif, jika tidak batas paket.
			if (!editId && targetStage === 'invoice') {
				const invoiceLimit = effectiveInvoiceMonthlyLimit(activeCompany);
				if (invoiceLimit !== null) {
					const used = await countInvoicesThisMonth(activeCompany.id);
					if (used >= invoiceLimit) {
						setError(invoiceLimitMessage(invoiceLimit, hasCustomInvoiceQuota(activeCompany)));
						return;
					}
				}
			}
			const contactRecord = contacts.find(c => c.id === contact);
			const docNumber = editId
				? undefined
				: buildDocumentNumber(stageCfg.numberPrefix, existingCount);
			const payload: Record<string, unknown> = {
				company: activeCompany.id,
				direction,
				stage: targetStage,
				date,
				contact: contact || null,
				partner: contactRecord?.name ?? partner,
				description,
				items: lineItems,
				subtotal: stageCfg.isPayment ? amount : totals.subtotal,
				discount_total: totals.discountTotal,
				tax_total: totals.taxTotal,
				total: stageCfg.isPayment ? amount : totals.total,
				paid_amount: stageCfg.isPayment ? amount : 0,
				debit_account: stageCfg.postsJournal ? postingDebit : null,
				credit_account: stageCfg.postsJournal ? postingCredit : null,
				status,
				owner: ownerId,
			};
			if (docNumber) payload.number = docNumber;
			if (fromId) payload.source_document = fromId;
			payload.warehouse = warehouseId || null;
			payload.student = studentId || null;
			payload.payment_terms = targetStage === 'invoice' ? (paymentTerms || null) : null;
			payload.due_date =
				compactSales || (direction === 'pembelian' && targetStage === 'pembayaran')
					? dueDate || null
					: null;
			if (compactSales) {
				payload.down_payment = downPaymentAmount;
				payload.down_payment_account = downPaymentAccount || null;
				payload.message = message;
				payload.memo = memo;
				payload.header_discount_value = Number(headerDiscountValue) || 0;
				payload.header_discount_mode = headerDiscountMode;
				payload.withholding_account = null;
				payload.withholding_value = 0;
				payload.withholding_mode = 'percent';
				payload.total = Math.max(0, totals.total - headerDiscountAmount);
			}
			if (compactDelivery) {
				payload.shipping_cost = shippingAmount;
				payload.total = totals.total + shippingAmount;
			}
			// Saat konversi ke invoice, simpan uang muka + akun pemetaan dari
			// penawaran sumber agar dapat dipakai pada posting jurnal invoice.
			if (direction === 'penjualan' && targetStage === 'invoice' && downPaymentAmount > 0) {
				payload.down_payment = downPaymentAmount;
				payload.down_payment_account = downPaymentAccount || null;
			}
			if (
				(direction === 'penjualan' || direction === 'pembelian') &&
				targetStage === 'pembayaran'
			) {
				payload.memo = memo;
			}
			if (direction === 'pembelian') {
				payload.withholding_account = withholdingAccount || null;
				payload.withholding_value = Number(withholdingValue) || 0;
				payload.withholding_mode = withholdingMode;
			}

			let docId = editId ?? '';
			if (editId) {
				await pb.collection('documents').update(editId, payload);
			} else {
				const created = await pb.collection('documents').create<BusinessDocument>(payload);
				docId = created.id;
			}

			const savedNumber = docNumber || editDoc?.number || '';
			if (autoSalesInvoice && postingDebit && postingCredit) {
				const revenue = Math.max(0, amount - totals.taxTotal);
				const taxCredit = Math.min(Math.max(0, totals.taxTotal), amount);
				const ppnAccount = matchAccount(accounts, [/ppn keluaran/i, /\b207\b/]);
				// Diskon (per baris + header) dicatat sebagai debit pada akun
				// Potongan/Diskon Penjualan di samping debit Piutang; pendapatan
				// dikredit sebesar nilai kotor (sebelum diskon) agar jurnal seimbang.
				const discountAmount = Math.max(0, totals.discountTotal + headerDiscountAmount);
				const discountAccount =
					discountAmount > 0
						? (matchAccount(accounts, [/potongan penjualan|diskon penjualan/i, /\b403\b/]) ?? null)
						: null;
				const discountAccountId = discountAccount?.id ?? '';
				const applyDiscount =
					discountAmount > 0 &&
					Boolean(discountAccount) &&
					discountAccountId !== postingDebit &&
					discountAccountId !== postingCredit;
				const salesCredit =
					(ppnAccount && taxCredit > 0 ? revenue : amount) + (applyDiscount ? discountAmount : 0);
				const applyDownPayment =
					downPaymentAmount > 0 &&
					Boolean(downPaymentAccount) &&
					downPaymentAccount !== postingDebit &&
					downPaymentAccount !== postingCredit;
				const receivableDebit = applyDownPayment ? Math.max(0, amount - downPaymentAmount) : amount;
				// Jurnal HPP/Persediaan hanya untuk produk yang monitor stoknya aktif:
				// debit akun Beban Harga Penjualan, kredit akun persediaan dari
				// mapping inventory_account produk. Produk tanpa monitor stok tidak
				// menimbulkan jurnal COGS agar tidak mengubah transaksi terdahulu.
				let cogs = 0;
				const cogsByInventory = new Map<string, number>();
				// Metode persediaan perusahaan menentukan dasar perhitungan HPP:
				// FIFO & Average memakai lapisan pembelian (kartu stok), sedangkan
				// Reducing Balance & Produksi per Unit memakai harga pokok produk.
				const inventoryMethod: InventoryMethod =
					inventorySettings && inventorySettings.is_active !== false
						? inventorySettings.method
						: 'fifo';
				for (const item of lineItems) {
					if (!item.product || item.quantity <= 0) continue;
					const productRow = products.find(row => row.id === item.product);
					if (!productRow?.track_stock || !productRow.inventory_account) continue;
					const layers = purchaseLayers.get(item.product) ?? [];
					const lineCogs = computeCogsForProduct(inventoryMethod, productRow, item.quantity, layers);
					if (lineCogs <= 0) continue;
					cogs += lineCogs;
					cogsByInventory.set(
						productRow.inventory_account,
						(cogsByInventory.get(productRow.inventory_account) || 0) + lineCogs,
					);
				}
				let cogsAccount = matchAccount(accounts, [/harga pokok/i, /\bhpp\b/i]);
				if (cogs > 0 && !cogsAccount) {
					cogsAccount = await pb.collection('accounts').create<Account>(
						{
							company: activeCompany.id,
							code: '505',
							name: 'Harga Pokok Penjualan',
							type: 'beban',
							owner: ownerId,
						},
						{ requestKey: `cogs-account-${docId}` },
					);
				}
				const salesTxPayload: Record<string, unknown> = {
					company: activeCompany.id,
					category: 'penjualan',
					date,
					description: description || `Invoice ${savedNumber}`.trim(),
					amount,
					partner: contactRecord?.name ?? partner,
					debit_account: postingDebit,
					credit_account: postingCredit,
					owner: ownerId,
				};
				if (contact) salesTxPayload.contact = contact;
				let txId = editDoc?.transaction || '';
				if (txId) {
					try {
						await pb.collection('transactions').update(txId, salesTxPayload, {
							requestKey: `sales-tx-update-${docId}`,
						});
					} catch {
						txId = '';
					}
				}
				if (!txId) {
					const createdTx = await pb.collection('transactions').create<Transaction>(salesTxPayload, {
						requestKey: `sales-tx-create-${docId}`,
					});
					txId = createdTx.id;
					await pb.collection('documents').update(docId, { transaction: txId });
				}
				const priorEntries = await pb.collection('entries').getFullList<{ id: string }>({
					filter: pb.filter('transaction = {:tx}', { tx: txId }),
					requestKey: `sales-tx-lines-${docId}`,
				});
				await Promise.all(
					priorEntries.map((entry, index) =>
						pb.collection('entries').delete(entry.id, {
							requestKey: `sales-tx-del-${docId}-${index}`,
						}),
					),
				);
				const salesBase = {
					company: activeCompany.id,
					date,
					description: description || `Invoice ${savedNumber}`.trim(),
					owner: ownerId,
					transaction: txId,
					group: `doc-${docId}`,
				};
				// Bagi kredit pendapatan ke akun penjualan tiap produk sesuai mapping
				// sales_account pada produk. Baris tanpa produk / tanpa mapping
				// memakai akun pendapatan default (postingCredit). Total kredit
				// pendapatan tetap sama dengan salesCredit agar jurnal seimbang.
				const revenueByAccount = new Map<string, number>();
				for (const item of lineItems) {
					const grossLine = (item.quantity || 0) * (item.unitPrice || 0);
					const lineDisc = item.discount || 0;
					const credit = applyDiscount ? grossLine : Math.max(0, grossLine - lineDisc);
					if (credit <= 0) continue;
					const product = item.product ? products.find(p => p.id === item.product) : null;
					const acct = product?.sales_account || postingCredit;
					revenueByAccount.set(acct, (revenueByAccount.get(acct) || 0) + credit);
				}
				// Selaraskan total kredit pendapatan agar tepat sama dengan
				// salesCredit (menampung selisih diskon header saat tanpa akun
				// diskon maupun pembulatan).
				const revenueTotal = Array.from(revenueByAccount.values()).reduce(
					(sum, value) => sum + value,
					0,
				);
				const revenueAdjust = salesCredit - revenueTotal;
				if (revenueAdjust !== 0) {
					revenueByAccount.set(
						postingCredit,
						(revenueByAccount.get(postingCredit) || 0) + revenueAdjust,
					);
				}
				const salesLines: Array<Record<string, unknown>> = [
					{ ...salesBase, account: postingDebit, debit: receivableDebit, credit: 0 },
					...(applyDiscount && discountAccount
						? [
								{
									...salesBase,
									description: `Diskon ${savedNumber}`.trim(),
									account: discountAccountId,
									debit: discountAmount,
									credit: 0,
								},
							]
						: []),
					...Array.from(revenueByAccount.entries()).map(([acct, credit]) => ({
						...salesBase,
						account: acct,
						debit: 0,
						credit,
					})),
				];
				if (ppnAccount && taxCredit > 0 && salesCredit !== amount) {
					salesLines.push({
						...salesBase,
						description: `PPN ${savedNumber}`.trim(),
						account: ppnAccount.id,
						debit: 0,
						credit: taxCredit,
					});
				}
				if (applyDownPayment) {
					salesLines.push({
						...salesBase,
						description: `Uang muka ${savedNumber}`.trim(),
						account: downPaymentAccount,
						debit: downPaymentAmount,
						credit: 0,
					});
				}
				if (cogs > 0 && cogsAccount && cogsByInventory.size > 0) {
					salesLines.push({
						...salesBase,
						description: `HPP ${savedNumber}`.trim(),
						account: cogsAccount.id,
						debit: cogs,
						credit: 0,
					});
					for (const [acct, credit] of cogsByInventory) {
						if (credit <= 0) continue;
						salesLines.push({
							...salesBase,
							description: `Persediaan ${savedNumber}`.trim(),
							account: acct,
							debit: 0,
							credit,
						});
					}
				}
				// Setiap baris jurnal butuh nomor unik per perusahaan (indeks unik
				// company+number); tanpa ini, beberapa baris bernomor kosong bertabrakan
				// dan gagal disimpan. Hitung urutan tertinggi tahun berjalan lalu
				// beri nomor berurutan ke tiap baris.
				const journalYear = Number(date.slice(0, 4)) || new Date().getFullYear();
				const journalPrefix = `JU-${journalYear}-`;
				const numberedExisting = await pb.collection('entries').getFullList<{ number?: string }>({
					filter: pb.filter('company = {:company} && number ~ {:prefix}', {
						company: activeCompany.id,
						prefix: journalPrefix,
					}),
					requestKey: `sales-journal-numbers-${docId}`,
				});
				let maxJournalSeq = 0;
				for (const e of numberedExisting) {
					const v = e.number || '';
					if (v.startsWith(journalPrefix)) {
						const seq = Number.parseInt(v.slice(journalPrefix.length), 10);
						if (!Number.isNaN(seq) && seq > maxJournalSeq) maxJournalSeq = seq;
					}
				}
				const numberedSalesLines = salesLines.map((line, index) => ({
					...line,
					number: `${journalPrefix}${String(maxJournalSeq + index + 1).padStart(3, '0')}`,
				}));
				await Promise.all(
					numberedSalesLines.map((line, index) =>
						pb.collection('entries').create(line, {
							requestKey: `sales-entry-${docId}-${index}`,
						}),
					),
				);
				await pb.collection('documents').update(docId, {
					transaction: txId,
					debit_account: postingDebit,
					credit_account: postingCredit,
				});
			}

			// Posting jurnal untuk invoice pembelian & pembayaran.
			if (!autoSalesInvoice && stageCfg.postsJournal && postingDebit && postingCredit) {
				const txCategory = stageCfg.isPayment ? 'kas_bank' : direction;
				// Diskon syarat pembayaran (cth. 2/3 N/30) berlaku pada konversi
				// invoice -> pembayaran bila tanggal pembayaran masih dalam masa
				// diskon dan akun potongan penjualan tersedia.
				const termsCalc =
					targetStage === 'pembayaran' && sourceInvoice
						? computePaymentTerms(
								sourceInvoice.payment_terms,
								sourceInvoice.date,
								sourceInvoice.total,
								date,
						  )
						: null;
				const discountAccount =
					termsCalc && termsCalc.discountActive && termsCalc.discountAmount > 0
						? (accounts.find(a => /potongan penjualan|diskon penjualan/i.test(a.name)) ?? null)
						: null;
				const discountSettles = Boolean(
					termsCalc?.discountActive &&
						discountAccount &&
						sourceInvoice &&
						Math.abs(amount - termsCalc.payableWithDiscount) <= 1,
				);
				const purchaseWithholding =
					direction === 'pembelian' && !stageCfg.isPayment ? withholdingAmount : 0;
				const withholdSeparately = Boolean(
					purchaseWithholding > 0 &&
						withholdingAccount &&
						withholdingAccount !== postingCredit &&
						withholdingAccount !== postingDebit,
				);
				const creditAmount = discountSettles && sourceInvoice ? sourceInvoice.total : amount;
				const payableCredit = withholdSeparately
					? Math.max(0, creditAmount - purchaseWithholding)
					: creditAmount;
				const discountAmount = discountSettles && termsCalc ? termsCalc.discountAmount : 0;
				// Diskon Pembelian (baris + header) pada invoice pembelian: catat di
				// sisi kredit sebagai akun kontra-pembelian; debit akun pembelian
				// dinaikkan ke nilai bruto agar jurnal tetap seimbang.
				const purchaseInvoicePost = direction === 'pembelian' && !stageCfg.isPayment;
				const purchaseInvoiceDiscount = purchaseInvoicePost
					? Math.max(0, totals.discountTotal + headerDiscountAmount)
					: 0;
				let purchaseDiscountAccount =
					purchaseInvoiceDiscount > 0
						? (matchAccount(accounts, [/diskon pembelian/i, /\b503\b/]) ?? null)
						: null;
				const txPayload: Record<string, unknown> = {
					company: activeCompany.id,
					category: txCategory,
					date,
					description: description || `${stageCfg.singular} ${docNumber ?? ''}`,
					amount,
					partner: contactRecord?.name ?? partner,
					debit_account: postingDebit,
					credit_account: postingCredit,
					owner: ownerId,
				};
				if (contact) txPayload.contact = contact;
				if (lineItems.length === 1 && lineItems[0].product) {
					txPayload.product = lineItems[0].product;
					txPayload.quantity = lineItems[0].quantity;
					txPayload.unit_price = lineItems[0].unitPrice;
					txPayload.discount = lineItems[0].discount;
					txPayload.tax_rate = lineItems[0].taxRate;
					txPayload.tax_amount = lineItems[0].total - Math.max(0, lineItems[0].quantity * lineItems[0].unitPrice - lineItems[0].discount);
				}
				let txId = (salesPayment || purchaseInvoicePost) ? editDoc?.transaction || '' : '';
				if (txId) {
					try {
						await pb.collection('transactions').update(txId, txPayload, {
							requestKey: `pay-tx-update-${docId}`,
						});
					} catch {
						txId = '';
					}
				}
				if (!txId) {
					const createdTx = await pb.collection('transactions').create<Transaction>(txPayload, {
						requestKey: `pay-tx-create-${docId}`,
					});
					txId = createdTx.id;
				}
				if (salesPayment || purchaseInvoicePost) {
					const priorPayEntries = await pb.collection('entries').getFullList<{ id: string }>({
						filter: pb.filter('transaction = {:tx}', { tx: txId }),
						requestKey: `pay-tx-lines-${docId}`,
					});
					await Promise.all(
						priorPayEntries.map((entry, index) =>
							pb.collection('entries').delete(entry.id, {
								requestKey: `pay-tx-del-${docId}-${index}`,
							}),
						),
					);
				}
				const journalYear = Number(date.slice(0, 4)) || new Date().getFullYear();
				const journalPrefix = `JU-${journalYear}-`;
				let nextJournalSeq = 0;
				if (salesPayment || purchaseInvoicePost) {
					const numberedExisting = await pb.collection('entries').getFullList<{ number?: string }>({
						filter: pb.filter('company = {:company} && number ~ {:prefix}', {
							company: activeCompany.id,
							prefix: journalPrefix,
						}),
						requestKey: `pay-journal-numbers-${docId}`,
					});
					for (const row of numberedExisting) {
						const value = row.number || '';
						if (!value.startsWith(journalPrefix)) continue;
						const seq = Number.parseInt(value.slice(journalPrefix.length), 10);
						if (!Number.isNaN(seq) && seq > nextJournalSeq) nextJournalSeq = seq;
					}
				}
				const nextJournalNumber = () => {
					nextJournalSeq += 1;
					return `${journalPrefix}${String(nextJournalSeq).padStart(3, '0')}`;
				};
				// Buat akun Diskon Pembelian otomatis bila belum ada dan ada diskon.
				if (purchaseInvoiceDiscount > 0 && !purchaseDiscountAccount) {
					try {
						purchaseDiscountAccount = await pb.collection('accounts').create<Account>(
							{
								company: activeCompany.id,
								code: '503',
								name: 'Diskon Pembelian',
								type: 'pendapatan',
								owner: ownerId,
							},
							{ requestKey: `purchase-discount-account-${docId}` },
						);
					} catch {
						purchaseDiscountAccount = null;
					}
				}
				const applyPurchaseDiscount = Boolean(
					purchaseInvoiceDiscount > 0 &&
						purchaseDiscountAccount &&
						purchaseDiscountAccount.id !== postingDebit &&
						purchaseDiscountAccount.id !== postingCredit,
				);
				const purchaseDebitAmount = applyPurchaseDiscount
					? amount + purchaseInvoiceDiscount
					: amount;
				const baseEntry = {
					company: activeCompany.id,
					date,
					description: description || stageCfg.singular,
					owner: ownerId,
					transaction: txId,
				};
				// Bagi debit pembelian ke akun pembelian tiap produk sesuai mapping
				// purchase_account pada produk. Baris tanpa produk / tanpa mapping
				// memakai akun pembelian default (postingDebit). Total debit tetap
				// sama dengan purchaseDebitAmount agar jurnal seimbang (selisih
				// pajak & diskon header ditampung di akun default).
				let purchaseDebitLines: Array<{ account: string; debit: number }> = [];
				if (purchaseInvoicePost) {
					const debitByAccount = new Map<string, number>();
					for (const item of lineItems) {
						const grossLine = (item.quantity || 0) * (item.unitPrice || 0);
						const lineDisc = item.discount || 0;
						const debit = applyPurchaseDiscount ? grossLine : Math.max(0, grossLine - lineDisc);
						if (debit <= 0) continue;
						const product = item.product ? products.find(p => p.id === item.product) : null;
						// Produk yang dicentang "Saya beli produk ini" (buy_enabled)
						// memakai mapping Akun pembelian (purchase_account) sebagai
						// akun debit jurnal pembeliannya. Produk tanpa centang
						// memakai akun persediaan (bila monitor stok) atau default.
						const acct =
							product?.buy_enabled && product.purchase_account
								? product.purchase_account
								: product?.track_stock && product.inventory_account
									? product.inventory_account
									: product?.purchase_account || postingDebit;
						debitByAccount.set(acct, (debitByAccount.get(acct) || 0) + debit);
					}
					const debitTotal = Array.from(debitByAccount.values()).reduce(
						(sum, value) => sum + value,
						0,
					);
					const debitAdjust = purchaseDebitAmount - debitTotal;
					if (debitAdjust !== 0) {
						debitByAccount.set(
							postingDebit,
							(debitByAccount.get(postingDebit) || 0) + debitAdjust,
						);
					}
					purchaseDebitLines = Array.from(debitByAccount.entries()).map(
						([acct, debit]) => ({ account: acct, debit }),
					);
				} else {
					purchaseDebitLines = [{ account: postingDebit, debit: purchaseDebitAmount }];
				}
				await Promise.all(
					purchaseDebitLines.map((line, index) =>
						pb.collection('entries').create(
							{
								...baseEntry,
								...(salesPayment || purchaseInvoicePost
									? { number: nextJournalNumber() }
									: {}),
								account: line.account,
								debit: line.debit,
								credit: 0,
							},
							{ requestKey: `doc-entry-debit-${docId}-${index}` },
						),
					),
				);
				if (discountSettles && discountAccount) {
					await pb.collection('entries').create(
						{
						...baseEntry,
						...(salesPayment || purchaseInvoicePost ? { number: nextJournalNumber() } : {}),
						account: discountAccount.id,
						debit: discountAmount,
						credit: 0,
					},
						{ requestKey: `doc-entry-discount-${docId}` },
				);
				}
				await pb.collection('entries').create(
					{
						...baseEntry,
						...(salesPayment || purchaseInvoicePost ? { number: nextJournalNumber() } : {}),
						account: postingCredit,
						debit: 0,
						credit: payableCredit,
					},
					{ requestKey: `doc-entry-credit-${docId}` },
				);
				if (applyPurchaseDiscount && purchaseDiscountAccount) {
					await pb.collection('entries').create(
						{
							...baseEntry,
							...(salesPayment || purchaseInvoicePost ? { number: nextJournalNumber() } : {}),
							description: `Diskon Pembelian ${docNumber ?? stageCfg.singular}`,
							account: purchaseDiscountAccount.id,
							debit: 0,
							credit: purchaseInvoiceDiscount,
						},
						{ requestKey: `doc-entry-purchase-discount-${docId}` },
					);
				}
				if (withholdSeparately) {
					await pb.collection('entries').create(
						{
							...baseEntry,
							...(salesPayment || purchaseInvoicePost ? { number: nextJournalNumber() } : {}),
							description: `Pemotongan ${docNumber ?? stageCfg.singular}`,
							account: withholdingAccount,
							debit: 0,
							credit: purchaseWithholding,
						},
						{ requestKey: `doc-entry-withhold-${docId}` },
					);
				}
				// Penerapan uang muka (dari penawaran) pada invoice: catat di akun
				// pemetaan uang muka dan kurangi piutang. Debit akun uang muka,
				// kredit akun piutang (debit_account) sebesar uang muka.
				if (
					!stageCfg.isPayment &&
					direction === 'penjualan' &&
					downPaymentAmount > 0 &&
					downPaymentAccount &&
					downPaymentAccount !== postingDebit &&
					downPaymentAccount !== postingCredit
				) {
					await pb.collection('entries').create(
						{
							...baseEntry,
							description: `Uang muka ${docNumber ?? stageCfg.singular}`,
							account: downPaymentAccount,
							debit: downPaymentAmount,
							credit: 0,
						},
						{ requestKey: `doc-entry-dp-debit-${docId}` },
					);
					await pb.collection('entries').create(
						{
							...baseEntry,
							description: `Uang muka ${docNumber ?? stageCfg.singular}`,
							account: postingDebit,
							debit: 0,
							credit: downPaymentAmount,
						},
						{ requestKey: `doc-entry-dp-credit-${docId}` },
					);
				}
				await pb.collection('documents').update(docId, {
					transaction: txId,
					...(salesPayment ? { credit_account: postingCredit, debit_account: postingDebit } : {}),
				});

				// Terapkan pembayaran ke invoice sumber: tandai lunas (paid_amount
				// = total) bila diskon berlaku, atau tambahkan nominal pembayaran.
				if (targetStage === 'pembayaran' && fromId && sourceInvoice) {
					try {
						const fresh = await pb.collection('documents').getOne<BusinessDocument>(fromId);
						const currentPaid = Number(fresh.paid_amount) || 0;
						const newPaid = discountSettles
							? sourceInvoice.total
							: Math.min(sourceInvoice.total, currentPaid + amount);
						await pb.collection('documents').update(fromId, { paid_amount: newPaid });
					} catch {
						/* invoice gagal diperbarui — dokumen pembayaran tetap tersimpan */
					}
				}
			}

			// Pengiriman = perpindahan barang: kurangi stok untuk penjualan, tambah untuk pembelian.
			if (targetStage === 'pengiriman' && status === 'confirmed') {
				const sign = direction === 'pembelian' ? 1 : -1;
				await Promise.all(
					lineItems
						.filter(item => item.product && item.quantity > 0)
						.map((item, index) =>
							(async () => {
								try {
									const current = products.find(p => p.id === item.product)?.stock ?? 0;
									const newStock = Math.max(0, current + sign * item.quantity);
									await pb.collection('products').update(item.product, { stock: newStock }, { requestKey: `doc-prod-${docId}-${index}` });
									if (warehouseId) {
										await adjustProductStock(
											activeCompany.id,
											item.product,
											warehouseId,
											sign * item.quantity,
											ownerId,
											`doc-${docId}-${index}`,
										);
									}
								} catch {
									/* stok gagal diperbarui — dokumen tetap tersimpan */
								}
							})(),
						),
				);
			}

			// Invoice Pembelian: tambah stok produk yang monitor persediaannya
			// saat invoice disimpan. Idempoten — selisih (delta) antara kuantitas
			// item lama vs baru diterapkan, sehingga menyimpan ulang invoice yang
			// sama tidak menambah stok ganda. Mengubah status menjadi draft/
			// dibatalkan membalikkan stok yang sebelumnya ditambahkan.
			if (direction === 'pembelian' && targetStage === 'invoice') {
				const oldDocItems = editDoc?.items ?? [];
				const sumQty = (list: Array<{ product?: string; quantity?: number }>) => {
					const map = new Map<string, number>();
					for (const it of list) {
						if (!it.product) continue;
						map.set(it.product, (map.get(it.product) || 0) + (Number(it.quantity) || 0));
					}
					return map;
				};
				const oldQtyMap = sumQty(oldDocItems);
				const newQtyMap = sumQty(lineItems);
				const stockAppliedBefore = Boolean(editDoc?.stock_applied);
				const oldWasConfirmed = editDoc ? editDoc.status === 'confirmed' : false;
				const productIds = new Set<string>([...oldQtyMap.keys(), ...newQtyMap.keys()]);
				await Promise.all(
					Array.from(productIds).map((productId, index) =>
						(async () => {
							const product = products.find(p => p.id === productId);
							if (!product?.track_stock) return;
							const oldQty =
								stockAppliedBefore && oldWasConfirmed ? (oldQtyMap.get(productId) || 0) : 0;
							const newQty = status === 'confirmed' ? (newQtyMap.get(productId) || 0) : 0;
							const delta = newQty - oldQty;
							if (delta === 0) return;
							try {
								const current = product.stock ?? 0;
								const nextStock = Math.max(0, current + delta);
								await pb.collection('products').update(productId, { stock: nextStock }, { requestKey: `doc-inv-prod-${docId}-${index}` });
								if (warehouseId) {
									await adjustProductStock(
										activeCompany.id,
										productId,
										warehouseId,
										delta,
										ownerId,
										`doc-inv-${docId}-${index}`,
									);
								}
							} catch {
								/* stok gagal diperbarui — dokumen tetap tersimpan */
							}
						})(),
					),
				);
				try {
					await pb.collection('documents').update(docId, { stock_applied: true }, { requestKey: `doc-inv-stock-flag-${docId}` });
				} catch {
					/* bendera stok gagal diperbarui — stok tetap sudah disesuaikan */
				}
			}

			// Konversi Invoice Penjualan -> Pengiriman: tandai invoice sumber
			// sebagai "Sudah Dikirim" hanya setelah pengiriman tersimpan berhasil.
			// Idempoten — bila invoice sumber sudah berstatus sudah_dikirim, lewati.
			if (direction === 'penjualan' && targetStage === 'pengiriman' && fromId) {
				try {
					const source = await pb.collection('documents').getOne<BusinessDocument>(fromId);
					if (source.status !== 'sudah_dikirim') {
						await pb.collection('documents').update(fromId, { status: 'sudah_dikirim' });
					}
				} catch {
					/* invoice sumber gagal diperbarui — pengiriman tetap tersimpan */
				}
			}

			// Jurnal Pengiriman Penjualan: debit Piutang invoice sumber, kredit
			// Pendapatan Belum Ditagih. Idempoten — jurnal yang sudah seimbang
			// tidak dibuat ulang.
			if (direction === 'penjualan' && targetStage === 'pengiriman') {
				try {
					await ensureSalesDeliveryJournal({
						companyId: activeCompany.id,
						ownerId,
						docId,
						date,
						description: description || `Pengiriman ${savedNumber}`.trim(),
						number: savedNumber,
						amount: totals.total + shippingAmount,
						sourceDocumentId: fromId || editDoc?.source_document || undefined,
					});
				} catch {
					/* jurnal pengiriman gagal — dokumen tetap tersimpan */
				}
			}

			navigate(`/app/${basePath}?stage=${targetStage}`);
		} catch {
			setError('Gagal menyimpan dokumen. Periksa kembali isian Anda.');
		} finally {
			setIsSaving(false);
		}
	};

	const modeLabel = editId ? 'Ubah' : fromId ? `Konversi ke ${stageCfg.singular}` : `Buat ${stageCfg.singular}`;
	const compactDelivery = direction === 'penjualan' && targetStage === 'pengiriman';
	const compactPurchaseQuote = direction === 'pembelian' && targetStage === 'penawaran';
	const compactPurchaseOrder = direction === 'pembelian' && targetStage === 'pemesanan';
	const compactPurchaseInvoice = direction === 'pembelian' && targetStage === 'invoice';
	const compactSales =
		(direction === 'penjualan' &&
			(targetStage === 'penawaran' || targetStage === 'pemesanan' || targetStage === 'invoice')) ||
		compactPurchaseQuote ||
		compactPurchaseOrder ||
		compactPurchaseInvoice;
	const partyLabel =
		compactPurchaseQuote || compactPurchaseOrder || compactPurchaseInvoice ? 'Pelanggan' : dir.partyLabel;
	const compactPayment =
		(direction === 'penjualan' || direction === 'pembelian') && targetStage === 'pembayaran';
	const fieldClass = compactSales || compactDelivery || compactPayment
		? 'w-full rounded-md border border-[#d5dbe3] bg-white px-2.5 py-1.5 text-xs text-foreground outline-none ring-primary/30 focus:ring-2'
		: 'w-full rounded-lg border border-[#d5dbe3] bg-white px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2';

	if (compactSales) {
		return (
			<div className="flex flex-col gap-3">
				<Link
					to={`/app/${basePath}?stage=${targetStage}`}
					className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" /> Kembali ke {dir.title}
				</Link>
				{editDoc ? (
					<DocumentActions doc={editDoc} company={activeCompany} direction={direction} variant="full" />
				) : null}
				{loadError ? (
					<div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
						<p className="text-sm font-semibold text-destructive">{loadError}</p>
						<button
							type="button"
							onClick={() => {
								setLoadError('');
								setRetryKey(k => k + 1);
							}}
							className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
						>
							<RefreshCw className="size-3.5" /> Coba muat ulang
						</button>
					</div>
				) : null}

				<form onSubmit={handleSave} className="flex flex-col gap-3">
					<div className="grid gap-2.5 md:grid-cols-3 md:items-end">
						<div className="flex flex-col gap-1">
							<label htmlFor="doc-date" className="text-xs font-medium text-foreground">
								Tanggal
							</label>
							<input
								id="doc-date"
								type="date"
								required
								value={date}
								onChange={e => setDate(e.target.value)}
								className={fieldClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="doc-due-date" className="text-xs font-medium text-foreground">
								Tanggal Jatuh Tempo <span className="font-normal text-muted-foreground">(opsional)</span>
							</label>
							<input
								id="doc-due-date"
								type="date"
								value={dueDate}
								onChange={e => setDueDate(e.target.value)}
								className={fieldClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="doc-contact" className="text-xs font-medium text-foreground">
								{partyLabel} <span className="font-semibold text-destructive">*</span>
							</label>
							<select
								id="doc-contact"
								required
								value={studentId ? `student:${studentId}` : contact}
								onChange={e => {
									const val = e.target.value;
									if (val.startsWith('student:')) {
										const sid = val.slice('student:'.length);
										const s = students.find(item => item.id === sid);
										setContact('');
										setStudentId(sid);
										if (s) setPartner(s.student_name);
									} else {
										setContact(val);
										setStudentId('');
										const c = contacts.find(item => item.id === val);
										if (c) setPartner(c.name);
									}
								}}
								className={fieldClass}
							>
								<option value="">Pilih {partyLabel.toLowerCase()}</option>
								{contacts.length > 0 ? (
									<optgroup label="Kontak">
										{contacts.map(c => (
											<option key={c.id} value={c.id}>
												{c.name}
											</option>
										))}
									</optgroup>
								) : null}
								{students.length > 0 ? (
									<optgroup label="Siswa">
										{students.map(s => (
											<option key={s.id} value={`student:${s.id}`}>
												{s.student_name}
												{s.student_id_number ? ` (${s.student_id_number})` : ''}
											</option>
										))}
									</optgroup>
								) : null}
							</select>
						</div>
					</div>

					<div className="rounded-lg bg-[#f3eefb] px-3 py-2.5">
						<p className="text-xs font-bold text-foreground">Detail {stageCfg.singular}</p>
						<div className="mt-2 grid gap-2 md:grid-cols-[1fr_12rem_8.5rem]">
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-desc" className="text-[11px] font-semibold">
									Keterangan
								</label>
								<input
									id="doc-desc"
									value={description}
									onChange={e => setDescription(e.target.value)}
									placeholder="Keterangan dokumen"
									className={fieldClass}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-warehouse" className="text-[11px] font-semibold">
									Gudang
								</label>
								<select
									id="doc-warehouse"
									value={warehouseId}
									onChange={e => setWarehouseId(e.target.value)}
									className={fieldClass}
								>
									<option value="">Tanpa gudang</option>
									{warehouses.map(w => (
										<option key={w.id} value={w.id}>
											{w.name}
										</option>
									))}
								</select>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-status" className="text-[11px] font-semibold">
									Status
								</label>
								<select
									id="doc-status"
									value={status}
									onChange={e => setStatus(e.target.value as 'draft' | 'confirmed')}
									className={fieldClass}
								>
									<option value="draft">Draft</option>
									<option value="confirmed">Confirmed</option>
								</select>
							</div>
						</div>
					</div>

					{targetStage === 'invoice' ? (
						<PaymentTermsField
							value={paymentTerms}
							onChange={setPaymentTerms}
							invoiceDate={date}
							total={Math.max(0, totals.total - headerDiscountAmount)}
							presentation="sales-invoice"
						/>
					) : null}

					<div className="overflow-x-auto rounded-lg border border-[#e3ebe6]">
						<table className="w-full min-w-[760px] text-xs">
							<thead>
								<tr className="bg-[#e7f6ef] text-left text-[11px] font-bold text-foreground">
									<th className="rounded-tl-lg px-2 py-1.5">Produk</th>
									<th className="px-1.5 py-1.5">Deskripsi</th>
									<th className="px-1.5 py-1.5 text-right">Qty</th>
									<th className="px-1.5 py-1.5 text-right">Harga</th>
									<th className="px-1.5 py-1.5 text-right">Diskon</th>
									<th className="px-1.5 py-1.5">Pajak</th>
									<th className="px-1.5 py-1.5 text-right">Jumlah</th>
									<th className="rounded-tr-lg py-1.5 pr-1.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{items.map((item, idx) => (
									<tr key={idx} className="border-t border-[#e6eee9]">
										<td className="px-1.5 py-1.5">
											<select
												aria-label="Produk"
												value={item.product}
												onChange={e => handleProductPick(idx, e.target.value)}
												className={fieldClass}
											>
												<option value="">Pilih produk</option>
												{products.map(p => (
													<option key={p.id} value={p.id}>
														{p.name}
														{p.code ? ` (${p.code})` : ''}
													</option>
												))}
											</select>
										</td>
										<td className="px-1.5 py-1.5">
											<input
												aria-label="Deskripsi"
												value={item.name}
												onChange={e => updateItem(idx, { name: e.target.value })}
												placeholder="Deskripsi"
												className={fieldClass}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											<input
												aria-label="Qty"
												type="number"
												min="0"
												value={item.quantity}
												onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
												className={`${fieldClass} w-16 text-right`}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											<div className="flex items-center rounded-md border border-[#d5dbe3] bg-white ring-primary/30 focus-within:ring-2">
												<span className="pl-2 text-xs text-muted-foreground">Rp</span>
												<AmountInput
													aria-label="Harga"
													value={item.unitPrice}
													onValueChange={v => updateItem(idx, { unitPrice: v })}
													className="w-24 bg-transparent px-1.5 py-1.5 text-right text-xs outline-none"
												/>
											</div>
										</td>
										<td className="px-1.5 py-1.5">
											<AmountInput
												aria-label="Diskon"
												value={item.discount}
												onValueChange={v => updateItem(idx, { discount: v })}
												className={`${fieldClass} w-20 text-right`}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											{taxTypes.length > 0 ? (
												<select
													aria-label="Pajak"
													value={
														taxTypes.find(t => Number(t.rate) === Number(item.taxRate))?.id || ''
													}
													onChange={e => {
														const t = taxTypes.find(x => x.id === e.target.value);
														updateItem(idx, { taxRate: Number(t?.rate) || 0 });
													}}
													className={fieldClass}
												>
													<option value="">Tanpa Pajak (0%)</option>
													{taxTypes.map(t => (
														<option key={t.id} value={t.id}>
															{t.name} ({Number(t.rate || 0)}%)
														</option>
													))}
												</select>
											) : (
												<input
													aria-label="Pajak"
													type="number"
													min="0"
													value={item.taxRate}
													onChange={e => updateItem(idx, { taxRate: Number(e.target.value) })}
													className={`${fieldClass} w-20 text-right`}
												/>
											)}
										</td>
										<td className="px-1.5 py-1.5 text-right text-xs font-medium whitespace-nowrap tabular-nums text-muted-foreground">
											{formatRupiah(item.total)}
										</td>
										<td className="py-1.5 pr-1.5 text-right">
											<button
												type="button"
												onClick={() => removeItem(idx)}
												aria-label="Hapus item"
												disabled={items.length === 1}
												className="inline-flex size-7 items-center justify-center text-emerald-600 hover:text-emerald-700 disabled:opacity-30"
											>
												<Minus className="size-3.5" strokeWidth={2.5} />
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<button
						type="button"
						onClick={addItem}
						className="inline-flex min-h-9 w-fit items-center gap-1 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						<Plus className="size-3.5" /> Tambah Data
					</button>

					<div className="grid items-stretch gap-8 lg:grid-cols-2">
						<div className="flex flex-col justify-end gap-3">
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-memo" className="text-xs font-semibold text-foreground">
									Memo
								</label>
								<textarea
									id="doc-memo"
									value={memo}
									onChange={e => setMemo(e.target.value)}
									placeholder="Memo"
									rows={3}
									className="min-h-[3.5rem] w-full resize-y rounded-md border border-[#d5dbe3] bg-white px-2 py-1.5 text-xs text-foreground outline-none ring-primary/30 placeholder:text-slate-400 focus:ring-2"
								/>
							</div>
						</div>

						<div className="flex flex-col gap-2 text-xs text-foreground">
							<div className="flex items-center justify-between gap-3">
								<span className="font-bold">Subtotal</span>
								<span className="font-semibold tabular-nums">{formatQuoteAmount(totals.subtotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-2">
								<span>Diskon per baris</span>
								<span className="tabular-nums">{formatQuoteAmount(totals.discountTotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span>Pajak</span>
								<span className="tabular-nums">{formatQuoteAmount(totals.taxTotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<div className="flex min-w-0 items-center gap-1.5">
									<span>Diskon</span>
									<select
										aria-label="Tipe diskon"
										value={headerDiscountMode}
										onChange={e => setHeaderDiscountMode(e.target.value as 'percent' | 'amount')}
										className="h-7 rounded-md border border-[#d5dbe3] bg-[#f3f4f6] px-1 text-xs outline-none"
									>
										<option value="percent">%</option>
										<option value="amount">Rp</option>
									</select>
									<AmountInput
										aria-label="Nominal diskon"
										value={headerDiscountValue}
										onValueChange={setHeaderDiscountValue}
										className="h-7 w-24 rounded-md border border-[#d5dbe3] bg-white px-2 text-right text-xs outline-none ring-primary/30 focus:ring-2"
									/>
								</div>
								<span className="shrink-0 tabular-nums">{formatQuoteAmount(headerDiscountAmount)}</span>
							</div>
							<div className="border-t border-dashed border-slate-300" />
							<div className="flex items-center justify-between gap-3 font-bold">
								<span>Total</span>
								<span className="tabular-nums">{formatQuoteAmount(Math.max(0, totals.total - headerDiscountAmount))}</span>
							</div>
							<div className="grid items-end gap-2 sm:grid-cols-2">
								<div className="flex flex-col gap-1">
									<label htmlFor="doc-down-payment-account" className="text-xs font-semibold text-foreground">
										Akun Uang Muka
									</label>
									<select
										id="doc-down-payment-account"
										value={downPaymentAccount}
										onChange={e => setDownPaymentAccount(e.target.value)}
										className={fieldClass}
									>
										<option value="">Pilih akun uang muka</option>
										{accounts.map(a => (
											<option key={a.id} value={a.id}>
												{a.code} — {a.name}
											</option>
										))}
									</select>
								</div>
								<div className="flex flex-col gap-1">
									<label htmlFor="doc-down-payment" className="text-xs font-semibold text-foreground">
										Uang Muka
									</label>
									<div className="flex items-center rounded-md border border-[#d5dbe3] bg-white ring-primary/30 focus-within:ring-2">
										<span className="pl-2 text-xs text-muted-foreground">Rp</span>
										<AmountInput
											id="doc-down-payment"
											aria-label="Uang Muka"
											value={downPaymentAmount}
											onValueChange={setDownPayment}
											className="w-full bg-transparent px-1.5 py-1.5 text-right text-xs font-semibold outline-none"
										/>
									</div>
								</div>
							</div>
							<div className="border-t border-dashed border-slate-300" />
							<div className="flex items-center justify-between gap-2 text-sm font-bold">
								<span>Sisa tagihan</span>
								<span className="tabular-nums">
									{formatQuoteAmount(
										Math.max(
											0,
											totals.total - headerDiscountAmount - downPaymentAmount,
										),
									)}
								</span>
							</div>
						</div>
					</div>
					<div className="flex flex-wrap items-center justify-end gap-3">
						<button
							type="submit"
							disabled={isSaving}
							className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
						>
							{isSaving ? 'Menyimpan…' : `Simpan ${stageCfg.singular}`}
						</button>
						{error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
					</div>
				</form>
			</div>
		);
	}

	if (compactDelivery) {
		return (
			<div className="flex flex-col gap-3">
				<Link
					to={`/app/${basePath}?stage=${targetStage}`}
					className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" /> Kembali ke {dir.title}
				</Link>
				{editDoc ? (
					<div className="flex flex-wrap items-center gap-2">
						<DocumentActions doc={editDoc} company={activeCompany} direction={direction} variant="full" />
						{editDoc.source_document ? (
							<DeliveryPaymentAction
								sourceInvoiceId={editDoc.source_document}
								sourceInvoice={deliverySourceInvoice}
							/>
						) : null}
					</div>
				) : null}
				{loadError ? (
					<div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
						<p className="text-sm font-semibold text-destructive">{loadError}</p>
						<button
							type="button"
							onClick={() => {
								setLoadError('');
								setRetryKey(k => k + 1);
							}}
							className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
						>
							<RefreshCw className="size-3.5" /> Coba muat ulang
						</button>
					</div>
				) : null}

				<form onSubmit={handleSave} className="flex flex-col gap-3">
					<div className="grid gap-2.5 md:grid-cols-2 md:items-end">
						<div className="flex flex-col gap-1">
							<label htmlFor="doc-date" className="text-xs font-medium text-foreground">
								Tanggal
							</label>
							<input
								id="doc-date"
								type="date"
								required
								value={date}
								onChange={e => setDate(e.target.value)}
								className={fieldClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="doc-contact" className="text-xs font-medium text-foreground">
								{dir.partyLabel}
							</label>
							<select
								id="doc-contact"
								value={studentId ? `student:${studentId}` : contact}
								onChange={e => {
									const val = e.target.value;
									if (val.startsWith('student:')) {
										const sid = val.slice('student:'.length);
										const s = students.find(item => item.id === sid);
										setContact('');
										setStudentId(sid);
										if (s) setPartner(s.student_name);
									} else {
										setContact(val);
										setStudentId('');
										const c = contacts.find(item => item.id === val);
										if (c) setPartner(c.name);
									}
								}}
								className={fieldClass}
							>
								<option value="">Pilih {dir.partyLabel.toLowerCase()}</option>
								{contacts.length > 0 ? (
									<optgroup label="Kontak">
										{contacts.map(c => (
											<option key={c.id} value={c.id}>
												{c.name}
											</option>
										))}
									</optgroup>
								) : null}
								{students.length > 0 ? (
									<optgroup label="Siswa">
										{students.map(s => (
											<option key={s.id} value={`student:${s.id}`}>
												{s.student_name}
												{s.student_id_number ? ` (${s.student_id_number})` : ''}
											</option>
										))}
									</optgroup>
								) : null}
							</select>
						</div>
					</div>

					<div className="rounded-lg bg-[#f3eefb] px-3 py-2.5">
						<p className="text-xs font-bold text-foreground">Detail {stageCfg.singular}</p>
						<div className="mt-2 grid gap-2 md:grid-cols-[1fr_12rem_8.5rem]">
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-desc" className="text-[11px] font-semibold">
									Keterangan
								</label>
								<input
									id="doc-desc"
									value={description}
									onChange={e => setDescription(e.target.value)}
									placeholder="Keterangan dokumen"
									className={fieldClass}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-warehouse" className="text-[11px] font-semibold">
									Gudang
								</label>
								<select
									id="doc-warehouse"
									value={warehouseId}
									onChange={e => setWarehouseId(e.target.value)}
									className={fieldClass}
								>
									<option value="">Tanpa gudang</option>
									{warehouses.map(w => (
										<option key={w.id} value={w.id}>
											{w.name}
										</option>
									))}
								</select>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-status" className="text-[11px] font-semibold">
									Status
								</label>
								<select
									id="doc-status"
									value={status}
									onChange={e => setStatus(e.target.value as 'draft' | 'confirmed')}
									className={fieldClass}
								>
									<option value="draft">Draft</option>
									<option value="confirmed">Confirmed</option>
								</select>
							</div>
						</div>
						<p className="mt-1.5 text-[10px] text-muted-foreground">
							Stok produk akan diperbarui sesuai gudang ini saat pengiriman dikonfirmasi.
						</p>
					</div>

					<div className="overflow-x-auto rounded-lg border border-[#e3ebe6]">
						<table className="w-full min-w-[760px] text-xs">
							<thead>
								<tr className="bg-[#e7f6ef] text-left text-[11px] font-bold text-foreground">
									<th className="rounded-tl-lg px-2 py-1.5">Produk</th>
									<th className="px-1.5 py-1.5">Deskripsi</th>
									<th className="px-1.5 py-1.5 text-right">Qty</th>
									<th className="px-1.5 py-1.5 text-right">Harga</th>
									<th className="px-1.5 py-1.5 text-right">Diskon</th>
									<th className="px-1.5 py-1.5">Pajak</th>
									<th className="px-1.5 py-1.5 text-right">Jumlah</th>
									<th className="rounded-tr-lg py-1.5 pr-1.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{items.map((item, idx) => (
									<tr key={idx} className="border-t border-[#e6eee9]">
										<td className="px-1.5 py-1.5">
											<select
												aria-label="Produk"
												value={item.product}
												onChange={e => handleProductPick(idx, e.target.value)}
												className={fieldClass}
											>
												<option value="">Pilih produk</option>
												{products.map(p => (
													<option key={p.id} value={p.id}>
														{p.name}
														{p.code ? ` (${p.code})` : ''}
													</option>
												))}
											</select>
										</td>
										<td className="px-1.5 py-1.5">
											<input
												aria-label="Deskripsi"
												value={item.name}
												onChange={e => updateItem(idx, { name: e.target.value })}
												placeholder="Deskripsi"
												className={fieldClass}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											<input
												aria-label="Qty"
												type="number"
												min="0"
												value={item.quantity}
												onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
												className={`${fieldClass} w-16 text-right`}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											<div className="flex items-center rounded-md border border-[#d5dbe3] bg-white ring-primary/30 focus-within:ring-2">
												<span className="pl-2 text-xs text-muted-foreground">Rp</span>
												<AmountInput
													aria-label="Harga"
													value={item.unitPrice}
													onValueChange={v => updateItem(idx, { unitPrice: v })}
													className="w-24 bg-transparent px-1.5 py-1.5 text-right text-xs outline-none"
												/>
											</div>
										</td>
										<td className="px-1.5 py-1.5">
											<AmountInput
												aria-label="Diskon"
												value={item.discount}
												onValueChange={v => updateItem(idx, { discount: v })}
												className={`${fieldClass} w-20 text-right`}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											{taxTypes.length > 0 ? (
												<select
													aria-label="Pajak"
													value={
														taxTypes.find(t => Number(t.rate) === Number(item.taxRate))?.id || ''
													}
													onChange={e => {
														const t = taxTypes.find(x => x.id === e.target.value);
														updateItem(idx, { taxRate: Number(t?.rate) || 0 });
													}}
													className={fieldClass}
												>
													<option value="">Tanpa Pajak (0%)</option>
													{taxTypes.map(t => (
														<option key={t.id} value={t.id}>
															{t.name} ({Number(t.rate || 0)}%)
														</option>
													))}
												</select>
											) : (
												<input
													aria-label="Pajak"
													type="number"
													min="0"
													value={item.taxRate}
													onChange={e => updateItem(idx, { taxRate: Number(e.target.value) })}
													className={`${fieldClass} w-20 text-right`}
												/>
											)}
										</td>
										<td className="px-1.5 py-1.5 text-right text-xs font-medium whitespace-nowrap tabular-nums text-muted-foreground">
											{formatRupiah(item.total)}
										</td>
										<td className="py-1.5 pr-1.5 text-right">
											<button
												type="button"
												onClick={() => removeItem(idx)}
												aria-label="Hapus item"
												disabled={items.length === 1}
												className="inline-flex size-7 items-center justify-center text-emerald-600 hover:text-emerald-700 disabled:opacity-30"
											>
												<Minus className="size-3.5" strokeWidth={2.5} />
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<button
						type="button"
						onClick={addItem}
						className="inline-flex min-h-9 w-fit items-center gap-1 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						<Plus className="size-3.5" /> Tambah Data
					</button>

					<div className="flex justify-end">
						<div className="flex w-full max-w-sm flex-col gap-2 text-xs text-foreground">
							<div className="flex items-center justify-between gap-3">
								<span className="font-bold">Subtotal</span>
								<span className="font-semibold tabular-nums">{formatQuoteAmount(totals.subtotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-2">
								<span>Diskon per baris</span>
								<span className="tabular-nums">{formatQuoteAmount(totals.discountTotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span>Pajak</span>
								<span className="tabular-nums">{formatQuoteAmount(totals.taxTotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span>Ongkos Kirim</span>
								<div className="flex items-center rounded-md border border-[#d5dbe3] bg-white ring-primary/30 focus-within:ring-2">
									<span className="pl-2 text-xs text-muted-foreground">Rp</span>
									<AmountInput
										aria-label="Ongkos Kirim"
										value={shippingCost}
										onValueChange={setShippingCost}
										className="w-28 bg-transparent px-1.5 py-1.5 text-right text-xs outline-none"
									/>
								</div>
							</div>
							<div className="border-t border-dashed border-slate-300" />
							<div className="flex items-center justify-between gap-3 text-sm font-bold">
								<span>Total</span>
								<span className="tabular-nums">{formatQuoteAmount(totals.total + shippingAmount)}</span>
							</div>
						</div>
					</div>

					<div className="flex flex-wrap items-center justify-end gap-3">
						<button
							type="submit"
							disabled={isSaving}
							className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
						>
							{isSaving ? 'Menyimpan…' : `Simpan ${stageCfg.singular}`}
						</button>
						{error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
					</div>
				</form>
			</div>
		);
	}

	if (compactPayment) {
		const paymentPenalty =
			sourceInvoice && paymentTermsCalc && !paymentTermsCalc.discountActive
				? computeLatePenalty(
						penaltySettings,
						{
							total: sourceInvoice.total,
							payment_terms: sourceInvoice.payment_terms,
							date: sourceInvoice.date,
							paid_amount: sourceInvoice.paid_amount,
						},
						date,
					)
				: null;
		const obligation = sourceInvoice
			? paymentTermsCalc?.discountActive
				? paymentTermsCalc.payableWithDiscount
				: sourceInvoice.total + (paymentPenalty?.penalty ?? 0)
			: totals.total;
		const alreadyPaid = sourceInvoice ? Number(sourceInvoice.paid_amount) || 0 : 0;
		const payingNow = Math.max(0, Number(paidAmount) || 0);
		const remainingBill = Math.max(0, obligation - alreadyPaid - payingNow);
		const displayedDue = paymentTermsCalc?.dueDate || sourceInvoice?.due_date || dueDate;
		const purchasePayment = direction === 'pembelian';
		const paymentPartyLabel = purchasePayment ? 'Pelanggan' : dir.partyLabel;
		const cashAccount = purchasePayment ? creditAccount : debitAccount;
		const setCashAccount = purchasePayment ? setCreditAccount : setDebitAccount;
		const cashFiltered = purchasePayment
			? accounts.filter(account => account.type === 'aset' || /kas|bank/i.test(account.name))
			: accounts;
		const cashOptions = cashFiltered.length > 0 ? cashFiltered : accounts;

		return (
			<div className="flex flex-col gap-3">
				<Link
					to={`/app/${basePath}?stage=${targetStage}`}
					className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" /> Kembali ke {dir.title}
				</Link>
				{editDoc ? (
					<DocumentActions doc={editDoc} company={activeCompany} direction={direction} variant="full" />
				) : null}
				{loadError ? (
					<div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
						<p className="text-sm font-semibold text-destructive">{loadError}</p>
						<button
							type="button"
							onClick={() => {
								setLoadError('');
								setRetryKey(k => k + 1);
							}}
							className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
						>
							<RefreshCw className="size-3.5" /> Coba muat ulang
						</button>
					</div>
				) : null}

				<form onSubmit={handleSave} className="flex flex-col gap-3">
					<div className="grid gap-2.5 md:grid-cols-3 md:items-end">
						<div className="flex flex-col gap-1">
							<label htmlFor="doc-date" className="text-xs font-medium text-foreground">
								Tanggal
							</label>
							<input
								id="doc-date"
								type="date"
								required
								value={date}
								onChange={e => setDate(e.target.value)}
								className={fieldClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="doc-due-date" className="text-xs font-medium text-foreground">
								Tanggal Jatuh Tempo <span className="font-normal text-muted-foreground">(opsional)</span>
							</label>
							<input
								id="doc-due-date"
								type="date"
								readOnly={!purchasePayment}
								value={purchasePayment ? dueDate : displayedDue}
								onChange={e => setDueDate(e.target.value)}
								className={fieldClass}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label htmlFor="doc-contact" className="text-xs font-medium text-foreground">
								{paymentPartyLabel} <span className="font-semibold text-destructive">*</span>
							</label>
							<select
								id="doc-contact"
								required={purchasePayment}
								value={studentId ? `student:${studentId}` : contact}
								onChange={e => {
									const val = e.target.value;
									if (val.startsWith('student:')) {
										const sid = val.slice('student:'.length);
										const s = students.find(item => item.id === sid);
										setContact('');
										setStudentId(sid);
										if (s) setPartner(s.student_name);
									} else {
										setContact(val);
										setStudentId('');
										const c = contacts.find(item => item.id === val);
										if (c) setPartner(c.name);
									}
								}}
								className={fieldClass}
							>
								<option value="">Pilih {paymentPartyLabel.toLowerCase()}</option>
								{contacts.length > 0 ? (
									<optgroup label="Kontak">
										{contacts.map(c => (
											<option key={c.id} value={c.id}>
												{c.name}
											</option>
										))}
									</optgroup>
								) : null}
								{students.length > 0 ? (
									<optgroup label="Siswa">
										{students.map(s => (
											<option key={s.id} value={`student:${s.id}`}>
												{s.student_name}
												{s.student_id_number ? ` (${s.student_id_number})` : ''}
											</option>
										))}
									</optgroup>
								) : null}
							</select>
						</div>
					</div>

					<div className="rounded-lg bg-[#f3eefb] px-3 py-2.5">
						<p className="text-xs font-bold text-foreground">Detail {stageCfg.singular}</p>
						<div className="mt-2 grid gap-2 md:grid-cols-[1fr_12rem_8.5rem]">
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-desc" className="text-[11px] font-semibold">
									Keterangan
								</label>
								<input
									id="doc-desc"
									value={description}
									onChange={e => setDescription(e.target.value)}
									placeholder="Keterangan dokumen"
									className={fieldClass}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-debit" className="text-[11px] font-semibold">
									Akun Kas/Bank
								</label>
								<select
									id="doc-debit"
									value={cashAccount}
									onChange={e => setCashAccount(e.target.value)}
									className={fieldClass}
								>
									<option value="">Pilih akun</option>
									{cashOptions.map(a => (
										<option key={a.id} value={a.id}>
											{a.code} — {a.name}
										</option>
									))}
								</select>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-status" className="text-[11px] font-semibold">
									Status
								</label>
								<select
									id="doc-status"
									value={status}
									onChange={e => setStatus(e.target.value as 'draft' | 'confirmed')}
									className={fieldClass}
								>
									<option value="draft">Draft</option>
									<option value="confirmed">Confirmed</option>
								</select>
							</div>
						</div>
					</div>

					{sourceInvoice?.payment_terms ? (
						<PaymentTermsField
							value={sourceInvoice.payment_terms}
							onChange={() => {}}
							invoiceDate={sourceInvoice.date}
							total={sourceInvoice.total}
							presentation="sales-invoice"
							readOnly
						/>
					) : (
						<div className="flex w-full flex-col gap-1 md:max-w-md">
							<label htmlFor="doc-payment-terms" className="text-xs font-medium text-foreground">
								Syarat Pembayaran
							</label>
							<select id="doc-payment-terms" disabled value="" className={fieldClass}>
								<option value="">Tanpa syarat</option>
							</select>
						</div>
					)}
					{paymentPenalty && paymentPenalty.penalty > 0 ? (
						<p className="text-[11px] font-semibold text-amber-700">
							Terlambat {paymentPenalty.daysOverdue} hari · denda {formatRupiah(paymentPenalty.penalty)} sudah
							masuk nominal pembayaran.
						</p>
					) : null}

					<div className="overflow-x-auto rounded-lg border border-[#e3ebe6]">
						<table className="w-full min-w-[760px] text-xs">
							<thead>
								<tr className="bg-[#e7f6ef] text-left text-[11px] font-bold text-foreground">
									<th className="rounded-tl-lg px-2 py-1.5">Produk</th>
									<th className="px-1.5 py-1.5">Deskripsi</th>
									<th className="px-1.5 py-1.5 text-right">Qty</th>
									<th className="px-1.5 py-1.5 text-right">Harga</th>
									<th className="px-1.5 py-1.5 text-right">Diskon</th>
									<th className="px-1.5 py-1.5">Pajak</th>
									<th className="px-1.5 py-1.5 text-right">Jumlah</th>
									<th className="rounded-tr-lg py-1.5 pr-1.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{items.map((item, idx) => (
									<tr key={idx} className="border-t border-[#e6eee9]">
										<td className="px-1.5 py-1.5">
											<select
												aria-label="Produk"
												value={item.product}
												onChange={e => handleProductPick(idx, e.target.value)}
												className={fieldClass}
											>
												<option value="">Pilih produk</option>
												{products.map(p => (
													<option key={p.id} value={p.id}>
														{p.name}
														{p.code ? ` (${p.code})` : ''}
													</option>
												))}
											</select>
										</td>
										<td className="px-1.5 py-1.5">
											<input
												aria-label="Deskripsi"
												value={item.name}
												onChange={e => updateItem(idx, { name: e.target.value })}
												placeholder="Deskripsi"
												className={fieldClass}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											<input
												aria-label="Qty"
												type="number"
												min="0"
												value={item.quantity}
												onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
												className={`${fieldClass} w-16 text-right`}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											<div className="flex items-center rounded-md border border-[#d5dbe3] bg-white ring-primary/30 focus-within:ring-2">
												<span className="pl-2 text-xs text-muted-foreground">Rp</span>
												<AmountInput
													aria-label="Harga"
													value={item.unitPrice}
													onValueChange={v => updateItem(idx, { unitPrice: v })}
													className="w-24 bg-transparent px-1.5 py-1.5 text-right text-xs outline-none"
												/>
											</div>
										</td>
										<td className="px-1.5 py-1.5">
											<AmountInput
												aria-label="Diskon"
												value={item.discount}
												readOnly={Boolean(sourceInvoice?.payment_terms)}
												onValueChange={v => updateItem(idx, { discount: v })}
												className={`${fieldClass} w-20 text-right read-only:bg-secondary`}
											/>
										</td>
										<td className="px-1.5 py-1.5">
											{taxTypes.length > 0 ? (
												<select
													aria-label="Pajak"
													value={taxTypes.find(t => Number(t.rate) === Number(item.taxRate))?.id || ''}
													onChange={e => {
														const t = taxTypes.find(x => x.id === e.target.value);
														updateItem(idx, { taxRate: Number(t?.rate) || 0 });
													}}
													className={fieldClass}
												>
													<option value="">Tanpa Pajak (0%)</option>
													{taxTypes.map(t => (
														<option key={t.id} value={t.id}>
															{t.name} ({Number(t.rate || 0)}%)
														</option>
													))}
												</select>
											) : (
												<input
													aria-label="Pajak"
													type="number"
													min="0"
													value={item.taxRate}
													onChange={e => updateItem(idx, { taxRate: Number(e.target.value) })}
													className={`${fieldClass} w-20 text-right`}
												/>
											)}
										</td>
										<td className="px-1.5 py-1.5 text-right text-xs font-medium whitespace-nowrap tabular-nums text-muted-foreground">
											{formatRupiah(item.total)}
										</td>
										<td className="py-1.5 pr-1.5 text-right">
											<button
												type="button"
												onClick={() => removeItem(idx)}
												aria-label="Hapus item"
												disabled={items.length === 1}
												className="inline-flex size-7 items-center justify-center text-emerald-600 hover:text-emerald-700 disabled:opacity-30"
											>
												<Minus className="size-3.5" strokeWidth={2.5} />
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<button
						type="button"
						onClick={addItem}
						className="inline-flex min-h-9 w-fit items-center gap-1 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						<Plus className="size-3.5" /> Tambah Data
					</button>

					<div className="grid items-stretch gap-8 lg:grid-cols-2">
						<div className="flex flex-col justify-end gap-3">
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-memo" className="text-xs font-semibold text-foreground">
									Memo
								</label>
								<textarea
									id="doc-memo"
									value={memo}
									onChange={e => setMemo(e.target.value)}
									placeholder="Memo"
									rows={3}
									className="min-h-[3.5rem] w-full resize-y rounded-md border border-[#d5dbe3] bg-white px-2 py-1.5 text-xs text-foreground outline-none ring-primary/30 placeholder:text-slate-400 focus:ring-2"
								/>
							</div>
						</div>

						<div className="flex flex-col gap-2 text-xs text-foreground">
							<div className="flex items-center justify-between gap-3">
								<span className="font-bold">Subtotal</span>
								<span className="font-semibold tabular-nums">{formatQuoteAmount(totals.subtotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-2">
								<span>Diskon per baris</span>
								<span className="tabular-nums">{formatQuoteAmount(totals.discountTotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span>Pajak</span>
								<span className="tabular-nums">{formatQuoteAmount(totals.taxTotal)}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span>Diskon</span>
								<span className="tabular-nums">{formatQuoteAmount(purchasePayment ? headerDiscountAmount : totals.discountTotal)}</span>
							</div>
							<div className="border-t border-dashed border-slate-300" />
							<div className="flex items-center justify-between gap-3 font-bold">
								<span>Total</span>
								<span className="tabular-nums">{formatQuoteAmount(sourceInvoice ? obligation : totals.total)}</span>
							</div>
							<div className="flex flex-col gap-1">
								<label htmlFor="doc-paid" className="text-xs font-semibold text-foreground">
									Nominal Bayar
								</label>
								<div className="flex items-center rounded-md border border-[#d5dbe3] bg-white ring-primary/30 focus-within:ring-2">
									<span className="pl-2 text-xs text-muted-foreground">Rp</span>
									<AmountInput
										id="doc-paid"
										required
										aria-label="Nominal pembayaran"
										value={paidAmount}
										onValueChange={v => setPaidAmount(String(v))}
										className="w-full bg-transparent px-1.5 py-1.5 text-right text-xs font-semibold outline-none"
									/>
								</div>
							</div>
							<div className="border-t border-dashed border-slate-300" />
							<div className="flex items-center justify-between gap-2 text-sm font-bold">
								<span>Sisa tagihan</span>
								<span className="tabular-nums">{formatQuoteAmount(remainingBill)}</span>
							</div>
						</div>
					</div>
					<div className="flex flex-wrap items-center justify-end gap-3">
						<button
							type="submit"
							disabled={isSaving}
							className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
						>
							{isSaving ? 'Menyimpan…' : `Simpan ${stageCfg.singular}`}
						</button>
						{error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
					</div>
				</form>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-col gap-3">
				<Link
					to={`/app/${basePath}?stage=${targetStage}`}
					className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Kembali ke {dir.title}
				</Link>
				<div>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
						{modeLabel} {dir.title}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">{stageCfg.description}</p>
				{editDoc ? (
					<div className="mt-4">
						<DocumentActions
							doc={editDoc}
							company={activeCompany}
							direction={direction}
							variant="full"
						/>
					</div>
				) : null}
				</div>
			</header>

			{loadError ? (
				<div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
					<p className="text-sm font-semibold text-destructive">{loadError}</p>
					<button
						type="button"
						onClick={() => {
							setLoadError('');
							setRetryKey(k => k + 1);
						}}
						className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
					>
						<RefreshCw className="size-3.5" /> Coba muat ulang
					</button>
				</div>
			) : null}

			<form
				onSubmit={handleSave}
				className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-soft"
			>
				<div className="grid gap-4 md:grid-cols-4 md:items-end">
					<div className="flex flex-col gap-2">
						<label htmlFor="doc-stage" className="text-xs font-semibold">Tahap</label>
						<input
							id="doc-stage"
							value={stageCfg.singular}
							disabled
							className="rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm font-semibold"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="doc-date" className="text-xs font-semibold">Tanggal</label>
						<input
							id="doc-date"
							type="date"
							required
							value={date}
							onChange={e => setDate(e.target.value)}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<label htmlFor="doc-contact" className="text-xs font-semibold">{dir.partyLabel}</label>
						<select
							id="doc-contact"
							value={contact}
							onChange={e => {
								const val = e.target.value;
								if (val.startsWith('student:')) {
									const sid = val.slice('student:'.length);
									const s = students.find(item => item.id === sid);
									setContact('');
									setStudentId(sid);
									if (s) setPartner(s.student_name);
								} else {
									setContact(val);
									setStudentId('');
									const c = contacts.find(item => item.id === val);
									if (c) setPartner(c.name);
								}
							}}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						>
							<option value="">Pilih {dir.partyLabel.toLowerCase()}</option>
							{contacts.length > 0 ? (
								<optgroup label="Kontak">
									{contacts.map(c => (
										<option key={c.id} value={c.id}>{c.name}</option>
									))}
								</optgroup>
							) : null}
							{students.length > 0 ? (
								<optgroup label="Siswa">
									{students.map(s => (
										<option key={s.id} value={`student:${s.id}`}>
											{s.student_name}{s.student_id_number ? ` (${s.student_id_number})` : ''}
										</option>
									))}
								</optgroup>
							) : null}
						</select>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<label htmlFor="doc-desc" className="text-xs font-semibold">Keterangan</label>
					<input
						id="doc-desc"
						value={description}
						onChange={e => setDescription(e.target.value)}
						placeholder="Keterangan dokumen"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>

				<div className="flex flex-col gap-2 md:max-w-xs">
					<label htmlFor="doc-warehouse" className="text-xs font-semibold">Gudang</label>
					<select
						id="doc-warehouse"
						value={warehouseId}
						onChange={e => setWarehouseId(e.target.value)}
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					>
						<option value="">Tanpa gudang</option>
						{warehouses.map(w => (
							<option key={w.id} value={w.id}>{w.name}</option>
						))}
					</select>
					{targetStage === 'pengiriman' ? (
						<p className="text-[10px] text-muted-foreground">
							Stok produk akan diperbarui sesuai gudang ini saat pengiriman dikonfirmasi.
						</p>
					) : null}
				</div>

				{targetStage === 'invoice' ? (
					<PaymentTermsField value={paymentTerms} onChange={setPaymentTerms} invoiceDate={date} total={totals.total} />
				) : null}

				{/* Line items */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-bold">Item</h2>
						<button
							type="button"
							onClick={addItem}
							className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-accent"
						>
							<Plus className="size-3.5" /> Tambah Item
						</button>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[760px] text-sm">
							<thead>
								<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide">
									<th className="py-2 pr-3">Produk</th>
									<th className="px-3 py-2">Deskripsi</th>
									<th className="px-3 py-2 text-right">Qty</th>
									<th className="px-3 py-2 text-right">Harga</th>
									<th className="px-3 py-2 text-right">Diskon</th>
									<th className="px-3 py-2 text-right">Pajak (%)</th>
									<th className="px-3 py-2 text-right">Jumlah</th>
									<th className="py-2 pl-3" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{items.map((item, idx) => (
									<tr key={idx} className="border-b border-foreground/10 last:border-0">
										<td className="py-2 pr-3">
											<select
												value={item.product}
												onChange={e => handleProductPick(idx, e.target.value)}
												className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
											>
												<option value="">— Manual —</option>
												{products.map(p => (
													<option key={p.id} value={p.id}>
														{p.name} {p.code ? `(${p.code})` : ''}
													</option>
												))}
											</select>
										</td>
										<td className="px-3 py-2">
											<input
												value={item.name}
												onChange={e => updateItem(idx, { name: e.target.value })}
												placeholder="Nama item"
												className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
											/>
										</td>
										<td className="px-3 py-2">
											<input
												type="number"
												min="0"
												value={item.quantity}
												onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
												className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-xs outline-none ring-primary/30 focus:ring-2"
											/>
										</td>
										<td className="px-3 py-2">
											<AmountInput
												value={item.unitPrice}
												onValueChange={v => updateItem(idx, { unitPrice: v })}
												className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-xs outline-none ring-primary/30 focus:ring-2"
											/>
										</td>
										<td className="px-3 py-2">
											<AmountInput
												value={item.discount}
												readOnly={Boolean(sourceInvoice?.payment_terms) && targetStage === 'pembayaran'}
												onValueChange={v => updateItem(idx, { discount: v })}
												className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-xs outline-none ring-primary/30 focus:ring-2 read-only:bg-secondary read-only:font-bold"
											/>
										</td>
										<td className="px-3 py-2">
											{taxTypes.length > 0 ? (
												<select
													value={
														taxTypes.find(t => Number(t.rate) === Number(item.taxRate))?.id ||
														taxTypes[0]?.id ||
														''
													}
													onChange={e => {
														const t = taxTypes.find(x => x.id === e.target.value);
														updateItem(idx, { taxRate: Number(t?.rate) || 0 });
													}}
													className="min-w-[7.5rem] rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
												>
													{taxTypes.map(t => (
														<option key={t.id} value={t.id}>
															{t.name} ({Number(t.rate || 0)}%)
														</option>
													))}
												</select>
											) : (
												<input
													type="number"
													min="0"
													value={item.taxRate}
													onChange={e => updateItem(idx, { taxRate: Number(e.target.value) })}
													className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-xs outline-none ring-primary/30 focus:ring-2"
												/>
											)}
										</td>
										<td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
											{formatRupiah(item.total)}
										</td>
										<td className="py-2 pl-3 text-right">
											<button
												type="button"
												onClick={() => removeItem(idx)}
												aria-label="Hapus item"
												className="border border-border p-1 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
											>
												<Trash2 className="size-3.5" />
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="flex justify-end">
						<div className="w-full max-w-xs rounded-xl bg-secondary px-4 py-3 text-xs">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Subtotal</span>
								<span className="font-semibold">{formatRupiah(totals.subtotal)}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Diskon</span>
								<span className="font-semibold">- {formatRupiah(totals.discountTotal)}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Pajak</span>
								<span className="font-semibold">{formatRupiah(totals.taxTotal)}</span>
							</div>
							{direction === 'pembelian' ? (
								<div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
									<label htmlFor="doc-withholding-account" className="text-muted-foreground">
										Akun Pemotongan
									</label>
									<select
										id="doc-withholding-account"
										aria-label="Akun pemotongan pajak"
										value={withholdingAccount}
										onChange={e => setWithholdingAccount(e.target.value)}
										className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
									>
										<option value="">Tanpa pemotongan</option>
										{accounts.map(a => (
											<option key={a.id} value={a.id}>
												{a.code} — {a.name}
											</option>
										))}
									</select>
									<div className="flex items-center justify-between gap-2">
										<span className="text-muted-foreground">Pemotongan</span>
										<div className="flex items-center gap-1.5">
											<input
												id="doc-withholding"
												type="number"
												min="0"
												step="any"
												value={withholdingValue}
												onChange={e => setWithholdingValue(Math.max(0, Number(e.target.value) || 0))}
												className="w-16 rounded-md border border-border bg-background px-1.5 py-1 text-right text-xs outline-none ring-primary/30 focus:ring-2"
											/>
											<div className="inline-flex overflow-hidden rounded-md border border-border bg-background">
												<button
													type="button"
													aria-pressed={withholdingMode === 'percent'}
													onClick={() => setWithholdingMode('percent')}
													className={
														withholdingMode === 'percent'
															? 'bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground'
															: 'bg-background px-2 py-1 text-xs font-medium text-muted-foreground'
													}
												>
													%
												</button>
												<button
													type="button"
													aria-pressed={withholdingMode === 'amount'}
													onClick={() => setWithholdingMode('amount')}
													className={
														withholdingMode === 'amount'
															? 'border-l border-border bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground'
															: 'border-l border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground'
													}
												>
													Rp
												</button>
											</div>
										</div>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Jumlah Pemotongan</span>
										<span className="font-semibold">- {formatRupiah(withholdingAmount)}</span>
									</div>
								</div>
							) : null}
							<div className="mt-1 flex justify-between border-t border-border pt-1">
								<span className="font-bold">Total</span>
								<span className="font-extrabold text-primary">{formatRupiah(totals.total)}</span>
							</div>
						</div>
					</div>
				</div>

				{stageCfg.isPayment ? (
					<div className="flex flex-col gap-4">
						{sourceInvoice && paymentTermsCalc ? (
							<div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs">
								<p className="flex items-center gap-1 font-bold text-emerald-700">
									Syarat pembayaran: {sourceInvoice.payment_terms}
								</p>
								<div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-emerald-800">
									<span>
										Total invoice: <span className="font-bold">{formatRupiah(paymentTermsCalc.fullAmount)}</span>
									</span>
									<span>
										Batas diskon: <span className="font-bold">{formatDate(paymentTermsCalc.discountDeadline)}</span>
									</span>
									<span>
										Jatuh tempo: <span className="font-bold">{formatDate(paymentTermsCalc.dueDate)}</span>
									</span>
								</div>
								{paymentTermsCalc.discountActive ? (
									<div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-emerald-100/70 px-3 py-2 font-semibold text-emerald-800">
										<span>Diskon {paymentTermsCalc.parsed.discountRate}%: - {formatRupiah(paymentTermsCalc.discountAmount)}</span>
										<span>Harus dibayar: {formatRupiah(paymentTermsCalc.payableWithDiscount)}</span>
									</div>
								) : (
									<p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-700">
										Masa diskon telah berakhir — bayar jumlah penuh {formatRupiah(paymentTermsCalc.fullAmount)}.
									</p>
								)}
							</div>
						) : null}
						{sourceInvoice && paymentTermsCalc && !paymentTermsCalc.discountActive
							? (() => {
									const penaltyCalc = computeLatePenalty(
										penaltySettings,
										{
											total: sourceInvoice.total,
											payment_terms: sourceInvoice.payment_terms,
											date: sourceInvoice.date,
											paid_amount: sourceInvoice.paid_amount,
										},
										date,
									);
									if (!penaltyCalc || penaltyCalc.penalty <= 0) return null;
									return (
										<div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs">
											<p className="flex items-center gap-1 font-bold text-amber-700">
												Denda keterlambatan berlaku
											</p>
											<div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-amber-800">
												<span>
													Denda: <span className="font-bold">{formatRupiah(penaltyCalc.penalty)}</span> (terlambat {penaltyCalc.daysOverdue} hari)
												</span>
												<span>
													Total + denda: <span className="font-bold">{formatRupiah(penaltyCalc.totalWithPenalty)}</span>
												</span>
											</div>
											<p className="mt-1 text-[11px] text-amber-700">
												Invoice telah melewati jatuh tempo. Nominal pembayaran diisi otomatis
												termasuk denda satu kali.
											</p>
										</div>
									);
								})()
							: null}
						<div className="grid gap-4 md:grid-cols-4 md:items-end">
							{sourceInvoice?.payment_terms ? (
								<div className="flex flex-col gap-2 md:col-span-2">
									<label htmlFor="doc-terms-discount" className="text-sm font-extrabold tracking-wide text-foreground">
										DISKON
									</label>
									<input
										id="doc-terms-discount"
										type="text"
										readOnly
										value={paymentTermsCalc?.discountActive ? paymentTermsCalc.discountAmount : 0}
										aria-label="Diskon otomatis dari syarat pembayaran"
										className="rounded-full border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-center text-lg font-bold text-foreground outline-none"
									/>
								</div>
							) : null}
							<div className="flex flex-col gap-2 md:col-span-2">
								<label htmlFor="doc-paid" className="text-xs font-semibold">Nominal Pembayaran (Rp)</label>
								<AmountInput
									id="doc-paid"
									required
									value={paidAmount}
									onValueChange={v => setPaidAmount(String(v))}
									placeholder={String(totals.total)}
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</div>
						</div>
					</div>
				) : null}

				{stageCfg.postsJournal ? (
					<div className="grid gap-4 rounded-xl bg-accent/40 p-4 md:grid-cols-2">
						<p className="text-xs font-semibold md:col-span-2">
							Posting Jurnal — {stageCfg.isPayment ? 'penerimaan/pembayaran kas' : 'pengakuan piutang/utang'}
						</p>
						<div className="flex flex-col gap-2">
							<label htmlFor="doc-debit" className="text-xs font-semibold">Akun Debit</label>
							<select
								id="doc-debit"
								value={debitAccount}
								onChange={e => setDebitAccount(e.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								{accounts.length === 0 ? <option value="">Belum ada akun</option> : null}
								{accounts.map(a => (
									<option key={a.id} value={a.id}>{a.code} — {a.name}</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="doc-credit" className="text-xs font-semibold">Akun Kredit</label>
							<select
								id="doc-credit"
								value={creditAccount}
								onChange={e => setCreditAccount(e.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								{accounts.length === 0 ? <option value="">Belum ada akun</option> : null}
								{accounts.map(a => (
									<option key={a.id} value={a.id}>{a.code} — {a.name}</option>
								))}
							</select>
						</div>
					</div>
				) : null}

				<div className="flex flex-wrap items-center gap-3">
					<div className="flex flex-col gap-2">
						<label htmlFor="doc-status" className="text-xs font-semibold">Status</label>
						<select
							id="doc-status"
							value={status}
							onChange={e => setStatus(e.target.value as 'draft' | 'confirmed')}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						>
							<option value="draft">Draft</option>
							<option value="confirmed">Confirmed</option>
						</select>
					</div>
					<button
						type="submit"
						disabled={isSaving}
						className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
					>
						{isSaving ? 'Menyimpan…' : `Simpan ${stageCfg.singular}`}
					</button>
					{error ? (
						<p className="mt-6 text-sm font-semibold text-destructive">{error}</p>
					) : null}
				</div>
			</form>
		</div>
	);
}

/**
 * Tindakan pembayaran pada formulir Pengiriman Penjualan.
 *
 * Menghubungkan pengiriman ke alur pembayaran transaksi penjualan yang sudah
 * ada: mengarahkan ke konversi invoice sumber → Pembayaran. Tidak membuat
 * pencatatan pembayaran sendiri, sehingga tidak ada risiko pembayaran ganda —
 * alur pembayaran yang ada yang menangani posting jurnal dan pembaruan
 * paid_amount invoice sumber.
 *
 * Jika invoice sumber sudah lunas, tombol disembunyikan agar pengguna tidak
 * membuat pembayaran untuk tagihan yang sudah diselesaikan.
 */
function DeliveryPaymentAction({
	sourceInvoiceId,
	sourceInvoice,
}: {
	sourceInvoiceId: string;
	sourceInvoice: BusinessDocument | null;
}) {
	// Sedang memuat invoice sumber — tampilkan tombol non-aktif agar slot stabil.
	if (sourceInvoiceId && !sourceInvoice) {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
				<Banknote className="size-3.5" /> Memuat pembayaran…
			</span>
		);
	}

	const total = Number(sourceInvoice?.total) || 0;
	const paid = Number(sourceInvoice?.paid_amount) || 0;
	const down = Number(sourceInvoice?.down_payment) || 0;
	const isPaid = total > 0 && paid + down >= total;

	// Invoice sumber sudah lunas — tidak perlu pembayaran lagi.
	if (isPaid) {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
				<Banknote className="size-3.5" /> Pembayaran Lunas
			</span>
		);
	}

	const remaining = Math.max(0, total - paid - down);

	return (
		<Link
			to={`/app/penjualan/dokumen/buat/pembayaran/konversi/${sourceInvoiceId}`}
			className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white"
		>
			<Banknote className="size-3.5" /> Buat Pembayaran
			{remaining > 0 ? (
				<span className="ml-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
					Sisa {formatRupiah(remaining)}
				</span>
			) : null}
		</Link>
	);
}
