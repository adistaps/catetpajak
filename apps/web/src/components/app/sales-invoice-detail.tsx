import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, MessageSquare, Pencil } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, type Company, type JournalEntry } from '@/lib/accounting';
import { computePaymentTerms } from '@/lib/payment-terms';
import type { Product } from '@/lib/products';
import type { BusinessDocument } from '@/lib/documents';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

interface SalesInvoiceDetailProps {
	docId: string;
	activeCompany: Company | null;
}

function formatDetailMoney(value: number): string {
	const n = Number(value) || 0;
	const negative = n < 0;
	const fixed = Math.abs(n).toFixed(2);
	const [intPart, decPart] = fixed.split('.');
	const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${negative ? '-' : ''}Rp. ${withDots},${decPart}`;
}

function formatTermsLabel(raw?: string): string {
	const value = (raw || '').trim();
	if (!value) return '-';
	return value.replace(/\bN\/(\d+)\b/gi, 'Net $1');
}

function formatUpdatedStamp(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Asia/Jakarta',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: true,
	}).formatToParts(date);
	const pick = (type: string) => parts.find(part => part.type === type)?.value ?? '';
	const day = pick('day');
	const month = pick('month');
	const year = pick('year');
	const hour = pick('hour').padStart(2, '0');
	const minute = pick('minute');
	const second = pick('second');
	const period = pick('dayPeriod').toUpperCase();
	return `${day}/${month}/${year} ${hour}:${minute}:${second} ${period} GMT +7`;
}

function paymentBadge(doc: BusinessDocument): { label: string; className: string } {
	if (doc.status === 'cancelled') {
		return { label: 'Dibatalkan', className: 'bg-rose-100 text-rose-700' };
	}
	if (doc.status === 'draft') {
		return { label: 'Draft', className: 'bg-slate-200 text-slate-700' };
	}
	const total = Number(doc.total) || 0;
	const paid = Number(doc.paid_amount) || 0;
	const down = Number(doc.down_payment) || 0;
	const covered = paid + down;
	if (total > 0 && covered >= total) {
		return { label: 'Lunas', className: 'bg-emerald-100 text-emerald-800' };
	}
	if (covered > 0) {
		return { label: 'Dibayar sebagian', className: 'bg-amber-100 text-amber-800' };
	}
	if (doc.status === 'sudah_dikirim') {
		return { label: 'Dikirim', className: 'bg-indigo-100 text-indigo-700' };
	}
	return { label: 'Menunggu pembayaran', className: 'bg-amber-400 text-white' };
}

export function SalesInvoiceDetail({ docId, activeCompany }: SalesInvoiceDetailProps) {
	const navigate = useNavigate();
	const [doc, setDoc] = useState<BusinessDocument | null>(null);
	const [units, setUnits] = useState<Record<string, string>>({});
	const [siblings, setSiblings] = useState<string[]>([]);
	const [journalLines, setJournalLines] = useState<JournalEntry[]>([]);
	const [journalOpen, setJournalOpen] = useState(false);
	const [editorName, setEditorName] = useState('');
	const [error, setError] = useState('');
	const [commentsOpen, setCommentsOpen] = useState(false);

	useEffect(() => {
		if (!activeCompany || !docId) return;
		let cancelled = false;
		setError('');
		setDoc(null);
		setJournalLines([]);
		setJournalOpen(false);
		pb.collection('documents')
			.getOne<BusinessDocument>(docId, {
				expand: 'contact,source_document,warehouse',
			})
			.then(record => {
				if (cancelled) return;
				if (record.company !== activeCompany.id || record.direction !== 'penjualan' || record.stage !== 'invoice') {
					setError('Invoice penjualan tidak ditemukan.');
					return;
				}
				setDoc(record);
			})
			.catch(() => {
				if (!cancelled) setError('Invoice penjualan tidak ditemukan.');
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, docId]);

	useEffect(() => {
		if (!doc || !activeCompany) return;
		let cancelled = false;
		const productIds = [...new Set((doc.items || []).map(item => item.product).filter(Boolean))];
		if (productIds.length > 0) {
			const productParams: Record<string, string> = {};
			const productFilter = productIds
				.map((id, index) => {
					productParams[`id${index}`] = id;
					return `id = {:id${index}}`;
				})
				.join(' || ');
			pb.collection('products')
				.getFullList<Product>({
					filter: pb.filter(productFilter, productParams),
					fields: 'id,unit',
				})
				.then(list => {
					if (cancelled) return;
					const next: Record<string, string> = {};
					for (const product of list) next[product.id] = product.unit || '';
					setUnits(next);
				})
				.catch(() => {
					if (!cancelled) setUnits({});
				});
		} else {
			setUnits({});
		}

		pb.collection('documents')
			.getFullList<{ id: string }>({
				filter: pb.filter('company = {:company} && direction = "penjualan" && stage = "invoice"', {
					company: activeCompany.id,
				}),
				sort: '-date,-created',
				fields: 'id',
			})
			.then(list => {
				if (!cancelled) setSiblings(list.map(item => item.id));
			})
			.catch(() => {
				if (!cancelled) setSiblings([doc.id]);
			});

		const journalFilter = doc.transaction
			? pb.filter('transaction = {:tx}', { tx: doc.transaction })
			: pb.filter('group = {:group}', { group: `doc-${doc.id}` });
		pb.collection('entries')
			.getFullList<JournalEntry>({
				filter: journalFilter,
				sort: 'created',
				expand: 'account',
			})
			.then(list => {
				if (!cancelled) setJournalLines(list);
			})
			.catch(() => {
				if (!cancelled) setJournalLines([]);
			});

		const me = pb.authStore.record;
		if (me && me.id === doc.owner) {
			const record = me as { name?: string; email?: string };
			setEditorName(record.name || record.email || 'pengguna');
		} else if (doc.owner) {
			pb.collection('users')
				.getOne<{ name?: string; email?: string }>(doc.owner)
				.then(user => {
					if (!cancelled) setEditorName(user.name || user.email || 'pengguna');
				})
				.catch(() => {
					if (!cancelled) setEditorName('pengguna');
				});
		} else {
			setEditorName('pengguna');
		}

		return () => {
			cancelled = true;
		};
	}, [doc, activeCompany]);

	const index = siblings.indexOf(docId);
	const prevId = index > 0 ? siblings[index - 1] : '';
	const nextId = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : '';

	const view = useMemo(() => {
		if (!doc) return null;
		const total = Number(doc.total) || 0;
		const paid = Number(doc.paid_amount) || 0;
		const down = Number(doc.down_payment) || 0;
		const remaining = Math.max(0, total - paid - down);
		const terms = computePaymentTerms(doc.payment_terms, doc.date, total);
		const due = doc.due_date || terms?.dueDate || '';
		const contact = doc.expand?.contact;
		const items = doc.items || [];
		return {
			total,
			remaining,
			due,
			contact,
			items,
			badge: paymentBadge(doc),
			address: contact?.address || '-',
			email: contact?.email || '',
			customer: contact?.name || doc.partner || '-',
			reference: doc.expand?.source_document?.number || '-',
			warehouse: doc.expand?.warehouse?.name || '',
			number: doc.number || doc.id.slice(0, 8).toUpperCase(),
			discount: Number(doc.discount_total) || 0,
			tax: Number(doc.tax_total) || 0,
			subtotal: Number(doc.subtotal) || 0,
		};
	}, [doc]);

	if (!activeCompany) {
		return <p className="text-sm text-muted-foreground">Pilih perusahaan untuk membuka invoice.</p>;
	}
	if (error) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm font-semibold text-destructive">{error}</p>
				<Link to="/app/penjualan?stage=invoice" className="text-sm font-semibold text-blue-600 hover:underline">
					Kembali ke daftar invoice
				</Link>
			</div>
		);
	}
	if (!doc || !view) {
		return <p className="text-sm text-muted-foreground">Memuat invoice…</p>;
	}

	const iconBtn =
		'inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-30';

	return (
		<div className="-mx-4 -mt-6 bg-[#f4f7fb] text-slate-900 sm:-mx-5 md:-mx-10 md:-mt-10">
			<header className="flex items-start justify-between gap-4 border-b border-slate-200/80 bg-[#f7f9fc] px-4 py-4 sm:px-6 md:px-8">
				<div className="min-w-0">
					<Link
						to="/app/penjualan?stage=invoice"
						className="text-[13px] font-medium text-blue-600 hover:underline"
					>
						Penjualan
					</Link>
					<div className="mt-0.5 flex flex-wrap items-center gap-2.5">
						<h1 className="text-[22px] font-bold tracking-tight text-slate-950">
							Penagihan Penjualan #{view.number}
						</h1>
						<span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${view.badge.className}`}>
							{view.badge.label}
						</span>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Link
						to={`/app/penjualan/dokumen/buat/invoice/ubah/${doc.id}`}
						aria-label="Ubah invoice"
						className={iconBtn}
					>
						<Pencil className="size-4" strokeWidth={1.75} />
					</Link>
					<button
						type="button"
						aria-label="Komentar"
						onClick={() => setCommentsOpen(true)}
						className={`${iconBtn} relative`}
					>
						<MessageSquare className="size-4" strokeWidth={1.75} />
					</button>
					<button
						type="button"
						aria-label="Invoice sebelumnya"
						disabled={!prevId}
						onClick={() => prevId && navigate(`/app/penjualan/dokumen/lihat/${prevId}`)}
						className={iconBtn}
					>
						<ChevronLeft className="size-4" />
					</button>
					<button
						type="button"
						aria-label="Invoice berikutnya"
						disabled={!nextId}
						onClick={() => nextId && navigate(`/app/penjualan/dokumen/lihat/${nextId}`)}
						className={iconBtn}
					>
						<ChevronRight className="size-4" />
					</button>
				</div>
			</header>

			<div className="bg-white px-4 py-5 sm:px-6 md:px-8">
				<div className="grid gap-6 md:grid-cols-[1fr_1fr_auto] md:items-start">
					<div>
						<p className="text-[13px] text-slate-500">Pelanggan</p>
						{doc.contact ? (
							<Link
								to={`/app/kontak/riwayat/customer/${doc.contact}`}
								className="mt-1 inline-block text-[13px] font-medium text-blue-600 hover:underline"
							>
								{view.customer}
							</Link>
						) : (
							<p className="mt-1 text-[13px] text-slate-800">{view.customer}</p>
						)}
					</div>
					<div>
						<p className="text-[13px] text-slate-500">Email</p>
						<p className="mt-1 text-[13px] text-slate-800">{view.email || ''}</p>
					</div>
					<div className="text-right">
						<p className="text-[18px] font-bold tracking-tight text-slate-950">
							Sisa tagihan {formatDetailMoney(view.remaining)}
						</p>
						{journalLines.length > 0 ? (
							<button
								type="button"
								onClick={() => setJournalOpen(true)}
								className="mt-0.5 text-[13px] font-medium text-blue-600 hover:underline"
							>
								Lihat Jurnal Entry
							</button>
						) : (
							<p className="mt-0.5 text-[13px] text-slate-400">Jurnal belum tercatat</p>
						)}
					</div>
				</div>

				<div className="mt-6 border-t border-dashed border-slate-200 pt-5">
					<dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">Alamat penagihan</dt>
							<dd>{view.address || '-'}</dd>
						</div>
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">Tgl. transaksi</dt>
							<dd>{formatDate(doc.date)}</dd>
						</div>
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">No Transaksi</dt>
							<dd>Sales Invoice #{view.number}</dd>
						</div>
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">Tgl. jatuh tempo</dt>
							<dd>{view.due ? formatDate(view.due) : '-'}</dd>
						</div>
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">No Referensi</dt>
							<dd>{view.reference}</dd>
						</div>
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">Syarat pembayaran</dt>
							<dd className="font-semibold">{formatTermsLabel(doc.payment_terms)}</dd>
						</div>
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">Gudang</dt>
							<dd>{view.warehouse || ''}</dd>
						</div>
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">Tag</dt>
							<dd>-</dd>
						</div>
					</dl>
				</div>

				<div className="mt-6 overflow-x-auto">
					<table className="w-full min-w-[760px] border-collapse text-[13px]">
						<thead>
							<tr className="bg-[#f7f8fa] text-left text-[13px] font-semibold text-slate-900">
								<th className="px-3 py-2.5">Produk</th>
								<th className="px-3 py-2.5">Deskripsi</th>
								<th className="px-3 py-2.5 text-right">Kuantitas</th>
								<th className="px-3 py-2.5">Unit</th>
								<th className="px-3 py-2.5 text-right">Harga satuan</th>
								<th className="px-3 py-2.5 text-right">Diskon</th>
								<th className="px-3 py-2.5">Pajak</th>
								<th className="px-3 py-2.5 text-right">Jumlah</th>
							</tr>
						</thead>
						<tbody>
							{view.items.length === 0 ? (
								<tr>
									<td colSpan={8} className="px-3 py-6 text-slate-500">
										Tidak ada produk.
									</td>
								</tr>
							) : (
								view.items.map((item, index) => {
									const line = (item.quantity || 0) * (item.unitPrice || 0);
									const discPct = line > 0 ? Math.round(((item.discount || 0) / line) * 100) : 0;
									const unit = (item.product && units[item.product]) || 'Buah';
									return (
										<tr key={`${item.product}-${index}`} className="border-t border-slate-200">
											<td className="px-3 py-2.5 font-medium text-blue-600">{item.name || item.code || '—'}</td>
											<td className="px-3 py-2.5 text-slate-600">{item.code && item.name ? '' : ''}</td>
											<td className="px-3 py-2.5 text-right tabular-nums">{item.quantity || 0}</td>
											<td className="px-3 py-2.5">{unit}</td>
											<td className="px-3 py-2.5 text-right tabular-nums">{formatDetailMoney(item.unitPrice || 0)}</td>
											<td className="px-3 py-2.5 text-right tabular-nums">{discPct}%</td>
											<td className="px-3 py-2.5">{item.taxRate ? `${item.taxRate}%` : ''}</td>
											<td className="px-3 py-2.5 text-right tabular-nums">{formatDetailMoney(item.total || 0)}</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
					<p className="mt-3 text-[13px] text-slate-700">
						Menampilkan {view.items.length} dari {view.items.length} produk
					</p>
				</div>

				<div className="mt-4 grid gap-6 border-t border-dashed border-slate-200 pt-4 md:grid-cols-2">
					<div className="grid grid-cols-[5rem_1fr] gap-3 text-[13px]">
						<p className="text-slate-500">Memo</p>
						<p>{doc.memo?.trim() || '-'}</p>
					</div>
					<div className="flex flex-col gap-2 text-[13px]">
						<div className="flex items-center justify-between gap-4">
							<span className="font-semibold">Subtotal</span>
							<span className="tabular-nums">{formatDetailMoney(view.subtotal)}</span>
						</div>
						{view.discount > 0 ? (
							<div className="flex items-center justify-between gap-4 text-slate-600">
								<span>Diskon</span>
								<span className="tabular-nums">{formatDetailMoney(view.discount)}</span>
							</div>
						) : null}
						{view.tax > 0 ? (
							<div className="flex items-center justify-between gap-4 text-slate-600">
								<span>Pajak</span>
								<span className="tabular-nums">{formatDetailMoney(view.tax)}</span>
							</div>
						) : null}
						<div className="mt-1 flex items-center justify-between gap-4 border-t border-dashed border-slate-200 pt-2">
							<span className="font-semibold">Total</span>
							<span className="tabular-nums">{formatDetailMoney(view.total)}</span>
						</div>
						<div className="mt-1 flex items-center justify-between gap-4 border-t border-dashed border-slate-200 pt-2 text-[15px] font-bold">
							<span>Sisa tagihan</span>
							<span className="tabular-nums">{formatDetailMoney(view.remaining)}</span>
						</div>
					</div>
				</div>

				<p className="mt-8 text-[13px] text-blue-600">
					Terakhir diubah oleh {editorName || 'pengguna'} pada {formatUpdatedStamp(doc.updated)}
				</p>
			</div>

			<Dialog open={commentsOpen} onOpenChange={setCommentsOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Komentar</DialogTitle>
						<DialogDescription>Belum ada komentar pada invoice ini.</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>

			<JournalReportDialog
				open={journalOpen}
				onOpenChange={setJournalOpen}
				number={view.number}
				lines={journalLines}
			/>
		</div>
	);
}

function JournalReportDialog({
	open,
	onOpenChange,
	number,
	lines,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	number: string;
	lines: JournalEntry[];
}) {
	const debitTotal = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
	const creditTotal = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] gap-0 overflow-hidden rounded-md border-slate-200 bg-white p-0 sm:max-w-3xl">
				<DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200 bg-[#f8fafc] px-5 py-3.5 pr-12 text-left">
					<DialogTitle className="text-[15px] font-semibold text-slate-900">
						Laporan Jurnal Sales Invoice #{number}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Rincian akun debit dan kredit untuk invoice penjualan ini.
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
								const label = account
									? `${account.code} - ${account.name}`
									: 'Akun';
								return (
									<tr key={line.id} className="border-b border-slate-200">
										<td className="py-3.5 pr-4 font-medium text-blue-600">{label}</td>
										<td className="py-3.5 text-right tabular-nums">{formatDetailMoney(line.debit || 0)}</td>
										<td className="py-3.5 pl-4 text-right tabular-nums">{formatDetailMoney(line.credit || 0)}</td>
									</tr>
								);
							})}
							<tr>
								<td className="py-3.5 pr-4 font-semibold">Total</td>
								<td className="border-b-2 border-double border-slate-900 py-3.5 text-right font-semibold tabular-nums">
									{formatDetailMoney(debitTotal)}
								</td>
								<td className="border-b-2 border-double border-slate-900 py-3.5 pl-4 text-right font-semibold tabular-nums">
									{formatDetailMoney(creditTotal)}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</DialogContent>
		</Dialog>
	);
}
