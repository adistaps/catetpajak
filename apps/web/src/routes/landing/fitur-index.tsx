import { Link } from 'react-router';
import type { Route } from './+types/fitur-index';
import { seo, siteOriginFrom, absoluteUrl } from '@/lib/seo';
import { FEATURE_PAGES } from '@/data/feature-pages';
import { SiteHeader } from '@/components/home/site-header';

const GROUP_ORDER = [
	'Dokumen Bisnis',
	'Kas & Persediaan',
	'SDM & Penggajian',
	'Pajak & Laporan',
	'Lainnya',
];

export function meta({ matches, location }: Route.MetaArgs) {
	const origin = siteOriginFrom(matches);
	const url = absoluteUrl(origin, location.pathname);

	return seo(
		{ matches, location },
		{
			title: 'Semua Fitur Aplikasi Akuntansi — Catet Pajak',
			description:
				'Jelajahi semua fitur aplikasi akuntansi Catet Pajak: penjualan, pembelian, kas & bank, persediaan, gudang, penggajian, absensi, cuti & lembur, pajak, e-Bupot, laporan keuangan, dan aset tetap.',
			jsonLd: {
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: 'Semua Fitur Aplikasi Akuntansi Catet Pajak',
				url,
				description:
					'Daftar lengkap fitur aplikasi akuntansi, pajak, dan payroll Catet Pajak untuk pembukuan bisnis UMKM.',
			},
		},
	);
}

export default function FiturIndex() {
	const groups = GROUP_ORDER.map(group => ({
		group,
		pages: FEATURE_PAGES.filter(page => page.group === group),
	})).filter(entry => entry.pages.length > 0);

	return (
		<main className="bg-background text-foreground">
			<SiteHeader />
			<section className="hero-glow px-5 pb-12 pt-10 md:px-8 md:pb-16 md:pt-14">
				<div className="mx-auto max-w-4xl text-center">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
						Fitur
					</p>
					<h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
						Semua yang dibutuhkan bisnis Anda
					</h1>
					<p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
						Akuntansi, dokumen bisnis, kas, persediaan, SDM, pajak, dan laporan — saling
						terhubung dalam satu aplikasi. Pilih fitur untuk mempelajarinya lebih lanjut.
					</p>
				</div>
			</section>

			<section className="bg-white px-5 py-12 md:px-8 md:py-16">
				<div className="mx-auto max-w-6xl flex flex-col gap-10">
					{groups.map(entry => (
						<div key={entry.group}>
							<h2 className="text-lg font-extrabold tracking-tight text-foreground">
								{entry.group}
							</h2>
							<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{entry.pages.map(page => (
									<Link
										key={page.slug}
										to={`/fitur/${page.slug}`}
										className="group flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-4 transition-colors hover:border-primary/30 hover:bg-accent"
									>
										<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-soft-sm">
											<page.icon className="size-[18px]" strokeWidth={1.75} />
										</span>
										<span className="min-w-0">
											<span className="block text-[15px] font-bold leading-tight text-foreground group-hover:text-primary">
												{page.title}
											</span>
											<span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
												{page.tagline}
											</span>
										</span>
									</Link>
								))}
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="bg-white px-5 pb-14 md:px-8 md:pb-20">
				<div className="mx-auto max-w-4xl rounded-3xl border border-primary/20 bg-[#f0faf5] px-6 py-10 text-center shadow-soft md:px-10">
					<h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
						Coba semuanya secara gratis
					</h2>
					<p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
						Buat akun gratis dan coba seluruh fitur Catet Pajak selama masa uji coba.
					</p>
					<div className="mt-7 flex flex-wrap items-center justify-center gap-3">
						<Link
							to="/login"
							className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
						>
							Mulai gratis sekarang
						</Link>
						<Link
							to="/plans"
							className="inline-flex items-center justify-center rounded-full border border-primary/30 bg-white px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-accent"
						>
							Lihat harga
						</Link>
					</div>
				</div>
			</section>
		</main>
	);
}
