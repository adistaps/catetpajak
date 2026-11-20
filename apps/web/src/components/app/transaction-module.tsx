import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
	Calculator,
	CheckCircle2,
	HandCoins,
	Loader2,
	MoreHorizontal,
	Pencil,
	Plus,
	Printer,
	Receipt,
	ReceiptText,
	Trash2,
	Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePendingAction } from '@/hooks/use-pending-action';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import pb from '@/lib/pocketbase-client';
import {
	formatDate,
	formatRupiah,
	todayIso,
	type Account,
	type Company,
	type JournalEntry,
	type PayrollRunMeta,
} from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import type { Product } from '@/lib/products';
import type { Transaction } from '@/lib/transactions';
import type { TransactionModuleConfig } from '@/data/transaction-modules';
import { NoCompany } from '@/components/app/no-company';
import { ImportExportBar } from '@/components/app/import-export-bar';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { exportInvoicePdf } from '@/lib/pdf-print';
import { LoanTransactionProcessDialog } from '@/components/app/loan-transaction-process-dialog';
import { ReimbursementProcessDialog } from '@/components/app/reimbursement-process-dialog';
import { ColumnFilter } from '@/components/app/invoice-list-table';
import { reconcileLoanTransactions } from '@/lib/loan-ledger';
import { useLanguage } from '@/hooks/use-language';
import { reconcileReimbursementTransactions } from '@/lib/reimbursements';
import { loadPayrollJournalGroups, payrollErrorMessage, type PayrollJournalGroup as PayrollExpenseGroup } from '@/lib/payroll-expenses';
import { PayrollJournalList } from '@/components/app/payroll-journal-list';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

type BiayaTab = 'semua' | 'biaya' | 'pinjaman' | 'reimbursement' | 'payroll';
type BiayaColumnKey = 'date' | 'partner' | 'description' | 'debit' | 'credit' | 'amount' | 'status';

const BIAYA_COLUMNS: { key: BiayaColumnKey; label: string }[] = [
	{ key: 'date', label: 'Tanggal' },
	{ key: 'partner', label: 'Pemasok' },
	{ key: 'description', label: 'Keterangan' },
	{ key: 'debit', label: 'Akun Debit' },
	{ key: 'credit', label: 'Akun Kredit' },
	{ key: 'amount', label: 'Nominal' },
	{ key: 'status', label: 'Status' },
];

const DEFAULT_BIAYA_COLUMNS: Record<BiayaColumnKey, boolean> = {
	date: true,
	partner: true,
	description: true,
	debit: true,
	credit: true,
	amount: true,
	status: true,
};

function expenseKind(tx: Transaction): BiayaTab {
	if (tx.expense_detail?.kind === 'loan') return 'pinjaman';
	if (tx.expense_detail?.kind === 'reimbursement') return 'reimbursement';
	return 'biaya';
}

/** Kelompokkan baris jurnal payroll (entries dengan payroll_run) per periode penggajian. */
function groupPayrollEntries(entries: JournalEntry[]): PayrollJournalGroup[] {
	const buckets = new Map<string, JournalEntry[]>();
	for (const entry of entries) {
		const runId = (entry.payroll_run || '').trim();
		if (!runId) continue;
		const list = buckets.get(runId) ?? [];
		list.push(entry);
		buckets.set(runId, list);
	}
	const groups: PayrollJournalGroup[] = [];
	for (const [runId, lines] of buckets) {
		const sorted = [...lines].sort((a, b) => (a.number || '').localeCompare(b.number || ''));
		const run = sorted[0]?.expand?.payroll_run as PayrollRunMeta | undefined;
		const total = sorted.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
		const descriptions = [...new Set(sorted.map(line => (line.description || '').trim()).filter(Boolean))];
		groups.push({
			runId,
			run,
			date: run?.pay_date || sorted[0]?.date || '',
			description: run?.description || descriptions.join(' · ') || `Penggajian ${run?.period ?? ''}`,
			lines: sorted,
			total,
		});
	}
	groups.sort((a, b) => b.date.localeCompare(a.date));
	return groups;
}

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

