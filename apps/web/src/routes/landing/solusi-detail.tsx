import type { Route } from './+types/solusi-detail';
import { seo, siteOriginFrom, absoluteUrl } from '@/lib/seo';
import { getIndustrySolution } from '@/data/industry-solutions';
import { SiteHeader } from '@/components/home/site-header';
import { SolutionHero } from '@/components/solusi/solution-hero';
import { SolutionBenefits } from '@/components/solusi/solution-benefits';
import { SolutionFlow } from '@/components/solusi/solution-flow';
import { SolutionCta } from '@/components/solusi/solution-cta';
import { SchoolPortalShowcase } from '@/components/solusi/school-portal-showcase';
import { FoundationReportShowcase } from '@/components/solusi/foundation-report-showcase';

export function loader({ params }: Route.LoaderArgs) {
	if (!getIndustrySolution(params.slug)) {
		throw new Response('Solusi tidak ditemukan', { status: 404 });
	}
	return { slug: params.slug };
}

export function meta({ matches, location, loaderData }: Route.MetaArgs) {
	const solution = loaderData ? getIndustrySolution(loaderData.slug) : undefined;
	const origin = siteOriginFrom(matches);
	const url = absoluteUrl(origin, location.pathname);

	return seo(
		{ matches, location },
		{
			title: solution
				? `${solution.title} — Software Akuntansi untuk Bisnis ${solution.title} | Catet Pajak`
				: 'Solusi tidak ditemukan — Catet Pajak',
			description: solution
				? `${solution.tagline} ${solution.description}`
				: 'Halaman solusi industri Catet Pajak tidak ditemukan.',
			jsonLd: solution
				? [
						{
							'@context': 'https://schema.org',
							'@type': 'Service',
							name: `Catet Pajak untuk ${solution.title}`,
							serviceType: solution.tagline,
							description: solution.description,
							url,
							provider: {
								'@type': 'Organization',
								name: 'PT Catet Pajak Indonesia',
							},
							areaServed: 'ID',
						},
						{
							'@context': 'https://schema.org',
							'@type': 'BreadcrumbList',
							itemListElement: [
								{ '@type': 'ListItem', position: 1, name: 'Beranda', item: absoluteUrl(origin, '/') },
								{ '@type': 'ListItem', position: 2, name: 'Solusi Industri', item: absoluteUrl(origin, '/#solusi') },
								{ '@type': 'ListItem', position: 3, name: solution.title, item: url },
							],
						},
					]
				: undefined,
		},
	);
}

export default function SolusiDetail({ loaderData }: Route.ComponentProps) {
	const solution = getIndustrySolution(loaderData.slug);
	if (!solution) return null;

	return (
		<main className="bg-background text-foreground">
			<SiteHeader />
			<SolutionHero solution={solution} />
			<SolutionBenefits solution={solution} />
			{solution.slug === 'sekolah' ? <SchoolPortalShowcase /> : null}
			{solution.slug === 'yayasan' ? <FoundationReportShowcase /> : null}
			<SolutionFlow solution={solution} />
			<SolutionCta solution={solution} />
		</main>
	);
}
