import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Loader2, MapPin } from 'lucide-react';
import { fetchPublishedEvents, type EventMode, type WebinarEvent } from '@/data/events';
import { EventPoster } from '@/components/event/event-poster';
import { EventDetail } from '@/components/event/event-detail';
import { cn } from '@/lib/utils';

const MODE_FILTERS: { id: 'all' | EventMode; label: string }[] = [
	{ id: 'all', label: 'Semua' },
	{ id: 'online', label: 'Online' },
	{ id: 'onsite', label: 'Onsite' },
];

const PRICE_FILTERS: { id: 'free' | 'paid'; label: string }[] = [
	{ id: 'free', label: 'Gratis' },
	{ id: 'paid', label: 'Berbayar' },
];

export function EventBoard() {
	const [mode, setMode] = useState<(typeof MODE_FILTERS)[number]['id']>('all');
	const [pricing, setPricing] = useState<'all' | 'free' | 'paid'>('all');
	const [active, setActive] = useState<WebinarEvent | null>(null);
	const [events, setEvents] = useState<WebinarEvent[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError('');
		fetchPublishedEvents()
			.then(items => {
				if (!cancelled) setEvents(items);
			})
			.catch(() => {
				if (!cancelled) {
					setEvents([]);
					setError('Gagal memuat daftar event. Coba lagi beberapa saat.');
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const filtered = useMemo(
		() =>
			events.filter(event => {
				const modeMatch = mode === 'all' || event.mode === mode;
				const priceMatch = pricing === 'all' || event.pricing === pricing;
				return modeMatch && priceMatch;
			}),
		[events, mode, pricing],
	);

	return (
		<div>
			<div className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
				<div className="flex flex-wrap gap-2" role="group" aria-label="Filter tempat">
					{MODE_FILTERS.map(item => (
						<button
							key={item.id}
							type="button"
							onClick={() => setMode(item.id)}
							aria-pressed={mode === item.id}
							className={cn(
								'h-10 rounded-full px-4 text-sm font-semibold transition-colors',
								mode === item.id
									? 'bg-primary text-primary-foreground'
									: 'bg-white text-foreground ring-1 ring-border hover:bg-accent',
							)}
						>
							{item.label}
						</button>
					))}
				</div>
				<div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
				<div className="flex flex-wrap gap-2" role="group" aria-label="Filter biaya">
					{PRICE_FILTERS.map(item => (
						<button
							key={item.id}
							type="button"
							onClick={() => setPricing(current => (current === item.id ? 'all' : item.id))}
							aria-pressed={pricing === item.id}
							className={cn(
								'h-10 rounded-full px-4 text-sm font-semibold transition-colors',
								pricing === item.id
									? 'bg-primary text-primary-foreground'
									: 'bg-white text-foreground ring-1 ring-border hover:bg-accent',
							)}
						>
							{item.label}
						</button>
					))}
				</div>
			</div>

			{isLoading ? (
				<p className="flex items-center gap-2 rounded-2xl bg-white px-6 py-10 text-center text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat daftar event…
				</p>
			) : error ? (
				<p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center text-sm font-medium text-destructive">
					{error}
				</p>
			) : filtered.length === 0 ? (
				<p className="rounded-2xl bg-white px-6 py-10 text-center text-sm text-muted-foreground">
					Belum ada event pada kategori ini.
				</p>
			) : (
				<div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
					{filtered.map(event => (
						<article
							key={event.id}
							className="flex flex-col overflow-hidden rounded-[22px] bg-[#f3f5f7] p-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
						>
							<div className="overflow-hidden rounded-2xl bg-white shadow-sm">
								<EventPoster event={event} />
							</div>
							<div className="flex flex-1 flex-col px-2 pb-2 pt-4">
								<h2 className="line-clamp-2 text-[17px] font-semibold leading-snug text-[#1f2937]">
									{event.title}
								</h2>
								<ul className="mt-3 space-y-1.5 text-[14px] text-[#4b5563]">
									<li className="flex items-center gap-2">
										<CalendarDays className="size-4 shrink-0 text-[#6b7280]" strokeWidth={1.75} />
										{event.dateLabel}
									</li>
									<li className="flex items-center gap-2">
										<Clock className="size-4 shrink-0 text-[#6b7280]" strokeWidth={1.75} />
										{event.timeLabel}
									</li>
									<li className="flex items-start gap-2">
										<MapPin className="mt-0.5 size-4 shrink-0 text-[#6b7280]" strokeWidth={1.75} />
										<span>{event.venue}</span>
									</li>
								</ul>
								<button
									type="button"
									onClick={() => setActive(event)}
									className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
								>
									Daftar
								</button>
							</div>
						</article>
					))}
				</div>
			)}

			{active ? <EventDetail event={active} onClose={() => setActive(null)} /> : null}
		</div>
	);
}