interface PayrollJournalGroup {
	runId: string;
	run?: PayrollRunMeta;
	date: string;
	description: string;
	lines: JournalEntry[];
	total: number;
}

interface TransactionModuleProps {
	config: TransactionModuleConfig;
	activeCompany: Company | null;
}

export function TransactionModule({ config, activeCompany }: TransactionModuleProps) {
	const { t } = useLanguage();
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [transactions, setTransactions] = useState<Transaction[]>([]);
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [processingTx, setProcessingTx] = useState<Transaction | null>(null);
	const [processingReimbTx, setProcessingReimbTx] = useState<Transaction | null>(null);
	const [reloadKey, setReloadKey] = useState(0);
	const [tab, setTab] = useState<BiayaTab>('semua');
	const [columns, setColumns] = useState<Record<BiayaColumnKey, boolean>>(DEFAULT_BIAYA_COLUMNS);
	const [payrollGroups, setPayrollGroups] = useState<PayrollExpenseGroup[]>([]);
	const [payrollLoading, setPayrollLoading] = useState(false);
	const [payrollError, setPayrollError] = useState('');
	const [listError, setListError] = useState('');
	const [journalLines, setJournalLines] = useState<JournalEntry[]>([]);
	const [journalOpen, setJournalOpen] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setAccounts([]);
			setTransactions([]);
			setContacts([]);
			setProducts([]);
			setPayrollGroups([]);
			return;
		}
		let cancelled = false;
		setAccounts([]);
		setTransactions([]);
		setContacts([]);
		setProducts([]);
		setPayrollGroups([]);
		setListError('');
		setPayrollError('');
		setPayrollLoading(config.key === 'biaya');
		if (config.key === 'biaya') {
			loadPayrollJournalGroups(activeCompany.id)
				.then(groups => { if (!cancelled) setPayrollGroups(groups); })
				.catch(error => { if (!cancelled) setPayrollError(payrollErrorMessage(error, 'Gagal memuat jurnal payroll. Periksa izin dan koneksi, lalu coba lagi.')); })
				.finally(() => { if (!cancelled) setPayrollLoading(false); });
		}
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		const txFilter = pb.filter('company = {:company} && category = {:category}', {
			company: activeCompany.id,
			category: config.key,
		});
		// Pengajuan pinjaman karyawan yang belum sempat tercatat sebagai transaksi
		// Biaya (pengajuan dibuat saat peramban terputus atau gagal simpan)
		// dipulihkan di sini agar akuntan selalu melihatnya untuk diproses.
		const prepare = async () => {
			if (config.key !== 'biaya') return;
			try {
				await reconcileLoanTransactions(activeCompany);
				await reconcileReimbursementTransactions(activeCompany);
			} catch {
				// Rekonsiliasi bersifat bantuan — daftar tetap dimuat.
			}
		};
		const loadTasks = () => {
			const tasks: Promise<unknown>[] = [
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code', requestKey: null }),
			pb
				.collection('transactions')
				.getFullList<Transaction>({
					filter: txFilter,
					sort: '-date,-created',
					expand: 'debit_account,credit_account,contact,product',
					requestKey: null,
				}),
		];
		if (config.contactType) {
			const contactFilter = pb.filter('company = {:company} && type = {:type}', {
				company: activeCompany.id,
				type: config.contactType,
			});
			tasks.push(
				pb.collection('contacts').getFullList<Contact>({ filter: contactFilter, sort: 'name', requestKey: null }),
			);
		}
			if (config.allowProduct) {
				tasks.push(
					pb.collection('products').getFullList<Product>({ filter: companyFilter, sort: 'name', requestKey: null }),
				);
			}
			return Promise.all(tasks);
		};
		prepare()
			.then(loadTasks)
			.then(results => {
				if (cancelled) return;
				const [accountList, txList] = results as [Account[], Transaction[]];
				setAccounts(accountList);
				setTransactions(txList);
				if (config.contactType) setContacts(results[2] as Contact[]);
				if (config.allowProduct) {
					setProducts((results[config.contactType ? 3 : 2] as Product[]) ?? []);
				}
			})
			.catch(() => { if (!cancelled) setListError('Gagal memuat transaksi. Periksa koneksi dan coba lagi.'); });
		return () => {
			cancelled = true;
		};
	}, [activeCompany, config, reloadKey]);

	const { run: runDelete, isPending: isDeleting } = usePendingAction();

	if (!activeCompany) {
		return <NoCompany />;
	}

	const handleExport = () => {
		const rows = [TX_EXPORT_HEADERS, ...transactions.map(tx => [
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
		])];
		exportCsv(timestampedFilename(`transaksi-${config.key}`), rows);
	};

	const handleImport = async (rows: string[][]) => {
		const ownerId = pb.authStore.record?.id ?? '';
		let created = 0;
		let skipped = 0;
		for (let idx = 0; idx < rows.length; idx += 1) {
			const row = rows[idx];
			const [
				rawDate, rawPartner, rawProductCode, rawDesc,
				rawDebitCode, rawCreditCode, rawQty, rawPrice,
				rawDiscount, rawTax, rawAmount,
			] = row;
			const date = (rawDate ?? '').trim() || todayIso();
			const debitAcc = accounts.find(a => a.code === (rawDebitCode ?? '').trim());
			const creditAcc = accounts.find(a => a.code === (rawCreditCode ?? '').trim());
			if (!debitAcc || !creditAcc) { skipped += 1; continue; }
			if (debitAcc.id === creditAcc.id) { skipped += 1; continue; }

			let lineTotal = Number(rawAmount) || 0;
			let qty = 0;
			let unitPrice = 0;
			let discount = 0;
			let taxRate = 0;
			let taxAmount = 0;
			let productId = '';
			const partnerName = (rawPartner ?? '').trim();

			if (config.allowProduct) {
				qty = Number(rawQty) || 0;
				unitPrice = Number(rawPrice) || 0;
				discount = Number(rawDiscount) || 0;
				taxRate = Number(rawTax) || 0;
				const productCode = (rawProductCode ?? '').trim();
				const matchedProduct = products.find(p => p.code === productCode);
				if (matchedProduct) productId = matchedProduct.id;
				const subtotal = qty * unitPrice;
				const afterDiscount = Math.max(0, subtotal - discount);
				taxAmount = Math.round((afterDiscount * taxRate) / 100);
				lineTotal = afterDiscount + taxAmount;
			}
			if (lineTotal <= 0) { skipped += 1; continue; }

			let contactId = '';
			if (config.contactType) {
				const matched = contacts.find(c => c.name === partnerName);
				if (matched) contactId = matched.id;
			}

			try {
				const txPayload: Record<string, unknown> = {
					company: activeCompany.id,
					category: config.key,
					date,
					description: (rawDesc ?? '').trim(),
					amount: lineTotal,
					partner: partnerName,
					debit_account: debitAcc.id,
					credit_account: creditAcc.id,
					owner: ownerId,
				};
				if (config.contactType) txPayload.contact = contactId || null;
				if (config.allowProduct) {
					txPayload.product = productId || null;
					txPayload.quantity = qty;
					txPayload.unit_price = unitPrice;
					txPayload.discount = discount;
					txPayload.tax_rate = taxRate;
					txPayload.tax_amount = taxAmount;
				}
				const tx = await pb.collection('transactions').create<Transaction>(txPayload, {
					expand: 'debit_account,credit_account,contact,product',
					requestKey: `import-tx-${config.key}-${idx}`,
				});
				const baseEntry = {
					company: activeCompany.id,
					date,
					description: (rawDesc ?? '').trim() || config.title,
					owner: ownerId,
					transaction: tx.id,
				};
				await pb.collection('entries').create(
					{ ...baseEntry, account: debitAcc.id, debit: lineTotal, credit: 0 },
					{ requestKey: `import-entry-debit-${tx.id}` },
				);
				await pb.collection('entries').create(
					{ ...baseEntry, account: creditAcc.id, debit: 0, credit: lineTotal },
					{ requestKey: `import-entry-credit-${tx.id}` },
				);
				if (config.allowProduct && productId && qty > 0) {
					try {
						const current = products.find(p => p.id === productId)?.stock ?? 0;
						const delta = config.key === 'pembelian' ? qty : -qty;
						const newStock = Math.max(0, current + delta);
						await pb.collection('products').update(productId, { stock: newStock });
						setProducts(previous =>
							previous.map(p => (p.id === productId ? { ...p, stock: newStock } : p)),
						);
					} catch { /* stok gagal — transaksi tetap tersimpan */ }
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
		if (!window.confirm(t('biaya.delete_confirm'))) {
			return;
		}
		void runDelete(tx.id, async () => {
			try {
				await pb.collection('transactions').delete(tx.id, { requestKey: `del-tx-${tx.id}` });
				setTransactions(previous => previous.filter(item => item.id !== tx.id));
				toast.success(t('biaya.deleted'));
			} catch {
				toast.error(t('biaya.delete_failed'));
			}
		});
	};

	const invoiceMeta =
		config.key === 'penjualan'
			? { docTitle: 'Faktur Penjualan', partyLabel: 'Pelanggan', numberPrefix: 'INV' }
			: config.key === 'pembelian'
				? { docTitle: 'Faktur Pembelian', partyLabel: 'Pemasok', numberPrefix: 'PO' }
				: null;

	const handlePrintInvoice = (tx: Transaction) => {
		if (!invoiceMeta) return;
		exportInvoicePdf({
			company: activeCompany,
			transaction: tx,
			docTitle: invoiceMeta.docTitle,
			partyLabel: invoiceMeta.partyLabel,
			numberPrefix: invoiceMeta.numberPrefix,
		});
	};

	const basePath = config.key === 'kas_bank' ? 'kas-bank' : config.key;
	const visibleTx = tab === 'semua' ? transactions : transactions.filter(tx => !tx.payroll_run && expenseKind(tx) === tab);
	const toggleColumn = (key: BiayaColumnKey) => {
		setColumns(prev => {
			const nextOn = !prev[key];
			if (!nextOn && Object.values(prev).filter(Boolean).length <= 1) return prev;
			return { ...prev, [key]: nextOn };
		});
	};

	return (
		<div className="flex flex-col gap-8">
			<header>
				<div className="mt-2 flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">
							{config.title}
						</h1>
						<p className="mt-1 text-sm text-slate-600">{config.subtitle}</p>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<ImportExportBar
							importLabel={`Import ${config.title}`}
							importButtonLabel="Impor"
							importButtonVariant="dropdown"
							exportLabel={`Export ${config.title}`}
							exportTone={config.key === 'biaya' ? 'purple' : 'default'}
							onExport={() => handleExport()}
							onImport={async (_headers, rows) => { await handleImport(rows); }}
						/>
						<Link
							to={`/app/${basePath}/buat`}
							className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
						>
							<Plus className="size-4" /> {config.key === 'biaya' ? t('biaya.create') : `${t('common.create')} ${config.title}`}
						</Link>
					</div>
				</div>
			</header>

			<div className="flex flex-col gap-3">
				<nav
					aria-label="Kategori biaya"
					className="flex w-full overflow-x-auto rounded-full border border-emerald-100 bg-[#eef1f6] shadow-soft-sm"
				>
					<BiayaTabButton active={tab === 'semua'} onClick={() => setTab('semua')} edge="left" icon="all">
						{t('biaya.tab.all')}
					</BiayaTabButton>
					<BiayaTabButton active={tab === 'biaya'} onClick={() => setTab('biaya')} icon="biaya">
						{t('biaya.tab.biaya')}
					</BiayaTabButton>
					<BiayaTabButton active={tab === 'pinjaman'} onClick={() => setTab('pinjaman')} icon="pinjaman">
						{t('biaya.tab.loan')}
					</BiayaTabButton>
					<BiayaTabButton active={tab === 'reimbursement'} onClick={() => setTab('reimbursement')} icon="reimb">
						{t('biaya.tab.reimbursement')}
					</BiayaTabButton>
					{config.key === 'biaya' ? (
						<BiayaTabButton active={tab === 'payroll'} onClick={() => setTab('payroll')} edge="right" icon="payroll">
							{t('biaya.tab.payroll')}
						</BiayaTabButton>
					) : null}
				</nav>

				<div className="flex justify-end">
					<ColumnFilter columns={BIAYA_COLUMNS} visible={columns} onToggle={toggleColumn} />
				</div>
			</div>

			{tab === 'payroll' ? (
				payrollLoading ? <p className="px-5 py-8 text-sm text-muted-foreground">Memuat jurnal payroll…</p> : payrollError ? (
					<div className="px-5 py-8 text-sm text-destructive"><p>{payrollError}</p><button type="button" onClick={() => setReloadKey(k => k + 1)} className="mt-2 font-semibold underline">Coba lagi</button></div>
				) : payrollGroups.length === 0 ? (
					<PayrollJournalTable groups={groupPayrollEntries([])} columns={columns} onViewJournal={lines => { setJournalLines(lines); setJournalOpen(true); }} />
				) : <PayrollJournalList companyId={activeCompany.id} groups={payrollGroups} columns={columns} onRecorded={() => setReloadKey(k => k + 1)} />
			) : (
			<div className="-mt-6">
				{listError ? <p className="px-5 py-8 text-sm text-destructive">{listError} <button type="button" onClick={() => setReloadKey(k => k + 1)} className="font-semibold underline">Coba lagi</button></p> : visibleTx.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">
						{tab === 'pinjaman'
							? t('biaya.empty.loan')
							: tab === 'reimbursement'
								? t('biaya.empty.reimb')
								: t('biaya.empty')}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
							<thead className="sticky top-0 z-20">
								<tr className="text-left text-[13px] font-semibold text-slate-900">
									{columns.date ? <th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">Tanggal</th> : null}
									{columns.partner ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Pemasok</th> : null}
									{columns.description ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Keterangan</th> : null}
									{columns.debit ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Akun Debit</th> : null}
									{columns.credit ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Akun Kredit</th> : null}
									{columns.amount ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Nominal</th> : null}
									{columns.status ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Status</th> : null}
									<th className="w-12 border-b border-slate-200 px-2 py-2.5 text-right" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{visibleTx.map(tx => {
									const partnerName = (tx.expand?.contact?.name ?? tx.partner) || '—';
									const isPayroll = Boolean(tx.payroll_run);
									const loanDetail = tx.expense_detail?.kind === 'loan' ? tx.expense_detail : null;
									const loanBooked = Boolean(loanDetail?.booked);
									const reimbDetail = tx.expense_detail?.kind === 'reimbursement' ? tx.expense_detail : null;
									const reimbBooked = Boolean(reimbDetail?.booked);
									return (
										<tr key={tx.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
											{columns.date ? (
												<td className="px-5 py-2.5 align-middle whitespace-nowrap">{formatDate(tx.date)}</td>
											) : null}
											{columns.partner ? (
												<td className="px-2 py-2.5 align-middle font-semibold">{partnerName}</td>
											) : null}
											{columns.description ? (
												<td className="max-w-[280px] px-2 py-2.5 align-middle text-slate-600">
													<p className="truncate" title={tx.description || ''}>{tx.description || '—'}</p>
													{loanDetail ? (
														<span className="mt-1 flex flex-wrap items-center gap-1.5">
															<span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/80">
																<HandCoins className="size-3" /> Pinjaman Karyawan
															</span>
															{loanDetail.employeeName ? (
																<span className="text-[11px] text-muted-foreground">
																	{loanDetail.employeeName}
																	{loanDetail.installments ? ` · ${loanDetail.installments}x` : ''}
																</span>
															) : null}
														</span>
													) : null}
													{reimbDetail ? (
														<span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200/80">
															<ReceiptText className="size-3" /> Reimbursement
														</span>
													) : null}
												</td>
											) : null}
											{columns.debit ? (
												<td className="px-2 py-2.5 align-middle">
													{tx.expand?.debit_account
														? `${tx.expand.debit_account.code} — ${tx.expand.debit_account.name}`
														: '—'}
												</td>
											) : null}
											{columns.credit ? (
												<td className="px-2 py-2.5 align-middle">
													{tx.expand?.credit_account
														? `${tx.expand.credit_account.code} — ${tx.expand.credit_account.name}`
														: '—'}
												</td>
											) : null}
											{columns.amount ? (
												<td className="px-2 py-2.5 align-middle text-right font-medium whitespace-nowrap tabular-nums">
													{formatRupiah(tx.amount)}
												</td>
											) : null}
											{columns.status ? (
												<td className="px-2 py-2.5 align-middle text-right">
													{isPayroll ? (
														<span className="inline-flex rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">Tercatat · Payroll</span>
													) : loanDetail ? (
														loanBooked ? (
															<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">
																<CheckCircle2 className="size-3" /> Sudah Dibukukan
															</span>
														) : (
															<span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
																Menunggu diproses
															</span>
														)
													) : reimbDetail ? (
														reimbBooked ? (
															<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">
																<CheckCircle2 className="size-3" /> Sudah Dibukukan
															</span>
														) : (
															<span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
																Menunggu diproses
															</span>
														)
													) : (
														<span className="inline-flex rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">
															Tercatat
														</span>
													)}
												</td>
											) : null}
											<td className="px-2 py-2.5 align-middle">
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
														<DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
															{loanDetail && !loanBooked ? (
																<DropdownMenuItem
																	onSelect={() => setProcessingTx(tx)}
																	className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold"
																>
																	<HandCoins className="size-4" /> Proses pinjaman
																</DropdownMenuItem>
															) : null}
															{reimbDetail && !reimbBooked ? (
																<DropdownMenuItem
																	onSelect={() => setProcessingReimbTx(tx)}
																	className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold"
																>
																	<ReceiptText className="size-4" /> Proses reimbursement
																</DropdownMenuItem>
															) : null}
															{isPayroll ? (
																<DropdownMenuItem onSelect={() => setTab('payroll')} className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold"><Calculator className="size-4" /> Lihat Payroll</DropdownMenuItem>
															) : null}
															{!loanDetail && !reimbDetail && !isPayroll ? (
																<DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
																	<Link to={`/app/biaya/ubah/${tx.id}`}>
																		<Pencil className="size-4" /> Ubah
																	</Link>
																</DropdownMenuItem>
															) : null}
															{invoiceMeta && !loanDetail ? (
																<DropdownMenuItem
																	onSelect={() => handlePrintInvoice(tx)}
																	className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold"
																>
																	<Printer className="size-4" /> Cetak PDF
																</DropdownMenuItem>
															) : null}
															<DropdownMenuItem
																disabled={isPayroll}
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
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>
			)}
			{config.key === 'biaya' ? (
				<LoanTransactionProcessDialog
					transaction={processingTx}
					company={activeCompany}
					accounts={accounts}
					onOpenChange={open => { if (!open) setProcessingTx(null); }}
					onDone={() => { setProcessingTx(null); setReloadKey(k => k + 1); }}
				/>
			) : null}
			{config.key === 'biaya' ? (
				<ReimbursementProcessDialog
					transaction={processingReimbTx}
					company={activeCompany}
					accounts={accounts}
					onOpenChange={open => { if (!open) setProcessingReimbTx(null); }}
					onDone={() => { setProcessingReimbTx(null); setReloadKey(k => k + 1); }}
				/>
			) : null}
		<PayrollJournalReportDialog
			open={journalOpen}
			onOpenChange={setJournalOpen}
			lines={journalLines}
		/>
		</div>
	);
}

function BiayaTabButton({
	active,
	onClick,
	edge,
	icon,
	children,
}: {
	active: boolean;
	onClick: () => void;
	edge?: 'left' | 'right';
	icon: 'all' | 'biaya' | 'pinjaman' | 'reimb' | 'payroll';
	children: React.ReactNode;
}) {
	const radius = edge === 'left' ? 'rounded-l-full' : edge === 'right' ? 'rounded-r-full' : '';
	const Icon = icon === 'all' ? Wallet : icon === 'pinjaman' ? HandCoins : icon === 'reimb' ? ReceiptText : icon === 'payroll' ? Calculator : Receipt;
	return (
		<button
			type="button"
			onClick={onClick}
			aria-current={active ? 'page' : undefined}
			className={
				active
					? `inline-flex min-w-max flex-1 items-center justify-center gap-2 whitespace-nowrap ${radius} bg-[#d8f5e4] px-3 py-2.5 text-sm font-semibold text-emerald-800 sm:px-4`
					: `inline-flex min-w-max flex-1 items-center justify-center gap-2 whitespace-nowrap ${radius} px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-[#eadcf8] hover:text-[#6b21a8] sm:px-4`
			}
		>
			<Icon className="size-4 shrink-0" strokeWidth={1.75} />
			{children}
		</button>
	);
}

function PayrollJournalTable({
	groups,
	columns,
	onViewJournal,
}: {
	groups: PayrollJournalGroup[];
	columns: Record<BiayaColumnKey, boolean>;
	onViewJournal: (lines: JournalEntry[]) => void;
}) {
	if (groups.length === 0) {
		return (
			<p className="px-5 py-8 text-sm text-muted-foreground">
				Belum ada jurnal dari Running Payroll untuk perusahaan ini. Jurnal payroll akan muncul di sini setelah periode penggajian diterbitkan di menu Penggajian.
			</p>
		);
	}
	return (
		<div className="overflow-x-auto">
			<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
				<thead className="sticky top-0 z-20">
					<tr className="text-left text-[13px] font-semibold text-slate-900">
						{columns.date ? <th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">Tanggal</th> : null}
						{columns.partner ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Sumber</th> : null}
						{columns.description ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Keterangan</th> : null}
						{columns.debit ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Akun Debit</th> : null}
						{columns.credit ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Akun Kredit</th> : null}
						{columns.amount ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Nominal</th> : null}
						{columns.status ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Status</th> : null}
						<th className="w-12 border-b border-slate-200 px-2 py-2.5 text-right" aria-label="Aksi" />
					</tr>
				</thead>
				<tbody>
					{groups.map(group => {
						const debitLine = group.lines.find(line => Number(line.debit) > 0);
						const creditLines = group.lines.filter(line => Number(line.credit) > 0);
						const debitLabel = debitLine?.expand?.account
							? `${debitLine.expand.account.code} — ${debitLine.expand.account.name}`
							: '—';
						const creditLabel =
							creditLines.length === 0
								? '—'
								: creditLines.length === 1
									? (creditLines[0]?.expand?.account
											? `${creditLines[0].expand.account.code} — ${creditLines[0].expand.account.name}`
											: '—')
									: `Beberapa akun (${creditLines.length})`;
						return (
						<tr key={group.runId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
							{columns.date ? (
								<td className="px-5 py-2.5 align-middle whitespace-nowrap">{formatDate(group.date)}</td>
							) : null}
							{columns.partner ? (
								<td className="px-2 py-2.5 align-middle font-semibold">Running Payroll</td>
							) : null}
							{columns.description ? (
								<td className="max-w-[280px] px-2 py-2.5 align-middle text-slate-600">
									<p className="truncate" title={group.description}>{group.description || '—'}</p>
									<span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
										<Calculator className="size-3" /> Payroll{group.run?.period ? ` · ${group.run.period}` : ''}
									</span>
								</td>
							) : null}
							{columns.debit ? (
								<td className="px-2 py-2.5 align-middle">{debitLabel}</td>
							) : null}
							{columns.credit ? (
								<td className="px-2 py-2.5 align-middle">{creditLabel}</td>
							) : null}
							{columns.amount ? (
								<td className="px-2 py-2.5 align-middle text-right font-medium whitespace-nowrap tabular-nums">
									{formatRupiah(group.total)}
								</td>
							) : null}
							{columns.status ? (
								<td className="px-2 py-2.5 align-middle text-right">
									<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">
										<CheckCircle2 className="size-3" /> Terbit
									</span>
								</td>
							) : null}
							<td className="px-2 py-2.5 align-middle">
								<div className="flex items-center justify-end">
									<button
										type="button"
										onClick={() => onViewJournal(group.lines)}
										className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
									>
										<Wallet className="size-3.5" /> Lihat Jurnal
									</button>
								</div>
							</td>
						</tr>
					);
					})}
				</tbody>
			</table>
		</div>
	);
}

function PayrollJournalReportDialog({
	open,
	onOpenChange,
	lines,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	lines: JournalEntry[];
}) {
	const debitTotal = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
	const creditTotal = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] gap-0 overflow-hidden rounded-md border-slate-200 bg-white p-0 sm:max-w-3xl">
				<DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200 bg-[#f8fafc] px-5 py-3.5 pr-12 text-left">
					<DialogTitle className="text-[15px] font-semibold text-slate-900">
						Laporan Jurnal Running Payroll
					</DialogTitle>
					<DialogDescription className="sr-only">
						Rincian akun debit dan kredit untuk jurnal penggajian ini.
					</DialogDescription>
				</DialogHeader>
				<div className="overflow-auto px-5 py-4">
					<table className="w-full min-w-[520px] text-[13px] text-slate-800">
						<thead>
							<tr className="border-b border-slate-200 text-left">
								<th className="py-2.5 pr-4 font-semibold">Akun</th>
								<th className="w-[28%] py-2.5 text-right font-semibold">Debit</th>
								<th className="w-[28%] py-2.5 pl-4 text-right font-semibold">Kredit</th>
							</tr>
						</thead>
						<tbody>
							{lines.map(line => {
								const account = line.expand?.account;
								const label = account ? `${account.code} - ${account.name}` : 'Akun';
								return (
									<tr key={line.id} className="border-b border-slate-200">
										<td className="py-3.5 pr-4 font-medium text-blue-600">{label}</td>
										<td className="py-3.5 text-right tabular-nums">{formatRupiah(Number(line.debit) || 0)}</td>
										<td className="py-3.5 pl-4 text-right tabular-nums">{formatRupiah(Number(line.credit) || 0)}</td>
									</tr>
								);
							})}
							<tr>
								<td className="py-3.5 pr-4 font-semibold">Total</td>
								<td className="border-b-2 border-double border-slate-900 py-3.5 text-right font-semibold tabular-nums">
									{formatRupiah(debitTotal)}
								</td>
								<td className="border-b-2 border-double border-slate-900 py-3.5 pl-4 text-right font-semibold tabular-nums">
									{formatRupiah(creditTotal)}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</DialogContent>
		</Dialog>
	);
}
