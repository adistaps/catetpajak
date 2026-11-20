import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Banknote, Check, Pencil, SlidersHorizontal, Trash2, Truck } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DocumentActions } from '@/components/app/document-actions';
import { formatDate, formatRupiah, todayIso, type Company } from '@/lib/accounting';
import {
	STAGE_CONFIG,
	type BusinessDocument,
	type DocumentDirection,
} from '@/lib/documents';
import { computePaymentTerms, daysBetweenIso } from '@/lib/payment-terms';
import {
	computeLatePenalty,
	type LatePenaltySettings,
} from '@/lib/late-penalty-settings';
import { useLanguage } from '@/hooks/use-language';

interface InvoiceListTableProps {
	docs: BusinessDocument[];
	company: Company;
	direction: DocumentDirection;
	basePath: string;
	penaltySettings: LatePenaltySettings | null;
	hasPendingPayment: (docId: string) => boolean;
	onValidate: (docId: string) => void;
	onDelete: (doc: BusinessDocument) => void;
	visible: Record<ColumnKey, boolean>;
}

type PayVisual = 'lunas' | 'sebagian' | 'belum' | 'draft' | 'batal' | 'dikirim';

export type ColumnKey =
	| 'number'
	| 'customer'
	| 'invoiceDate'
	| 'bookDate'
	| 'dueDate'
	| 'payment'
	| 'source'
	| 'team'
	| 'taxExcluded'
	| 'total'
	| 'status';

export const COLUMNS: { key: ColumnKey; label: string; align?: 'right' }[] = [
	{ key: 'number', label: 'Nomor' },
	{ key: 'customer', label: 'Pelanggan' },
	{ key: 'invoiceDate', label: 'Tgl Invoice' },
	{ key: 'bookDate', label: 'Tgl Buku' },
	{ key: 'dueDate', label: 'Jatuh Tempo' },
	{ key: 'payment', label: 'Pembayaran' },
	{ key: 'source', label: 'Dok. Sumber' },
	{ key: 'team', label: 'Tim' },
	{ key: 'taxExcluded', label: 'Sebelum Pajak', align: 'right' },
	{ key: 'total', label: 'Total', align: 'right' },
	{ key: 'status', label: 'Status', align: 'right' },
];

export const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
	number: true,
	customer: true,
	invoiceDate: true,
	bookDate: true,
	dueDate: true,
	payment: true,
	source: true,
	team: true,
	taxExcluded: true,
	total: true,
	status: true,
};

export type QuoteColumnKey =
	| 'number'
	| 'date'
	| 'customer'
	| 'description'
	| 'amount'
	| 'status';

export const QUOTE_COLUMNS: { key: QuoteColumnKey; label: string; align?: 'right' }[] = [
	{ key: 'number', label: 'Nomor' },
	{ key: 'date', label: 'Tanggal' },
	{ key: 'customer', label: 'Pelanggan' },
	{ key: 'description', label: 'Keterangan' },
	{ key: 'amount', label: 'Nominal', align: 'right' },
	{ key: 'status', label: 'Status', align: 'right' },
];

export const QUOTE_DEFAULT_VISIBLE: Record<QuoteColumnKey, boolean> = {
	number: true,
	date: true,
	customer: true,
	description: true,
	amount: true,
	status: true,
};

export type DeliveryColumnKey =
	| 'number'
	| 'customer'
	| 'date'
	| 'warehouse'
	| 'source'
	| 'description'
	| 'shipping'
	| 'status';

export const DELIVERY_COLUMNS: { key: DeliveryColumnKey; label: string; align?: 'right' }[] = [
	{ key: 'number', label: 'Nomor' },
	{ key: 'customer', label: 'Pelanggan' },
	{ key: 'date', label: 'Tgl Pengiriman' },
	{ key: 'warehouse', label: 'Gudang' },
	{ key: 'source', label: 'Dok. Sumber' },
	{ key: 'description', label: 'Keterangan' },
	{ key: 'shipping', label: 'Ongkos Kirim', align: 'right' },
	{ key: 'status', label: 'Status', align: 'right' },
];

