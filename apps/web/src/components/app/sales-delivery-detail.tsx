import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, type Company, type JournalEntry } from '@/lib/accounting';
import type { Product } from '@/lib/products';
import type { BusinessDocument } from '@/lib/documents';
import { ensureSalesDeliveryJournal } from '@/lib/delivery-journal';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

interface SalesDeliveryDetailProps {
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
	const hour = pick('hour').padStart(2, '0');
	const period = pick('dayPeriod').toUpperCase();
	return `${pick('day')}/${pick('month')}/${pick('year')} ${hour}:${pick('minute')}:${pick('second')} ${period} GMT +7`;
}

function sourceLabel(source?: BusinessDocument): string {
	if (!source?.number && !source) return '-';
	const number = source.number || source.id.slice(0, 8).toUpperCase();
	if (source.stage === 'pemesanan') return `Sales Order #${number}`;
	if (source.stage === 'invoice') return `Sales Invoice #${number}`;
	if (source.stage === 'penawaran') return `Penawaran #${number}`;
	return number;
}

function sourceHref(source?: BusinessDocument): string {
	if (!source) return '';
	if (source.stage === 'invoice' || source.stage === 'pengiriman') {
		return `/app/penjualan/dokumen/lihat/${source.id}`;
	}
	return `/app/penjualan/dokumen/buat/${source.stage}/ubah/${source.id}`;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
	confirmed: { label: 'Terkirim', className: 'bg-emerald-100 text-emerald-800' },
	draft: { label: 'Draft', className: 'bg-slate-200 text-slate-700' },
	cancelled: { label: 'Dibatalkan', className: 'bg-rose-100 text-rose-700' },
};

