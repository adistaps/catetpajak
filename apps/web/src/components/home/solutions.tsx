import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { INDUSTRY_SOLUTIONS } from '@/data/industry-solutions';

export function Solutions() {
	return (
		<section id="solusi" className="bg-white px-5 py-16 md:px-8 md:py-20">
			<div className="mx-auto max-w-6xl">
				<div className="max-w-2xl">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
						Solusi Industri
					</p>
					<h2 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
						Cocok untuk dagang, jasa, sekolah, hingga yayasan
					</h2>
					<p className="mt-3 text-sm text-muted-foreground md:text-base">
						Catet Pajak menyesuaikan alur pembukuan bisnis dengan kebutuhan tiap industri —
						dari persediaan dagang hingga laporan keuangan yayasan.
					</p>
				</div>

				<div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{INDUSTRY_SOLUTIONS.map(solution => (
						<Link
							key={solution.slug}
							to={`/solusi/${solution.slug}`}
							className="group flex flex-col rounded-2xl border border-border bg-secondary/40 p-6 transition-colors hover:border-primary/30 hover:bg-accent"
						>
							<span className="flex size-11 items-center justify-center rounded-xl bg-white text-primary shadow-soft-sm">
								<solution.icon className="size-5" strokeWidth={1.75} />
							</span>
							<h3 className="mt-4 text-base font-bold text-foreground group-hover:text-primary">
								{solution.title}
							</h3>
							<p className="mt-1.5 flex-1 text-[13px] leading-snug text-muted-foreground">
								{solution.tagline}
							</p>
							<span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
								Pelajari solusi
								<ArrowRight
									className="size-3.5 transition-transform group-hover:translate-x-0.5"
									strokeWidth={2}
								/>
							</span>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}
