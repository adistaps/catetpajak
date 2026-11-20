import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ChevronDown, ImageIcon, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { type Account, type AccountType, type Company } from '@/lib/accounting';
import type { Product } from '@/lib/products';
import { NoCompany } from '@/components/app/no-company';
import { AmountInput } from '@/components/ui/amount-input';

const NAME_LIMIT = 255;
const DESCRIPTION_LIMIT = 6000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const UNITS = ['Pcs', 'Box', 'Kg', 'Gram', 'Liter', 'Meter', 'Unit', 'Pak', 'Lusin', 'Karton'];
const PRODUCT_TYPES = [
	{ value: 'barang', label: 'Barang' },
	{ value: 'jasa', label: 'Jasa' },
] as const;
const TAX_OPTIONS = ['Tidak kena pajak', 'PPN 11%', 'PPN 12%', 'PPN 1,1%', 'PPh 23 2%'];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
	aset: 'Aset',
	liabilitas: 'Liabilitas',
	ekuitas: 'Ekuitas',
	pendapatan: 'Pendapatan',
	beban: 'Beban',
};

interface ProductFormProps {
	activeCompany: Company | null;
	productId?: string;
}

function findAccount(accounts: Account[], pattern: RegExp, type?: AccountType): string {
	return accounts.find(account => (!type || account.type === type) && pattern.test(account.name))?.id ?? '';
}

