import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useLanguage } from '@/hooks/use-language';

/**
 * Panel “Promo Terbaru” di dasbor.
 *
 * - Bila Admin Pusat mengunggah gambar promo, semua gambar yang terbit
 *   ditampilkan sebagai banner penuh pada panel ini (urutan terbaru di atas).
 *   Jika promo memiliki tautan, gambar dapat diklik dan mengarah ke tautan
 *   tersebut (dibuka di tab baru). Tanpa tautan, gambar tetap tidak aktif.
 * - Bila belum ada gambar promo unggahan, panel menampilkan konten promo BCA
 *   (Paper by Ocean by BCA) seperti tampilan awal: diskon 0,5%, hemat hingga
 *   Rp1,2 juta, kode BCAVICOR50, berlaku sampai 31 Desember 2026, beserta
 *   hitung mundur.
 */

const PROMO_CODE = 'BCAVICOR50';
const PROMO_END = new Date('2026-12-31T23:59:59+07:00').getTime();
const FALLBACK_BANNER =
	'https://images.hostinger.com/ea537a69-2343-4521-b1d9-fecabf36d70d.png';

type PromoRecord = {
	id: string;
	image: string;
	banner_url: string;
	link: string;
	published: boolean;
	sort: number;
};

type PromoItem = { url: string; link: string };

/**
 * Mengembalikan URL gambar promo unggahan (bila ada) atau null agar konten BCA
 * ditampilkan sebagai fallback.
 */
function resolvePromoImage(record: PromoRecord | null): string | null {
	if (!record || !record.image) return null;
	try {
		return pb.files.getURL(record, record.image);
	} catch {
		return null;
	}
}

/**
 * Menormalisasi tautan promo menjadi URL http/https yang aman dibuka.
 *
 * Tautan yang sudah memiliki skema http/https dipakai apa adanya. Tautan tanpa
 * skema (mis. "www.contoh.com" atau "contoh.com/promo") ditambahkan awalan
 * "https://" agar gambar benar-benar terbuka saat diklik. Skema lain
 * (javascript:, data:, mailto:, dsb.) ditolak demi keamanan.
 */
function safeLink(link: string): string {
	if (!link) return '';
	const trimmed = link.trim();
	if (!trimmed) return '';
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
	return `https://${trimmed}`;
}

function pad(value: number) {
	return String(value).padStart(2, '0');
}

function remaining(now: number) {
	const diff = Math.max(0, PROMO_END - now);
	const totalSeconds = Math.floor(diff / 1000);
	return {
		days: Math.floor(totalSeconds / 86400),
		hours: Math.floor((totalSeconds % 86400) / 3600),
		minutes: Math.floor((totalSeconds % 3600) / 60),
		seconds: totalSeconds % 60,
		ended: diff === 0,
	};
}

