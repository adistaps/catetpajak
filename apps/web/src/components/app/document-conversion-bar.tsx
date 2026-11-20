import { useEffect, useState } from 'react';
import pb from '@/lib/pocketbase-client';
import type { BusinessDocument, DocumentDirection, DocumentStage } from '@/lib/documents';
import { useLanguage } from '@/hooks/use-language';

interface ConversionStat {
	label: string;
	from: DocumentStage;
	to: DocumentStage;
	converted: number;
	total: number;
}

interface DocumentConversionBarProps {
	companyId: string;
	direction: DocumentDirection;
	/** Tahap yang sedang aktif; menentukan progres mana yang ditampilkan. */
	activeStage: DocumentStage;
	/** Naikkan nilai ini untuk memicu muat ulang (mis. setelah aksi pada dokumen). */
	reloadKey: number;
}

const STAGES_NEEDED: DocumentStage[] = ['penawaran', 'pemesanan', 'invoice'];

const EMPTY_STATS: ConversionStat[] = [
	{ label: 'Penawaran → Pemesanan', from: 'penawaran', to: 'pemesanan', converted: 0, total: 0 },
	{ label: 'Pemesanan → Invoice', from: 'pemesanan', to: 'invoice', converted: 0, total: 0 },
	{ label: 'Invoice → Lunas', from: 'invoice', to: 'pembayaran', converted: 0, total: 0 },
];

const STAGE_LABEL_KEY: Record<DocumentStage, string> = {
	penawaran: 'sales.stage.quotation',
	pemesanan: 'sales.stage.order',
	invoice: 'sales.stage.invoice',
	pengiriman: 'sales.stage.delivery',
	pembayaran: 'sales.stage.payment',
};

export function DocumentConversionBar({ companyId, direction, activeStage, reloadKey }: DocumentConversionBarProps) {
	const { t } = useLanguage();
	const [stats, setStats] = useState<ConversionStat[]>(EMPTY_STATS);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!companyId) {
			setStats(EMPTY_STATS);
			setLoading(false);
			return;
		}
		let cancelled = false;
		const controller = new AbortController();
		setLoading(true);

		// Ambil semua dokumen penjualan (semua tahap) untuk perusahaan ini.
		// `requestKey: null` menonaktifkan auto-cancel SDK (yang sebelumnya
		// membatalkan permintaan ini saat komponen re-render/StrictMode, sehingga
		// stats tidak pernah terisi dan bar selalu 0). AbortController kita
		// mengatur pembatalan secara bersih saat effect dibersihkan/unmount.
		pb.collection('documents')
			.getFullList<BusinessDocument>({
				filter: pb.filter('company = {:company} && direction = {:direction}', {
					company: companyId,
					direction,
				}),
				fields: 'id,stage,source_document,total,paid_amount',
				requestKey: null,
				signal: controller.signal,
			})
			.then(list => {
				if (cancelled) return;

				const byStage = new Map<DocumentStage, BusinessDocument[]>();
				for (const stage of STAGES_NEEDED) byStage.set(stage, []);
				for (const doc of list) {
					if (byStage.has(doc.stage)) {
						byStage.get(doc.stage)!.push(doc);
					}
				}

				const penawaran = byStage.get('penawaran') ?? [];
				const pemesanan = byStage.get('pemesanan') ?? [];
				const invoice = byStage.get('invoice') ?? [];

				// Penawaran -> Pemesanan: penawaran yang menjadi source_document suatu pemesanan.
				const pemesananSources = new Set(
					pemesanan.map(d => d.source_document).filter(Boolean) as string[],
				);
				const convertedPenawaran = penawaran.filter(d => pemesananSources.has(d.id)).length;

				// Pemesanan -> Invoice: pemesanan yang menjadi source_document suatu invoice.
				const invoiceSources = new Set(
					invoice.map(d => d.source_document).filter(Boolean) as string[],
				);
				const convertedPemesanan = pemesanan.filter(d => invoiceSources.has(d.id)).length;

				// Invoice -> Lunas: invoice dengan paid_amount >= total (total > 0).
				const paidInvoice = invoice.filter(
					d => Number(d.total) > 0 && Number(d.paid_amount) >= Number(d.total),
				).length;

				setStats([
					{
						label: t('sales.conv.quotation_order'),
						from: 'penawaran',
						to: 'pemesanan',
						converted: convertedPenawaran,
						total: penawaran.length,
					},
					{
						label: t('sales.conv.order_invoice'),
						from: 'pemesanan',
						to: 'invoice',
						converted: convertedPemesanan,
						total: pemesanan.length,
					},
					{
						label: t('sales.conv.invoice_paid'),
						from: 'invoice',
						to: 'pembayaran',
						converted: paidInvoice,
						total: invoice.length,
					},
				]);
				setLoading(false);
			})
			.catch(() => {
				// Dibatalkan (cleanup/unmount) atau gagal jaringan: jangan reset ke
				// 0 — pertahankan nilai sebelumnya agar bar tidak kehilangan datanya.
				if (cancelled || controller.signal.aborted) return;
				setLoading(false);
			});

		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [companyId, direction, reloadKey]);

	if (loading) {
		return (
			<div className="grid gap-3 sm:grid-cols-3">
				{[0, 1, 2].map(i => (
					<div
						key={i}
						className="h-20 animate-pulse rounded-xl border border-emerald-100 bg-white/60"
					/>
				))}
			</div>
		);
	}

	// Tampilkan hanya progres konversi yang berawal dari tahap aktif:
	// Penawaran → Pemesanan, Pemesanan → Invoice, Invoice → Lunas.
	const visibleStats = stats.filter(stat => stat.from === activeStage);

	if (visibleStats.length === 0) return null;

	return (
		<div
			className="grid gap-3 sm:grid-cols-3"
			aria-label="Progres konversi penjualan"
			style={{ gridTemplateColumns: `repeat(${visibleStats.length}, minmax(0, 1fr))` }}
		>
			{visibleStats.map(stat => {
				const pct = stat.total > 0 ? Math.round((stat.converted / stat.total) * 100) : 0;
				return (
					<div
						key={stat.label}
						className="p-4"
					>
						<div className="flex items-center justify-between gap-2">
							<p className="text-xs font-semibold text-muted-foreground">{stat.label}</p>
							<span className="text-sm font-extrabold text-emerald-700">{pct}%</span>
						</div>
						<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
							<div
								className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-600 transition-all duration-500"
								style={{ width: `${pct}%` }}
							/>
						</div>
					<p className="mt-2 text-[11px] font-medium text-muted-foreground">
							{t('sales.conv.converted', { converted: stat.converted, total: stat.total })}
						</p>
					</div>
				);
			})}
		</div>
	);
}
