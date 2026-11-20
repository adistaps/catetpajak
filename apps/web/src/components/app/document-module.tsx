import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import {
	Plus,
	Trash2,
	Pencil,
	BadgeCheck,
	Truck,
	Banknote,
	FileText,
	ClipboardList,
	Receipt,
	Zap,
	type LucideIcon,
} from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, formatDate, type Company } from '@/lib/accounting';
import {
	DIRECTION_CONFIG,
	STAGE_CONFIG,
	STAGE_ORDER,
	type BusinessDocument,
	type DocumentDirection,
	type DocumentStage,
} from '@/lib/documents';
import { NoCompany } from '@/components/app/no-company';
import { ImportExportBar } from '@/components/app/import-export-bar';
import { DocumentActions } from '@/components/app/document-actions';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { toast } from 'sonner';
import { InvoicePaymentValidationDialog } from '@/components/app/invoice-payment-validation-dialog';
import { DocumentConversionBar } from '@/components/app/document-conversion-bar';
import {
	ColumnFilter,
	COLUMNS,
	DEFAULT_VISIBLE,
	DELIVERY_COLUMNS,
	DELIVERY_DEFAULT_VISIBLE,
	DeliveryListTable,
	InvoiceListTable,
	PAYMENT_COLUMNS,
	PAYMENT_DEFAULT_VISIBLE,
	PaymentListTable,
	QUOTE_COLUMNS,
	QUOTE_DEFAULT_VISIBLE,
	type ColumnKey,
	type DeliveryColumnKey,
	type PaymentColumnKey,
	type QuoteColumnKey,
} from '@/components/app/invoice-list-table';
import { computePaymentTerms } from '@/lib/payment-terms';
import { fetchCompanyPendingPayments, type CompanyParentPayment } from '@/lib/invoice-payments';
import {
	computeLatePenalty,
	fetchLatePenaltySettings,
	type LatePenaltySettings,
} from '@/lib/late-penalty-settings';
import type { AppOutletContext } from '@/lib/app-context';
import { ensureSalesDeliveryJournal } from '@/lib/delivery-journal';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useLanguage } from '@/hooks/use-language';

interface DocumentModuleProps {
	direction: DocumentDirection;
	activeCompany: Company | null;
}

const STATUS_LABEL: Record<string, string> = {
	draft: 'Draft',
	confirmed: 'Confirmed',
	cancelled: 'Dibatalkan',
	sudah_dikirim: 'Dikirim',
};

const STAGE_LABEL_KEY: Record<DocumentStage, string> = {
	penawaran: 'sales.stage.quotation',
	pemesanan: 'sales.stage.order',
	invoice: 'sales.stage.invoice',
	pengiriman: 'sales.stage.delivery',
	pembayaran: 'sales.stage.payment',
};

const STAGE_ICON: Record<DocumentStage, LucideIcon> = {
	penawaran: FileText,
	pemesanan: ClipboardList,
	invoice: Receipt,
	pengiriman: Truck,
	pembayaran: Banknote,
};

/** Header CSV untuk export/import dokumen (semua tahap). */
const DOCUMENT_CSV_HEADERS = [
	'Nomor',
	'Tanggal',
	'Pelanggan',
	'Keterangan',
	'Status',
	'Items',
	'Subtotal',
	'Diskon',
	'Pajak',
	'Total',
	'Syarat Pembayaran',
	'Akun Debit',
	'Akun Kredit',
	'Nominal Pembayaran',
	'Gudang',
] as const;