export function DashboardPromo() {
	const { t } = useLanguage();
	const [copied, setCopied] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const [showAll, setShowAll] = useState(false);
	const [promoItems, setPromoItems] = useState<PromoItem[]>([]);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		let cancelled = false;
		// Ambil semua promo yang terbit (urutan terbaru di atas). Sebelumnya
		// hanya mengambil 1 item sehingga promo lain tidak pernah muncul.
		pb.collection('promos')
			.getList<PromoRecord>(1, 50, {
				filter: 'published = true',
				sort: '-created',
				requestKey: null,
			})
			.then((result) => {
				if (cancelled) return;
				const items: PromoItem[] = result.items
					.map((item) => ({
						url: resolvePromoImage(item) ?? '',
						link: typeof item.link === 'string' ? item.link : '',
					}))
					.filter((entry) => Boolean(entry.url));
				setPromoItems(items);
			})
			.catch(() => {
				if (!cancelled) setPromoItems([]);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const clock = remaining(now);

	const copyCode = async () => {
		try {
			await navigator.clipboard.writeText(PROMO_CODE);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
		} catch {
			setCopied(false);
		}
	};

	const hasUploadedPromos = promoItems.length > 0;

	return (
		<aside aria-labelledby="promo-heading" className="flex min-h-full min-w-0 flex-col gap-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 id="promo-heading" className="text-base font-bold tracking-tight text-foreground">
						{t('dash.promo.title')}
					</h2>
					<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						{t('dash.promo.subtitle')}
					</p>
				</div>
				<button
					type="button"
					onClick={() => setShowAll((value) => !value)}
					className="shrink-0 text-sm font-semibold text-sky-600 hover:text-sky-700"
					aria-expanded={showAll}
				>
					{showAll ? t('dash.promo.close') : t('dash.promo.view_all')}
				</button>
			</div>

			{hasUploadedPromos ? (
				<div className="flex min-h-0 flex-1 flex-col gap-3">
					{promoItems.map((item, index) => {
						// Tampilan awal ringkas: hanya promo terbaru yang ditampilkan.
						// Tombol "Lihat Semua" membuka promo lainnya.
						if (!showAll && index > 0) return null;
						const href = safeLink(item.link);
						const img = (
							<img
								src={item.url}
								alt={t('dash.promo.alt') + (index + 1)}
								className="size-full object-cover"
							/>
						);
						return (
							<article
								key={`${item.url}-${index}`}
								className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-sky-100 bg-[#e8f3fb] shadow-soft-sm"
							>
								{href ? (
									<a
										href={href}
										target="_blank"
										rel="noopener noreferrer"
										className="block size-full cursor-pointer transition-opacity hover:opacity-90"
									>
										{img}
									</a>
								) : (
									img
								)}
							</article>
						);
					})}
				</div>
			) : (
				<article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sky-100 bg-[#e8f3fb] shadow-soft-sm">
					<div className="relative min-h-[168px] flex-1">
						<img
							src={FALLBACK_BANNER}
							alt="Ilustrasi pembayaran supplier dengan kartu korporat BCA Visa"
							className="absolute inset-0 size-full object-cover object-right"
						/>
						<div className="absolute inset-0 bg-gradient-to-r from-[#d7ebf8] via-[#d7ebf8]/88 to-transparent" />
						<div className="relative flex h-full min-h-[140px] flex-col justify-between p-4">
							<p className="text-[11px] font-bold tracking-wide text-[#0b3a73]">
								PAPER <span className="font-medium text-[#0b3a73]/50">|</span> ocean{' '}
								<span className="text-[10px] font-semibold">by BCA</span>{' '}
								<span className="font-medium text-[#0b3a73]/50">|</span> VISA
							</p>
							<div>
								<p className="max-w-[16rem] text-lg font-extrabold leading-tight tracking-tight text-[#0b2a4a]">
									Bayar Supplier, Diskon 0,5%
								</p>
								<p className="mt-1 max-w-[15rem] text-2xl font-extrabold leading-none tracking-tight text-[#0b2a4a]">
									Hemat hingga
								</p>
								<p className="mt-1 flex items-center gap-2 text-3xl font-extrabold tracking-tight text-[#0b2a4a]">
									<span className="inline-flex size-8 items-center justify-center rounded-full bg-[#0b2a4a] text-xs font-bold text-white">
										Rp
									</span>
									1,2 Juta!
								</p>
								<p className="mt-3 max-w-[15rem] text-[11px] font-medium leading-snug text-[#163a5f]">
									Promo khusus pembayaran dengan BCA Visa Corporate Card melalui akses Paper di Ocean by BCA.
								</p>
							</div>
							<div>
								<div className="flex max-w-[17rem] overflow-hidden rounded-lg bg-[#0b3a73] text-white shadow-soft-sm">
									<div className="flex w-[4.6rem] items-center justify-center border-r border-dashed border-white/30 px-2 py-2 text-center text-[10px] font-bold leading-tight">
										{t('dash.promo.code')}
									</div>
									<div className="flex flex-1 items-center justify-between gap-2 px-3 py-2">
										<p className="text-sm font-extrabold tracking-wide">{PROMO_CODE}</p>
										<button
											type="button"
											onClick={copyCode}
											className="inline-flex min-h-9 items-center gap-1 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold hover:bg-white/25"
										>
											{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
											{copied ? t('dash.promo.copied') : t('dash.promo.copy')}
										</button>
									</div>
								</div>
								<p className="mt-2 text-[11px] font-semibold text-[#163a5f]">
									{t('dash.promo.period')}
								</p>
							</div>
						</div>
					</div>
					<p className="border-t border-sky-100 bg-white px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
						Penawaran dari Paper di Ocean by BCA, bukan produk Catet Pajak. BCA berizin dan diawasi oleh Otoritas Jasa Keuangan &amp; Bank Indonesia. BCA merupakan peserta penjaminan LPS bca.co.id.
					</p>
				</article>
			)}

			{showAll && !hasUploadedPromos ? (
				<>
				<ul className="space-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs leading-relaxed text-foreground">
					<li>Diskon 0,5% untuk pembayaran supplier dengan BCA Visa Corporate Card.</li>
					<li>Penghematan yang ditampilkan hingga Rp1,2 juta.</li>
					<li>Gunakan kode {PROMO_CODE}. Berlaku sampai 31 Desember 2026.</li>
					<li>Informasi ini bersifat promosi pihak ketiga dan tidak mengubah data akuntansi Anda.</li>
				</ul>

				<section className="rounded-2xl bg-[#0b3d66] px-4 py-4 text-center text-white shadow-soft-sm">
				<p className="text-sm font-bold leading-snug">
					Dapatkan PAPER <span className="rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-extrabold text-[#0b3d66]">PLUS</span>{' '}
					(biaya transaksi lebih murah <span className="text-sky-200">1,9%</span>{' '}
					<span className="text-emerald-300">1,5%</span>) Dalam 3 bulan!
				</p>
				<p className="mt-1 text-[11px] leading-relaxed text-sky-100">
					Selesaikan misi dan nikmati benefitnya. Promo Paper by Ocean by BCA tetap berlaku sampai 31 Desember 2026.
				</p>
				<p className="mt-3 text-xs font-semibold text-sky-100">
					{clock.ended ? t('dash.promo.ended') : t('dash.promo.ends_in')}
				</p>
				{clock.ended ? null : (
					<div className="mt-2 flex items-start justify-center gap-2">
						{[
							[t('dash.promo.days'), clock.days],
							[t('dash.promo.hours'), clock.hours],
							[t('dash.promo.minutes'), clock.minutes],
							[t('dash.promo.seconds'), clock.seconds],
						].map(([label, value], index) => (
							<div key={label} className="flex items-start gap-2">
								{index > 0 ? <span className="pt-1 text-sm font-bold text-sky-200">:</span> : null}
								<div>
									<span className="inline-flex min-w-9 items-center justify-center rounded-md bg-[#f97316] px-2 py-1 text-sm font-extrabold tabular-nums">
										{pad(Number(value))}
									</span>
									<p className="mt-1 text-[10px] text-sky-100">{label}</p>
								</div>
							</div>
						))}
					</div>
				)}
				</section>
				</>
			) : null}
		</aside>
	);
}
