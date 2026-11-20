import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight, Banknote, Link2, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import pb from '@/lib/pocketbase-client';
import { createNumberedJournalLines, rollbackTransaction } from '@/lib/journal-numbers';
import {
	computeBalances,
	formatDate,
	formatRupiah,
	isCashAccount,
	todayIso,
	type Account,
	type Company,
	type JournalEntry,
} from '@/lib/accounting';
import type { Transaction } from '@/lib/transactions';
import { NoCompany } from '@/components/app/no-company';
import { ImportExportBar } from '@/components/app/import-export-bar';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { ColumnFilter } from '@/components/app/invoice-list-table';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useLanguage } from '@/hooks/use-language';

const TX_EXPORT_HEADERS = [
	'Tanggal',
	'Mitra',
	'Kode Produk',
	'Keterangan',
	'Kode Akun Debit',
	'Kode Akun Kredit',
	'Qty',
	'Harga Satuan',
	'Diskon',
	'Pajak (%)',
	'Nominal',
];

type CashColumnKey = 'date' | 'description' | 'debit' | 'credit' | 'amount';

const CASH_COLUMNS: { key: CashColumnKey; label: string; align?: 'right' }[] = [
	{ key: 'date', label: 'Tanggal' },
	{ key: 'description', label: 'Keterangan' },
	{ key: 'debit', label: 'Akun Debit' },
	{ key: 'credit', label: 'Akun Kredit' },
	{ key: 'amount', label: 'Nominal', align: 'right' },
];

const DEFAULT_VISIBLE: Record<CashColumnKey, boolean> = {
	date: true,
	description: true,
	debit: true,
	credit: true,
	amount: true,
};

type TabId = 'semua' | string;

interface KasBankModuleProps {
	activeCompany: Company | null;
}