export const DELIVERY_DEFAULT_VISIBLE: Record<DeliveryColumnKey, boolean> = {
	number: true,
	customer: true,
	date: true,
	warehouse: true,
	source: true,
	description: true,
	shipping: true,
	status: true,
};

export type PaymentColumnKey =
	| 'number'
	| 'date'
	| 'customer'
	| 'description'
	| 'status'
	| 'amount';

export const PAYMENT_COLUMNS: { key: PaymentColumnKey; label: string; align?: 'right' }[] = [
	{ key: 'number', label: 'Nomor' },
	{ key: 'date', label: 'Tanggal' },
	{ key: 'customer', label: 'Pelanggan' },
	{ key: 'description', label: 'Keterangan' },
	{ key: 'status', label: 'Status' },
	{ key: 'amount', label: 'Nominal', align: 'right' },
];

export const PAYMENT_DEFAULT_VISIBLE: Record<PaymentColumnKey, boolean> = {
	number: true,
	date: true,
	customer: true,
	description: true,
	status: true,
	amount: true,
};

const DELIVERY_STATUS: Record<string, { label: string; className: string }> = {
	confirmed: { label: 'Terkirim', className: 'bg-emerald-500 text-white' },
	draft: { label: 'Draft', className: 'bg-slate-200 text-slate-700' },
	cancelled: { label: 'Dibatalkan', className: 'bg-rose-100 text-rose-700' },
};

function payVisual(doc: BusinessDocument): PayVisual {
	if (doc.status === 'cancelled') return 'batal';
	if (doc.status === 'draft') return 'draft';
	const total = Number(doc.total) || 0;
	const paid = Number(doc.paid_amount) || 0;
	if (total > 0 && paid >= total) return 'lunas';
	if (paid > 0) return 'sebagian';
	if (doc.status === 'sudah_dikirim') return 'dikirim';
	return 'belum';
}

const PAY_STYLE: Record<PayVisual, { label: string; key: string; className: string }> = {
	lunas: { label: 'Lunas', key: 'sales.pay.lunas', className: 'bg-emerald-500 text-white' },
	sebagian: { label: 'Sebagian', key: 'sales.pay.sebagian', className: 'bg-amber-500 text-white' },
	belum: { label: 'Belum Bayar', key: 'sales.pay.belum', className: 'bg-slate-200 text-slate-700' },
	draft: { label: 'Draft', key: 'sales.pay.draft', className: 'bg-slate-100 text-slate-600' },
	batal: { label: 'Dibatalkan', key: 'sales.pay.batal', className: 'bg-rose-100 text-rose-700' },
	dikirim: { label: 'Dikirim', key: 'sales.pay.dikirim', className: 'bg-indigo-100 text-indigo-700' },
};

function duePresentation(doc: BusinessDocument): { text: string; overdue: boolean } {
	const calc = computePaymentTerms(doc.payment_terms, doc.date, doc.total);
	if (!calc) return { text: '—', overdue: false };
	const today = todayIso();
	const delta = daysBetweenIso(today, calc.dueDate);
	if (delta < 0) {
		const late = Math.abs(delta);
		return {
			text: late > 60 ? formatDate(calc.dueDate) : `${late} hari lalu`,
			overdue: true,
		};
	}
	if (delta === 0) return { text: 'Hari ini', overdue: false };
	return { text: `Dalam ${delta} hari`, overdue: false };
}

