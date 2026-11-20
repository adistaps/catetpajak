import type { Route } from './+types/fitur-detail';
import { seo, siteOriginFrom, absoluteUrl } from '@/lib/seo';
import { getFeaturePage, getRelatedFeatures } from '@/data/feature-pages';
import { SiteHeader } from '@/components/home/site-header';
import { FeatureHero } from '@/components/fitur/feature-hero';
import { FeatureBenefits } from '@/components/fitur/feature-benefits';
import { FeatureCapabilities } from '@/components/fitur/feature-capabilities';
import { SalesPaymentTerms } from '@/components/fitur/sales-payment-terms';
import { PayrollShowcase } from '@/components/fitur/payroll-showcase';
import { AttendanceShowcase } from '@/components/fitur/attendance-showcase';
import { FeatureCta } from '@/components/fitur/feature-cta';
import { RelatedFeatures } from '@/components/fitur/related-features';

export function loader({ params }: Route.LoaderArgs) {
	if (!getFeaturePage(params.slug)) {
		throw new Response('Fitur tidak ditemukan', { status: 404 });
	}
	return { slug: params.slug };
}

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
	const feature = loaderData ? getFeaturePage(loaderData.slug) : undefined;
	const origin = siteOriginFrom(matches);
	const url = absoluteUrl(origin, location.pathname);

	return seo(
		{ matches, location },
		{
			title: feature
				? `${feature.title} — Fitur Aplikasi Akuntansi Catet Pajak`
				: 'Fitur tidak ditemukan — Catet Pajak',
			description: feature
				? `${feature.tagline} ${feature.description}`
				: 'Halaman fitur Catet Pajak tidak ditemukan.',
			jsonLd: feature
				? [
						{
							'@context': 'https://schema.org',
							'@type': 'SoftwareApplication',
							name: `Catet Pajak — ${feature.title}`,
							applicationCategory: 'BusinessApplication',
							operatingSystem: 'Web',
							description: feature.description,
							url,
							offers: {
								'@type': 'Offer',
								price: '0',
								priceCurrency: 'IDR',
							},
						},
						{
							'@context': 'https://schema.org',
							'@type': 'BreadcrumbList',
							itemListElement: [
								{ '@type': 'ListItem', position: 1, name: 'Beranda', item: absoluteUrl(origin, '/') },
								{ '@type': 'ListItem', position: 2, name: 'Fitur', item: absoluteUrl(origin, '/fitur') },
								{ '@type': 'ListItem', position: 3, name: feature.title, item: url },
							],
						},
					]
				: undefined,
		},
	);
}

export default function FiturDetail({ loaderData }: Route.ComponentProps) {
	const feature = getFeaturePage(loaderData.slug);
	if (!feature) return null;

	return (
		<main className="bg-background text-foreground">
			<SiteHeader />
			<FeatureHero feature={feature} />
			<FeatureBenefits feature={feature} />
			{feature.slug === 'penjualan' ? <SalesPaymentTerms /> : null}
			{feature.slug === 'penggajian' ? <PayrollShowcase /> : null}
			{feature.slug === 'absensi' ? <AttendanceShowcase /> : null}
			<FeatureCapabilities feature={feature} />
			<FeatureCta feature={feature} />
			<RelatedFeatures related={getRelatedFeatures(feature.slug)} />
		</main>
	);
}
