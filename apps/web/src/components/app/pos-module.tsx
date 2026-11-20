import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	Banknote,
	Minus,
	Plus,
	Search,
	ShoppingCart,
	Store,
	Users,
	X,
	CheckCircle2,
	Receipt,
	Pause,
	Play,
	Trash2,
	LayoutGrid,
	ImageOff,
	LayoutList,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	formatRupiah,
	todayIso,
	type Account,
	type Company,
} from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import type { Student } from '@/lib/students';
import type { Product } from '@/lib/products';
import type { Warehouse } from '@/lib/warehouses';
import type { TaxType } from '@/lib/tax';
import { loadTaxTypes } from '@/lib/tax';
import { adjustProductStock } from '@/lib/warehouse-stock';
import type { Table } from '@/lib/tables';
import {
	buildDocumentNumber,
	computeDocumentTotals,
	type BusinessDocument,
	type DocumentItem,
} from '@/lib/documents';
import {
	countInvoicesThisMonth,
	effectiveInvoiceMonthlyLimit,
	hasCustomInvoiceQuota,
	invoiceLimitMessage,
} from '@/lib/plan-access';
import {
	loadHeldOrders,
	addHeldOrder,
	removeHeldOrder,
	type HeldOrder,
	type HeldCartItem,
} from '@/lib/pos-held-orders';
import { NoCompany } from '@/components/app/no-company';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface PosModuleProps {
	activeCompany: Company | null;
}

interface CartItem extends DocumentItem {
	stock: number;
}

const EMPTY_CART_ITEM: CartItem = {
	product: '',
	name: '',
	code: '',
	quantity: 1,
	unitPrice: 0,
	discount: 0,
	taxRate: 0,
	total: 0,
	stock: 0,
};

interface Receipt {
	number: string;
	total: number;
	paid: number;
	partner: string;
}

function productImageUrl(product: Product): string | null {
	if (!product.image) return null;
	try {
		return pb.files.getURL(product, product.image, { thumb: '200x200' });
	} catch {
		return null;
	}
}