export function ColumnFilter<K extends string>({
	columns,
	visible,
	onToggle,
}: {
	columns: { key: K; label: string }[];
	visible: Record<K, boolean>;
	onToggle: (key: K) => void;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="relative">
			<button
				type="button"
				aria-label="Filter kolom"
				aria-expanded={open}
				aria-haspopup="dialog"
				onClick={() => setOpen(prev => !prev)}
				className="inline-flex size-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
			>
				<SlidersHorizontal className="size-4" strokeWidth={2} />
			</button>
			{open ? (
				<div
					role="dialog"
					aria-label="Tampilkan kolom"
					className="absolute right-0 top-[calc(100%+6px)] z-30 w-[220px] rounded-md border border-slate-200 bg-white py-2 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
				>
					<ul className="max-h-[min(70vh,420px)] overflow-y-auto">
						{columns.map(column => {
							const checked = visible[column.key];
							return (
								<li key={column.key}>
									<button
										type="button"
										role="checkbox"
										aria-checked={checked}
										onClick={() => onToggle(column.key)}
										className="flex w-full items-center gap-3 px-3.5 py-1.5 text-left text-[13.5px] font-medium text-slate-700 hover:bg-slate-50"
									>
										<span
											className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border ${
												checked
													? 'border-[#0f766e] bg-[#0f766e] text-white'
													: 'border-slate-300 bg-white'
											}`}
										>
											{checked ? <Check className="size-3" strokeWidth={3} /> : null}
										</span>
										{column.label}
									</button>
								</li>
							);
						})}
					</ul>
				</div>
			) : null}
		</div>
	);
}

export function InvoiceListTable({
	docs,
	company,
	direction,
	basePath,
	penaltySettings,
	hasPendingPayment,
	onValidate,
	onDelete,
	visible,
}: InvoiceListTableProps) {
	const { t } = useLanguage();
	const stageCfg = STAGE_CONFIG.invoice;

	const show = (key: ColumnKey) => visible[key];

	return (
		<div className="overflow-x-auto">
			<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
				<thead className="sticky top-0 z-20">
					<tr className="text-left text-[13px] font-semibold text-slate-900">
						{show('number') ? <th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">{t('sales.col.number')}</th> : null}
						{show('customer') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('sales.col.customer')}</th> : null}
						{show('invoiceDate') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('sales.col.invoice_date')}</th> : null}
						{show('bookDate') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('sales.col.book_date')}</th> : null}
						{show('dueDate') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('sales.col.due_date')}</th> : null}
						{show('payment') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('sales.col.payment')}</th> : null}
						{show('source') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('sales.col.source')}</th> : null}
						{show('team') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{t('sales.col.team')}</th> : null}
						{show('taxExcluded') ? (
							<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('sales.col.tax_excluded')}</th>
						) : null}
						{show('total') ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('sales.col.amount')}</th> : null}
						{show('status') ? (
							<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">{t('sales.col.status')}</th>
						) : null}
						<th className="w-12 border-b border-slate-200 px-2 py-2.5 text-right" aria-label="Aksi" />
					</tr>
				</thead>
				<tbody>
					{docs.map(doc => {
						const partnerName = doc.expand?.contact?.name || doc.partner || '—';
						const due = duePresentation(doc);
						const visual = payVisual(doc);
						const style = PAY_STYLE[visual];
						const taxExcluded = Math.max(0, (Number(doc.total) || 0) - (Number(doc.tax_total) || 0));
						const sourceNo = doc.expand?.source_document?.number || '—';
						const penalty = computeLatePenalty(penaltySettings, {
							total: doc.total,
							payment_terms: doc.payment_terms,
							date: doc.date,
							paid_amount: doc.paid_amount,
						});
						return (
							<tr
								key={doc.id}
								className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
							>
								{show('number') ? (
									<td className="px-5 py-2 align-middle font-medium whitespace-nowrap">
										<Link
											to={`/app/penjualan/dokumen/lihat/${doc.id}`}
											className="text-[#8b5cf6] hover:underline"
										>
											{doc.number || '—'}
										</Link>
									</td>
								) : null}
								{show('customer') ? (
									<td className="max-w-[180px] truncate px-2 py-2 align-middle" title={partnerName}>
										{partnerName}
									</td>
								) : null}
								{show('invoiceDate') ? (
									<td className="px-2 py-2 align-middle whitespace-nowrap">{formatDate(doc.date)}</td>
								) : null}
								{show('bookDate') ? (
									<td className="px-2 py-2 align-middle whitespace-nowrap">{formatDate(doc.date)}</td>
								) : null}
								{show('dueDate') ? (
									<td className={`px-2 py-2 align-middle whitespace-nowrap ${due.overdue ? 'font-semibold text-red-600' : ''}`}>
										{due.text}
									</td>
								) : null}
								{show('payment') ? (
									<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">
										{doc.payment_terms || '—'}
									</td>
								) : null}
								{show('source') ? (
									<td className="max-w-[140px] truncate px-2 py-2 align-middle" title={sourceNo}>
										{sourceNo}
									</td>
								) : null}
								{show('team') ? (
									<td className="px-2 py-2 align-middle whitespace-nowrap text-slate-600">{t('sales.title')}</td>
								) : null}
								{show('taxExcluded') ? (
									<td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">
										{formatRupiah(taxExcluded)}
									</td>
								) : null}
								{show('total') ? (
									<td className="px-2 py-2 align-middle text-right whitespace-nowrap font-medium tabular-nums">
										<span className="block">{formatRupiah(doc.total)}</span>
										{penalty && penalty.penalty > 0 ? (
											<span className="block text-[10px] font-semibold text-amber-600">
												+ denda {formatRupiah(penalty.penalty)}
											</span>
										) : null}
									</td>
								) : null}
								{show('status') ? (
									<td className="px-2 py-2 align-middle text-right">
										<span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>
											{t(style.key)}
										</span>
									</td>
								) : null}
								<td className="px-2 py-2 align-middle">
									<div className="flex items-center justify-end gap-1">
										{hasPendingPayment(doc.id) ? (
											<button
												type="button"
												onClick={() => onValidate(doc.id)}
												className="text-[11px] font-semibold text-amber-600 hover:text-amber-700"
											>
												Validasi
											</button>
										) : null}
										<DocumentActions
											doc={doc}
											company={company}
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
														onSelect={() => onDelete(doc)}
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
	);
}

export function DeliveryListTable({
	docs,
	company,
	direction,
	basePath,
	onDelete,
	visible,
}: {
	docs: BusinessDocument[];
	company: Company;
	direction: DocumentDirection;
	basePath: string;
	onDelete: (doc: BusinessDocument) => void;
	visible: Record<DeliveryColumnKey, boolean>;
}) {
	const show = (key: DeliveryColumnKey) => visible[key];
	const partyLabel = direction === 'pembelian' ? 'Pemasok' : 'Pelanggan';

	return (
		<div className="overflow-x-auto">
			<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
				<thead className="sticky top-0 z-20">
					<tr className="text-left text-[13px] font-semibold text-slate-900">
						{show('number') ? <th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">Nomor</th> : null}
						{show('customer') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{partyLabel}</th> : null}
						{show('date') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Tgl Pengiriman</th> : null}
						{show('warehouse') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Gudang</th> : null}
						{show('source') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Dok. Sumber</th> : null}
						{show('description') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Keterangan</th> : null}
						{show('shipping') ? (
							<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Ongkos Kirim</th>
						) : null}
						{show('status') ? (
							<th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Status</th>
						) : null}
						<th className="w-12 border-b border-slate-200 px-2 py-2.5 text-right" aria-label="Aksi" />
					</tr>
				</thead>
				<tbody>
					{docs.map(doc => {
						const partnerName = doc.expand?.contact?.name || doc.partner || '—';
						const sourceNo = doc.expand?.source_document?.number || '—';
						const warehouse = doc.expand?.warehouse?.name || '—';
						const status = DELIVERY_STATUS[doc.status] ?? {
							label: doc.status,
							className: 'bg-slate-200 text-slate-700',
						};
						return (
							<tr key={doc.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
								{show('number') ? (
									<td className="px-5 py-2 align-middle font-medium whitespace-nowrap">
										<Link
											to={direction === 'penjualan' ? `/app/penjualan/dokumen/lihat/${doc.id}` : `/app/${basePath}/dokumen/buat/${doc.stage}/ubah/${doc.id}`}
											className="text-[#8b5cf6] hover:underline"
										>
											{doc.number || '—'}
										</Link>
									</td>
								) : null}
								{show('customer') ? (
									<td className="max-w-[180px] truncate px-2 py-2 align-middle" title={partnerName}>
										{partnerName}
									</td>
								) : null}
								{show('date') ? (
									<td className="px-2 py-2 align-middle whitespace-nowrap">{formatDate(doc.date)}</td>
								) : null}
								{show('warehouse') ? (
									<td className="max-w-[140px] truncate px-2 py-2 align-middle" title={warehouse}>
										{warehouse}
									</td>
								) : null}
								{show('source') ? (
									<td className="max-w-[140px] truncate px-2 py-2 align-middle" title={sourceNo}>
										{sourceNo}
									</td>
								) : null}
								{show('description') ? (
									<td className="max-w-[220px] truncate px-2 py-2 align-middle text-slate-600" title={doc.description || ''}>
										{doc.description || '—'}
									</td>
								) : null}
								{show('shipping') ? (
									<td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">
										{formatRupiah(Number(doc.shipping_cost) || 0)}
									</td>
								) : null}
								{show('status') ? (
									<td className="px-2 py-2 align-middle text-right">
										<span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
											{status.label}
										</span>
									</td>
								) : null}
								<td className="px-2 py-2 align-middle">
									<div className="flex items-center justify-end">
										<DocumentActions
											doc={doc}
											company={company}
											direction={direction}
											variant="menu"
											menuAfter={
												<>
													<DeliveryPaymentMenuItem doc={doc} basePath={basePath} />
													<DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
														<Link to={`/app/${basePath}/dokumen/buat/${doc.stage}/ubah/${doc.id}`}>
															<Pencil className="size-4 text-primary" /> Ubah dokumen
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem
														onSelect={() => onDelete(doc)}
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
	);
}

const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
	confirmed: { label: 'Diterima', className: 'bg-emerald-500 text-white' },
	draft: { label: 'Draft', className: 'bg-slate-200 text-slate-700' },
	cancelled: { label: 'Dibatalkan', className: 'bg-rose-100 text-rose-700' },
};

function paymentStatus(doc: BusinessDocument): { label: string; className: string } {
	if (doc.status === 'cancelled' || doc.status === 'draft') {
		return PAYMENT_STATUS[doc.status];
	}
	const source = doc.expand?.source_document;
	if (source) {
		const total = Number(source.total) || 0;
		const paid = Number(source.paid_amount) || 0;
		const down = Number(source.down_payment) || 0;
		if (total > 0 && paid + down >= total) {
			return { label: 'Lunas', className: 'bg-emerald-500 text-white' };
		}
		if (paid + down > 0) {
			return { label: 'Sebagian', className: 'bg-amber-500 text-white' };
		}
	}
	return PAYMENT_STATUS.confirmed;
}

export function PaymentListTable({
	docs,
	company,
	direction,
	basePath,
	onDelete,
	visible,
}: {
	docs: BusinessDocument[];
	company: Company;
	direction: DocumentDirection;
	basePath: string;
	onDelete: (doc: BusinessDocument) => void;
	visible: Record<PaymentColumnKey, boolean>;
}) {
	const show = (key: PaymentColumnKey) => visible[key];
	const partyLabel = direction === 'pembelian' ? 'Pemasok' : 'Pelanggan';

	return (
		<div className="overflow-x-auto">
			<table className="invoice-table w-full border-separate border-spacing-0 text-[13px] text-slate-800">
				<thead className="sticky top-0 z-20">
					<tr className="text-left text-[13px] font-semibold text-slate-900">
						{show('number') ? <th className="border-b border-slate-200 px-5 py-2.5 whitespace-nowrap">Nomor</th> : null}
						{show('date') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Tanggal</th> : null}
						{show('customer') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">{partyLabel}</th> : null}
						{show('description') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Keterangan</th> : null}
						{show('status') ? <th className="border-b border-slate-200 px-2 py-2.5 whitespace-nowrap">Status</th> : null}
						{show('amount') ? <th className="border-b border-slate-200 px-2 py-2.5 text-right whitespace-nowrap">Nominal</th> : null}
						<th className="w-12 border-b border-slate-200 px-2 py-2.5 text-right" aria-label="Aksi" />
					</tr>
				</thead>
				<tbody>
					{docs.map(doc => {
						const partnerName = doc.expand?.contact?.name || doc.partner || '—';
						const status = paymentStatus(doc);
						const amount = Number(doc.paid_amount) || Number(doc.total) || 0;
						return (
							<tr key={doc.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
								{show('number') ? (
									<td className="px-5 py-2 align-middle font-medium whitespace-nowrap">
										<Link
											to={`/app/${basePath}/dokumen/buat/${doc.stage}/ubah/${doc.id}`}
											className="text-[#8b5cf6] hover:underline"
										>
											{doc.number || '—'}
										</Link>
									</td>
								) : null}
								{show('date') ? (
									<td className="px-2 py-2 align-middle whitespace-nowrap">{formatDate(doc.date)}</td>
								) : null}
								{show('customer') ? (
									<td className="max-w-[180px] truncate px-2 py-2 align-middle" title={partnerName}>
										{partnerName}
									</td>
								) : null}
								{show('description') ? (
									<td className="max-w-[220px] truncate px-2 py-2 align-middle text-slate-600" title={doc.description || ''}>
										{doc.description || '—'}
									</td>
								) : null}
								{show('status') ? (
									<td className="px-2 py-2 align-middle">
										<span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
											{status.label}
										</span>
									</td>
								) : null}
								{show('amount') ? (
									<td className="px-2 py-2 align-middle text-right font-medium whitespace-nowrap tabular-nums">
										{formatRupiah(amount)}
									</td>
								) : null}
								<td className="px-2 py-2 align-middle">
									<div className="flex items-center justify-end">
										<DocumentActions
											doc={doc}
											company={company}
											direction={direction}
											variant="menu"
											menuAfter={
												<>
													<DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold">
														<Link to={`/app/${basePath}/dokumen/buat/${doc.stage}/ubah/${doc.id}`}>
															<Pencil className="size-4 text-primary" /> Ubah dokumen
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem
														onSelect={() => onDelete(doc)}
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
	);
}

/** Opsi pembayaran di menu tiga titik daftar Pengiriman. Mengarah ke konversi invoice sumber yang sudah ada. */
function DeliveryPaymentMenuItem({ doc, basePath }: { doc: BusinessDocument; basePath: string }) {
	const sourceId = doc.source_document;
	if (!sourceId) return null;
	const source = doc.expand?.source_document;
	const total = Number(source?.total) || 0;
	const paid = Number(source?.paid_amount) || 0;
	const down = Number(source?.down_payment) || 0;
	const isPaid = Boolean(source) && total > 0 && paid + down >= total;
	const remaining = Math.max(0, total - paid - down);
	const itemClass = 'min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold';

	if (isPaid) {
		return (
			<DropdownMenuItem disabled className={`${itemClass} text-emerald-700 focus:text-emerald-700`}>
				<Banknote className="size-4" /> Pembayaran Lunas
			</DropdownMenuItem>
		);
	}

	return (
		<DropdownMenuItem asChild className={itemClass}>
			<Link to={`/app/${basePath}/dokumen/buat/pembayaran/konversi/${sourceId}`}>
				<Banknote className="size-4 text-primary" />
				<span className="flex min-w-0 flex-col items-start leading-tight">
					<span>Buat Pembayaran</span>
					{source && remaining > 0 ? (
						<span className="text-[11px] font-medium text-muted-foreground">Sisa {formatRupiah(remaining)}</span>
					) : null}
				</span>
			</Link>
		</DropdownMenuItem>
	);
}
