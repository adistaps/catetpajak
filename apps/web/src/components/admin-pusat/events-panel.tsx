import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	CalendarDays,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Trash2,
	ToggleLeft,
	ToggleRight,
	Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	createCentralAdminEvent,
	deleteCentralAdminEvent,
	fetchCentralAdminEvents,
	fetchCentralAdminEventRegistrations,
	updateCentralAdminEvent,
	type CentralAdminEvent,
	type CentralAdminEventInput,
	type CentralAdminEventRegistration,
} from '@/lib/central-admin';
import { formatRupiah } from '@/data/events';

const EMPTY_INPUT: CentralAdminEventInput = {
	slug: '',
	badge: '',
	kicker: '',
	headline: '',
	title: '',
	topics: [],
	speakers: [],
	date_label: '',
	time_label: '',
	venue: '',
	mode: 'online',
	pricing: 'free',
	price_note: '',
	price: 0,
	accent: 'navy',
	published: false,
	sort: 0,
};

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

function topicsToText(topics: string[]): string {
	return topics.join('\n');
}

function textToTopics(text: string): string[] {
	return text
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);
}

function speakersToText(speakers: { name: string; role: string }[]): string {
	return speakers.map(speaker => `${speaker.name} | ${speaker.role}`).join('\n');
}

function textToSpeakers(text: string): { name: string; role: string }[] {
	return text
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => {
			const [name, ...rest] = line.split('|');
			return { name: name.trim(), role: rest.join('|').trim() };
		})
		.filter(speaker => speaker.name);
}

const fieldClass =
	'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const labelClass = 'text-[13px] font-semibold text-foreground';

