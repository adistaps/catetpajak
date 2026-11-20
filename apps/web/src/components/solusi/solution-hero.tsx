import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { IndustrySolution } from '@/data/industry-solutions';

export function SolutionHero({ solution }: { solution: IndustrySolution }) {
	return (
		<section className="hero-glow relative overflow-hidden px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-14">
			<div className="mx-auto max-w-4xl">
				<nav className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
					<Link to="/" className="transition-colors hover:text-primary">
						Beranda
					</Link>
					<ChevronRight className="size-3.5" strokeWidth={2} />
					<span className="text-muted-foreground">Solusi Industri</span>
					<ChevronRight className="size-3.5" strokeWidth={2} />
					<span className="text-foreground">{solution.title}</span>
				</nav>

				<div className="mt-8 flex flex-col items-start gap-6 md:flex-row md:items-center md:gap-8">
					<div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-white shadow-soft-sm md:size-20">
						<solution.icon className="size-8 text-primary md:size-10" strokeWidth={1.5} />
					</div>
					<div className="min-w-0">
						<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
							{solution.group}
						</p>
						<h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
							{solution.title}
						</h1>
						<p className="mt-3 text-base font-medium text-foreground/80 md:text-lg">
							{solution.tagline}
						</p>
					</div>
				</div>

				<p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
					{solution.description}
				</p>

				<div className="mt-8 flex flex-wrap items-center gap-3">
					<Link
						to="/login"
						className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
					>
						Mulai gratis sekarang
					</Link>
					<Link
						to="/plans"
						className="inline-flex min-h-11 items-center justify-center rounded-full border border-primary/30 bg-white px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-accent"
					>
						Lihat harga
					</Link>
				</div>
			</div>
		</section>
	);
}