export function ProductForm({ activeCompany, productId }: ProductFormProps) {
	const navigate = useNavigate();
	const editing = Boolean(productId);
	const fileRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState('');
	const [code, setCode] = useState('');
	const [barcode, setBarcode] = useState('');
	const [unit, setUnit] = useState('');
	const [category, setCategory] = useState('');
	const [categories, setCategories] = useState<string[]>([]);
	const [description, setDescription] = useState('');
	const [productType, setProductType] = useState('');
	const [buyEnabled, setBuyEnabled] = useState(true);
	const [sellEnabled, setSellEnabled] = useState(true);
	const [price, setPrice] = useState('');
	const [cost, setCost] = useState('');
	const [stock, setStock] = useState('0');
	const [purchaseAccount, setPurchaseAccount] = useState('');
	const [salesAccount, setSalesAccount] = useState('');
	const [buyTax, setBuyTax] = useState('');
	const [sellTax, setSellTax] = useState('');
	const [trackStock, setTrackStock] = useState(false);
	const [inventoryAccount, setInventoryAccount] = useState('');
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState('');
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [editReady, setEditReady] = useState(!productId);
	const [editMissing, setEditMissing] = useState(false);
	const [existingImage, setExistingImage] = useState('');
	const [imageRemoved, setImageRemoved] = useState(false);

	useEffect(() => {
		if (!activeCompany) return;
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		Promise.all([
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code' }),
			pb.collection('products').getFullList<Product>({ filter: companyFilter, fields: 'category' }),
		])
			.then(([accountList, productList]) => {
				if (cancelled) return;
				setAccounts(accountList);
				if (!productId) {
					setPurchaseAccount(findAccount(accountList, /pokok|hpp|persediaan/i, 'beban') || findAccount(accountList, /beban/i, 'beban'));
					setSalesAccount(findAccount(accountList, /pendapatan/i, 'pendapatan'));
				}
				const unique = Array.from(
					new Set(productList.map(item => (item.category ?? '').trim()).filter(Boolean)),
				).sort((a, b) => a.localeCompare(b, 'id'));
				setCategories(unique);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	useEffect(() => {
		if (!activeCompany || !productId) return;
		let cancelled = false;
		setEditReady(false);
		setEditMissing(false);
		pb.collection('products')
			.getFirstListItem<Product>(
				pb.filter('id = {:id} && company = {:company}', { id: productId, company: activeCompany.id }),
				{ requestKey: `product-edit-${productId}` },
			)
			.then(product => {
				if (cancelled) return;
				setName(product.name ?? '');
				setCode(product.code ?? '');
				setBarcode(product.barcode ?? '');
				setUnit(product.unit ?? '');
				setCategory(product.category ?? '');
				setDescription(product.description ?? '');
				setProductType(product.product_type ?? '');
				setBuyEnabled(product.buy_enabled !== false);
				setSellEnabled(product.sell_enabled !== false);
				setPrice(String(product.price ?? 0));
				setCost(String(product.cost ?? 0));
				setStock(String(product.stock ?? 0));
				setPurchaseAccount(product.purchase_account ?? '');
				setSalesAccount(product.sales_account ?? '');
				setBuyTax(product.buy_tax ?? '');
				setSellTax(product.sell_tax ?? '');
				setTrackStock(product.track_stock === true);
				setInventoryAccount(product.inventory_account ?? '');
				setExistingImage(product.image ? pb.files.getURL(product, product.image) : '');
				setImageRemoved(false);
				setEditReady(true);
			})
			.catch(() => {
				if (!cancelled) {
					setEditMissing(true);
					setEditReady(true);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, productId]);

	const accountsByType = useMemo(
		() =>
			(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).reduce(
				(groups, type) => {
					groups[type] = accounts.filter(account => account.type === type);
					return groups;
				},
				{} as Record<AccountType, Account[]>,
			),
		[accounts],
	);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0] ?? null;
		if (!file) {
			setImageFile(null);
			setImagePreview('');
			return;
		}
		if (!['image/jpeg', 'image/png'].includes(file.type)) {
			setError('Format gambar harus JPG atau PNG.');
			event.target.value = '';
			return;
		}
		if (file.size > IMAGE_MAX_BYTES) {
			setError('Ukuran gambar maksimal 5 MB.');
			event.target.value = '';
			return;
		}
		setError('');
		setImageFile(file);
		const reader = new FileReader();
		reader.onload = () => setImagePreview(String(reader.result ?? ''));
		reader.readAsDataURL(file);
	};

	const clearImage = () => {
		setImageFile(null);
		setImagePreview('');
		setExistingImage('');
		setImageRemoved(true);
		if (fileRef.current) fileRef.current.value = '';
	};

	const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		if (!name.trim()) {
			setError('Nama produk wajib diisi.');
			return;
		}
		if (!unit.trim()) {
			setError('Unit wajib diisi.');
			return;
		}
		if (!productType) {
			setError('Tipe produk wajib dipilih.');
			return;
		}
		if (trackStock && !inventoryAccount) {
			setError('Akun persediaan wajib dipilih saat monitor stok aktif.');
			return;
		}
		if (editing && !editReady) return;
		setIsSaving(true);
		try {
			const fd = new FormData();
			fd.append('company', activeCompany.id);
			fd.append('name', name.trim().slice(0, NAME_LIMIT));
			fd.append('code', code.trim());
			fd.append('barcode', barcode.trim());
			fd.append('unit', unit.trim());
			fd.append('category', category.trim());
			fd.append('description', description.slice(0, DESCRIPTION_LIMIT));
			fd.append('product_type', productType);
			fd.append('buy_enabled', buyEnabled ? 'true' : 'false');
			fd.append('sell_enabled', sellEnabled ? 'true' : 'false');
			fd.append('price', String(sellEnabled ? Number(price) || 0 : 0));
			fd.append('cost', String(buyEnabled ? Number(cost) || 0 : 0));
			fd.append('stock', String(Number(stock) || 0));
			fd.append('buy_tax', buyEnabled ? buyTax : '');
			fd.append('sell_tax', sellEnabled ? sellTax : '');
			fd.append('purchase_account', buyEnabled && purchaseAccount ? purchaseAccount : '');
			fd.append('sales_account', sellEnabled && salesAccount ? salesAccount : '');
			fd.append('track_stock', trackStock ? 'true' : 'false');
			fd.append('inventory_account', trackStock && inventoryAccount ? inventoryAccount : '');
			if (!editing) fd.append('owner', pb.authStore.record?.id ?? '');
			if (imageFile) {
				fd.append('image', imageFile);
			} else if (editing && imageRemoved) {
				fd.append('image', '');
			}
			if (editing && productId) {
				await pb.collection('products').update<Product>(productId, fd);
			} else {
				await pb.collection('products').create<Product>(fd);
			}
			navigate('/app/produk');
		} catch {
			setError('Gagal menyimpan produk. Periksa kembali isian Anda.');
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
			<header className="flex flex-col gap-1">
				<Link
					to="/app/produk"
					className="inline-flex w-fit items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
				>
					<ArrowLeft className="size-3.5" /> Kembali ke Produk
				</Link>
				<div>
					<h1 className="text-lg font-bold tracking-tight text-slate-900">{editing ? 'Ubah Produk' : 'Tambah Produk'}</h1>
				</div>
			</header>

			{editing && !editReady ? (
				<p className="text-xs text-slate-500">Memuat produk…</p>
			) : null}
			{editMissing ? (
				<p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
					Produk tidak ditemukan untuk perusahaan ini.
				</p>
			) : null}

			<form onSubmit={handleCreate} className="flex flex-col gap-3.5">
				<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_156px]">
					<div className="flex min-w-0 flex-col gap-2">
						<Field label="Nama produk" required counter={`${name.length} / ${NAME_LIMIT}`}>
							<input
								id="product-name"
								required
								maxLength={NAME_LIMIT}
								value={name}
								onChange={event => setName(event.target.value)}
								className={inputClass}
							/>
						</Field>

						<div className="grid gap-2 sm:grid-cols-2">
							<Field label="Kode produk / SKU">
								<input
									id="product-code"
									value={code}
									onChange={event => setCode(event.target.value)}
									className={inputClass}
								/>
							</Field>
							<Field label="Barcode">
								<input
									id="product-barcode"
									value={barcode}
									onChange={event => setBarcode(event.target.value)}
									className={inputClass}
								/>
							</Field>
						</div>

						<ComboField
							id="product-unit"
							label="Unit"
							required
							value={unit}
							onChange={setUnit}
							options={UNITS}
							placeholder="Pilih atau masukkan unit"
						/>
						<ComboField
							id="product-category"
							label="Kategori produk"
							value={category}
							onChange={setCategory}
							options={categories}
							placeholder="Pilih atau masukkan kategori"
						/>

						<div className="flex flex-col gap-1">
							<label htmlFor="product-description" className="text-xs font-semibold text-slate-900">
								Deskripsi
							</label>
							<div className="relative">
								<textarea
									id="product-description"
									rows={3}
									maxLength={DESCRIPTION_LIMIT}
									value={description}
									onChange={event => setDescription(event.target.value)}
									className={`${inputClass} min-h-[68px] resize-y pb-5`}
								/>
								<span className="pointer-events-none absolute bottom-1 right-2 text-[10px] font-medium text-[#8b5cf6]">
									{description.length}/{DESCRIPTION_LIMIT}
								</span>
							</div>
						</div>

						<Field label="Tipe produk" required>
							<div className="relative">
								<select
									id="product-type"
									required
									value={productType}
									onChange={event => setProductType(event.target.value)}
									className={`${inputClass} appearance-none pr-8 ${productType ? 'text-slate-900' : 'text-slate-400'}`}
								>
									<option value="">Pilih tipe produk</option>
									{PRODUCT_TYPES.map(type => (
										<option key={type.value} value={type.value}>
											{type.label}
										</option>
									))}
								</select>
								<ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
							</div>
						</Field>
					</div>

					<div className="lg:pt-4">
						<button
							type="button"
							onClick={() => fileRef.current?.click()}
							className="flex h-[112px] w-full flex-col items-center justify-center gap-0.5 rounded-md border border-[#ede9fe] bg-[#f5f3ff] px-2 text-center transition-colors hover:bg-[#ede9fe]"
						>
							{imagePreview || existingImage ? (
								<img src={imagePreview || existingImage} alt="Pratinjau gambar produk" className="size-full rounded-md object-contain" />
							) : (
								<>
									<ImageIcon className="size-5 text-slate-400" strokeWidth={1.5} />
									<span className="text-[11px] font-semibold text-[#8b5cf6]">Pilih gambar produk</span>
									<span className="text-[10px] leading-tight text-slate-500">
										Format file JPG atau PNG
										<br />
										(maks. 5 MB)
									</span>
								</>
							)}
						</button>
						<input
							ref={fileRef}
							id="product-image"
							type="file"
							accept="image/jpeg,image/png"
							onChange={handleImageChange}
							className="sr-only"
						/>
						{imagePreview || existingImage ? (
							<button
								type="button"
								onClick={clearImage}
								className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline"
							>
								<X className="size-3" /> Hapus gambar
							</button>
						) : null}
					</div>
				</div>

				<section className="flex flex-col gap-1.5">
					<h2 className="text-xs font-bold text-slate-900">Harga &amp; persediaan</h2>
					<label className="inline-flex min-h-8 w-fit items-center gap-1.5 text-xs text-slate-800">
						<input
							type="checkbox"
							checked={buyEnabled}
							onChange={event => setBuyEnabled(event.target.checked)}
							className="size-3.5 rounded border-slate-300 accent-[#8b5cf6]"
						/>
						Saya beli produk ini
					</label>
					{buyEnabled ? (
						<PriceBlock
							headers={['Harga beli satuan', 'Akun pembelian', 'Pajak beli']}
							amountLabel="Harga beli satuan"
							amount={cost}
							onAmount={setCost}
							accountLabel="Akun pembelian"
							account={purchaseAccount}
							onAccount={setPurchaseAccount}
							accountTypes={['beban', 'aset']}
							accountsByType={accountsByType}
							taxLabel="Pajak beli"
							tax={buyTax}
							onTax={setBuyTax}
						/>
					) : null}

					<label className="inline-flex min-h-8 w-fit items-center gap-1.5 text-xs text-slate-800">
						<input
							type="checkbox"
							checked={sellEnabled}
							onChange={event => setSellEnabled(event.target.checked)}
							className="size-3.5 rounded border-slate-300 accent-[#8b5cf6]"
						/>
						Saya jual produk ini
					</label>
					{sellEnabled ? (
						<PriceBlock
							headers={['Harga jual satuan', 'Akun penjualan', 'Pajak jual']}
							amountLabel="Harga jual satuan"
							amount={price}
							onAmount={setPrice}
							accountLabel="Akun penjualan"
							account={salesAccount}
							onAccount={setSalesAccount}
							accountTypes={['pendapatan']}
							accountsByType={accountsByType}
							taxLabel="Pajak jual"
							tax={sellTax}
							onTax={setSellTax}
							extra={
								<p className="self-center text-[11px] text-slate-600">
									Butuh akun diskon?{' '}
									<Link to="/app/akun" className="font-medium text-[#8b5cf6] hover:underline">
										Aktifkan sekarang
									</Link>
								</p>
							}
						/>
					) : null}

					<label className="inline-flex min-h-8 w-fit items-center gap-1.5 text-xs text-slate-800">
						<input
							type="checkbox"
							checked={trackStock}
							onChange={event => {
								const next = event.target.checked;
								setTrackStock(next);
								if (next && !inventoryAccount) {
									setInventoryAccount(
										findAccount(accounts, /persediaan/i, 'aset') ||
											accounts.find(account => account.type === 'aset')?.id ||
											'',
									);
								}
							}}
							className="size-3.5 rounded border-slate-300 accent-[#8b5cf6]"
						/>
						Monitor stok
					</label>
					{trackStock ? (
						<p className="text-[11px] text-slate-500">
							Produk ini dicatat sebagai persediaan. Akun pembelian dan penjualan tidak berubah.
						</p>
					) : null}
					{trackStock ? (
						<div className="grid max-w-md gap-1">
							<label htmlFor="product-inventory-account" className="text-xs font-semibold text-slate-900">
								Akun persediaan <span className="text-red-500">*</span>
							</label>
							<div className="relative">
								<select
									id="product-inventory-account"
									required
									value={inventoryAccount}
									onChange={event => setInventoryAccount(event.target.value)}
									className={`${inputClass} appearance-none pr-8`}
								>
									<option value="">Pilih akun persediaan</option>
									{accountsByType.aset.map(item => (
										<option key={item.id} value={item.id}>
											({item.code}) - {item.name}
										</option>
									))}
								</select>
								<ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
							</div>
						</div>
					) : null}

					<div className="mt-0.5 grid max-w-[160px] gap-1">
						<label htmlFor="product-stock" className="text-xs font-semibold text-slate-900">
							Stok awal
						</label>
						<input
							id="product-stock"
							type="number"
							min="0"
							value={stock}
							onChange={event => setStock(event.target.value)}
							className={inputClass}
						/>
					</div>
				</section>

				{error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}

				<div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-2.5">
					<Link
						to="/app/produk"
						className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
					>
						Batal
					</Link>
					<button
						type="submit"
						disabled={isSaving || (editing && (!editReady || editMissing))}
						className="rounded-md bg-[#8b5cf6] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#7c3aed] disabled:opacity-60"
					>
						{isSaving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Simpan Produk'}
					</button>
				</div>
			</form>
		</div>
	);
}

const inputClass =
	'w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs leading-5 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/20';

function Field({
	label,
	required,
	counter,
	children,
}: {
	label: string;
	required?: boolean;
	counter?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center justify-between gap-3">
				<label className="text-[11px] font-semibold text-slate-900">
					{label}
					{required ? <span className="text-red-500"> *</span> : null}
				</label>
				{counter ? <span className="text-[10px] text-slate-400">{counter}</span> : null}
			</div>
			{children}
		</div>
	);
}

function ComboField({
	id,
	label,
	required,
	value,
	onChange,
	options,
	placeholder,
}: {
	id: string;
	label: string;
	required?: boolean;
	value: string;
	onChange: (value: string) => void;
	options: string[];
	placeholder: string;
}) {
	const [open, setOpen] = useState(false);
	const filtered = options.filter(option => option.toLowerCase().includes(value.trim().toLowerCase()));
	return (
		<Field label={label} required={required}>
			<div className="relative">
				<input
					id={id}
					required={required}
					value={value}
					placeholder={placeholder}
					onChange={event => {
						onChange(event.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => window.setTimeout(() => setOpen(false), 120)}
					className={`${inputClass} pr-7`}
					autoComplete="off"
				/>
				<ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
				{open && (filtered.length > 0 || value.trim()) ? (
					<ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-md border border-slate-200 bg-white py-0.5 shadow-lg">
						{filtered.map(option => (
							<li key={option}>
								<button
									type="button"
									onMouseDown={event => event.preventDefault()}
									onClick={() => {
										onChange(option);
										setOpen(false);
									}}
									className="w-full px-2 py-1.5 text-left text-xs text-slate-800 hover:bg-slate-50"
								>
									{option}
								</button>
							</li>
						))}
						{value.trim() && !options.some(option => option.toLowerCase() === value.trim().toLowerCase()) ? (
							<li className="px-2 py-1.5 text-[11px] text-slate-400">Gunakan “{value.trim()}”</li>
						) : null}
					</ul>
				) : null}
			</div>
		</Field>
	);
}

function PriceBlock({
	headers,
	amountLabel,
	amount,
	onAmount,
	accountLabel,
	account,
	onAccount,
	accountTypes,
	accountsByType,
	taxLabel,
	tax,
	onTax,
	extra,
}: {
	headers: string[];
	amountLabel: string;
	amount: string;
	onAmount: (value: string) => void;
	accountLabel: string;
	account: string;
	onAccount: (value: string) => void;
	accountTypes: AccountType[];
	accountsByType: Record<AccountType, Account[]>;
	taxLabel: string;
	tax: string;
	onTax: (value: string) => void;
	extra?: React.ReactNode;
}) {
	return (
		<div className="overflow-hidden rounded-md border border-slate-100">
			<div className="hidden grid-cols-3 gap-2 bg-[#f7f8fa] px-2 py-1.5 text-[11px] font-medium text-slate-700 md:grid">
				{headers.map(header => (
					<span key={header}>{header}</span>
				))}
			</div>
			<div className="grid items-start gap-2 bg-white p-2 md:grid-cols-3">
				<label className="flex flex-col gap-1">
					<span className="text-[11px] font-medium text-slate-600 md:sr-only">{amountLabel}</span>
					<span className="flex overflow-hidden rounded border border-slate-200 focus-within:border-[#8b5cf6] focus-within:ring-1 focus-within:ring-[#8b5cf6]/20">
						<span className="border-r border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-500">Rp</span>
						<AmountInput
							value={amount}
							onValueChange={value => onAmount(String(value))}
							placeholder="0"
							aria-label={amountLabel}
							className="w-full bg-white px-2 py-1 text-xs outline-none"
						/>
					</span>
				</label>
				<label className="relative flex flex-col gap-1">
					<span className="text-[11px] font-medium text-slate-600 md:sr-only">{accountLabel}</span>
					<select
						value={account}
						onChange={event => onAccount(event.target.value)}
						aria-label={accountLabel}
						className={`${inputClass} appearance-none pr-7`}
					>
						<option value="">Pilih akun</option>
						{accountTypes.map(type => (
							<optgroup key={type} label={ACCOUNT_TYPE_LABELS[type]}>
								{accountsByType[type].map(item => (
									<option key={item.id} value={item.id}>
										({item.code}) - {item.name}
									</option>
								))}
							</optgroup>
						))}
					</select>
					<ChevronDown className="pointer-events-none absolute right-2 top-[calc(50%+0.55rem)] size-3.5 -translate-y-1/2 text-slate-400 md:top-1/2" />
				</label>
				<div className="flex flex-col gap-1.5 md:contents">
					<label className="relative flex flex-col gap-1">
						<span className="text-[11px] font-medium text-slate-600 md:sr-only">{taxLabel}</span>
						<select
							value={tax}
							onChange={event => onTax(event.target.value)}
							aria-label={taxLabel}
							className={`${inputClass} appearance-none pr-7 ${tax ? 'text-slate-900' : 'text-slate-400'}`}
						>
							<option value="">Pilih pajak</option>
							{TAX_OPTIONS.map(option => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
						<ChevronDown className="pointer-events-none absolute right-2 top-[calc(50%+0.55rem)] size-3.5 -translate-y-1/2 text-slate-400 md:top-1/2" />
					</label>
				</div>
			</div>
			{extra ? <div className="flex justify-end px-2 pb-1.5">{extra}</div> : null}
		</div>
	);
}