export function PosModule({ activeCompany }: PosModuleProps) {
	const [products, setProducts] = useState<Product[]>([]);
	const [customers, setCustomers] = useState<Contact[]>([]);
	const [students, setStudents] = useState<Student[]>([]);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
	const [taxTypes, setTaxTypes] = useState<TaxType[]>([]);
	const [tables, setTables] = useState<Table[]>([]);
	const [tableInvoices, setTableInvoices] = useState<BusinessDocument[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const [search, setSearch] = useState('');
	const [cart, setCart] = useState<CartItem[]>([]);
	const [customerId, setCustomerId] = useState('');
	const [warehouseId, setWarehouseId] = useState('');
	const [paymentAccountId, setPaymentAccountId] = useState('');
	const [taxRate, setTaxRate] = useState(0);
	const [tableId, setTableId] = useState('');
	const [isCheckingOut, setIsCheckingOut] = useState(false);
	const [error, setError] = useState('');
	const [receipt, setReceipt] = useState<Receipt | null>(null);

	// Pesanan ditahan (held orders) — disimpan di localStorage per perusahaan.
	const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);

	// Dialog kelola meja.
	const [tablesOpen, setTablesOpen] = useState(false);
	const [newTableName, setNewTableName] = useState('');
	const [newTableCapacity, setNewTableCapacity] = useState('');
	const [isSavingTable, setIsSavingTable] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setProducts([]);
			setCustomers([]);
			setStudents([]);
			setAccounts([]);
			setWarehouses([]);
			setTables([]);
			setTableInvoices([]);
			setHeldOrders([]);
			setIsLoading(false);
			return;
		}
		let cancelled = false;
		setIsLoading(true);
		setHeldOrders(loadHeldOrders(activeCompany.id));
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		const customerFilter = pb.filter('company = {:company} && type = "customer"', {
			company: activeCompany.id,
		});
		const ownerId = pb.authStore.record?.id ?? activeCompany.owner;
		const studentFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		const invoiceFilter = pb.filter(
			'company = {:company} && direction = "penjualan" && stage = "invoice" && table != ""',
			{ company: activeCompany.id },
		);
		Promise.allSettled([
			pb.collection('products').getFullList<Product>({ filter: companyFilter, sort: 'name' }),
			pb.collection('contacts').getFullList<Contact>({ filter: customerFilter, sort: 'name' }),
			pb.collection('students').getFullList<Student>({ filter: studentFilter, sort: 'student_name', requestKey: 'pos-students' }),
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code' }),
			pb.collection('warehouses').getFullList<Warehouse>({ filter: companyFilter, sort: 'name' }),
			pb.collection('tables').getFullList<Table>({ filter: companyFilter, sort: 'sort_order,name' }),
			pb.collection('documents').getFullList<BusinessDocument>({
				filter: invoiceFilter,
				sort: '-date,-created',
				requestKey: 'pos-table-invoices',
			}),
			ownerId
				? loadTaxTypes(activeCompany.id, ownerId, { activeOnly: true })
				: Promise.resolve([] as TaxType[]),
		])
			.then(results => {
				if (cancelled) return;
				const productList = results[0].status === 'fulfilled' ? results[0].value : [];
				const customerList = results[1].status === 'fulfilled' ? results[1].value : [];
				const studentList = results[2].status === 'fulfilled' ? results[2].value : [];
				const accountList = results[3].status === 'fulfilled' ? results[3].value : [];
				const warehouseList = results[4].status === 'fulfilled' ? results[4].value : [];
				const tableList = results[5].status === 'fulfilled' ? results[5].value : [];
				const tableInvoiceList = results[6].status === 'fulfilled' ? results[6].value : [];
				const taxList = results[7].status === 'fulfilled' ? results[7].value : [];
				setProducts(productList);
				setCustomers(customerList);
				setStudents(studentList);
				setAccounts(accountList);
				setWarehouses(warehouseList);
				setTables(tableList);
				setTableInvoices(tableInvoiceList);
				setTaxTypes(taxList);
				setWarehouseId(prev => prev || warehouseList[0]?.id || '');
				// Default akun pembayaran: akun kas/bank pertama, jika tidak ada
				// akun aset pertama.
				const cashAccount =
					accountList.find(a => a.type === 'aset' && /kas|bank/i.test(a.name)) ??
					accountList.find(a => a.type === 'aset') ??
					accountList[0];
				setPaymentAccountId(prev => prev || cashAccount?.id || '');
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	const filteredProducts = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return products;
		return products.filter(
			p =>
				p.name.toLowerCase().includes(q) ||
				(p.code ?? '').toLowerCase().includes(q),
		);
	}, [products, search]);

	const cartTotals = useMemo(() => {
		// Apply the cart-level tax rate to every line for the totals preview.
		const items: DocumentItem[] = cart.map(item => {
			const lineSub = (item.quantity || 0) * (item.unitPrice || 0);
			const afterDiscount = Math.max(0, lineSub - (item.discount || 0));
			const tax = Math.round((afterDiscount * (taxRate || 0)) / 100);
			return { ...item, taxRate, total: afterDiscount + tax };
		});
		return { ...computeDocumentTotals(items), items };
	}, [cart, taxRate]);

	// Meja yang sedang terisi: digunakan pesanan tertahan (held) atau memiliki
	// invoice belum lunas. Meja terisi tidak dapat dipilih untuk pesanan baru.
	const occupiedTableIds = useMemo(() => {
		const ids = new Set<string>();
		for (const order of heldOrders) {
			if (order.tableId) ids.add(order.tableId);
		}
		for (const inv of tableInvoices) {
			const total = Number(inv.total) || 0;
			const paid = Number(inv.paid_amount) || 0;
			if (paid < total && inv.table) ids.add(inv.table);
		}
		return ids;
	}, [heldOrders, tableInvoices]);

	const addToCart = (product: Product) => {
		setCart(prev => {
			const existing = prev.find(item => item.product === product.id);
			if (existing) {
				const maxQty = Math.max(existing.quantity, product.stock ?? 0);
				if (existing.quantity >= maxQty && (product.stock ?? 0) > 0) {
					toast.warning('Jumlah melebihi stok tersedia.');
					return prev;
				}
				return prev.map(item =>
					item.product === product.id
						? { ...item, quantity: item.quantity + 1 }
						: item,
				);
			}
			return [
				...prev,
				{
					...EMPTY_CART_ITEM,
					product: product.id,
					name: product.name,
					code: product.code,
					unitPrice: product.price || 0,
					quantity: 1,
					stock: product.stock ?? 0,
				},
			];
		});
	};

	const changeQty = (index: number, delta: number) => {
		setCart(prev =>
			prev.map((item, idx) => {
				if (idx !== index) return item;
				const nextQty = Math.max(1, item.quantity + delta);
				return { ...item, quantity: nextQty };
			}),
		);
	};

	const setQty = (index: number, value: number) => {
		setCart(prev =>
			prev.map((item, idx) =>
				idx === index ? { ...item, quantity: Math.max(1, Math.floor(value) || 1) } : item,
			),
		);
	};

	const removeItem = (index: number) => {
		setCart(prev => prev.filter((_, idx) => idx !== index));
	};

	const resetSale = () => {
		setCart([]);
		setCustomerId('');
		setTaxRate(0);
		setTableId('');
		setReceipt(null);
		setError('');
	};

	const buildHeldLabel = (custId: string): string => {
		if (custId.startsWith('student:')) {
			const id = custId.slice('student:'.length);
			const s = students.find(x => x.id === id);
			if (s) return s.student_name;
		}
		if (custId) {
			const c = customers.find(x => x.id === custId);
			if (c) return c.name;
		}
		return '';
	};

	const holdOrder = () => {
		if (!activeCompany) return;
		if (cart.length === 0) {
			toast.warning('Keranjang masih kosong, tidak ada yang ditahan.');
			return;
		}
		const label =
			buildHeldLabel(customerId) || `Pesanan #${heldOrders.length + 1}`;
		const snapshot: HeldCartItem[] = cart.map(item => ({
			product: item.product,
			name: item.name,
			code: item.code,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			discount: item.discount,
			taxRate,
			total: item.total,
			stock: item.stock,
		}));
		const order: HeldOrder = {
			id: `hold-${Date.now()}`,
			label,
			cart: snapshot,
			customerId,
			warehouseId,
			paymentAccountId,
			taxRate,
			tableId,
			createdAt: new Date().toISOString(),
		};
		const next = addHeldOrder(activeCompany.id, order);
		setHeldOrders(next);
		setCart([]);
		setCustomerId('');
		setTaxRate(0);
		setTableId('');
		toast.success(`Pesanan "${label}" ditahan.`);
	};

	const recallOrder = (order: HeldOrder) => {
		if (cart.length > 0) {
			toast.warning('Selesaikan atau tahan pesanan aktif sebelum memanggil pesanan lain.');
			return;
		}
		setCart(order.cart.map(item => ({ ...EMPTY_CART_ITEM, ...item })));
		setCustomerId(order.customerId);
		setWarehouseId(order.warehouseId || warehouseId);
		setPaymentAccountId(order.paymentAccountId || paymentAccountId);
		setTaxRate(order.taxRate);
		setTableId(order.tableId);
		if (activeCompany) {
			setHeldOrders(removeHeldOrder(activeCompany.id, order.id));
		}
		toast.success(`Pesanan "${order.label}" dipanggil kembali.`);
	};

	const deleteHeldOrder = (order: HeldOrder) => {
		if (!activeCompany) return;
		if (!window.confirm(`Hapus pesanan ditahan "${order.label}"?`)) return;
		setHeldOrders(removeHeldOrder(activeCompany.id, order.id));
	};

	const handleAddTable = async () => {
		if (!activeCompany) return;
		const name = newTableName.trim();
		if (!name) {
			toast.error('Nama meja wajib diisi.');
			return;
		}
		setIsSavingTable(true);
		try {
			const rec = await pb.collection('tables').create<Table>({
				company: activeCompany.id,
				name,
				capacity: Number(newTableCapacity) || 0,
				sort_order: tables.length,
				owner: pb.authStore.record?.id ?? '',
			});
			setTables(prev => [...prev, rec].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name)));
			setNewTableName('');
			setNewTableCapacity('');
			toast.success(`Meja "${name}" ditambahkan.`);
		} catch {
			toast.error('Gagal menambahkan meja.');
		} finally {
			setIsSavingTable(false);
		}
	};

	const handleDeleteTable = async (table: Table) => {
		if (!window.confirm(`Hapus meja "${table.name}"?`)) return;
		try {
			await pb.collection('tables').delete(table.id);
			setTables(prev => prev.filter(t => t.id !== table.id));
			if (tableId === table.id) setTableId('');
			toast.success(`Meja "${table.name}" dihapus.`);
		} catch {
			toast.error('Gagal menghapus meja.');
		}
	};

	const handleCheckout = async () => {
		setError('');
		const company = activeCompany;
		if (!company) {
			setError('Perusahaan tidak ditemukan.');
			return;
		}
		if (cart.length === 0) {
			setError('Keranjang masih kosong.');
			return;
		}
		if (!paymentAccountId) {
			setError('Pilih metode pembayaran (akun kas/bank).');
			return;
		}
		// Akun pendapatan default: akun pendapatan pertama.
		const revenueAccount =
			accounts.find(a => a.type === 'pendapatan') ?? null;
		if (!revenueAccount) {
			setError('Belum ada akun pendapatan. Tambahkan akun pendapatan di Bagan Akun.');
			return;
		}
		if (paymentAccountId === revenueAccount.id) {
			setError('Akun pembayaran dan akun pendapatan tidak boleh sama.');
			return;
		}

		setIsCheckingOut(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const date = todayIso();

			// Batas invoice bulanan: kuota kustom Admin Pusat bila aktif, jika tidak batas paket.
			const invoiceLimit = effectiveInvoiceMonthlyLimit(company);
			if (invoiceLimit !== null) {
				const used = await countInvoicesThisMonth(company.id);
				if (used >= invoiceLimit) {
					setError(invoiceLimitMessage(invoiceLimit, hasCustomInvoiceQuota(company)));
					return;
				}
			}

			// Hitung jumlah dokumen invoice penjualan yang sudah ada untuk nomor urut.
			const countFilter = pb.filter(
				'company = {:company} && direction = "penjualan" && stage = "invoice"',
				{ company: company.id },
			);
			const countResult = await pb.collection('documents').getList(1, 1, {
				filter: countFilter,
				requestKey: null,
			});
			const docNumber = buildDocumentNumber('POS', countResult.totalItems ?? 0);

			const lineItems: DocumentItem[] = cartTotals.items.map(item => ({
				product: item.product || '',
				name: item.name || '',
				code: item.code || '',
				quantity: Number(item.quantity) || 0,
				unitPrice: Number(item.unitPrice) || 0,
				discount: Number(item.discount) || 0,
				taxRate: Number(item.taxRate) || 0,
				total: item.total || 0,
			}));

			const isStudent = customerId.startsWith('student:');
			const studentId = isStudent ? customerId.slice('student:'.length) : '';
			const contactId = !isStudent ? customerId : '';
			const customer = !isStudent ? customers.find(c => c.id === customerId) : undefined;
			const student = isStudent ? students.find(s => s.id === studentId) : undefined;
			const partner = customer?.name ?? student?.student_name ?? 'Pelanggan Umum';
			const total = cartTotals.total;
			const tableName = tableId ? tables.find(t => t.id === tableId)?.name : '';

			// 1. Buat dokumen invoice penjualan yang langsung lunas (paid_amount = total).
			//    POS = penjualan tunanagara: barang diserahkan & dibayar sekaligus,
			//    jadi tidak perlu dokumen pengiriman/pembayaran terpisah.
			const docPayload: Record<string, unknown> = {
				company: company.id,
				direction: 'penjualan',
				stage: 'invoice',
				number: docNumber,
				date,
				contact: contactId || null,
				student: studentId || null,
				partner,
				description: tableName
					? `Penjualan POS (Kasir) — Meja ${tableName}`
					: 'Penjualan POS (Kasir)',
				items: lineItems,
				subtotal: cartTotals.subtotal,
				discount_total: cartTotals.discountTotal,
				tax_total: cartTotals.taxTotal,
				total,
				paid_amount: total,
				debit_account: paymentAccountId,
				credit_account: revenueAccount.id,
				status: 'confirmed',
				warehouse: warehouseId || null,
				table: tableId || null,
				owner: ownerId,
			};
			const created = await pb.collection('documents').create(docPayload);
			const docId = created.id;

			// 2. Posting jurnal: debit kas/bank, kredit pendapatan.
			const txPayload: Record<string, unknown> = {
				company: company.id,
				category: 'penjualan',
				date,
				description: `Penjualan POS ${docNumber}`,
				amount: total,
				partner,
				debit_account: paymentAccountId,
				credit_account: revenueAccount.id,
				contact: contactId || null,
				owner: ownerId,
			};
				if (studentId) {
					txPayload.student = studentId;
				}
			if (lineItems.length === 1 && lineItems[0].product) {
				txPayload.product = lineItems[0].product;
				txPayload.quantity = lineItems[0].quantity;
				txPayload.unit_price = lineItems[0].unitPrice;
				txPayload.discount = lineItems[0].discount;
				txPayload.tax_rate = lineItems[0].taxRate;
				txPayload.tax_amount =
					lineItems[0].total -
					Math.max(
						0,
						lineItems[0].quantity * lineItems[0].unitPrice - lineItems[0].discount,
					);
			}
			const tx = await pb.collection('transactions').create(txPayload);

			const baseEntry = {
				company: company.id,
				date,
				description: `Penjualan POS ${docNumber}`,
				owner: ownerId,
				transaction: tx.id,
			};
			await pb.collection('entries').create(
				{ ...baseEntry, account: paymentAccountId, debit: total, credit: 0 },
				{ requestKey: `pos-entry-debit-${docId}` },
			);
			await pb.collection('entries').create(
				{ ...baseEntry, account: revenueAccount.id, debit: 0, credit: total },
				{ requestKey: `pos-entry-credit-${docId}` },
			);
			await pb.collection('documents').update(docId, { transaction: tx.id });

			// 3. Kurangi stok produk (sekali, di sini saja — tidak ada dokumen
			//    pengiriman terpisah sehingga stok tidak berkurang ganda).
			await Promise.all(
				lineItems
					.filter(item => item.product && item.quantity > 0)
					.map((item, index) =>
						(async () => {
							try {
								const current =
									products.find(p => p.id === item.product)?.stock ?? 0;
								const newStock = Math.max(0, current - item.quantity);
								await pb.collection('products').update(item.product, {
									stock: newStock,
								}, { requestKey: `pos-prod-${docId}-${index}` });
								if (warehouseId) {
									await adjustProductStock(
										company.id,
										item.product,
										warehouseId,
										-item.quantity,
										ownerId,
										`pos-${docId}-${index}`,
									);
								}
							} catch {
								/* stok gagal diperbarui — transaksi tetap tersimpan */
							}
						})(),
					),
			);

			// Segarkan stok lokal agar tampilan produk akurat.
			setProducts(prev =>
				prev.map(p => {
					const line = lineItems.find(i => i.product === p.id);
					if (!line) return p;
					return { ...p, stock: Math.max(0, (p.stock ?? 0) - line.quantity) };
				}),
			);

			setReceipt({ number: docNumber, total, paid: total, partner });
			toast.success('Transaksi POS berhasil disimpan.');
			setCart([]);
			setCustomerId('');
			setTaxRate(0);
			setTableId('');
		} catch {
			setError('Gagal memproses transaksi. Periksa koneksi lalu coba lagi.');
		} finally {
			setIsCheckingOut(false);
		}
	};

	if (!activeCompany) {
		return <NoCompany />;
	}

	const cashAccounts = accounts.filter(
		a => a.type === 'aset' && /kas|bank/i.test(a.name),
	);
	const paymentOptions = cashAccounts.length > 0 ? cashAccounts : accounts.filter(a => a.type === 'aset');

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="mt-2 flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<Store className="size-7 text-primary" strokeWidth={2} /> Point of Sales
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Kasir cepat — pilih produk, terima pembayaran, stok & jurnal tercatat otomatis.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Link
						to="/app/pos/meja"
						className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<LayoutList className="size-4" /> Daftar Meja
					</Link>
					<Link
						to="/app/penjualan?stage=invoice"
						className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<Receipt className="size-4" /> Lihat Invoice Penjualan
					</Link>
				</div>
			</header>

			{receipt ? (
				<div className="flex flex-col items-center gap-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center shadow-soft">
					<span className="flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white">
						<CheckCircle2 className="size-9" strokeWidth={2} />
					</span>
					<div>
						<h2 className="text-2xl font-extrabold tracking-tight text-emerald-800">
							Transaksi Berhasil
						</h2>
						<p className="mt-1 text-sm text-emerald-700">
							No. Invoice: <span className="font-bold">{receipt.number}</span>
						</p>
					</div>
					<div className="w-full max-w-sm rounded-xl bg-white px-5 py-4 text-sm shadow-soft-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Pelanggan</span>
							<span className="font-semibold">{receipt.partner}</span>
						</div>
						<div className="mt-1 flex justify-between">
							<span className="text-muted-foreground">Total</span>
							<span className="font-bold">{formatRupiah(receipt.total)}</span>
						</div>
						<div className="mt-1 flex justify-between">
							<span className="text-muted-foreground">Dibayar</span>
							<span className="font-bold text-emerald-600">{formatRupiah(receipt.paid)}</span>
						</div>
					</div>
					<div className="flex flex-wrap justify-center gap-3">
						<button
							type="button"
							onClick={resetSale}
							className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
						>
							<Plus className="size-4" /> Transaksi Baru
						</button>
						<Link
							to="/app/penjualan?stage=invoice"
							className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-bold transition-colors hover:bg-accent"
						>
							<Receipt className="size-4" /> Lihat Daftar Invoice
						</Link>
					</div>
				</div>
			) : null}

			{receipt ? null : (
				<>
					{/* Pesanan ditahan */}
					{heldOrders.length > 0 ? (
						<section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-soft-sm">
							<div className="flex items-center gap-2">
								<Pause className="size-4 text-amber-600" />
								<h2 className="text-sm font-bold text-amber-800">
									Pesanan Ditahan ({heldOrders.length})
								</h2>
							</div>
							<p className="mt-0.5 text-[11px] text-amber-700">
								Pesanan ditahan belum tercatat sebagai penjualan dan tidak mengurangi stok.
							</p>
							<div className="mt-3 flex flex-wrap gap-2">
								{heldOrders.map(order => {
									const tableName = order.tableId
										? tables.find(t => t.id === order.tableId)?.name
										: '';
									return (
										<div
											key={order.id}
											className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 shadow-soft-sm"
										>
											<div className="min-w-0">
												<p className="truncate text-xs font-bold text-foreground">{order.label}</p>
												<p className="text-[10px] font-semibold text-muted-foreground">
													{order.cart.reduce((s, i) => s + (i.quantity || 0), 0)} item
													{tableName ? ` · Meja ${tableName}` : ''}
												</p>
											</div>
											<button
												type="button"
												onClick={() => recallOrder(order)}
												aria-label={`Panggil pesanan ${order.label}`}
												className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
											>
												<Play className="size-3.5" />
											</button>
											<button
												type="button"
												onClick={() => deleteHeldOrder(order)}
												aria-label={`Hapus pesanan ${order.label}`}
												className="flex size-7 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
											>
												<Trash2 className="size-3.5" />
											</button>
										</div>
									);
								})}
							</div>
						</section>
					) : null}

					<div className="grid gap-6 lg:grid-cols-3">
						{/* Product area */}
						<div className="flex flex-col gap-4 lg:col-span-2">
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<input
									type="search"
									value={search}
									onChange={e => setSearch(e.target.value)}
									placeholder="Cari produk berdasarkan nama atau kode…"
									className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</div>

							{isLoading ? (
								<p className="px-2 py-8 text-sm font-semibold text-muted-foreground">Memuat produk…</p>
							) : filteredProducts.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
									<p className="text-sm font-semibold text-muted-foreground">
										{products.length === 0
											? 'Belum ada produk. Tambahkan produk di menu Produk.'
											: 'Produk tidak ditemukan.'}
									</p>
								</div>
							) : (
								<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
									{filteredProducts.map(product => {
										const inCart = cart.find(item => item.product === product.id);
										const stock = product.stock ?? 0;
										const outOfStock = stock <= 0;
										const imgUrl = productImageUrl(product);
										return (
											<button
												key={product.id}
												type="button"
												onClick={() => addToCart(product)}
												disabled={outOfStock}
												className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-soft-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
											>
												<div className="relative aspect-square w-full overflow-hidden bg-secondary">
													{imgUrl ? (
														<img
															src={imgUrl}
															alt={product.name}
															loading="lazy"
															className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
														/>
													) : (
														<div className="flex size-full flex-col items-center justify-center text-muted-foreground/60">
															<ImageOff className="size-7" />
														</div>
													)}
													{inCart ? (
														<span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-soft-sm">
															{inCart.quantity}
														</span>
													) : null}
													{outOfStock ? (
														<span className="absolute bottom-2 left-2 rounded-full bg-destructive px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-destructive-foreground">
															Habis
														</span>
													) : null}
												</div>
												<div className="flex flex-1 flex-col gap-1 p-3">
													<span className="line-clamp-2 text-sm font-bold leading-snug">
														{product.name}
													</span>
													{product.code ? (
														<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
															{product.code}
														</span>
													) : null}
													<div className="mt-auto flex items-end justify-between pt-1.5">
														<span className="text-sm font-extrabold text-primary">
															{formatRupiah(product.price || 0)}
														</span>
														<span
															className={
																'text-[10px] font-semibold ' +
																(outOfStock ? 'text-destructive' : 'text-muted-foreground')
															}
														>
															Stok {stock}
														</span>
													</div>
												</div>
											</button>
										);
									})}
								</div>
							)}
						</div>

						{/* Cart */}
						<aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card shadow-soft lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
							<div className="flex items-center justify-between border-b border-border px-5 py-3">
								<h2 className="flex items-center gap-2 text-sm font-bold">
									<ShoppingCart className="size-4 text-primary" /> Keranjang
									<span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
										{cart.length}
									</span>
								</h2>
								{cart.length > 0 ? (
									<button
										type="button"
										onClick={() => setCart([])}
										className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-destructive"
									>
										Kosongkan
									</button>
								) : null}
							</div>

							<div className="flex flex-col gap-3 overflow-y-auto px-5">
								{/* Customer + warehouse + payment + table */}
								<div className="flex flex-col gap-2">
									<label htmlFor="pos-customer" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										<Users className="size-3" /> Pelanggan
									</label>
									<select
										id="pos-customer"
										value={customerId}
										onChange={e => setCustomerId(e.target.value)}
										className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
									>
										<option value="">Pelanggan Umum</option>
										{customers.length > 0 ? (
											<optgroup label="Pelanggan">
												{customers.map(c => (
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

								{customerId ? (
									<Link
										to={`/app/pos/riwayat?customer=${encodeURIComponent(customerId)}`}
										className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
									>
										<Receipt className="size-3.5" /> Riwayat Invoice
									</Link>
								) : null}

								{warehouses.length > 0 ? (
									<div className="flex flex-col gap-2">
										<label htmlFor="pos-warehouse" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											Gudang
										</label>
										<select
											id="pos-warehouse"
											value={warehouseId}
											onChange={e => setWarehouseId(e.target.value)}
											className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
										>
											<option value="">Tanpa gudang</option>
											{warehouses.map(w => (
												<option key={w.id} value={w.id}>{w.name}</option>
											))}
										</select>
									</div>
								) : null}

								<div className="flex flex-col gap-2">
									<label htmlFor="pos-payment" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										<Banknote className="size-3" /> Metode Pembayaran
									</label>
									<select
										id="pos-payment"
										value={paymentAccountId}
										onChange={e => setPaymentAccountId(e.target.value)}
										className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
									>
										{paymentOptions.length === 0 ? (
											<option value="">Belum ada akun kas</option>
										) : null}
										{paymentOptions.map(a => (
											<option key={a.id} value={a.id}>{a.code} — {a.name}</option>
										))}
									</select>
								</div>

								{/* Meja (opsional, untuk dine-in) */}
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between">
										<label htmlFor="pos-table" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											<LayoutGrid className="size-3" /> Meja (opsional)
										</label>
										<button
											type="button"
											onClick={() => setTablesOpen(true)}
											className="text-[11px] font-bold text-primary transition-colors hover:text-primary/80"
										>
											Kelola Meja
										</button>
									</div>
									<select
										id="pos-table"
										value={tableId}
										onChange={e => setTableId(e.target.value)}
										className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
									>
										<option value="">Tanpa Meja</option>
										{tables.map(t => {
											const isOccupied = occupiedTableIds.has(t.id) && t.id !== tableId;
											return (
												<option key={t.id} value={t.id} disabled={isOccupied}>
													{t.name}{t.capacity ? ` · ${t.capacity} kursi` : ''}{isOccupied ? ' (Terisi)' : ''}
												</option>
											);
										})}
									</select>
								</div>

								{taxTypes.length > 0 ? (
									<div className="flex flex-col gap-2">
										<label htmlFor="pos-tax" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											Pajak
										</label>
										<select
											id="pos-tax"
											value={String(taxRate)}
											onChange={e => setTaxRate(Number(e.target.value))}
											className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
										>
											<option value="0">Tanpa Pajak</option>
											{taxTypes.map(t => (
												<option key={t.id} value={String(Number(t.rate) || 0)}>
													{t.name} ({Number(t.rate || 0)}%)
												</option>
											))}
										</select>
									</div>
								) : null}
							</div>

							{/* Cart items */}
							<div className="flex max-h-72 flex-col gap-2 overflow-y-auto border-y border-border px-5 py-3">
								{cart.length === 0 ? (
									<p className="py-6 text-center text-xs font-semibold text-muted-foreground">
										Pilih produk untuk menambahkan ke keranjang.
									</p>
								) : (
									cart.map((item, idx) => (
										<div key={item.product || idx} className="flex items-center gap-2 rounded-xl bg-secondary/60 p-2">
											<div className="min-w-0 flex-1">
												<p className="truncate text-xs font-bold">{item.name}</p>
												<p className="text-[10px] font-semibold text-muted-foreground">
													{formatRupiah(item.unitPrice)} {item.code ? `· ${item.code}` : ''}
												</p>
											</div>
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={() => changeQty(idx, -1)}
													aria-label="Kurangi jumlah"
													className="flex size-7 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent"
												>
													<Minus className="size-3.5" />
												</button>
												<input
													type="number"
													min="1"
													value={item.quantity}
													onChange={e => setQty(idx, Number(e.target.value))}
													className="w-10 rounded-lg border border-border bg-background py-1 text-center text-xs font-bold outline-none ring-primary/30 focus:ring-2"
												/>
												<button
													type="button"
													onClick={() => changeQty(idx, 1)}
													aria-label="Tambah jumlah"
													className="flex size-7 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent"
												>
													<Plus className="size-3.5" />
												</button>
											</div>
											<button
												type="button"
												onClick={() => removeItem(idx)}
												aria-label="Hapus item"
												className="flex size-7 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
											>
												<X className="size-3.5" />
											</button>
										</div>
									))
								)}
							</div>

							{/* Totals + checkout */}
							<div className="flex flex-col gap-3 px-5 pb-5">
								<div className="rounded-xl bg-secondary px-4 py-3 text-xs">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Subtotal</span>
										<span className="font-semibold">{formatRupiah(cartTotals.subtotal)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Diskon</span>
										<span className="font-semibold">- {formatRupiah(cartTotals.discountTotal)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Pajak</span>
										<span className="font-semibold">{formatRupiah(cartTotals.taxTotal)}</span>
									</div>
									<div className="mt-1 flex justify-between border-t border-border pt-1">
										<span className="font-bold">Total</span>
										<span className="font-extrabold text-primary">{formatRupiah(cartTotals.total)}</span>
									</div>
								</div>

								{error ? (
									<p className="text-xs font-semibold text-destructive">{error}</p>
								) : null}

								<div className="flex gap-2">
									<button
										type="button"
										onClick={holdOrder}
										disabled={cart.length === 0}
										className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
									>
										<Pause className="size-4" /> Tahan
									</button>
									<button
										type="button"
										onClick={handleCheckout}
										disabled={isCheckingOut || cart.length === 0}
										className="inline-flex flex-[2] items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{isCheckingOut ? (
											'Memproses…'
										) : (
											<>
												<Banknote className="size-4" /> Bayar {formatRupiah(cartTotals.total)}
											</>
										)}
									</button>
								</div>
							</div>
						</aside>
					</div>
				</>
			)}

			{/* Dialog Kelola Meja */}
			<Dialog open={tablesOpen} onOpenChange={setTablesOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Kelola Meja</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<div className="flex items-end gap-2">
							<div className="flex flex-1 flex-col gap-1.5">
								<label htmlFor="new-table-name" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Nama Meja
								</label>
								<input
									id="new-table-name"
									value={newTableName}
									onChange={e => setNewTableName(e.target.value)}
									placeholder="Meja 1"
									className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</div>
							<div className="flex w-24 flex-col gap-1.5">
								<label htmlFor="new-table-cap" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Kursi
								</label>
								<input
									id="new-table-cap"
									type="number"
									min="0"
									value={newTableCapacity}
									onChange={e => setNewTableCapacity(e.target.value)}
									placeholder="4"
									className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</div>
							<button
								type="button"
								onClick={handleAddTable}
								disabled={isSavingTable}
								className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
							>
								<Plus className="size-4" />
							</button>
						</div>

						<div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
							{tables.length === 0 ? (
								<p className="py-6 text-center text-xs font-semibold text-muted-foreground">
									Belum ada meja. Tambahkan meja untuk pesanan dine-in.
								</p>
							) : (
								tables.map(t => (
									<div
										key={t.id}
										className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2"
									>
										<div>
											<p className="text-sm font-bold">{t.name}</p>
											<p className="text-[10px] font-semibold text-muted-foreground">
												{t.capacity ? `${t.capacity} kursi` : 'Tanpa kapasitas'}
											</p>
										</div>
										<button
											type="button"
											onClick={() => handleDeleteTable(t)}
											aria-label={`Hapus meja ${t.name}`}
											className="flex size-7 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
										>
											<Trash2 className="size-3.5" />
										</button>
									</div>
								))
							)}
						</div>
					</div>
					<DialogFooter>
						<button
							type="button"
							onClick={() => setTablesOpen(false)}
							className="rounded-full border border-border px-5 py-2 text-sm font-bold transition-colors hover:bg-accent"
						>
							Selesai
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
