import { Link } from 'react-router';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIERS = [
	{
		name: 'Starter',
		price: 'Gratis',
		period: 'selamanya',
		blurb: 'Untuk mulai mencatat pembukuan tanpa biaya.',
		features: ['Fitur akuntansi', 'Maksimal 10 invoice per bulan', 'Multi-perusahaan dasar'],
		cta: 'Mulai gratis',
		href: '/login?mode=signup&plan=starter',
		featured: false,
	},
	{
		name: 'Pro',
		price: 'Rp 299rb',
		period: 'per bulan',
		blurb: 'Akuntansi, pajak, dan payroll untuk tim yang sedang tumbuh.',
		features: [
			'Aplikasi akuntansi, pajak, dan payroll',
			'Maksimal 10 karyawan',
			'e-Bupot, PPh 21, dan laporan fiskal',
		],
		cta: 'Pilih Pro',
		href: '/login?mode=signup&plan=pro',
		featured: true,
	},
	{
		name: 'Enterprise',
		price: 'Rp 499rb',
		period: 'per bulan',
		blurb: 'Semua fitur, untuk operasional yang lebih besar.',
		features: ['Semua fitur aplikasi', 'Maksimal 20 karyawan', 'Prioritas dukungan'],
		cta: 'Pilih Enterprise',
		href: '/login?mode=signup&plan=enterprise',
		featured: false,
	},
];

export function Pricing() {
	return (
		<section id="harga" className="bg-white px-5 py-20 md:px-8 md:py-24">
			<div className="mx-auto max-w-6xl">
				<p className="text-center text-[11px] font-semibold uppercase tracking-wide text-primary">
					Harga
				</p>
				<h2 className="mt-3 text-center text-3xl font-extrabold tracking-tight md:text-4xl">
					Pilih paket yang sesuai skala usaha
				</h2>
				<p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground md:text-base">
					Mulai gratis dengan akuntansi, lalu naik ke Pro atau Enterprise saat pajak dan payroll dibutuhkan.
				</p>

				<div className="mt-12 grid gap-5 md:grid-cols-3">
					{TIERS.map(tier => (
						<article
							key={tier.name}
							className={cn(
								'flex flex-col rounded-3xl border bg-card p-7',
								tier.featured
									? 'border-primary shadow-soft ring-1 ring-primary/30'
									: 'border-border shadow-soft-sm',
							)}
						>
							<div className="flex items-center justify-between gap-3">
								<h3 className="text-lg font-extrabold tracking-tight">{tier.name}</h3>
								{tier.featured ? (
									<span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
										Paling dipilih
									</span>
								) : null}
							</div>
							<p className="mt-2 min-h-10 text-sm text-muted-foreground">{tier.blurb}</p>
							<p className="mt-5 text-3xl font-extrabold tracking-tight">{tier.price}</p>
							<p className="mt-1 text-xs font-medium text-muted-foreground">{tier.period}</p>
							<ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
								{tier.features.map(feature => (
									<li key={feature} className="flex items-start gap-2.5">
										<Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={3} />
										<span>{feature}</span>
									</li>
								))}
							</ul>
							<Link
								to={tier.href}
								className={cn(
									'mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0',
									tier.featured
										? 'bg-primary text-primary-foreground shadow-soft-sm'
										: 'border border-primary/30 bg-white text-primary hover:bg-accent',
								)}
							>
								{tier.cta}
							</Link>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
