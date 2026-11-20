import type { Route } from './+types/akuntan.activity.$id';
import { seo } from '@/lib/seo';
import { ActivityPostDetail } from '@/components/akuntan/activity-post-detail';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Detail aktivitas — Catet Akuntan',
			description: 'Lihat posting aktivitas akuntan beserta komentar pada Catet Akuntan.',
		},
	);
}

export default function AkuntanActivityPost({ params }: Route.ComponentProps) {
	return <ActivityPostDetail id={params.id} />;
}
