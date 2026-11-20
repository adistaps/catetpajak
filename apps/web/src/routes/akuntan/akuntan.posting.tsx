import type { Route } from './+types/akuntan.posting';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { AkuntanShell } from '@/components/akuntan/akuntan-shell';
import { PostingPage } from '@/components/akuntan/posting-page';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Buat posting — Catet Akuntan',
			description:
				'Buat posting aktivitas harian: caption, beberapa gambar sekaligus, pratinjau, dan mention pengguna.',
		},
	);
}

export function clientLoader() {
	return { user: requireAuth('/akuntan/masuk') };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-dvh bg-[#f7fbf8]" />;
}

export default function AkuntanPosting() {
	return (
		<AkuntanShell>
			<PostingPage />
		</AkuntanShell>
	);
}
