import type { Route } from './+types/event';
import { seo, siteOriginFrom, absoluteUrl } from '@/lib/seo';
import { SiteHeader } from '@/components/home/site-header';
import { Cta } from '@/components/home/cta';
import { EventBoard } from '@/components/event/event-board';

export function meta({ matches, location }: Route.MetaArgs) {
	const origin = siteOriginFrom(matches);
	const url = absoluteUrl(origin, location.pathname);

	return seo(
		{ matches, location },
		{
			title: 'Event & Webinar Pajak Akuntansi — Catet Pajak',
			description:
				'Daftar webinar dan kelas pajak Catet Pajak: Coretax, Global Minimum Tax, dan masterclass akuntansi pajak. Pendaftaran online maupun onsite untuk praktisi pembukuan bisnis.',
			jsonLd: {
				'@context': 'https://schema.org',
				'@type': 'BreadcrumbList',
				itemListElement: [
					{ '@type': 'ListItem', position: 1, name: 'Beranda', item: absoluteUrl(origin, '/') },
					{ '@type': 'ListItem', position: 2, name: 'Event', item: url },
				],
			},
		},
	);
}

export default function EventPage() {
	return (
		<main className="min-h-[100dvh] bg-[#eef2f5] text-foreground">
			<SiteHeader />
			<section className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:px-8 md:pt-14">
				<p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Event</p>
				<h1 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-[#122033] md:text-4xl">
					Webinar & kelas yang bisa langsung didaftar
				</h1>
				<p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
					Pilih acara, lihat jadwal dan tempatnya, lalu daftar. Konfirmasi dikirim ke email yang Anda isi.
				</p>
				<div className="mt-8">
					<EventBoard />
				</div>
			</section>
			<Cta />
		</main>
	);
}
