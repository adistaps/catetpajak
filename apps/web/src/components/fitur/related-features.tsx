import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import type { FeaturePage } from '@/data/feature-pages';

export function RelatedFeatures({ related }: { related: FeaturePage[] }) {
	if (related.length === 0) return null;

	return (
		<section className="border-t border-border/70 bg-white px-5 py-12 md:px-8 md:py-16">
			<div className="mx-auto max-w-6xl">
				<h2 className="text-lg font-extrabold tracking-tight text-foreground">
					Jelajahi fitur lainnya
				</h2>
				<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{related.map(page => (
						<Link
							key={page.slug}
							to={`/fitur/${page.slug}`}
							className="group flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3.5 transition-colors hover:border-primary/30 hover:bg-accent"
						>
							<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-soft-sm">
								<page.icon className="size-[18px]" strokeWidth={1.75} />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-[14px] font-semibold leading-tight text-foreground group-hover:text-primary">
									{page.title}
								</span>
								<span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
									{page.group}
								</span>
							</span>
							<ArrowRight
								className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
								strokeWidth={2}
							/>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}
