import { Mic } from 'lucide-react';
import type { WebinarEvent } from '@/data/events';
import { cn } from '@/lib/utils';

export function EventPoster({ event }: { event: WebinarEvent }) {
	if (event.accent === 'cream') return <CreamPoster event={event} />;
	if (event.accent === 'maroon') return <MaroonPoster event={event} />;
	return <NavyPoster event={event} />;
}

function NavyPoster({ event }: { event: WebinarEvent }) {
	return (
		<div className="relative aspect-[3/4] overflow-hidden bg-[#12315c] text-white">
			<div className="absolute inset-0 bg-[linear-gradient(160deg,#1a4a86_0%,#0d2748_55%,#08182e_100%)]" />
			<div className="absolute -right-8 top-16 h-40 w-40 rounded-full bg-white/10" />
			<div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.35))]" />
			<div className="relative flex h-full flex-col p-3.5">
				<div className="flex items-start justify-between gap-2">
					<span className="text-[11px] font-extrabold tracking-tight text-white">
						Catet <span className="text-emerald-300">Pajak</span>
					</span>
					<span className="rounded-md bg-[#e23b2f] px-2 py-1 text-[9px] font-bold uppercase tracking-wide">
						{event.badge} · Hot offer
					</span>
				</div>
				<p className="mt-3 text-[13px] font-extrabold leading-snug text-[#ff5a4f]">{event.kicker}</p>
				<p className="mt-1 text-[12px] font-bold leading-snug">{event.headline}</p>
				<p className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-sky-200">Materi pembahasan</p>
				<ul className="mt-1 space-y-0.5 text-[9px] leading-snug text-sky-50/90">
					{event.topics.map(topic => (
						<li key={topic}>• {topic}</li>
					))}
				</ul>
				<div className="mt-auto grid grid-cols-2 gap-1.5 pt-3 text-[9px]">
					{event.speakers.map(speaker => (
						<div key={speaker.name} className="rounded-md bg-white/10 p-1.5">
							<p className="font-bold">{speaker.name}</p>
							<p className="text-sky-100/80">{speaker.role}</p>
						</div>
					))}
				</div>
				<div className="mt-2 rounded-md bg-[#0b2140]/80 p-2 text-[10px]">
					<p className="font-semibold">{event.dateLabel}</p>
					<p>{event.timeLabel}</p>
					<p className="text-sky-100/80">{event.venue}</p>
				</div>
			</div>
		</div>
	);
}

function CreamPoster({ event }: { event: WebinarEvent }) {
	return (
		<div className="relative aspect-[3/4] overflow-hidden bg-[#f6efe2] text-[#1c2430]">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,#fff7ea,transparent_45%),linear-gradient(180deg,#f8f1e4,#efe4cf)]" />
			<div className="relative flex h-full flex-col p-3.5">
				<div className="flex justify-center">
					<span className="rounded-full border border-[#1d4f86] px-3 py-1 text-[10px] font-bold text-[#1d4f86]">
						{event.badge} Catet Pajak
					</span>
				</div>
				<p className="mt-3 text-center text-[15px] font-extrabold text-[#1d4ed8]">{event.kicker}</p>
				<p className="mt-2 text-center text-[12px] font-extrabold uppercase leading-snug text-[#c2410c]">
					{event.headline}
				</p>
				<div className="mt-3 rounded-lg border border-[#d7c7a8] bg-white/70 p-2 text-[10px]">
					<p className="font-bold text-[#1d4f86]">Materi</p>
					<ul className="mt-1 space-y-0.5 leading-snug">
						{event.topics.map(topic => (
							<li key={topic}>• {topic}</li>
						))}
					</ul>
				</div>
				<div className="mt-2 rounded-lg bg-[#1d4f86] px-2 py-1.5 text-[10px] text-white">
					<p className="font-bold">{event.dateLabel}</p>
					<p>
						{event.timeLabel} · {event.venue}
					</p>
				</div>
				<div className="mt-auto rounded-lg border border-dashed border-[#c4b496] bg-white/80 p-2 text-center">
					<p className="text-[10px] text-[#6b6254]">Tentukan sendiri berapa nominal yang akan kamu berikan</p>
					<p className="text-lg font-extrabold text-[#111827]">
						Mulai dari <span className="text-[#b45309]">{event.price}</span>
					</p>
				</div>
			</div>
		</div>
	);
}

function MaroonPoster({ event }: { event: WebinarEvent }) {
	return (
		<div className="relative aspect-[3/4] overflow-hidden bg-[#7f1d1d] text-white">
			<div className="absolute inset-0 bg-[linear-gradient(165deg,#9f1239_0%,#7f1d1d_40%,#3f0d12_100%)]" />
			<div className={cn('absolute right-3 top-16 text-white/30')}>
				<Mic className="size-16" strokeWidth={1.25} />
			</div>
			<div className="relative flex h-full flex-col p-3.5">
				<div className="flex items-start justify-between gap-2">
					<span className="text-[11px] font-extrabold">
						Catet <span className="text-emerald-300">Pajak</span>
					</span>
					<span className="rounded-md bg-[#f59e0b] px-2 py-1 text-[9px] font-bold text-[#3f0d12]">
						{event.badge}
					</span>
				</div>
				<p className="mt-4 text-[13px] font-extrabold text-[#fbbf24]">{event.kicker}</p>
				<p className="mt-1 text-[13px] font-bold leading-snug">{event.headline}</p>
				<div className="mt-3 space-y-1 text-[10px]">
					<p className="font-semibold">{event.dateLabel}</p>
					<p>{event.timeLabel}</p>
					<p className="text-rose-100/90">{event.venue}</p>
				</div>
				<ul className="mt-2 space-y-0.5 text-[9px] leading-snug text-rose-50/90">
					{event.topics.map(topic => (
						<li key={topic}>• {topic}</li>
					))}
				</ul>
				<div className="mt-auto flex items-end justify-between gap-2 pt-3">
					<div className="text-[9px]">
						{event.speakers.map(speaker => (
							<p key={speaker.name}>
								<span className="font-bold">{speaker.name}</span>
								<span className="text-rose-100/80"> · {speaker.role}</span>
							</p>
						))}
					</div>
					<div className="rounded-lg bg-white/15 px-2 py-1.5 text-right">
						<p className="text-[9px] uppercase tracking-wide text-amber-200">{event.priceNote}</p>
						<p className="text-sm font-extrabold">{event.price}</p>
					</div>
				</div>
			</div>
		</div>
	);
}
