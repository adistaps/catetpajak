import type { Route } from './+types/akuntan.activity';
import { seo } from '@/lib/seo';
import { AkuntanShell } from '@/components/akuntan/akuntan-shell';
import { ActivityFeed } from '@/components/akuntan/activity-feed';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Activity Akuntan — Catet Akuntan',
			description:
				'Feed aktivitas harian para akuntan: postingan teks dan gambar terbaru dari seluruh akuntan di direktori Catet Akuntan.',
		},
	);
}

export default function AkuntanActivity() {
	return (
		<AkuntanShell>
			<main className="mx-auto max-w-6xl bg-white px-4 pb-12 sm:px-6">
				<ActivityFeed />
			</main>
		</AkuntanShell>
	);
}