export function SalesDeliveryDetail({ docId, activeCompany }: SalesDeliveryDetailProps) {
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
				if (record.company !== activeCompany.id || record.direction !== 'penjualan' || record.stage !== 'pengiriman') {
					setError('Pengiriman penjualan tidak ditemukan.');
					return;
				}
				setDoc(record);
			})
			.catch(() => {
				if (!cancelled) setError('Pengiriman penjualan tidak ditemukan.');
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
				filter: pb.filter('company = {:company} && direction = "penjualan" && stage = "pengiriman"', {
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

		const ownerId = pb.authStore.record?.id || activeCompany.owner;
		const journalFilter = pb.filter('company = {:company} && group = {:group}', {
			company: activeCompany.id,
			group: `doc-${doc.id}`,
		});
		ensureSalesDeliveryJournal({
			companyId: activeCompany.id,
			ownerId,
			docId: doc.id,
			date: doc.date,
			description: doc.description || `Pengiriman ${doc.number || ''}`.trim(),
			number: doc.number || '',
			amount: Number(doc.total) || 0,
			sourceDocumentId: doc.source_document || undefined,
		})
			.catch(() => false)
			.then(() =>
				pb.collection('entries').getFullList<JournalEntry>({
					filter: journalFilter,
					sort: 'created',
					expand: 'account',
					requestKey: `delivery-journal-view-${doc.id}`,
				}),
			)
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
		const contact = doc.expand?.contact;
		const source = doc.expand?.source_document;
		return {
			contact,
			items: doc.items || [],
			address: contact?.address || '-',
			email: contact?.email || '',
			customer: contact?.name || doc.partner || '-',
			number: doc.number || doc.id.slice(0, 8).toUpperCase(),
			source,
			badge: STATUS_BADGE[doc.status] ?? { label: doc.status, className: 'bg-slate-200 text-slate-700' },
		};
	}, [doc]);

	if (!activeCompany) {
		return <p className="text-sm text-muted-foreground">Pilih perusahaan untuk membuka pengiriman.</p>;
	}
	if (error) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm font-semibold text-destructive">{error}</p>
				<Link to="/app/penjualan" className="text-sm font-semibold text-blue-600 hover:underline">
					Kembali ke Penjualan
				</Link>
			</div>
		);
	}
	if (!doc || !view) {
		return <p className="text-sm text-muted-foreground">Memuat pengiriman…</p>;
	}

	const iconBtn =
		'inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-30';
	const source = view.source;

	return (
		<div className="-mx-4 -mt-6 bg-[#f4f7fb] text-slate-900 sm:-mx-5 md:-mx-10 md:-mt-10">
			<header className="flex items-start justify-between gap-4 border-b border-slate-200/80 bg-[#f7f9fc] px-4 py-4 sm:px-6 md:px-8">
				<div className="min-w-0">
					<Link
						to="/app/penjualan"
						className="text-[13px] font-medium text-blue-600 hover:underline"
					>
						Penjualan
					</Link>
					<div className="mt-0.5 flex flex-wrap items-center gap-2.5">
						<h1 className="text-[22px] font-bold tracking-tight text-slate-950">
							Pengiriman Penjualan #{view.number}
						</h1>
						<span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${view.badge.className}`}>
							{view.badge.label}
						</span>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						aria-label="Komentar"
						onClick={() => setCommentsOpen(true)}
						className={iconBtn}
					>
						<MessageSquare className="size-4" strokeWidth={1.75} />
					</button>
					<button
						type="button"
						aria-label="Pengiriman sebelumnya"
						disabled={!prevId}
						onClick={() => prevId && navigate(`/app/penjualan/dokumen/lihat/${prevId}`)}
						className={iconBtn}
					>
						<ChevronLeft className="size-4" />
					</button>
					<button
						type="button"
						aria-label="Pengiriman berikutnya"
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
						<button
							type="button"
							onClick={() => setJournalOpen(true)}
							className="text-[13px] font-medium text-blue-600 hover:underline"
						>
							Lihat Jurnal Entry
						</button>
					</div>
				</div>

				<div className="mt-6 border-t border-dashed border-slate-200 pt-5">
					<dl className="grid gap-x-10 gap-y-3 text-[13px] lg:grid-cols-3">
						<div className="grid grid-cols-[9.5rem_1fr] gap-2">
							<dt className="text-slate-500">Alamat pengiriman</dt>
							<dd>{view.address || '-'}</dd>
						</div>
						<div className="flex flex-col gap-3">
							<div className="grid grid-cols-[9.5rem_1fr] gap-2">
								<dt className="text-slate-500">Tgl. pengiriman</dt>
								<dd className="font-semibold">{formatDate(doc.date)}</dd>
							</div>
							<div className="grid grid-cols-[9.5rem_1fr] gap-2">
								<dt className="text-slate-500">Kirim melalui</dt>
								<dd>-</dd>
							</div>
							<div className="grid grid-cols-[9.5rem_1fr] gap-2">
								<dt className="text-slate-500">No. pelacakan</dt>
								<dd>-</dd>
							</div>
						</div>
						<div className="flex flex-col gap-3">
							<div className="grid grid-cols-[8.5rem_1fr] gap-2">
								<dt className="text-slate-500">No Transaksi</dt>
								<dd className="font-semibold">Sales Delivery #{view.number}</dd>
							</div>
							<div className="grid grid-cols-[8.5rem_1fr] gap-2">
								<dt className="text-slate-500">No Referensi</dt>
								<dd>{doc.description?.trim() || '-'}</dd>
							</div>
							<div className="grid grid-cols-[8.5rem_1fr] gap-2">
								<dt className="text-slate-500">No. pesanan</dt>
								<dd>
									{source ? (
										<Link to={sourceHref(source)} className="font-medium text-blue-600 hover:underline">
											{sourceLabel(source)}
										</Link>
									) : (
										'-'
									)}
								</dd>
							</div>
							<div className="grid grid-cols-[8.5rem_1fr] gap-2">
								<dt className="text-slate-500">Tag</dt>
								<dd>-</dd>
							</div>
						</div>
					</dl>
				</div>

				<div className="mt-6 overflow-x-auto">
					<table className="w-full min-w-[640px] border-collapse text-[13px]">
						<thead>
							<tr className="border-b border-slate-200 bg-[#f7f8fa] text-left text-[13px] font-semibold text-slate-900">
								<th className="px-3 py-2.5">Produk</th>
								<th className="px-3 py-2.5">Keterangan</th>
								<th className="px-3 py-2.5 text-right">Kuantitas</th>
								<th className="px-3 py-2.5 text-right">Unit</th>
							</tr>
						</thead>
						<tbody>
							{view.items.length === 0 ? (
								<tr>
									<td colSpan={4} className="border-b border-slate-200 px-3 py-6 text-slate-500">
										Tidak ada produk.
									</td>
								</tr>
							) : (
								view.items.map((item, rowIndex) => {
									const unit = (item.product && units[item.product]) || 'Buah';
									const note = item.code && item.code !== item.name ? item.code : '';
									return (
										<tr key={`${item.product}-${rowIndex}`} className="border-b border-slate-200">
											<td className="px-3 py-3 font-medium text-blue-600">{item.name || item.code || '—'}</td>
											<td className="px-3 py-3 text-slate-600">{note}</td>
											<td className="px-3 py-3 text-right tabular-nums">{item.quantity || 0}</td>
											<td className="px-3 py-3 text-right">{unit}</td>
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

				<div className="mt-5 border-t border-dashed border-slate-200 pt-4">
					<div className="grid grid-cols-[5rem_1fr] gap-3 text-[13px]">
						<p className="text-slate-500">Memo</p>
						<p>{doc.memo?.trim() || '-'}</p>
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
						<DialogDescription>Belum ada komentar pada pengiriman ini.</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>

			<Dialog open={journalOpen} onOpenChange={setJournalOpen}>
				<DialogContent className="max-h-[85vh] gap-0 overflow-hidden rounded-md border-slate-200 bg-white p-0 sm:max-w-3xl">
					<DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-200 bg-[#f8fafc] px-5 py-3.5 pr-12 text-left">
						<DialogTitle className="text-[15px] font-semibold text-slate-900">
							Laporan Jurnal Sales Delivery #{view.number}
						</DialogTitle>
						<DialogDescription className="sr-only">
							Rincian akun debit dan kredit untuk pengiriman penjualan ini.
						</DialogDescription>
					</DialogHeader>
					<div className="overflow-auto px-5 py-4">
						{journalLines.length === 0 ? (
							<p className="py-6 text-[13px] text-slate-500">Jurnal belum tercatat untuk pengiriman ini.</p>
						) : (
							<JournalTable lines={journalLines} />
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function JournalTable({ lines }: { lines: JournalEntry[] }) {
	const debitTotal = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
	const creditTotal = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
	return (
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
	);
}
