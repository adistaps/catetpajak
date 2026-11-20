import { useState } from 'react';
import type { Route } from './+types/akuntan';
import { seo } from '@/lib/seo';
import { AkuntanShell } from '@/components/akuntan/akuntan-shell';
import { AkuntanHero } from '@/components/akuntan/akuntan-hero';
import { AkuntanDirectory } from '@/components/akuntan/akuntan-directory';
import { Link } from 'react-router';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Catet Akuntan — Direktori jasa akuntan',
			description:
				'Temukan akuntan Indonesia. Jelajahi profil tanpa login. Akuntan masuk lewat aplikasi Catet Akuntan untuk menayangkan nama CV, foto, dan layanan.',
		},
	);
}

export default function Akuntan() {
	const [query, setQuery] = useState('');
	const [applied, setApplied] = useState('');

	return (
		<AkuntanShell>
			<main>
				<AkuntanHero
					query={query}
					onQueryChange={setQuery}
					onSearch={() => setApplied(query)}
					onPickService={service => {
						setQuery(service);
						setApplied(service);
					}}
				/>
				<AkuntanDirectory refreshToken={0} query={applied} />
				<section className="mx-auto mb-16 max-w-6xl px-5 md:px-8">
					<div className="flex flex-col items-start justify-between gap-4 rounded-[1.6rem] bg-[#102a4c] px-6 py-8 text-white sm:flex-row sm:items-center md:px-10">
						<div>
							<h2 className="text-2xl font-extrabold tracking-tight">Tawarkan jasa akuntan Anda</h2>
							<p className="mt-2 max-w-xl text-sm text-white/75">
								Daftar sebagai Akuntan untuk menayangkan profil, foto, dan nama CV Anda — atau sebagai Pencari Akuntan untuk menemukan akuntan yang tepat.
							</p>
						</div>
						<Link
							to="/akuntan/masuk?mode=daftar"
							className="inline-flex h-11 items-center rounded-full bg-emerald-400 px-5 text-sm font-semibold text-[#102a4c] hover:bg-emerald-300"
						>
							Daftar sekarang
						</Link>
					</div>
				</section>
			</main>
		</AkuntanShell>
	);
}