export function DocumentModule({ direction, activeCompany }: DocumentModuleProps) {
	const { canAccessMenu } = useOutletContext<AppOutletContext>();
	const { t } = useLanguage();
	const dir = DIRECTION_CONFIG[direction];
	const basePath = direction === 'penjualan' ? 'penjualan' : 'pembelian';
	const [searchParams, setSearchParams] = useSearchParams();
	const paramStage = searchParams.get('stage') as DocumentStage | null;
	const activeStage: DocumentStage =
		paramStage && STAGE_ORDER.includes(paramStage) ? paramStage : 'penawaran';
	const setActiveStage = (stage: DocumentStage) => {
		const next = new URLSearchParams(searchParams);
		next.set('stage', stage);
		setSearchParams(next, { replace: true });
	};
	const [docs, setDocs] = useState<BusinessDocument[]>([]);
	const [reloadKey, setReloadKey] = useState(0);
	const [parentPayments, setParentPayments] = useState<CompanyParentPayment[]>([]);
	const [validatingInvoiceId, setValidatingInvoiceId] = useState<string | null>(null);
	const [penaltySettings, setPenaltySettings] = useState<LatePenaltySettings | null>(null);
	const [invoiceColumns, setInvoiceColumns] = useState<Record<ColumnKey, boolean>>(DEFAULT_VISIBLE);
	const [quoteColumns, setQuoteColumns] = useState<Record<QuoteColumnKey, boolean>>(QUOTE_DEFAULT_VISIBLE);
	const [deliveryColumns, setDeliveryColumns] = useState<Record<DeliveryColumnKey, boolean>>(DELIVERY_DEFAULT_VISIBLE);
	const [paymentColumns, setPaymentColumns] = useState<Record<PaymentColumnKey, boolean>>(PAYMENT_DEFAULT_VISIBLE);

	const toggleInvoiceColumn = (key: ColumnKey) => {
		setInvoiceColumns(prev => {
			const nextOn = !prev[key];
			if (!nextOn && Object.values(prev).filter(Boolean).length <= 1) return prev;
			return { ...prev, [key]: nextOn };
		});
	};

	const toggleQuoteColumn = (key: QuoteColumnKey) => {
		setQuoteColumns(prev => {
			const nextOn = !prev[key];
			if (!nextOn && Object.values(prev).filter(Boolean).length <= 1) return prev;
			return { ...prev, [key]: nextOn };
		});
	};

	const toggleDeliveryColumn = (key: DeliveryColumnKey) => {
		setDeliveryColumns(prev => {
			const nextOn = !prev[key];
			if (!nextOn && Object.values(prev).filter(Boolean).length <= 1) return prev;
			return { ...prev, [key]: nextOn };
		});
	};

	const togglePaymentColumn = (key: PaymentColumnKey) => {
		setPaymentColumns(prev => {
			const nextOn = !prev[key];
			if (!nextOn && Object.values(prev).filter(Boolean).length <= 1) return prev;
			return { ...prev, [key]: nextOn };
		});
	};

	const isInvoiceStage = direction === 'penjualan' && activeStage === 'invoice';
	const isDeliveryStage = direction === 'penjualan' && activeStage === 'pengiriman';
	const isPaymentStage = direction === 'penjualan' && activeStage === 'pembayaran';
	const isQuoteOrOrderStage = activeStage === 'penawaran' || activeStage === 'pemesanan';
	const isPurchaseList = direction === 'pembelian';
	const usesFlatTable = isInvoiceStage || isDeliveryStage || isPaymentStage || isQuoteOrOrderStage || isPurchaseList;
	const usesQuoteColumns = isQuoteOrOrderStage || isPurchaseList;
	const canApprovePayment = isInvoiceStage && (canAccessMenu('penjualan') || canAccessMenu('kas_bank'));

	useEffect(() => {
		if (!activeCompany) {
			setDocs([]);
			return;
		}
		let cancelled = false;
		const filter = pb.filter(
			'company = {:company} && direction = {:dir} && stage = {:stage}',
			{ company: activeCompany.id, dir: direction, stage: activeStage },
		);
		pb.collection('documents')
			.getFullList<BusinessDocument>({
				filter,
				sort: '-date,-created',
				expand: 'contact,source_document,debit_account,credit_account,warehouse',
				requestKey: null,
			})
			.then(list => {
				if (!cancelled) setDocs(list);
				if (cancelled || direction !== 'penjualan' || activeStage !== 'pengiriman') return;
				const ownerId = pb.authStore.record?.id || activeCompany.owner;
				void (async () => {
					for (const doc of list) {
						if (cancelled || (Number(doc.total) || 0) <= 0) continue;
						await ensureSalesDeliveryJournal({
							companyId: activeCompany.id,
							ownerId,
							docId: doc.id,
							date: doc.date,
							description: doc.description || `Pengiriman ${doc.number || ''}`.trim(),
							number: doc.number || '',
							amount: Number(doc.total) || 0,
							sourceDocumentId: doc.source_document || undefined,
						}).catch(() => false);
					}
				})();
			})
			.catch(() => {
				if (!cancelled) setDocs([]);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, direction, activeStage, reloadKey]);

	useEffect(() => {
		if (!isInvoiceStage || !activeCompany) {
			setParentPayments([]);
			setPenaltySettings(null);
			return;
		}
		let cancelled = false;
		fetchCompanyPendingPayments(activeCompany.id)
			.then(list => {
				if (!cancelled) setParentPayments(list);
			})
			.catch(() => {
				if (!cancelled) setParentPayments([]);
			});
		fetchLatePenaltySettings(activeCompany.id)
			.then(settings => {
				if (!cancelled) setPenaltySettings(settings);
			})
			.catch(() => {
				if (!cancelled) setPenaltySettings(null);
			});
		return () => {
			cancelled = true;
		};
	}, [isInvoiceStage, activeCompany, reloadKey]);

	const paymentsByInvoice = useMemo(() => {
		const map = new Map<string, CompanyParentPayment[]>();
		for (const payment of parentPayments) {
			const invId = payment.invoice.id;
			if (!invId) continue;
			const arr = map.get(invId) ?? [];
			arr.push(payment);
			map.set(invId, arr);
		}
		return map;
	}, [parentPayments]);

	const hasPendingPayment = (docId: string) => {
		const arr = paymentsByInvoice.get(docId);
		return Boolean(arr && arr.some(p => p.status === 'menunggu_verifikasi'));
	};

	const validatingDoc = validatingInvoiceId
		? docs.find(d => d.id === validatingInvoiceId) ?? null
		: null;

	const { run: runDelete } = usePendingAction();

	if (!activeCompany) {
		return <NoCompany />;
	}

	const handleDelete = (doc: BusinessDocument) => {
		if (!window.confirm(t('sales.delete_confirm'))) return;
		void runDelete(doc.id, async () => {
			try {
				await pb.collection('documents').delete(doc.id, { requestKey: `del-doc-${doc.id}` });
				setDocs(prev => prev.filter(d => d.id !== doc.id));
				setReloadKey(k => k + 1);
				toast.success(t('sales.deleted'));
			} catch {
				toast.error(t('sales.delete_failed'));
			}
		});
	};

	const total = docs.reduce((sum, doc) => sum + (doc.total || 0), 0);
	const stageCfg = STAGE_CONFIG[activeStage];

	const handleExport = () => {
		const rows = docs.map(doc => [
			doc.number || '',
			doc.date || '',
			doc.expand?.contact?.name || doc.partner || '',
			doc.description || '',
			doc.status || '',
			JSON.stringify(doc.items ?? []),
			String(doc.subtotal ?? 0),
			String(doc.discount_total ?? 0),
			String(doc.tax_total ?? 0),
			String(doc.total ?? 0),
			doc.payment_terms || '',
			doc.expand?.debit_account?.code || '',
			doc.expand?.credit_account?.code || '',
			String(doc.paid_amount ?? 0),
			doc.expand?.warehouse?.name || '',
		]);
		exportCsv(timestampedFilename(`${direction}-${activeStage}`), [
			[...DOCUMENT_CSV_HEADERS],
			...rows,
		]);
	};

	const handleImport = async (headers: string[], rows: string[][]) => {
		const token = pb.authStore.token;
		const res = await fetch('/api/documents-import', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			body: JSON.stringify({
				companyId: activeCompany.id,
				direction,
				stage: activeStage,
				headers,
				rows,
			}),
		});
		const data = (await res.json().catch(() => ({}))) as {
			ok?: boolean;
			created?: number;
			skipped?: number;
			errors?: string[];
			error?: string;
		};
		if (!res.ok || !data.ok) {
			throw new Error(data.error || `Gagal mengimpor dokumen (${res.status}).`);
		}
		setReloadKey(k => k + 1);
		const created = data.created ?? 0;
		const skipped = data.skipped ?? 0;
		const errs = data.errors ?? [];
		if (created > 0) {
			toast.success(`Berhasil mengimpor ${created} dokumen${skipped ? ` · ${skipped} dilewati` : ''}`);
		} else {
			toast.info(`Tidak ada dokumen baru yang diimpor${skipped ? ` · ${skipped} dilewati` : ''}`);
		}
		if (errs.length > 0) {
			toast.error(errs.slice(0, 3).join('\n'));
		}
	};

	return (
		<div className="flex flex-col gap-8">
			<header>
				<div className="mt-2 flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{direction === 'penjualan' ? t('sales.title') : t('purchases.title')}</h1>
						<p className="mt-1 text-sm text-muted-foreground">{direction === 'penjualan' ? t('sales.subtitle') : t('purchases.subtitle')}</p>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<ImportExportBar
							importLabel={`${t('sales.import')} ${t(STAGE_LABEL_KEY[activeStage])}`}
							importButtonLabel={t('sales.import')}
							importButtonVariant="dropdown"
							exportLabel={`${t('sales.export')} ${t(STAGE_LABEL_KEY[activeStage])}`}
							onExport={handleExport}
							onImport={handleImport}
						/>
						<Link
							to={`/app/${basePath}/dokumen/buat/${activeStage}`}
							className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
						>
							<Plus className="size-4" /> {t('sales.create')} {t(STAGE_LABEL_KEY[activeStage])}
						</Link>
					</div>
				</div>
			</header>

			<div className="flex flex-col gap-3">
			<nav
				aria-label="Tahap dokumen"
				className="flex w-full overflow-x-auto rounded-full border border-emerald-100 bg-[#eef1f6] shadow-soft-sm"
			>
				{STAGE_ORDER.map((stage, index) => {
					const cfg = STAGE_CONFIG[stage];
					const active = stage === activeStage;
					const Icon = STAGE_ICON[stage];
					const edge =
						index === 0 ? 'rounded-l-full' : '';
					return (
						<button
							key={stage}
							type="button"
							onClick={() => setActiveStage(stage)}
							aria-current={active ? 'page' : undefined}
							className={
								active
									? `inline-flex min-w-max flex-1 items-center justify-center gap-2 whitespace-nowrap ${edge} bg-[#d8f5e4] px-3 py-2.5 text-sm font-semibold text-emerald-800 sm:px-4`
									: `inline-flex min-w-max flex-1 items-center justify-center gap-2 whitespace-nowrap ${edge} px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-[#eadcf8] hover:text-[#6b21a8] sm:px-4`
							}
						>
							<Icon className="size-4 shrink-0" strokeWidth={1.75} />
							{cfg.label}
						</button>
					);
				})}
				<Link
					to={`/app/${basePath}/buat`}
					className="inline-flex min-w-max flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-r-full px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-[#eadcf8] hover:text-[#6b21a8] sm:px-4"
				>
					<Zap className="size-4 shrink-0" strokeWidth={1.75} />
					Transaksi Langsung
				</Link>
			</nav>

			<div className="flex items-center gap-3">
					<div className="min-w-0 flex-1">
						<DocumentConversionBar
							companyId={activeCompany.id}
							direction={direction}
							activeStage={activeStage}
							reloadKey={reloadKey}
						/>
					</div>
					{isInvoiceStage ? (
						<ColumnFilter columns={COLUMNS} visible={invoiceColumns} onToggle={toggleInvoiceColumn} />
					) : isDeliveryStage ? (
						<ColumnFilter columns={DELIVERY_COLUMNS} visible={deliveryColumns} onToggle={toggleDeliveryColumn} />
					) : isPaymentStage ? (
						<ColumnFilter
						columns={PAYMENT_COLUMNS.map(column =>
							column.key === 'customer' ? { ...column, label: dir.partyLabel } : column,
						)}
						visible={paymentColumns}
						onToggle={togglePaymentColumn}
					/>
					) : usesQuoteColumns ? (
						<ColumnFilter
							columns={QUOTE_COLUMNS.map(column =>
								column.key === 'customer' ? { ...column, label: dir.partyLabel } : column,
							)}
							visible={quoteColumns}
							onToggle={toggleQuoteColumn}
						/>
					) : null}
				</div>
			</div>

			<div className={usesFlatTable ? '-mt-6' : ''}>
			<section>
				{usesFlatTable ? null : (
					<div className={`flex items-center justify-between px-5 ${direction === 'penjualan' ? 'border-b border-slate-200/90 py-4' : 'border-b border-border py-3'}`}>
						<h2 className="text-[15px] font-semibold text-foreground">{t('sales.list_of')} {t(STAGE_LABEL_KEY[activeStage])}</h2>
						<p className="text-sm font-semibold text-emerald-600">
							{t('sales.total')}: {formatRupiah(total)}
						</p>
					</div>
				)}
				{docs.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">
						{t('sales.no_documents', { stage: t(STAGE_LABEL_KEY[activeStage]).toLowerCase() })}
					</p>
				) : isDeliveryStage ? (
					<DeliveryListTable
						docs={docs}
						company={activeCompany}
						direction={direction}
						basePath={basePath}
						onDelete={handleDelete}
						visible={deliveryColumns}
					/>
				) : isPaymentStage ? (
					<PaymentListTable
						docs={docs}
						company={activeCompany}
						direction={direction}
						basePath={basePath}
						onDelete={handleDelete}
						visible={paymentColumns}
					/>
				) : direction === 'penjualan' && isInvoiceStage ? (
					<InvoiceListTable
						docs={docs}
						company={activeCompany}
						direction={direction}
						basePath={basePath}
						penaltySettings={penaltySettings}
						hasPendingPayment={hasPendingPayment}
						onValidate={setValidatingInvoiceId}
						onDelete={handleDelete}
						visible={invoiceColumns}
					/>
				) : usesQuoteColumns ? (
					<div className="overflow-x-auto">
						<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
							<thead className="sticky top-0 z-20">
								<tr className="text-left text-[13px] font-semibold text-slate-900">
									{quoteColumns.number ? <th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">Nomor</th> : null}
									{quoteColumns.date ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Tanggal</th> : null}
									{quoteColumns.customer ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{dir.partyLabel}</th> : null}
									{quoteColumns.description ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Keterangan</th> : null}
									{quoteColumns.amount ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Nominal</th> : null}
									{quoteColumns.status ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Status</th> : null}
									<th className="w-12 border-b border-slate-200 px-2 py-2.5 text-right" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{docs.map(doc => {
									const partnerName = doc.expand?.contact?.name || doc.partner || '—';
									const statusTone =
										doc.status === 'cancelled'
											? 'bg-rose-100 text-rose-700'
											: doc.status === 'draft'
												? 'bg-slate-200 text-slate-700'
												: 'bg-emerald-500 text-white';
									return (
										<tr key={doc.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
											{quoteColumns.number ? (
											<td className="px-5 py-2 align-middle font-medium whitespace-nowrap">
												{direction === 'pembelian' ? (
													<Link to={`/app/pembelian/dokumen/lihat/${doc.id}`} className="text-[#8b5cf6] hover:underline">
														{doc.number || '—'}
													</Link>
												) : (
													doc.number || '—'
												)}
											</td>
										) : null}
											{quoteColumns.date ? <td className="px-2 py-2 align-middle whitespace-nowrap">{formatDate(doc.date)}</td> : null}
											{quoteColumns.customer ? (
												<td className="max-w-[180px] truncate px-2 py-2 align-middle" title={partnerName}>
													{partnerName}
												</td>
											) : null}
											{quoteColumns.description ? (
												<td className="max-w-[220px] truncate px-2 py-2 align-middle text-slate-600" title={doc.description || ''}>
													{doc.description || '—'}
												</td>
											) : null}
											{quoteColumns.amount ? (
												<td className="px-2 py-2 align-middle text-right font-medium whitespace-nowrap tabular-nums">
													{formatRupiah(doc.stage === 'pembayaran' ? doc.paid_amount || 0 : doc.total)}
												</td>
											) : null}
											{quoteColumns.status ? (
												<td className="px-2 py-2 align-middle text-right">
													<span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>
														{STATUS_LABEL[doc.status] ?? doc.status}
													</span>
												</td>
											) : null}
											<td className="px-2 py-2 align-middle">
												<div className="flex items-center justify-end">
													<DocumentActions
														doc={doc}
														company={activeCompany}
														direction={direction}
														variant="menu"
														menuBefore={stageCfg.next.map(nextStage => {
															const label = STAGE_CONFIG[nextStage].label;
															const ActionIcon = nextStage === 'pengiriman' ? Truck : Banknote;
															return (
																<DropdownMenuItem key={nextStage} asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
																	<Link to={`/app/${basePath}/dokumen/buat/${nextStage}/konversi/${doc.id}`}>
																		<ActionIcon className="size-4 text-primary" /> Buat {label}
																	</Link>
																</DropdownMenuItem>
															);
														})}
														menuAfter={
															<>
																<DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
																	<Link to={`/app/${basePath}/dokumen/buat/${doc.stage}/ubah/${doc.id}`}>
																		<Pencil className="size-4 text-primary" /> Ubah dokumen
																	</Link>
																</DropdownMenuItem>
																<DropdownMenuItem
																	onSelect={() => handleDelete(doc)}
																	className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold text-destructive focus:text-destructive"
																>
																	<Trash2 className="size-4" /> Hapus
																</DropdownMenuItem>
															</>
														}
													/>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : direction === 'penjualan' ? (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[1000px] text-sm">
							<thead>
								<tr className="border-b border-slate-200/90 text-left text-[13px] font-bold uppercase tracking-wide text-foreground">
									<th className="w-[16%] px-5 py-2.5">Nomor</th>
									<th className="w-[14%] px-5 py-2.5">Tanggal</th>
									<th className="w-[15%] px-5 py-2.5">{dir.partyLabel}</th>
									<th className="w-[15%] px-5 py-2.5">Keterangan</th>
									<th className="w-[16%] px-5 py-2.5">Status</th>
									<th className="w-[17%] px-5 py-2.5 text-right">Nominal</th>
									<th className="w-[7%] px-5 py-2.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{docs.map(doc => {
									const partnerName = doc.expand?.contact?.name || doc.partner || '—';
									return (
										<tr key={doc.id} className="border-b border-slate-200/90 last:border-0">
											<td className="px-5 py-0.5 align-middle font-semibold whitespace-nowrap leading-tight">
												{doc.number || '—'}
												{isInvoiceStage && doc.payment_terms ? <PaymentTermsBadge doc={doc} /> : null}
												{isInvoiceStage ? <LatePenaltyBadge doc={doc} settings={penaltySettings} /> : null}
											</td>
											<td className="px-5 py-0.5 align-middle whitespace-nowrap leading-tight">{formatDate(doc.date)}</td>
											<td className="px-5 py-0.5 align-middle font-semibold leading-tight">{partnerName}</td>
											<td className="px-5 py-0.5 align-middle leading-tight text-muted-foreground">{doc.description || '—'}</td>
											<td className="px-5 py-0.5 align-middle">
												<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
													{STATUS_LABEL[doc.status] ?? doc.status}
												</span>
											</td>
											<td className="px-5 py-0.5 align-middle text-right font-semibold whitespace-nowrap leading-tight">
												{formatRupiah(doc.stage === 'pembayaran' ? doc.paid_amount || 0 : doc.total)}
											</td>
											<td className="px-5 py-0.5 align-middle">
												<div className="flex items-center justify-end gap-2">
													{isInvoiceStage && hasPendingPayment(doc.id) ? (
														<button
															type="button"
															onClick={() => setValidatingInvoiceId(doc.id)}
															className="text-xs font-semibold text-amber-600 transition-colors hover:text-amber-700"
														>
															Validasi
														</button>
													) : null}
													<DocumentActions
														doc={doc}
														company={activeCompany}
														direction={direction}
														variant="menu"
														menuBefore={stageCfg.next.map(nextStage => {
															const label = STAGE_CONFIG[nextStage].label;
															const ActionIcon = nextStage === 'pengiriman' ? Truck : Banknote;
															return (
																<DropdownMenuItem key={nextStage} asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
																	<Link to={`/app/${basePath}/dokumen/buat/${nextStage}/konversi/${doc.id}`}>
																		<ActionIcon className="size-4 text-primary" /> Buat {label}
																	</Link>
																</DropdownMenuItem>
															);
														})}
														menuAfter={
															<>
																<DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
																	<Link to={`/app/${basePath}/dokumen/buat/${doc.stage}/ubah/${doc.id}`}>
																		<Pencil className="size-4 text-primary" /> Ubah dokumen
																	</Link>
																</DropdownMenuItem>
																<DropdownMenuItem
																	onSelect={() => handleDelete(doc)}
																	className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold text-destructive focus:text-destructive"
																>
																	<Trash2 className="size-4" /> Hapus
																</DropdownMenuItem>
															</>
														}
													/>
													</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[820px] text-sm">
							<thead>
								<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide">
									<th className="px-5 py-2.5">Nomor</th>
									<th className="px-5 py-2.5">Tanggal</th>
									<th className="px-5 py-2.5">{dir.partyLabel}</th>
									<th className="px-5 py-2.5">Keterangan</th>
									<th className="px-5 py-2.5">Status</th>
									<th className="px-5 py-2.5 text-right">Nominal</th>
									<th className="px-5 py-2.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{docs.map(doc => {
									const partnerName = doc.expand?.contact?.name || doc.partner || '—';
									return (
										<tr key={doc.id} className="border-b border-foreground/15 last:border-0">
											<td className="px-5 py-2.5 font-semibold whitespace-nowrap">
											{doc.number || '—'}
											{isInvoiceStage && doc.payment_terms ? (
												<PaymentTermsBadge doc={doc} />
											) : null}
											{isInvoiceStage ? (
												<LatePenaltyBadge doc={doc} settings={penaltySettings} />
											) : null}
										</td>
											<td className="px-5 py-2.5 whitespace-nowrap">{formatDate(doc.date)}</td>
											<td className="px-5 py-2.5 font-semibold">{partnerName}</td>
											<td className="px-5 py-2.5 text-muted-foreground">{doc.description || '—'}</td>
											<td className="px-5 py-2.5">
												<span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase">
													{STATUS_LABEL[doc.status] ?? doc.status}
												</span>
											</td>
											<td className="px-5 py-2.5 text-right font-semibold whitespace-nowrap">
												{formatRupiah(doc.stage === 'pembayaran' ? doc.paid_amount || 0 : doc.total)}
											</td>
											<td className="px-5 py-2.5">
												<div className="flex flex-wrap items-center justify-end gap-1">
												{isInvoiceStage && hasPendingPayment(doc.id) ? (
													<button
														type="button"
														onClick={() => setValidatingInvoiceId(doc.id)}
														className="inline-flex min-h-9 items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-amber-600"
													>
														<BadgeCheck className="size-3" /> Validasi
													</button>
												) : null}
												<DocumentActions
													doc={doc}
													company={activeCompany}
													direction={direction}
													variant="menu"
													menuBefore={stageCfg.next.map(nextStage => {
														const label = STAGE_CONFIG[nextStage].label;
														const ActionIcon = nextStage === 'pengiriman' ? Truck : Banknote;
														return (
															<DropdownMenuItem key={nextStage} asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
																<Link to={`/app/${basePath}/dokumen/buat/${nextStage}/konversi/${doc.id}`}>
																	<ActionIcon className="size-4 text-primary" /> Buat {label}
																</Link>
															</DropdownMenuItem>
														);
													})}
													menuAfter={
														<>
															<DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
																<Link to={`/app/${basePath}/dokumen/buat/${doc.stage}/ubah/${doc.id}`}>
																	<Pencil className="size-4 text-primary" /> Ubah dokumen
																</Link>
															</DropdownMenuItem>
															<DropdownMenuItem
																onSelect={() => handleDelete(doc)}
																className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold text-destructive focus:text-destructive"
															>
																<Trash2 className="size-4" /> Hapus
															</DropdownMenuItem>
														</>
													}
												/>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>
			</div>

		<InvoicePaymentValidationDialog
			open={validatingDoc !== null}
			onOpenChange={next => {
				if (!next) setValidatingInvoiceId(null);
			}}
			invoice={
				validatingDoc
					? {
							id: validatingDoc.id,
							number: validatingDoc.number,
							total: validatingDoc.total,
							paid_amount: validatingDoc.paid_amount,
							partner: validatingDoc.expand?.contact?.name || validatingDoc.partner,
							date: validatingDoc.date,
							payment_terms: validatingDoc.payment_terms,
						}
					: null
			}
			penaltySettings={penaltySettings}
			companyBank={activeCompany}
			payments={validatingDoc ? paymentsByInvoice.get(validatingDoc.id) ?? [] : []}
			canApprove={canApprovePayment}
			onPaymentApplied={() => setReloadKey(k => k + 1)}
		/>

		</div>
	);
}

function PaymentTermsBadge({ doc }: { doc: BusinessDocument }) {
	const calc = computePaymentTerms(doc.payment_terms, doc.date, doc.total);
	if (!calc) {
		return (
			<span className="mt-1 block text-[10px] font-semibold text-muted-foreground">
				{doc.payment_terms}
			</span>
		);
	}
	return (
		<span className="mt-1 flex flex-col gap-0.5 text-[10px] font-semibold">
			<span className="text-primary">{doc.payment_terms}</span>
			<span className={calc.discountActive ? 'text-emerald-600' : 'text-muted-foreground'}>
				Diskon {calc.parsed.discountRate}% · batas {formatDate(calc.discountDeadline)}
			</span>
			<span className="text-muted-foreground">Tempo {formatDate(calc.dueDate)}</span>
		</span>
	);
}

function LatePenaltyBadge({
	doc,
	settings,
}: {
	doc: BusinessDocument;
	settings: LatePenaltySettings | null;
}) {
	const calc = computeLatePenalty(settings, {
		total: doc.total,
		payment_terms: doc.payment_terms,
		date: doc.date,
		paid_amount: doc.paid_amount,
	});
	if (!calc || calc.penalty <= 0) return null;
	const tierLabel = calc.appliedTier
		? calc.appliedTier.method === 'percentage'
			? `${calc.appliedTier.value}%`
			: formatRupiah(calc.appliedTier.value)
		: '';
	return (
		<span className="mt-1 flex flex-col gap-0.5 text-[10px] font-semibold">
			<span className="text-amber-600">
				Terlambat {calc.daysOverdue} hari{tierLabel ? ` · denda ${tierLabel}` : ''}
			</span>
			<span className="text-amber-600">Denda: {formatRupiah(calc.penalty)}</span>
			<span className="text-primary">Total + denda: {formatRupiah(calc.totalWithPenalty)}</span>
		</span>
	);
}