export function EventsPanel() {
	const [events, setEvents] = useState<CentralAdminEvent[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [editing, setEditing] = useState<{ id: string | null; input: CentralAdminEventInput } | null>(
		null,
	);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [viewingParticipants, setViewingParticipants] = useState<CentralAdminEvent | null>(null);

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		try {
			const data = await fetchCentralAdminEvents();
			setEvents(data);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				setError(err.message);
			} else {
				setError('Gagal memuat daftar event. Periksa koneksi lalu coba lagi.');
			}
			setEvents([]);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const summary = useMemo(() => {
		const list = events ?? [];
		return {
			total: list.length,
			published: list.filter(e => e.published).length,
			draft: list.filter(e => !e.published).length,
			paid: list.filter(e => e.pricing === 'paid').length,
			registrations: list.reduce((sum, event) => sum + (event.registrationCount ?? 0), 0),
		};
	}, [events]);

	function startCreate() {
		setEditing({ id: null, input: { ...EMPTY_INPUT } });
	}

	function startEdit(event: CentralAdminEvent) {
		setEditing({
			id: event.id,
			input: {
				slug: event.slug,
				badge: event.badge,
				kicker: event.kicker,
				headline: event.headline,
				title: event.title,
				topics: event.topics,
				speakers: event.speakers,
				date_label: event.dateLabel,
				time_label: event.timeLabel,
				venue: event.venue,
				mode: event.mode,
				pricing: event.pricing,
				price_note: event.priceNote,
				price: event.price,
				accent: event.accent,
				published: event.published,
				sort: event.sort,
			},
		});
	}

	async function handleSave(input: CentralAdminEventInput) {
		setSaving(true);
		try {
			if (editing?.id) {
				const { event } = await updateCentralAdminEvent(editing.id, input);
				setEvents(prev => prev?.map(item => (item.id === event.id ? event : item)) ?? null);
				toast.success('Event diperbarui.');
			} else {
				const { event } = await createCentralAdminEvent(input);
				setEvents(prev => [...(prev ?? []), event].sort((a, b) => a.sort - b.sort));
				toast.success('Event ditambahkan.');
			}
			setEditing(null);
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal menyimpan event.');
		} finally {
			setSaving(false);
		}
	}

	async function handleTogglePublish(event: CentralAdminEvent) {
		setBusyId(event.id);
		try {
			const { event: updated } = await updateCentralAdminEvent(event.id, {
				published: !event.published,
			});
			setEvents(prev => prev?.map(item => (item.id === updated.id ? updated : item)) ?? null);
			toast.success(`${event.title} ${updated.published ? 'dipublikasikan' : 'disembunyikan'}.`);
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal mengubah status.');
		} finally {
			setBusyId(null);
		}
	}

	async function handleDelete(event: CentralAdminEvent) {
		if (!window.confirm(`Hapus event "${event.title}"? Tindakan ini tidak dapat dibatalkan.`)) {
			return;
		}
		setBusyId(event.id);
		try {
			await deleteCentralAdminEvent(event.id);
			setEvents(prev => prev?.filter(item => item.id !== event.id) ?? null);
			toast.success('Event dihapus.');
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal menghapus event.');
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<CalendarDays className="size-7 text-primary" strokeWidth={2} />
						Event & Webinar
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Tambah, atur harga, dan publikasikan webinar. Event yang dipublikasikan tampil di
						halaman /event; event draft disembunyikan dari peserta.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => void load(true)}
						disabled={isRefreshing}
						className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
					>
						{isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
						Muat ulang
					</button>
					<button
						type="button"
						onClick={startCreate}
						className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
					>
						<Plus className="size-4" />
						Tambah event
					</button>
				</div>
			</header>

			<section className="grid grid-cols-2 gap-3 md:grid-cols-5">
				{[
					{ label: 'Total event', value: summary.total },
					{ label: 'Dipublikasikan', value: summary.published },
					{ label: 'Draft', value: summary.draft },
					{ label: 'Berbayar', value: summary.paid },
					{ label: 'Peserta terdaftar', value: summary.registrations },
				].map(stat => (
					<div
						key={stat.label}
						className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-soft-sm"
					>
						<span className="text-2xl font-extrabold tracking-tight">{stat.value}</span>
						<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							{stat.label}
						</span>
					</div>
				))}
			</section>

			{error ? (
				<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
					{error}
				</p>
			) : null}

			{editing ? (
				<EventForm
					initial={editing.input}
					isEdit={Boolean(editing.id)}
					saving={saving}
					onCancel={() => setEditing(null)}
					onSave={handleSave}
				/>
			) : null}

			{viewingParticipants ? (
				<ParticipantsPanel
					event={viewingParticipants}
					onClose={() => setViewingParticipants(null)}
				/>
			) : null}

			{isLoading ? (
				<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat daftar event…
				</div>
			) : events && events.length === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-background px-5 py-12 text-center">
					<CalendarDays className="size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						Belum ada event. Klik “Tambah event” untuk membuat webinar pertama.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{events?.map(event => (
						<div
							key={event.id}
							className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-1.5">
									<p className="text-sm font-bold text-foreground">{event.title || '(tanpa judul)'}</p>
									<span
										className={cn(
											'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
											event.published
												? 'bg-emerald-50 text-emerald-700'
												: 'bg-secondary text-muted-foreground',
										)}
									>
										{event.published ? 'Publik' : 'Draft'}
									</span>
									<span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-foreground">
										{event.mode === 'online' ? 'Online' : 'Onsite'}
									</span>
									<span
										className={cn(
											'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
											event.pricing === 'paid'
												? 'bg-amber-50 text-amber-700'
												: 'bg-sky-50 text-sky-700',
										)}
									>
										{event.pricing === 'paid' ? `Berbayar · ${formatRupiah(event.price)}` : 'Gratis'}
									</span>
								</div>
								<p className="mt-1 text-xs text-muted-foreground">
									{event.dateLabel}
									{event.timeLabel ? ` · ${event.timeLabel}` : ''}
									{event.venue ? ` · ${event.venue}` : ''}
								</p>
								<p className="mt-0.5 text-[11px] text-muted-foreground">Slug: {event.slug}</p>
								<p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
									<Users className="size-3.5" />
									{event.registrationCount ?? 0} peserta terdaftar
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-1.5">
								<button
									type="button"
									onClick={() => setViewingParticipants(event)}
									className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-secondary"
								>
									<Users className="size-3.5" />
									Peserta
								</button>
								<button
									type="button"
									onClick={() => void handleTogglePublish(event)}
									disabled={busyId === event.id}
									aria-pressed={event.published}
									className={cn(
										'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors disabled:opacity-60',
										event.published
											? 'bg-primary text-primary-foreground hover:bg-primary/90'
											: 'border border-border bg-background text-muted-foreground hover:bg-secondary',
									)}
								>
									{busyId === event.id ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : event.published ? (
										<ToggleRight className="size-3.5" />
									) : (
										<ToggleLeft className="size-3.5" />
									)}
									{event.published ? 'Sembunyikan' : 'Publikasikan'}
								</button>
								<button
									type="button"
									onClick={() => startEdit(event)}
									className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-secondary"
								>
									<Pencil className="size-3.5" />
									Edit
								</button>
								<button
									type="button"
									onClick={() => void handleDelete(event)}
									disabled={busyId === event.id}
									className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-background px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60"
								>
									<Trash2 className="size-3.5" />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function EventForm({
	initial,
	isEdit,
	saving,
	onCancel,
	onSave,
}: {
	initial: CentralAdminEventInput;
	isEdit: boolean;
	saving: boolean;
	onCancel: () => void;
	onSave: (input: CentralAdminEventInput) => void;
}) {
	const [input, setInput] = useState<CentralAdminEventInput>(initial);
	const [topicsText, setTopicsText] = useState(topicsToText(initial.topics));
	const [speakersText, setSpeakersText] = useState(speakersToText(initial.speakers));
	const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));

	function update<K extends keyof CentralAdminEventInput>(
		key: K,
		value: CentralAdminEventInput[K],
	) {
		setInput(prev => ({ ...prev, [key]: value }));
	}

	function handleTitleChange(value: string) {
		update('title', value);
		if (!slugTouched) update('slug', slugify(value));
	}

	function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		onSave({
			...input,
			slug: input.slug.trim() || slugify(input.title),
			topics: textToTopics(topicsText),
			speakers: textToSpeakers(speakersText),
			price: input.pricing === 'free' ? 0 : input.price,
		});
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft"
		>
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-bold text-foreground">
					{isEdit ? 'Edit event' : 'Tambah event'}
				</h2>
				<button
					type="button"
					onClick={onCancel}
					className="text-sm font-semibold text-muted-foreground hover:text-foreground"
				>
					Batal
				</button>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>
						Judul <span className="text-red-500">*</span>
					</span>
					<input
						required
						value={input.title}
						onChange={e => handleTitleChange(e.target.value)}
						className={fieldClass}
						placeholder="cth. Serial Belajar Akuntansi Pajak"
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>
						Slug <span className="text-red-500">*</span>
					</span>
					<input
						required
						value={input.slug}
						onChange={e => {
							setSlugTouched(true);
							update('slug', slugify(e.target.value));
						}}
						className={fieldClass}
						placeholder="serial-belajar-akuntansi-pajak"
					/>
				</label>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Badge</span>
					<input
						value={input.badge}
						onChange={e => update('badge', e.target.value)}
						className={fieldClass}
						placeholder="cth. Onsite Class"
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Kicker</span>
					<input
						value={input.kicker}
						onChange={e => update('kicker', e.target.value)}
						className={fieldClass}
						placeholder="cth. Masterclass Persiapan Ujian"
					/>
				</label>
			</div>

			<label className="flex flex-col gap-1.5">
				<span className={labelClass}>Headline</span>
				<input
					value={input.headline}
					onChange={e => update('headline', e.target.value)}
					className={fieldClass}
					placeholder="Deskripsi singkat yang menarik"
				/>
			</label>

			<div className="grid gap-4 md:grid-cols-3">
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>
						Tanggal (label) <span className="text-red-500">*</span>
					</span>
					<input
						required
						value={input.date_label}
						onChange={e => update('date_label', e.target.value)}
						className={fieldClass}
						placeholder="cth. Sab, 17 Okt 2026"
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Waktu</span>
					<input
						value={input.time_label}
						onChange={e => update('time_label', e.target.value)}
						className={fieldClass}
						placeholder="cth. 13.00 – 17.00 WIB"
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Tempat</span>
					<input
						value={input.venue}
						onChange={e => update('venue', e.target.value)}
						className={fieldClass}
						placeholder="cth. Online Zoom Meeting"
					/>
				</label>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Mode</span>
					<select
						value={input.mode}
						onChange={e => update('mode', e.target.value as 'onsite' | 'online')}
						className={fieldClass}
					>
						<option value="online">Online</option>
						<option value="onsite">Onsite</option>
					</select>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Jenis harga</span>
					<select
						value={input.pricing}
						onChange={e => update('pricing', e.target.value as 'free' | 'paid')}
						className={fieldClass}
					>
						<option value="free">Gratis</option>
						<option value="paid">Berbayar</option>
					</select>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>
						Harga {input.pricing === 'paid' ? '(Rp)' : ''}
					</span>
					<input
						type="number"
						min={0}
						step={1000}
						value={input.price}
						disabled={input.pricing === 'free'}
						onChange={e => update('price', Number(e.target.value))}
						className={cn(fieldClass, input.pricing === 'free' && 'opacity-50')}
						placeholder="0"
					/>
					{input.pricing === 'paid' ? (
						<span className="text-xs text-muted-foreground">
							{formatRupiah(Number(input.price) || 0)} / orang (early bird)
						</span>
					) : (
						<span className="text-xs text-muted-foreground">Event gratis tidak memerlukan harga.</span>
					)}
				</label>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Catatan harga</span>
					<input
						value={input.price_note}
						onChange={e => update('price_note', e.target.value)}
						className={fieldClass}
						placeholder="cth. Early bird s.d. 10 Oktober"
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Tema poster</span>
					<select
						value={input.accent}
						onChange={e => update('accent', e.target.value as 'navy' | 'cream' | 'maroon')}
						className={fieldClass}
					>
						<option value="navy">Navy</option>
						<option value="cream">Cream</option>
						<option value="maroon">Maroon</option>
					</select>
				</label>
			</div>

			<label className="flex flex-col gap-1.5">
				<span className={labelClass}>Materi / topik (satu per baris)</span>
				<textarea
					value={topicsText}
					onChange={e => setTopicsText(e.target.value)}
					rows={4}
					className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100"
					placeholder={'Beda tetap dan beda waktu\nAspek pajak atas aktiva tetap'}
				/>
			</label>

			<label className="flex flex-col gap-1.5">
				<span className={labelClass}>Pemateri (Nama | Peran, satu per baris)</span>
				<textarea
					value={speakersText}
					onChange={e => setSpeakersText(e.target.value)}
					rows={3}
					className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100"
					placeholder={'Rina Kartika | Pemateri · Tax Lecturer\nBudi Santoso | Moderator'}
				/>
			</label>

			<div className="grid gap-4 md:grid-cols-2">
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Urutan tampil</span>
					<input
						type="number"
						min={0}
						value={input.sort}
						onChange={e => update('sort', Number(e.target.value))}
						className={fieldClass}
						placeholder="0"
					/>
					<span className="text-xs text-muted-foreground">Angka kecil tampil lebih dulu.</span>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Status publikasi</span>
					<select
						value={input.published ? 'true' : 'false'}
						onChange={e => update('published', e.target.value === 'true')}
						className={fieldClass}
					>
						<option value="false">Draft (sembunyikan)</option>
						<option value="true">Publikasikan</option>
					</select>
				</label>
			</div>

			<div className="flex items-center justify-end gap-2 border-t border-border pt-4">
				<button
					type="button"
					onClick={onCancel}
					className="rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
				>
					Batal
				</button>
				<button
					type="submit"
					disabled={saving}
					className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
				>
					{saving ? <Loader2 className="size-4 animate-spin" /> : null}
					{saving ? 'Menyimpan…' : isEdit ? 'Simpan perubahan' : 'Tambah event'}
				</button>
			</div>
		</form>
	);
}

const PAYMENT_STATUS_META: Record<string, { label: string; className: string }> = {
	menunggu_pembayaran: {
		label: 'Menunggu Pembayaran',
		className: 'bg-amber-50 text-amber-700',
	},
	menunggu_verifikasi: {
		label: 'Menunggu Verifikasi',
		className: 'bg-sky-50 text-sky-700',
	},
	lunas: {
		label: 'Lunas',
		className: 'bg-emerald-50 text-emerald-700',
	},
	ditolak: {
		label: 'Ditolak',
		className: 'bg-red-50 text-red-700',
	},
};

function formatRegistrationDate(iso: string): string {
	if (!iso) return '-';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '-';
	return date.toLocaleString('id-ID', {
		timeZone: 'Asia/Jakarta',
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function ParticipantsPanel({
	event,
	onClose,
}: {
	event: CentralAdminEvent;
	onClose: () => void;
}) {
	const [registrations, setRegistrations] = useState<CentralAdminEventRegistration[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let active = true;
		setIsLoading(true);
		setError('');
		fetchCentralAdminEventRegistrations(event.slug)
			.then(data => {
				if (active) setRegistrations(data);
			})
			.catch(err => {
				if (!active) return;
				if (err instanceof CentralAdminApiError) {
					if (err.status === 401) {
						window.location.href = '/login';
						return;
					}
					setError(err.message);
				} else {
					setError('Gagal memuat daftar peserta. Periksa koneksi lalu coba lagi.');
				}
				setRegistrations([]);
			})
			.finally(() => {
				if (active) setIsLoading(false);
			});
		return () => {
			active = false;
		};
	}, [event.slug]);

	const totalQty = (registrations ?? []).reduce(
		(sum, reg) => sum + (reg.quantity > 0 ? reg.quantity : 1),
		0,
	);

	return (
		<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="text-lg font-bold text-foreground">Peserta Event</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						{event.title || '(tanpa judul)'} · {event.dateLabel}
					</p>
					<p className="mt-1 text-[11px] text-muted-foreground">
						Slug: {event.slug} · {registrations?.length ?? 0} pendaftaran · {totalQty} tiket
					</p>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
				>
					Tutup
				</button>
			</div>

			<p className="rounded-xl bg-accent px-3 py-2 text-[11px] font-medium text-accent-foreground">
				Informasi peserta bersifat rahasia dan hanya untuk Admin Pusat. Jangan dibagikan kepada
				pengunjung publik atau peserta lain.
			</p>

			{error ? (
				<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
					{error}
				</p>
			) : null}

			{isLoading ? (
				<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat daftar peserta…
				</div>
			) : registrations && registrations.length === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-background px-5 py-10 text-center">
					<Users className="size-7 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						Belum ada pendaftar untuk event ini.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{registrations?.map(reg => {
						const status = PAYMENT_STATUS_META[reg.payment_status] ?? {
							label: reg.payment_status || '-',
							className: 'bg-secondary text-muted-foreground',
						};
						return (
							<div
								key={reg.id}
								className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="text-sm font-bold text-foreground">{reg.name || '(tanpa nama)'}</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{reg.email || '-'}
											{reg.phone ? ` · ${reg.phone}` : ''}
										</p>
										{reg.company_name ? (
											<p className="mt-0.5 text-xs text-muted-foreground">
												Perusahaan: {reg.company_name}
											</p>
										) : null}
									</div>
									<span
										className={cn(
											'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
											status.className,
										)}
									>
										{status.label}
									</span>
								</div>

								<div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
									<div>
										<p className="font-semibold text-muted-foreground">Tiket</p>
										<p className="text-foreground">{reg.price_option || '-'}</p>
									</div>
									<div>
										<p className="font-semibold text-muted-foreground">Jumlah</p>
										<p className="text-foreground">{reg.quantity} orang</p>
									</div>
									<div>
										<p className="font-semibold text-muted-foreground">Nominal</p>
										<p className="text-foreground">
											{reg.amount_formatted || formatRupiah(reg.amount)}
										</p>
										{reg.expected_amount_formatted ? (
											<p className="text-[10px] text-muted-foreground">
												Unik: {reg.expected_amount_formatted}
											</p>
										) : null}
									</div>
									<div>
										<p className="font-semibold text-muted-foreground">Waktu daftar</p>
										<p className="text-foreground">{formatRegistrationDate(reg.created)}</p>
									</div>
								</div>

								{reg.notes ? (
									<p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
										Catatan: {reg.notes}
									</p>
								) : null}

								{reg.verification_notes ? (
									<p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
										Catatan verifikasi: {reg.verification_notes}
									</p>
								) : null}

								<div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
									{reg.bank ? <span>Bank: {reg.bank}</span> : null}
									{reg.payment_date ? (
										<span>Tgl bayar: {formatRegistrationDate(reg.payment_date)}</span>
									) : null}
									{reg.proof_url ? (
										<a
											href={reg.proof_url}
											target="_blank"
											rel="noopener noreferrer"
											className="font-semibold text-primary hover:underline"
										>
											Lihat bukti bayar
										</a>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}
