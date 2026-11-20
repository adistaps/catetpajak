import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Announcement } from '@/lib/announcements';
import { LEAVE_TYPE_LABELS, type LeaveRequest } from '@/lib/leave';
import { cn } from '@/lib/utils';

interface CalendarItem {
	id: string;
	start: string;
	end: string;
	title: string;
	detail: string;
	kind: 'Pengumuman' | 'Cuti';
}

interface CalendarDate {
	year: number;
	month: number;
	day: number;
}

const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function localToday(): CalendarDate {
	const now = new Date();
	return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function dateKey(year: number, month: number, day: number): string {
	return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function labelDate(key: string, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat('id-ID', { ...options, timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
}

export function EmployeeCalendar({ companyId, employeeId, onBack }: {
	companyId: string;
	employeeId: string;
	onBack: () => void;
}) {
	const [selected, setSelected] = useState<CalendarDate | null>(null);
	const [today, setToday] = useState<CalendarDate | null>(null);
	const [showAll, setShowAll] = useState(false);
	const [items, setItems] = useState<CalendarItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);
	const [retry, setRetry] = useState(0);

	useEffect(() => {
		const current = localToday();
		setToday(current);
		setSelected(current);
	}, []);

	const year = selected?.year;
	const month = selected?.month;

	useEffect(() => {
		if (year === undefined || month === undefined) return;
		let cancelled = false;
		setLoading(true);
		setFailed(false);
		setItems([]);
		const first = dateKey(year, month, 1);
		const following = new Date(Date.UTC(year, month + 1, 1));
		const next = dateKey(following.getUTCFullYear(), following.getUTCMonth(), 1);
		const start = `${first} 00:00:00.000Z`;
		const end = `${next} 00:00:00.000Z`;

		void Promise.allSettled([
			pb.collection('announcements').getFullList<Announcement>({
				filter: pb.filter('company = {:company} && status = "published" && student = "" && date >= {:start} && date < {:end}', { company: companyId, start, end }),
				sort: 'date',
				requestKey: null,
			}),
			pb.collection('leave_requests').getFullList<LeaveRequest>({
				filter: pb.filter('company = {:company} && employee = {:employee} && status = "approved" && start_date < {:end} && end_date >= {:start}', { company: companyId, employee: employeeId, start, end }),
				sort: 'start_date',
				requestKey: null,
			}),
		]).then(([announcements, leaves]) => {
			if (cancelled) return;
			const announcementItems: CalendarItem[] = announcements.status === 'fulfilled' ? announcements.value.map(item => ({
				id: `announcement-${item.id}`,
				start: item.date.slice(0, 10),
				end: item.date.slice(0, 10),
				title: item.title,
				detail: item.body,
				kind: 'Pengumuman',
			})) : [];
			const leaveItems: CalendarItem[] = leaves.status === 'fulfilled' ? leaves.value.map(item => ({
				id: `leave-${item.id}`,
				start: item.start_date.slice(0, 10),
				end: item.end_date.slice(0, 10),
				title: LEAVE_TYPE_LABELS[item.leave_type] ?? 'Cuti',
				detail: 'Cuti disetujui',
				kind: 'Cuti',
			})) : [];
			setItems([...announcementItems, ...leaveItems]
				.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.start) && /^\d{4}-\d{2}-\d{2}$/.test(item.end))
				.sort((a, b) => a.start.localeCompare(b.start)));
			setFailed(announcements.status === 'rejected' || leaves.status === 'rejected');
			setLoading(false);
		});
		return () => { cancelled = true; };
	}, [companyId, employeeId, year, month, retry]);

	const visibleItems = useMemo(() => {
		if (!selected) return [];
		const key = dateKey(selected.year, selected.month, selected.day);
		return showAll ? items : items.filter(item => item.start <= key && item.end >= key);
	}, [items, selected, showAll]);

	if (!selected || !today) {
		return <div className="min-h-72 px-4 py-8 text-sm text-slate-500">Memuat kalender…</div>;
	}

	const firstDay = new Date(Date.UTC(selected.year, selected.month, 1)).getUTCDay();
	const daysInMonth = new Date(Date.UTC(selected.year, selected.month + 1, 0)).getUTCDate();
	const selectedKey = dateKey(selected.year, selected.month, selected.day);
	const todayKey = dateKey(today.year, today.month, today.day);
	const monthLabel = labelDate(dateKey(selected.year, selected.month, 1), { month: 'long', year: 'numeric' });

	const changeMonth = (offset: number) => {
		const target = new Date(Date.UTC(selected.year, selected.month + offset, 1));
		const targetYear = target.getUTCFullYear();
		const targetMonth = target.getUTCMonth();
		const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
		setSelected({ year: targetYear, month: targetMonth, day: Math.min(selected.day, lastDay) });
		setShowAll(false);
	};

	return (
		<section className="bg-white px-4 pb-8 text-slate-900" aria-label="Kalender karyawan">
			<header className="relative flex min-h-14 items-center justify-center">
				<button type="button" onClick={onBack} aria-label="Kembali ke beranda" className="absolute left-0 flex size-11 items-center justify-start rounded-lg text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
					<ArrowLeft className="size-6" strokeWidth={1.8} />
				</button>
				<h1 className="text-base font-semibold">Kalender</h1>
				<button type="button" onClick={() => { const current = localToday(); setToday(current); setSelected(current); setShowAll(false); }} className="absolute right-0 min-h-11 px-1 text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
					Hari ini
				</button>
			</header>

			<div className="mt-5 flex items-center justify-between gap-3">
				<button type="button" onClick={() => changeMonth(-1)} aria-label="Bulan sebelumnya" className="flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
					<ChevronLeft className="size-6" />
				</button>
				<h2 className="text-xl font-bold tracking-tight text-slate-900" aria-live="polite">{monthLabel}</h2>
				<button type="button" onClick={() => changeMonth(1)} aria-label="Bulan berikutnya" className="flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
					<ChevronRight className="size-6" />
				</button>
			</div>

			<div className="mt-5 grid grid-cols-7 text-center" aria-label={`Tanggal ${monthLabel}`}>
				{WEEKDAYS.map(day => <div key={day} className="pb-2 text-xs font-medium text-slate-500">{day}</div>)}
				{Array.from({ length: firstDay }, (_, index) => <span key={`empty-${index}`} aria-hidden="true" />)}
				{Array.from({ length: daysInMonth }, (_, index) => {
					const day = index + 1;
					const key = dateKey(selected.year, selected.month, day);
					const isSelected = key === selectedKey;
					const hasItems = items.some(item => item.start <= key && item.end >= key);
					return (
						<div key={key} className="flex items-center justify-center py-1.5">
							<button type="button" onClick={() => { setSelected({ ...selected, day }); setShowAll(false); }} aria-label={`${labelDate(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${key === todayKey ? ', hari ini' : ''}${hasItems ? ', ada agenda' : ''}`} aria-pressed={isSelected} className={cn('relative flex size-11 items-center justify-center rounded-lg text-base tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600', isSelected ? 'bg-blue-600 font-semibold text-white' : 'text-slate-800 hover:bg-blue-50', key === todayKey && !isSelected && 'font-bold text-blue-600 ring-1 ring-inset ring-blue-200')}>
								{day}
								{hasItems ? <span aria-hidden="true" className={cn('absolute bottom-1.5 size-1 rounded-full', isSelected ? 'bg-white' : 'bg-emerald-500')} /> : null}
							</button>
						</div>
					);
				})}
			</div>

			<button type="button" onClick={() => setShowAll(value => !value)} className="mx-auto mt-5 flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
				{showAll ? 'Lihat agenda tanggal terpilih' : 'Lihat semua agenda bulan ini'} <ArrowRight className="size-4" />
			</button>

			<div className="mt-5 border-t border-slate-100 pt-5" aria-live="polite">
				<h3 className="text-sm font-bold text-slate-800">{showAll ? `Agenda ${monthLabel}` : labelDate(selectedKey, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
				<p className="mt-1 text-xs leading-relaxed text-slate-500">Pengumuman perusahaan dan cuti Anda yang telah disetujui.</p>
				{loading ? <p className="py-5 text-sm text-slate-500">Memuat agenda…</p> : (
					<>
						{failed ? <p className="mt-4 text-sm text-red-700">Sebagian agenda tidak dapat dimuat. <button type="button" onClick={() => setRetry(value => value + 1)} className="font-semibold underline">Coba lagi</button></p> : null}
						{visibleItems.length === 0 ? <p className="py-5 text-sm text-slate-500">{failed ? 'Tidak ada agenda lain yang dapat ditampilkan.' : showAll ? 'Belum ada agenda pada bulan ini.' : 'Tidak ada agenda pada tanggal ini.'}</p> : (
							<ul className="mt-3 divide-y divide-slate-100">
								{visibleItems.map(item => (
									<li key={item.id} className="flex gap-3 py-3">
										<span className="mt-1 h-9 w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
										<div className="min-w-0">
											<p className="text-xs font-semibold text-emerald-700">{item.kind} · {labelDate(item.start, { day: 'numeric', month: 'short' })}{item.end !== item.start ? ` – ${labelDate(item.end, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
											<p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
											{item.detail ? <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-500">{item.detail}</p> : null}
										</div>
									</li>
								))}
							</ul>
						)}
					</>
				)}
			</div>
		</section>
	);
}
