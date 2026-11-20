import { useEffect, useMemo, useState } from 'react';
import { FileText, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	formatRupiah,
	todayIso,
	type Account,
	type AccountType,
	type Company,
} from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import {
	type DepreciationMethod,
	type FixedAsset,
} from '@/lib/depreciation';
import {
	buildDocumentNumber,
	type BusinessDocument,
	type DocumentItem,
} from '@/lib/documents';
import type { Transaction } from '@/lib/transactions';
import {
	countInvoicesThisMonth,
	effectiveInvoiceMonthlyLimit,
	hasCustomInvoiceQuota,
	invoiceLimitMessage,
} from '@/lib/plan-access';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
	aset: 'Aset',
	liabilitas: 'Liabilitas',
	ekuitas: 'Ekuitas',
	pendapatan: 'Pendapatan',
	beban: 'Beban',
};

function findAccountByName(accounts: Account[], pattern: RegExp): string {
	return accounts.find(a => pattern.test(a.name))?.id ?? '';
}

interface AssetInvoiceModalProps {
	asset: FixedAsset;
	activeCompany: Company;
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
}

/**
 * Modal "Buat Invoice" untuk aset tertunda. Membuat dokumen invoice pembelian
 * atas aset, melengkapi pengaturan penyusutan, lalu mengaktifkan aset
 * (status: active). Jika aset berasal dari transaksi pembelian (ada
 * source_transaction), jurnal sudah tercatat sehingga invoice tidak memosting
 * jurnal ganda.
 */
