import type { Route } from './+types/akuntan.profil-detail';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { AkuntanShell } from '@/components/akuntan/akuntan-shell';
import { ProfileDetailStudio } from '@/components/akuntan/profile-detail-studio';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Profile Detail Akuntan — Catet Akuntan',
			description:
				'Perbarui judul profil, lokasi layanan, mode layanan, keunggulan, deskripsi, pendidikan, dan riwayat pekerjaan.',
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

export default function AkuntanProfilDetail() {
	return (
		<AkuntanShell>
			<ProfileDetailStudio />
		</AkuntanShell>
	);
}
