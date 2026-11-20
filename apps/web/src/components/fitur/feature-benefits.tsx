import { Check } from 'lucide-react';
import type { FeaturePage } from '@/data/feature-pages';

export function FeatureBenefits({ feature }: { feature: FeaturePage }) {
	return (
		<section className="bg-white px-5 py-14 md:px-8 md:py-20">
			<div className="mx-auto max-w-6xl">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
					Manfaat utama
				</p>
				<h2 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
					Kenapa {feature.title} di Catet Pajak?
				</h2>

				<div className="mt-10 grid gap-5 md:grid-cols-3">
					{feature.benefits.map((benefit, index) => (
						<article
							key={benefit.title}
							className="rounded-2xl border border-border bg-secondary/40 p-6 shadow-soft-sm"
						>
							<span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">
								{index + 1}
							</span>
							<h3 className="mt-4 text-base font-bold leading-snug text-foreground">
								{benefit.title}
							</h3>
							<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
								{benefit.text}
							</p>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
