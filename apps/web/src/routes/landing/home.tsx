import type { Route } from './+types/home';
import { seo, siteOriginFrom, absoluteUrl } from '@/lib/seo';
import { FAQS } from '@/components/home/faq';
import { SiteHeader } from '@/components/home/site-header';
import { Hero } from '@/components/home/hero';
import { Features } from '@/components/home/features';
import { Benefits } from '@/components/home/benefits';
import { Solutions } from '@/components/home/solutions';
import { Results } from '@/components/home/results';
import { Pricing } from '@/components/home/pricing';
import { Faq } from '@/components/home/faq';
import { Cta } from '@/components/home/cta';

export function meta({ matches, location }: Route.MetaArgs) {
	const origin = siteOriginFrom(matches);
	const url = absoluteUrl(origin, location.pathname);

	return seo(
		{ matches, location },
		{
			title: 'Catet Pajak — Aplikasi Akuntansi, Pajak & Payroll All-in-One',
			description:
				'Aplikasi akuntansi & pembukuan bisnis all-in-one untuk UMKM: penjualan, pembelian, persediaan, aset, payroll, e-Bupot, dan laporan keuangan banyak perusahaan dalam satu platform.',
			jsonLd: [
				{
					'@context': 'https://schema.org',
					'@type': 'WebSite',
					name: 'Catet Pajak',
					url,
					description:
						'Aplikasi akuntansi, pajak, dan payroll all-in-one untuk pembukuan bisnis UMKM dan multi-perusahaan.',
					inLanguage: 'id-ID',
				},
				{
					'@context': 'https://schema.org',
					'@type': 'Organization',
					name: 'PT Catet Pajak Indonesia',
					url,
					description:
						'Penyedia aplikasi akuntansi, pajak, dan payroll untuk bisnis dagang, jasa, sekolah, dan yayasan.',
					email: 'info@catetpajak.com',
					address: {
						'@type': 'PostalAddress',
						streetAddress:
							'Infiniti Office, Arcade Business Center, 6th Floor, Unit 6-03, Jl. Pantai Indah Utara 2 Kav. C1, PIK',
						addressLocality: 'Kapuk Muara, Penjaringan, Jakarta Utara',
						addressRegion: 'DKI Jakarta',
						addressCountry: 'ID',
					},
				},
				{
					'@context': 'https://schema.org',
					'@type': 'FAQPage',
					mainEntity: FAQS.map(item => ({
						'@type': 'Question',
						name: item.q,
						acceptedAnswer: {
							'@type': 'Answer',
							text: item.a,
						},
					})),
				},
			],
		},
	);
}

export default function Home() {
	return (
		<main className="bg-background text-foreground">
			<SiteHeader variant="immersive" />
			<Hero />
			<Features />
			<Benefits />
			<Solutions />
			<Results />
			<Pricing />
			<Faq />
			<Cta />
		</main>
	);
}