export function KasBankModule({ activeCompany }: KasBankModuleProps) {
	const { t } = useLanguage();
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [entries, setEntries] = useState<JournalEntry[]>([]);
	const [transactions, setTransactions] = useState<Transaction[]>([]);
	const [tab, setTab] = useState<TabId>('semua');
	const [query, setQuery] = useState('');
	const [columns, setColumns] = useState<Record<CashColumnKey, boolean>>(DEFAULT_VISIBLE);

	useEffect(() => {
		if (!activeCompany) {
			setAccounts([]);
			setEntries([]);
			setTransactions([]);
			return;
		}
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		const txFilter = pb.filter('company = {:company} && category = {:category}', {
			company: activeCompany.id,
			category: 'kas_bank',
		});
		Promise.all([
			pb.collection('accounts').getFullList<Account>({
				filter: companyFilter,
				sort: 'code',
				requestKey: 'kas-bank-accounts',
			}),
			pb.collection('transactions').getFullList<Transaction>({
				filter: txFilter,
				sort: '-date,-created',
				expand: 'debit_account,credit_account,contact,product',
				requestKey: 'kas-bank-transactions',
			}),
			pb.collection('entries').getFullList<JournalEntry>({
				filter: companyFilter,
				requestKey: 'kas-bank-entries',
			}),
		])
			.then(([accountList, txList, entryList]) => {
				if (cancelled) return;
				setAccounts(accountList);
				setTransactions(txList);
				setEntries(entryList);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	const cashAccounts = useMemo(() => {
		const headerAccountIds = new Set(
			accounts.flatMap(account => (account.parent ? [account.parent] : [])),
		);
		return accounts.filter(
			account => isCashAccount(account) && !account.is_header && !headerAccountIds.has(account.id),
		);
	}, [accounts]);

	const normalizedQuery = useDebouncedValue(query.trim().toLowerCase(), 250);

	const filteredAccounts = useMemo(() => {
		if (!normalizedQuery) return cashAccounts;
		return cashAccounts.filter(account =>
			`${account.code} ${account.name}`.toLowerCase().includes(normalizedQuery),
		);
	}, [cashAccounts, normalizedQuery]);

	const balances = useMemo(
		() => computeBalances(accounts, entries, activeCompany?.conversion_date),
		[accounts, entries, activeCompany?.conversion_date],
	);

	const totalBalance = useMemo(() => {
		const scoped = tab === 'semua' ? cashAccounts : cashAccounts.filter(account => account.id === tab);
		return scoped.reduce((sum, account) => {
			const row = balances.find(item => item.account.id === account.id);
			return sum + (row?.balance ?? 0);
		}, 0);
	}, [balances, cashAccounts, tab]);

	useEffect(() => {
		if (tab === 'semua') return;
		if (!cashAccounts.some(account => account.id === tab)) setTab('semua');
	}, [cashAccounts, tab]);

	const visibleTx = useMemo(() => {
		const scoped =
			tab === 'semua'
				? transactions
				: transactions.filter(tx => tx.debit_account === tab || tx.credit_account === tab);
		if (!normalizedQuery) return scoped;
		const matchingIds = new Set(filteredAccounts.map(account => account.id));
		return scoped.filter(tx => {
			const debit = tx.expand?.debit_account;
			const credit = tx.expand?.credit_account;
			const haystack = [
				tx.description,
				tx.partner,
				tx.expand?.contact?.name,
				debit ? `${debit.code} ${debit.name}` : '',
				credit ? `${credit.code} ${credit.name}` : '',
				String(tx.amount ?? ''),
			]
				.join(' ')
				.toLowerCase();
			return (
				haystack.includes(normalizedQuery) ||
				matchingIds.has(tx.debit_account) ||
				matchingIds.has(tx.credit_account)
			);
		});
	}, [filteredAccounts, normalizedQuery, tab, transactions]);

	const toggleColumn = (key: CashColumnKey) => {
		setColumns(prev => {
			const nextOn = !prev[key];
			if (!nextOn && Object.values(prev).filter(Boolean).length <= 1) return prev;
			return { ...prev, [key]: nextOn };
		});
	};

	const { run: runDelete, isPending: isDeleting } = usePendingAction();

	if (!activeCompany) return <NoCompany />;

	const activeAccount = cashAccounts.find(account => account.id === tab) ?? null;

	const handleExport = () => {
		const rows = [
			TX_EXPORT_HEADERS,
			...visibleTx.map(tx => [
				tx.date,
				tx.expand?.contact?.name ?? tx.partner ?? '',
				tx.expand?.product?.code ?? '',
				tx.description ?? '',
				tx.expand?.debit_account?.code ?? '',
				tx.expand?.credit_account?.code ?? '',
				String(tx.quantity ?? ''),
				String(tx.unit_price ?? ''),
				String(tx.discount ?? ''),
				String(tx.tax_rate ?? ''),
				String(tx.amount ?? 0),
			]),
		];
		exportCsv(timestampedFilename('transaksi-kas_bank'), rows);
	};

	const handleImport = async (rows: string[][]) => {
		const ownerId = pb.authStore.record?.id ?? '';
		let created = 0;
		let skipped = 0;
		for (let idx = 0; idx < rows.length; idx += 1) {
			const row = rows[idx];
			const [rawDate, , , rawDesc, rawDebitCode, rawCreditCode, , , , , rawAmount] = row;
			const date = (rawDate ?? '').trim() || todayIso();
			const debitAcc = accounts.find(a => a.code === (rawDebitCode ?? '').trim());
			const creditAcc = accounts.find(a => a.code === (rawCreditCode ?? '').trim());
			if (!debitAcc || !creditAcc) {
				skipped += 1;
				continue;
			}
			if (debitAcc.id === creditAcc.id) {
				skipped += 1;
				continue;
			}
			const lineTotal = Number(rawAmount) || 0;
			if (lineTotal <= 0) {
				skipped += 1;
				continue;
			}
			try {
				const tx = await pb.collection('transactions').create<Transaction>(
					{
						company: activeCompany.id,
						category: 'kas_bank',
						date,
						description: (rawDesc ?? '').trim(),
						amount: lineTotal,
						partner: '',
						debit_account: debitAcc.id,
						credit_account: creditAcc.id,
						owner: ownerId,
					},
					{
						expand: 'debit_account,credit_account,contact,product',
						requestKey: `import-tx-kas_bank-${idx}`,
					},
				);
				try {
					await createNumberedJournalLines({
						companyId: activeCompany.id,
						date,
						ownerId,
						transactionId: tx.id,
						lines: [
							{
								account: debitAcc.id,
								description: (rawDesc ?? '').trim() || 'Kas & Bank',
								debit: lineTotal,
								credit: 0,
							},
							{
								account: creditAcc.id,
								description: (rawDesc ?? '').trim() || 'Kas & Bank',
								debit: 0,
								credit: lineTotal,
							},
						],
						requestKeyPrefix: `import-entry-${tx.id}`,
					});
				} catch {
					try {
						await rollbackTransaction(tx.id);
					} catch {
						/* baris gagal — jangan hitung sebagai transaksi baru */
					}
					skipped += 1;
					continue;
				}
				setTransactions(previous => [tx, ...previous]);
				created += 1;
			} catch {
				skipped += 1;
			}
		}
		if (created === 0) throw new Error('Tidak ada transaksi baru yang berhasil diimpor.');
		return { created, skipped };
	};

	const handleDelete = (tx: Transaction) => {
		if (!window.confirm(t('kasbank.delete_confirm'))) return;
		void runDelete(tx.id, async () => {
			try {
				await pb.collection('transactions').delete(tx.id, { requestKey: `del-kas-${tx.id}` });
				setTransactions(previous => previous.filter(item => item.id !== tx.id));
				toast.success(t('kasbank.deleted'));
			} catch {
				toast.error(t('kasbank.delete_failed'));
			}
		});
	};

	return (
		<div className="flex flex-col gap-8">
			<header>
				<div className="mt-2 flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t('kasbank.title')}</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							{t('kasbank.subtitle')}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<ImportExportBar
							importLabel="Import Kas & Bank"
							importButtonLabel="Impor"
							importButtonVariant="dropdown"
							exportLabel="Export Kas & Bank"
							onExport={handleExport}
							onImport={async (_headers, rows) => {
								await handleImport(rows);
							}}
						/>
						<Link
							to="/app/kas-bank/buat"
							className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
						>
							<Plus className="size-4" /> {t('kasbank.create')}
						</Link>
					</div>
				</div>
			</header>

			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
					<nav
						aria-label="Akun kas dan bank"
						className="flex min-w-0 items-center gap-0 overflow-x-auto overflow-y-hidden rounded-[18px] border border-emerald-300 bg-white p-0 shadow-soft-sm sm:max-w-[62%]"
					>
						<TabButton active={tab === 'semua'} onClick={() => setTab('semua')}>
							{t('kasbank.all')}
						</TabButton>
						{filteredAccounts.map(account => (
							<TabButton
								key={account.id}
								active={tab === account.id}
								onClick={() => setTab(account.id)}
							>
								{account.name.replace(/^\s*\d+[\s.\-]*/, '').trim() || account.name}
							</TabButton>
						))}
						{cashAccounts.length === 0 ? (
							<span className="inline-flex min-w-max items-center justify-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-medium text-white sm:px-4">
								<ArrowLeftRight className="size-4 shrink-0" strokeWidth={1.75} />
								{t('kasbank.no_accounts')}
							</span>
						) : null}
						{cashAccounts.length > 0 && filteredAccounts.length === 0 ? (
							<span className="inline-flex min-w-max items-center px-3 py-2.5 text-sm text-white/80">
								{t('kasbank.not_found')}
							</span>
						) : null}
					</nav>
					<div className="flex w-full shrink-0 items-center justify-end gap-2.5 px-1 sm:w-72">
						<div className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-100 to-sky-100 ring-1 ring-emerald-200/70">
							<Link2 className="size-5 text-slate-600" strokeWidth={2.4} aria-hidden="true" />
							<span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-violet-600 text-white shadow-sm ring-2 ring-white">
								<Banknote className="size-3" strokeWidth={2} aria-hidden="true" />
							</span>
						</div>
						<div className="min-w-0">
							<p className="text-xs font-medium leading-tight text-slate-600">
								{activeAccount
									? `${t('kasbank.col.debit').replace('Akun Debit', 'Saldo')} ${activeAccount.code} ${activeAccount.name}`
									: t('kasbank.total_balance')}
							</p>
							<p className="text-sm font-extrabold leading-tight tabular-nums text-emerald-800">
								{formatRupiah(totalBalance)}
							</p>
						</div>
					</div>
				</div>

				<div className="flex items-center justify-end">
					<ColumnFilter columns={CASH_COLUMNS} visible={columns} onToggle={toggleColumn} />
				</div>
			</div>

			<div className="-mt-6">
				{visibleTx.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">
						{t('kasbank.empty', { name: activeAccount ? activeAccount.name : '' })}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
							<thead className="sticky top-0 z-20">
								<tr className="text-left text-[13px] font-semibold text-slate-900">
								{columns.date ? <th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">{t('kasbank.col.date')}</th> : null}
									{columns.description ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('kasbank.col.description')}</th> : null}
									{columns.debit ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('kasbank.col.debit')}</th> : null}
									{columns.credit ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('kasbank.col.credit')}</th> : null}
									{columns.amount ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('kasbank.col.amount')}</th> : null}
									<th className="w-12 border-b border-slate-200 px-2 py-2.5 text-right" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{visibleTx.map(tx => (
									<tr key={tx.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
										{columns.date ? (
											<td className="px-5 py-2 align-middle whitespace-nowrap">{formatDate(tx.date)}</td>
										) : null}
										{columns.description ? (
											<td className="max-w-[280px] truncate px-2 py-2 align-middle text-slate-600" title={tx.description || ''}>
												{tx.description || '—'}
											</td>
										) : null}
										{columns.debit ? (
											<td className="px-2 py-2 align-middle">
												{tx.expand?.debit_account
													? `${tx.expand.debit_account.code} — ${tx.expand.debit_account.name}`
													: '—'}
											</td>
										) : null}
										{columns.credit ? (
											<td className="px-2 py-2 align-middle">
												{tx.expand?.credit_account
													? `${tx.expand.credit_account.code} — ${tx.expand.credit_account.name}`
													: '—'}
											</td>
										) : null}
										{columns.amount ? (
											<td className="px-2 py-2 align-middle text-right font-medium whitespace-nowrap tabular-nums">
												{formatRupiah(tx.amount)}
											</td>
										) : null}
										<td className="px-2 py-2 align-middle">
											<div className="flex items-center justify-end">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<button
															type="button"
															aria-label="Buka aksi transaksi"
															className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/30 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
														>
																			{isDeleting(tx.id) ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
														</button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
														<DropdownMenuItem
															onSelect={() => handleDelete(tx)}
															className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold text-destructive focus:text-destructive"
														>
															<Trash2 className="size-4" /> Hapus
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-current={active ? 'page' : undefined}
			className={
				active
					? 'inline-flex min-w-max items-center justify-center whitespace-nowrap rounded-none bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors sm:px-4'
					: 'inline-flex min-w-max items-center justify-center whitespace-nowrap rounded-none bg-white px-3 py-2.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-50 sm:px-4'
			}
		>
			{children}
		</button>
	);
}
