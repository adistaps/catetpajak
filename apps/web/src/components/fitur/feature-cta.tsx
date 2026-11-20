import { Link } from 'react-router';
import type { FeaturePage } from '@/data/feature-pages';

export function FeatureCta({ feature }: { feature: FeaturePage }) {
	return (
		<section className="bg-white px-5 py-14 md:px-8 md:py-20">
			<div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-primary/20 bg-[#f0faf5] px-6 py-10 text-center shadow-soft md:px-10 md:py-12">
				<h2 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
					Mulai pakai {feature.title} hari ini
				</h2>
				<p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
					Buat akun gratis dan coba semua fitur Catet Pajak selama masa uji coba — tanpa kartu
					kredit, tanpa komitmen.
				</p>
				<div className="mt-7 flex flex-wrap items-center justify-center gap-3">
					<Link
						to="/login"
						className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						Mulai gratis sekarang
					</Link>
					<Link
						to="/plans"
						className="inline-flex items-center justify-center rounded-full border border-primary/30 bg-white px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-accent"
					>
						Kembali ke halaman harga
					</Link>
				</div>
			</div>
		</section>
	);
}