export function AssetInvoiceModal({
	asset,
	activeCompany,
	open,
	onClose,
	onCreated,
}: AssetInvoiceModalProps) {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [existingCount, setExistingCount] = useState(0);

	const [assetAccount, setAssetAccount] = useState('');
	const [expenseAccount, setExpenseAccount] = useState('');
	const [accumDepAccount, setAccumDepAccount] = useState('');
	const [creditAccount, setCreditAccount] = useState('');
	const [contactId, setContactId] = useState('');
	const [partner, setPartner] = useState('');
	const [invoiceNumber, setInvoiceNumber] = useState('');
	const [date, setDate] = useState(todayIso());
	const [method, setMethod] = useState<DepreciationMethod>('straight_line');
	const [usefulLife, setUsefulLife] = useState('');
	const [rate, setRate] = useState('');
	const [capacity, setCapacity] = useState('');
	const [salvage, setSalvage] = useState('0');
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		Promise.all([
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code' }),
			pb
				.collection('contacts')
				.getFullList<Contact>({ filter: companyFilter, sort: 'name' }),
			pb
				.collection('documents')
				.getList<BusinessDocument>(1, 1, {
					filter: pb.filter('company = {:company} && direction = "pembelian"', {
						company: activeCompany.id,
					}),
				}),
		])
			.then(([accountList, contactList, page]) => {
				if (cancelled) return;
				setAccounts(accountList);
				setContacts(contactList);
				setExistingCount(page.totalItems);

				setAssetAccount(
					asset.asset_account ||
						findAccountByName(accountList, /peralatan|aset tetap/i),
				);
				setExpenseAccount(findAccountByName(accountList, /beban penyusutan/i));
				setAccumDepAccount(findAccountByName(accountList, /akumulasi penyusutan/i));
				setCreditAccount(findAccountByName(accountList, /utang usaha/i) || findAccountByName(accountList, /utang/i));
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [open, activeCompany.id, asset.id, asset.asset_account]);

	useEffect(() => {
		if (!open) return;
		setInvoiceNumber(asset.invoice_number || '');
		setDate((asset.acquisition_date || todayIso()).slice(0, 10));
		setSalvage(String(asset.salvage_value || 0));
		if (asset.method) setMethod(asset.method);
		if (asset.useful_life) setUsefulLife(String(asset.useful_life));
		if (asset.rate) setRate(String(asset.rate));
		if (asset.production_capacity) setCapacity(String(asset.production_capacity));
	}, [open, asset]);

	const accountsByType = useMemo(
		() =>
			(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).reduce(
				(groups, type) => {
					groups[type] = accounts.filter(a => a.type === type);
					return groups;
				},
				{} as Record<AccountType, Account[]>,
			),
		[accounts],
	);

	const suppliers = useMemo(() => contacts.filter(c => c.type === 'supplier'), [contacts]);

	const hasSourceTransaction = Boolean(asset.source_transaction);

	if (!open) return null;

	const ensureDepAccounts = async (): Promise<Account[]> => {
		const ownerId = pb.authStore.record?.id ?? '';
		const toCreate: { code: string; name: string; type: AccountType }[] = [];
		if (!accounts.some(a => /akumulasi penyusutan/i.test(a.name))) {
			toCreate.push({ code: '106', name: 'Akumulasi Penyusutan', type: 'aset' });
		}
		if (!accounts.some(a => /beban penyusutan/i.test(a.name))) {
			toCreate.push({ code: '504', name: 'Beban Penyusutan', type: 'beban' });
		}
		if (toCreate.length === 0) return accounts;
		const created = await Promise.all(
			toCreate.map((spec, i) =>
				pb.collection('accounts').create<Account>(
					{
						company: activeCompany.id,
						code: spec.code,
						name: spec.name,
						type: spec.type,
						owner: ownerId,
					},
					{ requestKey: `asset-inv-dep-${i}` },
				),
			),
		);
		const updated = [...accounts, ...created].sort((a, b) => a.code.localeCompare(b.code));
		setAccounts(updated);
		setExpenseAccount(prev => prev || findAccountByName(updated, /beban penyusutan/i));
		setAccumDepAccount(prev => prev || findAccountByName(updated, /akumulasi penyusutan/i));
		return updated;
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		if (!assetAccount || !expenseAccount || !accumDepAccount) {
			setError('Lengkapi akun aset, akun beban penyusutan, dan akun akumulasi penyusutan.');
			return;
		}
		if (!hasSourceTransaction && !creditAccount) {
			setError('Pilih akun kredit (Utang Usaha) untuk invoice pembelian.');
			return;
		}
		if (method === 'straight_line' && (!usefulLife || Number(usefulLife) <= 0)) {
			setError('Masukkan umur ekonomis (tahun) untuk metode Straight Line.');
			return;
		}
		if (method === 'reducing_balance' && (!rate || Number(rate) <= 0)) {
			setError('Masukkan tarif (%) untuk metode Reducing Balance.');
			return;
		}
		if (method === 'production' && (!capacity || Number(capacity) <= 0)) {
			setError('Masukkan total kapasitas produksi untuk metode Produksi.');
			return;
		}

		setIsSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';

			// Batas invoice bulanan: kuota kustom Admin Pusat bila aktif, jika tidak batas paket.
			const invoiceLimit = effectiveInvoiceMonthlyLimit(activeCompany);
			if (invoiceLimit !== null) {
				const used = await countInvoicesThisMonth(activeCompany.id);
				if (used >= invoiceLimit) {
					setError(invoiceLimitMessage(invoiceLimit, hasCustomInvoiceQuota(activeCompany)));
					return;
				}
			}

			const accountList = await ensureDepAccounts();
			const expenseId =
				expenseAccount || findAccountByName(accountList, /beban penyusutan/i);
			const accumId =
				accumDepAccount || findAccountByName(accountList, /akumulasi penyusutan/i);

			const cost = asset.acquisition_cost || 0;
			const lineItem: DocumentItem = {
				product: asset.product || '',
				name: asset.name,
				code: '',
				quantity: 1,
				unitPrice: cost,
				discount: 0,
				taxRate: 0,
				total: cost,
			};
			const contactRecord = contacts.find(c => c.id === contactId);
			const docNumber = buildDocumentNumber('INV', existingCount);

			const docPayload: Record<string, unknown> = {
				company: activeCompany.id,
				direction: 'pembelian',
				stage: 'invoice',
				number: docNumber,
				date,
				contact: contactId || null,
				partner: contactRecord?.name ?? partner,
				description: `Pembelian aset — ${asset.name}`,
				items: [lineItem],
				subtotal: cost,
				discount_total: 0,
				tax_total: 0,
				total: cost,
				paid_amount: 0,
				debit_account: hasSourceTransaction ? null : assetAccount,
				credit_account: hasSourceTransaction ? null : creditAccount,
				status: 'confirmed',
				owner: ownerId,
			};

			const doc = await pb.collection('documents').create<BusinessDocument>(docPayload);

			// Posting jurnal hanya jika aset belum memiliki transaksi pembelian,
			// agar tidak terjadi pencatatan ganda.
			if (!hasSourceTransaction && creditAccount) {
				const txPayload: Record<string, unknown> = {
					company: activeCompany.id,
					category: 'pembelian',
					date,
					description: `Invoice aset — ${asset.name}`,
					amount: cost,
					partner: contactRecord?.name ?? partner,
					debit_account: assetAccount,
					credit_account: creditAccount,
					owner: ownerId,
				};
				if (contactId) txPayload.contact = contactId;
				const tx = await pb.collection('transactions').create<Transaction>(txPayload);
				const baseEntry = {
					company: activeCompany.id,
					date,
					description: `Invoice aset — ${asset.name}`,
					owner: ownerId,
					transaction: tx.id,
				};
				await pb.collection('entries').create(
					{ ...baseEntry, account: assetAccount, debit: cost, credit: 0 },
					{ requestKey: `asset-inv-debit-${doc.id}` },
				);
				await pb.collection('entries').create(
					{ ...baseEntry, account: creditAccount, debit: 0, credit: cost },
					{ requestKey: `asset-inv-credit-${doc.id}` },
				);
				await pb.collection('documents').update(doc.id, { transaction: tx.id });
			}

			const assetPayload: Record<string, unknown> = {
				status: 'active',
				asset_account: assetAccount,
				expense_account: expenseId,
				accum_dep_account: accumId,
				method,
				salvage_value: Number(salvage) || 0,
				invoice_number: invoiceNumber || docNumber,
				source_document: doc.id,
			};
			if (method === 'straight_line') assetPayload.useful_life = Number(usefulLife) || 0;
			if (method === 'reducing_balance') {
				assetPayload.rate = Number(rate) || 0;
				assetPayload.useful_life = Number(usefulLife) || 0;
			}
			if (method === 'production') assetPayload.production_capacity = Number(capacity) || 0;

			await pb.collection('fixed_assets').update<FixedAsset>(asset.id, assetPayload);
			onCreated();
		} catch {
			setError('Gagal membuat invoice aset. Periksa kembali isian Anda.');
		} finally {
			setIsSaving(false);
		}
	};

	const renderAccountSelect = (
		value: string,
		onChange: (v: string) => void,
		label: string,
		types: AccountType[],
	) => (
		<div className="flex flex-col gap-1.5">
			<label className="text-xs font-semibold">{label}</label>
			<select
				value={value}
				onChange={e => onChange(e.target.value)}
				className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
			>
				<option value="">Pilih akun</option>
				{types.map(type => (
					<optgroup key={type} label={ACCOUNT_TYPE_LABELS[type]}>
						{accountsByType[type].map(a => (
							<option key={a.id} value={a.id}>
								{a.code} — {a.name}
							</option>
						))}
					</optgroup>
				))}
			</select>
		</div>
	);

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
			<div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-soft">
				<div className="flex items-center justify-between border-b border-border px-5 py-4">
					<div className="flex items-center gap-2.5">
						<span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
							<FileText className="size-5" />
						</span>
						<div>
							<h2 className="text-base font-bold text-foreground">Buat Invoice Aset</h2>
							<p className="text-xs text-muted-foreground">
								Aktifkan aset dengan membuat invoice pembelian &amp; pengaturan penyusutan.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
						aria-label="Tutup"
					>
						<X className="size-5" />
					</button>
				</div>

				<div className="border-b border-border bg-muted/30 px-5 py-3">
					<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
						<div>
							<p className="font-semibold text-foreground">{asset.name}</p>
							<p className="text-xs text-muted-foreground">
								Tgl. perolehan: {(asset.acquisition_date || '').slice(0, 10)}
							</p>
						</div>
						<p className="text-right">
							<span className="block text-[11px] text-muted-foreground">Harga perolehan</span>
							<span className="font-bold tabular-nums text-primary">
								{formatRupiah(asset.acquisition_cost || 0)}
							</span>
						</p>
					</div>
					{hasSourceTransaction ? (
						<p className="mt-2 rounded-md bg-primary/5 px-2.5 py-1.5 text-[11px] font-medium text-primary">
							Aset berasal dari transaksi pembelian — jurnal sudah tercatat, invoice tidak
							akan memosting jurnal ganda.
						</p>
					) : null}
				</div>

				<form onSubmit={handleSubmit} className="grid gap-4 px-5 py-5">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<label className="text-xs font-semibold">Pemasok</label>
							<select
								value={contactId}
								onChange={e => {
									setContactId(e.target.value);
									const c = contacts.find(x => x.id === e.target.value);
									if (c) setPartner(c.name);
								}}
								className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								<option value="">— Tanpa pemasok —</option>
								{suppliers.map(c => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<label className="text-xs font-semibold">Nama Pemasok (opsional)</label>
							<input
								value={partner}
								onChange={e => setPartner(e.target.value)}
								placeholder="cth. PT Sumber Rezeki"
								className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label className="text-xs font-semibold">Nomor Invoice</label>
							<input
								value={invoiceNumber}
								onChange={e => setInvoiceNumber(e.target.value)}
								placeholder="cth. INV-001"
								className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label className="text-xs font-semibold">Tanggal Invoice</label>
							<input
								type="date"
								required
								value={date}
								onChange={e => setDate(e.target.value)}
								className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
					</div>

					<div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
						<p className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">
							Pengaturan Penyusutan
						</p>
						<div className="grid gap-4 sm:grid-cols-3">
							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-semibold">Metode</label>
								<select
									value={method}
									onChange={e => setMethod(e.target.value as DepreciationMethod)}
									className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
								>
									<option value="straight_line">Straight Line</option>
									<option value="reducing_balance">Reducing Balance</option>
									<option value="production">Produksi</option>
								</select>
							</div>
							{method === 'straight_line' ? (
								<div className="flex flex-col gap-1.5">
									<label className="text-xs font-semibold">Umur Ekonomis (tahun)</label>
									<input
										type="number"
										min="1"
										required
										value={usefulLife}
										onChange={e => setUsefulLife(e.target.value)}
										placeholder="5"
										className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
									/>
								</div>
							) : null}
							{method === 'reducing_balance' ? (
								<>
									<div className="flex flex-col gap-1.5">
										<label className="text-xs font-semibold">Tarif (%)</label>
										<input
											type="number"
											min="1"
											max="100"
											required
											value={rate}
											onChange={e => setRate(e.target.value)}
											placeholder="25"
											className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<label className="text-xs font-semibold">Umur Ekonomis (tahun)</label>
										<input
											type="number"
											min="1"
											value={usefulLife}
											onChange={e => setUsefulLife(e.target.value)}
											placeholder="opsional"
											className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
										/>
									</div>
								</>
							) : null}
							{method === 'production' ? (
								<div className="flex flex-col gap-1.5">
									<label className="text-xs font-semibold">Total Kapasitas (unit)</label>
									<input
										type="number"
										min="1"
										required
										value={capacity}
										onChange={e => setCapacity(e.target.value)}
										placeholder="100000"
										className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
									/>
								</div>
							) : null}
							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-semibold">Nilai Sisa (Rp)</label>
								<input
									type="number"
									min="0"
									value={salvage}
									onChange={e => setSalvage(e.target.value)}
									placeholder="0"
									className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</div>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						{renderAccountSelect(assetAccount, setAssetAccount, 'Akun Aset', ['aset'])}
						{renderAccountSelect(
							accumDepAccount,
							setAccumDepAccount,
							'Akun Akumulasi Penyusutan',
							['aset'],
						)}
						{renderAccountSelect(
							expenseAccount,
							setExpenseAccount,
							'Akun Beban Penyusutan',
							['beban'],
						)}
						{hasSourceTransaction ? null : (
							<div className="flex flex-col gap-1.5">
								<label className="text-xs font-semibold">Akun Utang (Kredit)</label>
								<select
									value={creditAccount}
									onChange={e => setCreditAccount(e.target.value)}
									className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
								>
									<option value="">Pilih akun utang</option>
									{accountsByType.liabilitas.map(a => (
										<option key={a.id} value={a.id}>
											{a.code} — {a.name}
										</option>
									))}
								</select>
							</div>
						)}
					</div>

					{error ? (
						<p className="text-sm font-semibold text-destructive">{error}</p>
					) : null}

					<div className="flex items-center justify-end gap-2 border-t border-border pt-4">
						<button
							type="button"
							onClick={onClose}
							className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={isSaving}
							className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
						>
							<FileText className="size-4" />
							{isSaving ? 'Memproses…' : 'Buat Invoice & Aktifkan'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
