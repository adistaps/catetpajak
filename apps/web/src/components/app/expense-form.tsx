import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ChevronDown, Minus, Plus, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	formatRupiah,
	isCashAccount,
	todayIso,
	type Account,
	type Company,
} from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import type { Transaction } from '@/lib/transactions';
import { loadTaxTypes, type TaxType } from '@/lib/tax';
import { NoCompany } from '@/components/app/no-company';
import { AmountInput } from '@/components/ui/amount-input';

interface SplitLine {
	key: string;
	accountId: string;
	description: string;
	taxTypeId: string;
	taxRate: string;
	amount: string;
}

function payFromLabel(account: Account) {
	return `(1-${account.code}) - ${account.name} (Cash & Bank)`;
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

interface StoredExpenseDetail {
	debitLines?: Array<{
		accountId?: string;
		description?: string;
		taxTypeId?: string;
		taxRate?: string | number;
		amount?: string | number;
	}>;
	payLater?: boolean;
	payFromAccount?: string;
	fundAccount?: string;
	withholding?: {
		mode?: 'percent' | 'amount';
		value?: number;
		accountId?: string | null;
	};
}

function lineFromStored(line: NonNullable<StoredExpenseDetail['debitLines']>[number]): SplitLine {
	return {
		key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		accountId: line.accountId || '',
		description: line.description || '',
		taxTypeId: line.taxTypeId || '',
		taxRate: String(line.taxRate ?? 0),
		amount: line.amount != null && String(line.amount) !== '' ? String(line.amount) : '',
	};
}

export function ExpenseForm({
	activeCompany,
	transactionId,
}: {
	activeCompany: Company | null;
	transactionId?: string;
}) {
	const navigate = useNavigate();
	const editing = Boolean(transactionId);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [taxTypes, setTaxTypes] = useState<TaxType[]>([]);
	const [date, setDate] = useState(todayIso());
	const [contact, setContact] = useState('');
	const [lines, setLines] = useState<SplitLine[]>(() => [newSplitLine(), newSplitLine()]);
	const [fundAccount, setFundAccount] = useState('');
	const [payLater, setPayLater] = useState(false);
	const [editReady, setEditReady] = useState(!transactionId);
	const [editMissing, setEditMissing] = useState(false);
	const [payQuery, setPayQuery] = useState('');
	const [payOpen, setPayOpen] = useState(false);
	const [withholdMode, setWithholdMode] = useState<'percent' | 'amount'>('percent');
	const [withholdValue, setWithholdValue] = useState('0');
	const [withholdAccountId, setWithholdAccountId] = useState('');
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!activeCompany) return;
		let cancelled = false;
		const ownerId = pb.authStore.record?.id || activeCompany.owner;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		Promise.all([
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code' }),
			pb.collection('contacts').getFullList<Contact>({
				filter: pb.filter('company = {:company} && type = {:type}', {
					company: activeCompany.id,
					type: 'supplier',
				}),
				sort: 'name',
			}),
			ownerId ? loadTaxTypes(activeCompany.id, ownerId, { activeOnly: true }) : Promise.resolve([]),
		])
			.then(([accountList, contactList, types]) => {
				if (cancelled) return;
				setAccounts(accountList);
				setContacts(contactList);
				setTaxTypes(types);
				const expense = accountList.find(account => account.type === 'beban');
				const fund = accountList.find(isCashAccount);
				const withhold = accountList.find(account => /pph|pemotongan/i.test(account.name));
				if (!transactionId) {
					setLines(previous =>
						previous.some(line => line.accountId)
							? previous
							: [newSplitLine(expense?.id ?? ''), newSplitLine()],
					);
					setFundAccount(previous => previous || fund?.id || '');
					setWithholdAccountId(previous => previous || withhold?.id || '');
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, transactionId]);

	useEffect(() => {
		if (!activeCompany || !transactionId) return;
		let cancelled = false;
		setEditReady(false);
		setEditMissing(false);
		pb.collection('transactions')
			.getFirstListItem<Transaction>(
				pb.filter('id = {:id} && company = {:company} && category = {:category}', {
					id: transactionId,
					company: activeCompany.id,
					category: 'biaya',
				}),
				{ requestKey: `expense-edit-${transactionId}` },
			)
			.then(tx => {
				if (cancelled) return;
				if (tx.payroll_run) {
					setEditMissing(true);
					setEditReady(true);
					return;
				}
				const detail = (tx.expense_detail ?? {}) as StoredExpenseDetail;
				const storedLines = detail.debitLines?.filter(line => line.accountId || Number(line.amount) > 0) ?? [];
				setDate((tx.date || '').slice(0, 10) || todayIso());
				setContact(tx.contact || '');
				setLines(
					storedLines.length > 0
						? storedLines.map(lineFromStored)
						: [
								{
									...newSplitLine(tx.debit_account || ''),
									amount: tx.amount ? String(tx.amount) : '',
									description: tx.description && tx.description !== 'Biaya' ? tx.description : '',
								},
							],
				);
				setPayLater(Boolean(detail.payLater));
				const payFrom = detail.payLater ? '' : detail.payFromAccount || detail.fundAccount || tx.credit_account || '';
				setFundAccount(payFrom);
				if (detail.withholding) {
					setWithholdMode(detail.withholding.mode === 'amount' ? 'amount' : 'percent');
					setWithholdValue(String(detail.withholding.value ?? 0));
					if (detail.withholding.accountId) setWithholdAccountId(detail.withholding.accountId);
				}
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
	}, [activeCompany, transactionId]);

	const totals = useMemo(() => {
		const subtotal = lines.reduce((sum, line) => sum + lineMoney(line).amount, 0);
		const tax = lines.reduce((sum, line) => sum + lineMoney(line).taxAmount, 0);
		const gross = subtotal + tax;
		const raw = Number(withholdValue) || 0;
		const withholding =
			withholdMode === 'percent'
				? Math.round((subtotal * raw) / 100)
				: Math.round(raw);
		return {
			subtotal,
			tax,
			gross,
			withholding: Math.min(Math.max(0, withholding), gross),
			net: Math.max(0, gross - Math.min(Math.max(0, withholding), gross)),
		};
	}, [lines, withholdMode, withholdValue]);

	const bankAccounts = accounts.filter(isCashAccount);
	const payableAccount =
		accounts.find(account => /utang usaha/i.test(account.name)) ||
		accounts.find(account => account.type === 'liabilitas') ||
		null;
	const selectedFund = bankAccounts.find(account => account.id === fundAccount) || null;
	const payOptions = bankAccounts.filter(account =>
		`${account.code} ${account.name}`.toLowerCase().includes(payQuery.trim().toLowerCase()),
	);

	if (!activeCompany) return <NoCompany />;

	const fieldClass =
		'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2';

	const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		const kept = lines.filter(line => line.accountId || Number(line.amount) > 0);
		if (kept.length === 0 || kept.some(line => !line.accountId)) {
			setError('Pilih akun biaya pada setiap baris yang diisi.');
			return;
		}
		if (kept.some(line => (Number(line.amount) || 0) <= 0)) {
			setError('Isi jumlah pada setiap baris akun biaya.');
			return;
		}
		if (!payLater && !fundAccount) {
			setError('Pilih akun pada Bayar Dari, atau centang Bayar Nanti.');
			return;
		}
		if (payLater && !payableAccount) {
			setError('Akun Utang Usaha belum ada. Tambahkan dulu di bagan akun.');
			return;
		}
		if (totals.gross <= 0) {
			setError('Jumlah biaya harus lebih dari 0.');
			return;
		}
		if (editing && !editReady) return;
		setIsSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			if (transactionId) {
				const currentTransaction = await pb.collection('transactions').getFirstListItem<Transaction>(
					pb.filter('id = {:id} && company = {:company} && category = {:category}', {
						id: transactionId,
						company: activeCompany.id,
						category: 'biaya',
					}),
					{ requestKey: `expense-edit-check-${transactionId}` },
				);
				if (currentTransaction.payroll_run) throw new Error('Transaksi payroll harus dikelola melalui tab Payroll.');
			}
			const contactRecord = contacts.find(item => item.id === contact);
			const debitLines = kept.map(line => ({ ...line, ...lineMoney(line) }));
			const withholdAccount =
				accounts.find(account => account.id === withholdAccountId) ||
				accounts.find(account => /pph|pemotongan/i.test(account.name)) ||
				null;
			const paymentAccountId = payLater ? payableAccount!.id : fundAccount;
			const creditLines = [
				{
					accountId: paymentAccountId,
					description: payLater ? 'Bayar nanti' : '',
					amount: String(totals.net),
					taxRate: '0',
					taxAmount: 0,
					total: totals.net,
				},
			];
			if (totals.withholding > 0 && withholdAccount && withholdAccount.id !== paymentAccountId) {
				creditLines.push({
					accountId: withholdAccount.id,
					description: `Pemotongan ${withholdAccount.name}`.trim(),
					amount: String(totals.withholding),
					taxRate: '0',
					taxAmount: 0,
					total: totals.withholding,
				});
			} else if (totals.withholding > 0) {
				creditLines[0].amount = String(totals.gross);
				creditLines[0].total = totals.gross;
			}
			const expenseDetail = {
				debitLines,
				creditLines,
				memo: '',
				withholding: {
					mode: withholdMode,
					value: Number(withholdValue) || 0,
					amount: totals.withholding,
					accountId: withholdAccount?.id || withholdAccountId || null,
				},
				fundAccount: paymentAccountId,
				payLater,
				payFromAccount: payLater ? '' : fundAccount,
			};
			const txPayload: Record<string, unknown> = {
				company: activeCompany.id,
				category: 'biaya',
				date,
				description: 'Biaya',
				amount: totals.gross,
				partner: contactRecord?.name ?? '',
				contact: contact || null,
				debit_account: debitLines[0].accountId,
				credit_account: paymentAccountId,
				expense_detail: expenseDetail,
				owner: ownerId,
			};
			let txId = transactionId ?? '';
			if (transactionId) {
				const updatePayload = { ...txPayload };
				delete updatePayload.owner;
				await pb.collection('transactions').update(transactionId, updatePayload);
				const oldEntries = await pb.collection('entries').getFullList({
					filter: pb.filter('company = {:company} && transaction = {:tx}', {
						company: activeCompany.id,
						tx: transactionId,
					}),
					requestKey: `expense-old-entries-${transactionId}`,
				});
				await Promise.all(
					oldEntries.map((entry, index) =>
						pb.collection('entries').delete(entry.id, {
							requestKey: `expense-del-entry-${entry.id}-${index}`,
						}),
					),
				);
			} else {
				const tx: Transaction = await pb.collection('transactions').create<Transaction>(txPayload);
				txId = tx.id;
			}
			const baseEntry = {
				company: activeCompany.id,
				date,
				description: 'Biaya',
				owner: ownerId,
				transaction: txId,
			};
			const taxAccount = accounts.find(account => /ppn.*masukan|pajak masukan/i.test(account.name));
			let entryIndex = 0;
			for (const line of debitLines) {
				const note = line.description || 'Biaya';
				const foldTax = !taxAccount || taxAccount.id === line.accountId;
				await pb.collection('entries').create(
					{
						...baseEntry,
						description: note,
						account: line.accountId,
						debit: foldTax ? line.total : line.amount,
						credit: 0,
					},
					{ requestKey: `entry-debit-${txId}-${entryIndex}` },
				);
				entryIndex += 1;
				if (!foldTax && line.taxAmount > 0 && taxAccount) {
					await pb.collection('entries').create(
						{
							...baseEntry,
							description: `Pajak ${note}`,
							account: taxAccount.id,
							debit: line.taxAmount,
							credit: 0,
						},
						{ requestKey: `entry-tax-${txId}-${entryIndex}` },
					);
					entryIndex += 1;
				}
			}
			for (const line of creditLines) {
				if (line.total <= 0) continue;
				await pb.collection('entries').create(
					{
						...baseEntry,
						description: line.description || 'Biaya',
						account: line.accountId,
						debit: 0,
						credit: line.total,
					},
					{ requestKey: `entry-credit-${txId}-${entryIndex}` },
				);
				entryIndex += 1;
			}
			navigate('/app/biaya');
		} catch {
			setError('Gagal menyimpan transaksi. Periksa kembali isian Anda.');
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-col gap-3">
				<Link
					to="/app/biaya"
					className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Kembali ke Biaya
				</Link>
				<div>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
						{editing ? 'Ubah Biaya' : 'Catat Biaya'}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{editing
							? 'Perbarui transaksi biaya. Jurnal terkait ikut disesuaikan.'
							: 'Catat pengeluaran biaya operasional. Pemasok boleh dikosongkan.'}
					</p>
				</div>
			</header>

			{editing && !editReady ? (
				<p className="text-sm text-muted-foreground">Memuat transaksi…</p>
			) : null}
			{editMissing ? (
				<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive">
					Transaksi tidak ditemukan untuk perusahaan ini.
				</p>
			) : null}
			<form onSubmit={handleCreate} className="flex flex-col gap-5">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="exp-date" className="text-xs font-semibold">
							Tanggal
						</label>
						<input
							id="exp-date"
							type="date"
							required
							value={date}
							onChange={event => setDate(event.target.value)}
							className={fieldClass}
						/>
					</div>
					<div className="flex flex-col gap-2 sm:col-span-2">
						<label htmlFor="exp-contact" className="text-xs font-semibold">
							Pemasok <span className="font-normal text-muted-foreground">(opsional)</span>
						</label>
						<select
							id="exp-contact"
							value={contact}
							onChange={event => setContact(event.target.value)}
							className={fieldClass}
						>
							<option value="">Pilih pemasok</option>
							{contacts.map(item => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="rounded-lg bg-[#f1eafa] px-4 py-3">
					<p className="text-sm font-bold text-foreground">Bayar Dari</p>
					<div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
						<div className="relative min-w-0 flex-1">
							<div className="flex items-center rounded-md border border-[#d5dbe3] bg-white shadow-sm">
								<input
									id="exp-pay-from"
									role="combobox"
									aria-expanded={payOpen}
									aria-controls="exp-pay-from-list"
									aria-label="Bayar Dari"
									disabled={payLater}
									value={payOpen ? payQuery : selectedFund ? payFromLabel(selectedFund) : ''}
									placeholder={payLater ? 'Dibayar nanti — utang usaha' : 'Pilih akun kas atau bank'}
									onChange={event => {
										setPayQuery(event.target.value);
										setPayOpen(true);
									}}
									onFocus={() => {
										if (payLater) return;
										setPayQuery('');
										setPayOpen(true);
									}}
									className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none disabled:text-muted-foreground"
								/>
								{selectedFund && !payLater ? (
									<button
										type="button"
										aria-label="Hapus akun Bayar Dari"
										onClick={() => {
											setFundAccount('');
											setPayQuery('');
											setPayOpen(true);
										}}
										className="inline-flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
									>
										<X className="size-4" />
									</button>
								) : null}
								<button
									type="button"
									aria-label="Buka daftar akun kas dan bank"
									disabled={payLater}
									onClick={() => {
										if (payLater) return;
										setPayOpen(open => !open);
									}}
									className="inline-flex size-9 items-center justify-center text-muted-foreground disabled:opacity-40"
								>
									<ChevronDown className="size-4" />
								</button>
							</div>
							{payOpen && !payLater ? (
								<ul
									id="exp-pay-from-list"
									role="listbox"
									className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-white py-1 shadow-soft"
								>
									{payOptions.length === 0 ? (
										<li className="px-3 py-2 text-sm text-muted-foreground">Tidak ada akun kas atau bank.</li>
									) : (
										payOptions.map(account => (
											<li key={account.id}>
												<button
													type="button"
													role="option"
													aria-selected={account.id === fundAccount}
													onClick={() => {
														setFundAccount(account.id);
														setPayQuery('');
														setPayOpen(false);
													}}
													className="w-full px-3 py-2 text-left text-sm hover:bg-[#e7f6fb]"
												>
													{payFromLabel(account)}
												</button>
											</li>
										))
									)}
								</ul>
							) : null}
						</div>
						<label className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-bold">
							<input
								type="checkbox"
								checked={payLater}
								onChange={event => {
									setPayLater(event.target.checked);
									setPayOpen(false);
								}}
								className="size-4 accent-primary"
							/>
							Bayar Nanti
						</label>
					</div>
					{payLater ? (
						<p className="mt-2 text-xs text-muted-foreground">
							Tidak ada pembayaran langsung. Jurnal mengkredit{' '}
							{payableAccount ? `${payableAccount.code} — ${payableAccount.name}` : 'Utang Usaha'}.
						</p>
					) : null}
				</div>

				<div className="overflow-x-auto rounded-lg border border-border">
					<div className="min-w-[720px]">
						<div className="grid grid-cols-[1.4fr_1.5fr_1fr_1fr_2.5rem] bg-primary/10 px-2 py-2.5 text-xs font-bold text-foreground">
							<span className="px-1">Akun Biaya</span>
							<span className="px-1">Deskripsi</span>
							<span className="px-1">Pajak</span>
							<span className="px-1">Jumlah</span>
							<span />
						</div>
						{lines.map(line => (
							<div
								key={line.key}
								className="grid grid-cols-[1.4fr_1.5fr_1fr_1fr_2.5rem] items-center gap-2 border-t border-border px-2 py-2"
							>
								<select
									aria-label="Pilih akun biaya"
									value={line.accountId}
									onChange={event =>
										setLines(current =>
											current.map(item =>
												item.key === line.key ? { ...item, accountId: event.target.value } : item,
											),
										)
									}
									className={fieldClass}
								>
									<option value="">Pilih akun biaya</option>
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
										setLines(current =>
											current.map(item =>
												item.key === line.key ? { ...item, description: event.target.value } : item,
											),
										)
									}
									className={`${fieldClass} min-h-10 resize-y`}
								/>
								<select
									aria-label="Pilih pajak"
									value={line.taxTypeId}
									onChange={event => {
										const taxTypeId = event.target.value;
										const tax = taxTypes.find(item => item.id === taxTypeId);
										setLines(current =>
											current.map(item =>
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
								<div className="flex items-center rounded-md border border-border bg-background ring-primary/30 focus-within:ring-2">
									<span className="pl-3 text-sm text-muted-foreground">Rp</span>
									<AmountInput
										aria-label="Jumlah"
										value={line.amount}
										onValueChange={v =>
											setLines(current =>
												current.map(item =>
													item.key === line.key ? { ...item, amount: String(v) } : item,
												),
											)
										}
										placeholder="0,00"
										className="w-full bg-transparent px-2 py-2 text-sm outline-none"
									/>
								</div>
								<button
									type="button"
									aria-label="Hapus baris"
									disabled={lines.length === 1}
									onClick={() => setLines(current => current.filter(item => item.key !== line.key))}
									className="inline-flex size-9 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:opacity-30"
								>
									<Minus className="size-4" strokeWidth={2.5} />
								</button>
							</div>
						))}
					</div>
				</div>

				<button
					type="button"
					onClick={() => setLines(current => [...current, newSplitLine()])}
					className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
				>
					<Plus className="size-4" /> Tambah Data
				</button>

				<div className="w-full">
					<div className="ml-auto flex w-full max-w-[420px] flex-col gap-3 text-sm">
						<div className="flex items-center justify-between gap-4">
							<span>SubTotal</span>
							<span className="font-semibold tabular-nums">{formatRupiah(totals.subtotal)}</span>
						</div>
						<div className="flex items-center justify-between gap-4">
							<span>Total</span>
							<span className="font-semibold tabular-nums">{formatRupiah(totals.gross)}</span>
						</div>
					<div className="flex flex-col gap-2">
						<select
							aria-label="Akun pemotongan"
							value={withholdAccountId}
							onChange={event => setWithholdAccountId(event.target.value)}
							className={fieldClass}
						>
							<option value="">Pilih akun pemotongan (opsional)</option>
							{accounts.map(account => (
								<option key={account.id} value={account.id}>
									{account.code} — {account.name}
								</option>
							))}
						</select>
						<div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
							<span className="font-medium">Pemotongan</span>
							<div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
								<input
									aria-label="Nilai pemotongan"
									type="number"
									min="0"
									step="0.01"
									value={withholdValue}
									onChange={event => setWithholdValue(event.target.value)}
									className="w-16 rounded-md border border-border bg-background px-2 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
								<div className="inline-flex overflow-hidden rounded-md border border-border">
									<button
										type="button"
										aria-pressed={withholdMode === 'percent'}
										onClick={() => setWithholdMode('percent')}
										className={`px-2.5 py-2 text-xs font-bold ${
											withholdMode === 'percent'
												? 'bg-primary text-primary-foreground'
												: 'bg-background text-foreground'
										}`}
									>
										%
									</button>
									<button
										type="button"
										aria-pressed={withholdMode === 'amount'}
										onClick={() => setWithholdMode('amount')}
										className={`border-l border-border px-2.5 py-2 text-xs font-bold ${
											withholdMode === 'amount'
												? 'bg-primary text-primary-foreground'
												: 'bg-background text-foreground'
										}`}
									>
										Rp.
									</button>
								</div>
							</div>
							<span className="text-right font-semibold tabular-nums sm:min-w-24">
								{formatRupiah(totals.withholding)}
							</span>
						</div>
					</div>
						<div className="mt-2 flex items-center justify-between gap-4 border-t border-border pt-3 text-base font-extrabold">
							<span>Total</span>
							<span className="tabular-nums">{formatRupiah(totals.net)}</span>
						</div>
						<button
							type="submit"
							disabled={isSaving || accounts.length === 0 || !editReady || editMissing}
							className="mt-3 w-fit self-end rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
						>
							{isSaving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Simpan Biaya'}
						</button>
						{error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
					</div>
				</div>
			</form>
		</div>
	);
}
