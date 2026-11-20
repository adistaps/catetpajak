import type { Route } from './+types/akuntan.dasbor';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { Link } from 'react-router';
import { UserRound } from 'lucide-react';
import { AkuntanShell } from '@/components/akuntan/akuntan-shell';
import { ProfileManager } from '@/components/akuntan/profile-manager';
import { PencariNotice } from '@/components/akuntan/pencari-notice';
import { CvRequestsPanel } from '@/components/akuntan/cv-requests-panel';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Dasbor profil — Catet Akuntan',
			description: 'Kelola profil akuntan Anda: nama, nama CV, foto, kota, telepon, dan deskripsi layanan.',
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

export default function AkuntanDasbor() {
	return (
		<AkuntanShell>
			<main className="mx-auto max-w-3xl px-5 py-8 md:px-8">
				<p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Aplikasi akuntan</p>
				<h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#102a4c]">Dasbor profil</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Lengkapi profil agar tampil di direktori publik. Pengunjung dapat melihatnya tanpa masuk.
				</p>
				<PencariNotice />
				<Link
					to="/akuntan/profil-detail"
					className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-white px-5 py-4 shadow-soft-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
				>
					<span className="flex items-center gap-3">
						<span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
							<UserRound className="size-5" strokeWidth={1.75} />
						</span>
						<span>
							<span className="block text-sm font-bold text-[#102a4c]">Profile Detail Akuntan</span>
							<span className="mt-0.5 block text-xs text-muted-foreground">
								Ubah judul, lokasi, mode layanan, keunggulan, dan data profil publik.
							</span>
						</span>
					</span>
					<span className="shrink-0 text-sm font-semibold text-emerald-700">Buka</span>
				</Link>
				<ProfileManager onSaved={() => undefined} embedded />
				<CvRequestsPanel />
			</main>
		</AkuntanShell>
	);
}
