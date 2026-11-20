import type { FeaturePage } from '@/data/feature-pages';

export function FeatureCapabilities({ feature }: { feature: FeaturePage }) {
	return (
		<section className="bg-[#f0f2f5] px-5 py-14 md:px-8 md:py-20">
			<div className="mx-auto max-w-4xl">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
					Alur & kemampuan
				</p>
				<h2 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
					Cara kerjanya di dalam aplikasi
				</h2>

				<ol className="mt-10 flex flex-col">
					{feature.capabilities.map((capability, index) => (
						<li
							key={capability.title}
							className="relative flex gap-5 pb-8 last:pb-0 md:gap-7"
						>
							{index < feature.capabilities.length - 1 ? (
								<span
									aria-hidden
									className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-primary/20 md:left-[19px]"
								/>
							) : null}
							<span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-white text-[13px] font-bold text-primary shadow-soft-sm md:size-10">
								{index + 1}
							</span>
							<div className="min-w-0 pt-0.5">
								<h3 className="text-base font-bold leading-snug text-foreground">
									{capability.title}
								</h3>
								<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
									{capability.text}
								</p>
							</div>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
