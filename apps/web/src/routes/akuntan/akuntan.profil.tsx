import { Link } from 'react-router';
import type { Route } from './+types/akuntan.profil';
import { seo } from '@/lib/seo';
import { getAkuntanProfile } from '@/lib/akuntan';
import { ProfileDetail } from '@/components/akuntan/profile-detail';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Profil akuntan — Catet Akuntan',
			description:
				'Lihat detail profil jasa akuntan: layanan, lokasi, keunggulan, pendidikan, dan riwayat pekerjaan.',
		},
	);
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
	const profile = await getAkuntanProfile(params.id);
	return { profile };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return (
		<div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
			<div className="h-96 animate-pulse rounded-2xl bg-emerald-50" />
		</div>
	);
}

export default function AkuntanProfil({ loaderData }: Route.ComponentProps) {
	if (!loaderData.profile) {
		return (
			<main className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8">
				<h1 className="text-2xl font-extrabold tracking-tight text-[#111]">Profil tidak ditemukan</h1>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
					Profil akuntan ini sudah tidak tersedia di direktori Catet Akuntan.
				</p>
				<Link
					to="/akuntan"
					className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft-sm transition hover:brightness-110 active:scale-[0.99]"
				>
					Kembali ke direktori akuntan
				</Link>
			</main>
		);
	}
	return <ProfileDetail profile={loaderData.profile} />;
}
