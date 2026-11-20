import { useState } from 'react';
import {
	CalendarDays,
	Clock,
	Flame,
	Link2,
	MapPin,
	Minus,
	Phone,
	Plus,
	Sparkles,
	Star,
	UserRound,
	Users,
} from 'lucide-react';
import { toast } from 'sonner';
import pocketbaseClient from '@/lib/pocketbase-client';
import type { WebinarEvent } from '@/data/events';
import { EventPoster } from '@/components/event/event-poster';
import { EventPayment } from '@/components/event/event-payment';

type PriceOption = {
	id: string;
	label: string;
	amountLabel: string;
};

function priceOptions(event: WebinarEvent): PriceOption[] {
	if (event.pricing === 'free') {
		return [{ id: 'free', label: 'Gratis', amountLabel: 'Rp0' }];
	}
	return [
		{ id: 'early', label: 'Early Bird', amountLabel: event.price },
		{ id: 'normal', label: 'Normal', amountLabel: normalPrice(event.price) },
	];
}

function normalPrice(early: string) {
	const digits = Number(early.replace(/[^\d]/g, ''));
	if (!digits) return 'Rp599.000';
	const bumped = Math.round((digits * 1.2) / 1000) * 1000;
	return `Rp${bumped.toLocaleString('id-ID')}`;
}

function parseAmount(label: string): number {
	const digits = Number(String(label).replace(/[^\d]/g, ''));
	return Number.isFinite(digits) ? digits : 0;
}

type ConfirmationResponse = {
	ok?: boolean;
	alreadySent?: boolean;
	to?: string;
	via?: string;
	sender?: string;
	error?: string;
	message?: string;
};

/**
 * Mengirim email konfirmasi tagihan belum terbayar ke email pendaftar lewat
 * resource route server. Idempoten di sisi server (tidak mengirim ulang bila
 * sudah pernah dikirim). Umpan balik jujur: membedakan "terkirim via SMTP",
 * "diterima relay platform (periksa spam)", dan "gagal" — tidak mengklaim
 * berhasil bila pengiriman belum dikonfigurasi atau gagal.
 */
async function sendConfirmationEmail(registrationId: string, email: string): Promise<void> {
	let data: ConfirmationResponse | null = null;
	try {
		const response = await fetch('/api/event-confirmation-email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ registrationId }),
		});
		data = (await response.json().catch(() => null)) as ConfirmationResponse | null;
		if (!response.ok) {
			const reason = data?.error ?? data?.message ?? `${response.status} ${response.statusText}`;
			throw new Error(reason);
		}
	} catch (err) {
		const reason = (err as Error)?.message || 'Pengiriman email gagal.';
		toast.error(`Email konfirmasi gagal dikirim: ${reason}`, { duration: 8000 });
		return;
	}

	if (!data?.ok) {
		const reason = data?.error || 'Pengiriman email gagal.';
		toast.error(`Email konfirmasi gagal dikirim: ${reason}`, { duration: 8000 });
		return;
	}

	if (data.alreadySent) {
		toast.info(
			`Email konfirmasi sudah pernah diterima relay platform untuk ${email}. Belum masuk? Cek folder spam. Jika tetap tidak ada, pengiriman andal memerlukan SMTP aktif di Admin Pusat.`,
			{ duration: 8000 },
		);
		return;
	}

	const via = data.via || 'relay';
	const sender = data.sender || '';
	if (via === 'smtp') {
		toast.success(
			`Email konfirmasi dikirim via SMTP dari ${sender || 'info@catetpajak.com'} ke ${email}. Periksa kotak masuk (atau folder spam).`,
			{ duration: 7000 },
		);
	} else {
		// Relay menerima email (HTTP 200) tetapi BUKAN jaminan sampai ke kotak
		// masuk — pengirim generik sering masuk spam/ditolak. Jangan klaim terkirim.
		toast.warning(
			`Email diterima relay platform untuk ${email}, namun pengiriman lewat relay TIDAK menjamin sampai ke kotak masuk (sering masuk spam). Untuk pengiriman andal dari info@catetpajak.com, minta admin mengaktifkan SMTP di Admin Pusat → Pengaturan SMTP.`,
			{ duration: 10000 },
		);
	}
}

function benefitsFor(event: WebinarEvent) {
	return [
		'Pemateri berpengalaman (dosen, konsultan, dan praktisi pajak)',
		'Tips dan trik menghadapi materi ujian atau diskusi',
		...event.topics.slice(0, 2).map(topic => `Pembahasan: ${topic}`),
		event.mode === 'online' ? 'Rekaman dan materi digital' : 'Snack dan coffee break',
		'Materi presentasi',
		'Sertifikat kehadiran',
		'Sesi tanya jawab interaktif',
	];
}

export function EventDetail({
	event,
	onClose,
}: {
	event: WebinarEvent;
	onClose: () => void;
}) {
	const options = priceOptions(event);
	const [optionId, setOptionId] = useState('');
	const [qty, setQty] = useState(1);
	const [showForm, setShowForm] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [done, setDone] = useState(false);
	const [registrationId, setRegistrationId] = useState<string | null>(null);
	const [registeredEmail, setRegisteredEmail] = useState('');
	const [form, setForm] = useState({ name: '', email: '', phone: '', company_name: '' });
	const selected = options.find(item => item.id === optionId);
	const range =
		event.pricing === 'free'
			? 'Gratis'
			: `${event.price} – ${normalPrice(event.price)}`;
	const maps =
		event.mode === 'onsite'
			? `https://maps.google.com/?q=${encodeURIComponent(event.venue)}`
			: '';

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!selected) {
			toast.error('Pilih harga terlebih dahulu.');
			return;
		}
		const name = form.name.trim();
		const email = form.email.trim();
		const phone = form.phone.trim();
		if (name.length < 2) {
			toast.error('Nama lengkap wajib diisi.');
			return;
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			toast.error('Masukkan email yang valid.');
			return;
		}
		if (phone.length < 8) {
			toast.error('Nomor WhatsApp wajib diisi.');
			return;
		}
		setSubmitting(true);
		try {
			const record = await pocketbaseClient.collection('event_registrations').create({
				event_slug: event.slug,
				event_title: event.title,
				name,
				email,
				phone,
				company_name: form.company_name.trim(),
				quantity: qty,
				price_option: selected.label,
				amount: parseAmount(selected.amountLabel) * qty,
				amount_formatted: selected.amountLabel,
				payment_status: event.pricing === 'paid' ? 'menunggu_pembayaran' : 'lunas',
				notes: `${selected.label} · ${selected.amountLabel} · ${qty} orang`,
			});
			if (event.pricing === 'paid') {
				setRegisteredEmail(email);
				setRegistrationId(record.id);
				// Kirim email konfirmasi tagihan belum terbayar. Gagal kirim tidak
				// memblokir alur pembayaran; peserta tetap melihat halaman pembayaran.
				sendConfirmationEmail(record.id, email).catch(() => {});
			} else {
				setDone(true);
				toast.success('Pendaftaran tersimpan. Tim kami akan menghubungi Anda.');
			}
		} catch {
			toast.error('Pendaftaran gagal disimpan. Coba lagi beberapa saat.');
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto bg-[#eef1f4]">
			<div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-8">
				<button
					type="button"
					onClick={onClose}
					className="mb-4 inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#1f2937] ring-1 ring-slate-200 hover:bg-slate-50"
				>
					Kembali ke daftar event
				</button>
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
					<div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
						<div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
							<EventPoster event={event} />
						</div>
						<div className="min-w-0">
							<h2 className="text-[1.65rem] font-bold leading-tight tracking-tight text-[#1a1a1a] md:text-[2rem]">
								{event.kicker} {event.badge} {event.dateLabel}
							</h2>
							<p className="mt-3 text-lg font-semibold text-[#3d8c40]">{range}</p>
							<ul className="mt-5 space-y-2.5 text-[15px] leading-relaxed text-[#2b2b2b]">
								<li className="flex gap-2">
									<Sparkles className="mt-0.5 size-4 shrink-0 text-amber-500" />
									<span>Catet Pajak mempersembahkan {event.badge.toLowerCase()} {event.headline}</span>
								</li>
								<li className="flex gap-2">
									<Star className="mt-0.5 size-4 shrink-0 text-rose-500" />
									<span className="font-semibold">{event.title}</span>
								</li>
								<li className="flex gap-2">
									<CalendarDays className="mt-0.5 size-4 shrink-0 text-slate-500" />
									<span>{event.dateLabel}</span>
								</li>
								<li className="flex gap-2">
									<Clock className="mt-0.5 size-4 shrink-0 text-slate-500" />
									<span>{event.timeLabel}</span>
								</li>
								<li className="flex gap-2">
									<MapPin className="mt-0.5 size-4 shrink-0 text-rose-500" />
									<span className="font-semibold">{event.venue}</span>
								</li>
								{maps ? (
									<li className="pl-6">
										<a
											href={maps}
											target="_blank"
											rel="noreferrer"
											className="break-all text-[#c0392b] underline"
										>
											{maps}
										</a>
									</li>
								) : (
									<li className="flex gap-2">
										<Link2 className="mt-0.5 size-4 shrink-0 text-sky-600" />
										<span>Tautan Zoom dikirim setelah pendaftaran dikonfirmasi</span>
									</li>
								)}
								<li className="flex gap-2">
									<Flame className="mt-0.5 size-4 shrink-0 text-orange-500" />
									<span>Best Invest!</span>
								</li>
								<li className="flex gap-2">
									<Sparkles className="mt-0.5 size-4 shrink-0 text-amber-500" />
									<span>{event.priceNote}</span>
								</li>
								<li className="flex gap-2">
									<span className="mt-0.5 text-emerald-600">Rp</span>
									<span>{event.price}/orang</span>
								</li>
								{event.speakers.map(speaker => (
									<li key={speaker.name} className="flex gap-2">
										<UserRound className="mt-0.5 size-4 shrink-0 text-slate-600" />
										<span>
											<span className="font-semibold">{speaker.role}:</span> {speaker.name}
										</span>
									</li>
								))}
								<li className="flex gap-2">
									<Users className="mt-0.5 size-4 shrink-0 text-amber-500" />
									<span className="font-semibold">Benefit:</span>
								</li>
							</ul>
							<ul className="mt-1 space-y-1 pl-6 text-[15px] text-[#2b2b2b]">
								{benefitsFor(event).map(item => (
									<li key={item}>– {item}</li>
								))}
							</ul>
							<p className="mt-4 flex gap-2 text-[15px]">
								<Link2 className="mt-0.5 size-4 shrink-0 text-slate-500" />
								<span>
									Link daftar: <span className="font-semibold text-[#c0392b]">catetpajak.com/event</span>
								</span>
							</p>
							<p className="mt-2 flex gap-2 text-[15px]">
								<UserRound className="mt-0.5 size-4 shrink-0 text-rose-500" />
								<span>
									<span className="font-semibold">Contact person:</span> Tim Catet Pajak (info@catetpajak.com)
								</span>
							</p>
							<p className="mt-2 flex gap-2 text-[15px]">
								<Phone className="mt-0.5 size-4 shrink-0 text-emerald-600" />
								<span>
									<span className="font-semibold">WhatsApp:</span>{' '}
									<a
										href="https://wa.me/6285110565506"
										target="_blank"
										rel="noopener noreferrer"
										className="font-semibold text-emerald-600 hover:underline"
									>
										0851-1056-5506
									</a>
								</span>
							</p>

							<div className="mt-6 border-t border-slate-200 pt-5">
								<h3 className="text-lg font-semibold text-[#1a1a1a]">Harga</h3>
								<label className="mt-4 block">
									<span className="sr-only">Pilih harga</span>
									<select
										value={optionId}
										onChange={e => {
											setOptionId(e.target.value);
											setShowForm(false);
											setDone(false);
											setRegistrationId(null);
											setRegisteredEmail('');
										}}
										className="h-12 w-full rounded-md border border-[#e35d6a] bg-white px-3 text-[15px] text-[#6b7280] outline-none focus:ring-2 focus:ring-rose-200"
									>
										<option value="">Choose an option</option>
										{options.map(item => (
											<option key={item.id} value={item.id}>
												{item.label} — {item.amountLabel}
											</option>
										))}
									</select>
								</label>
								<div className="mt-4 inline-flex items-center overflow-hidden rounded-md border border-slate-300">
									<button
										type="button"
										aria-label="Kurangi jumlah"
										onClick={() => setQty(current => Math.max(1, current - 1))}
										className="grid size-11 place-items-center text-slate-600 hover:bg-slate-50"
									>
										<Minus className="size-4" />
									</button>
									<span className="grid h-11 min-w-12 place-items-center border-x border-slate-300 text-sm font-medium">
										{qty}
									</span>
									<button
										type="button"
										aria-label="Tambah jumlah"
										onClick={() => setQty(current => Math.min(20, current + 1))}
										className="grid size-11 place-items-center text-slate-600 hover:bg-slate-50"
									>
										<Plus className="size-4" />
									</button>
								</div>
								<button
									type="button"
									disabled={!selected}
									onClick={() => setShowForm(true)}
									className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-[#d5d8dc] text-[15px] font-semibold text-[#5f6670] disabled:cursor-not-allowed enabled:bg-[#3d8c40] enabled:text-white"
								>
									{event.pricing === 'free' ? 'Daftar' : 'Payment'}
								</button>
								{showForm && selected ? (
									done ? (
										<div className="mt-4 rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
											<p className="font-semibold">Pendaftaran berhasil.</p>
											<p className="mt-1">
												{selected.label} untuk {qty} orang pada {event.title}. Konfirmasi dikirim ke email yang didaftarkan.
											</p>
										</div>
									) : registrationId && event.pricing === 'paid' ? (
										<EventPayment
											registrationId={registrationId}
											email={registeredEmail || form.email.trim()}
											amountLabel={selected.amountLabel}
											quantity={qty}
											priceOption={selected.label}
											onDone={() => {
												setDone(true);
												setRegistrationId(null);
											}}
										/>
									) : (
										<form className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={submit}>
											<p className="text-sm text-slate-600">
												{selected.label} · {selected.amountLabel} · {qty} orang. Isi data peserta untuk lanjut ke pembayaran.
											</p>
											<label className="block text-sm font-medium">
												Nama lengkap
												<input
													required
													value={form.name}
													onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
													className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
												/>
											</label>
											<label className="block text-sm font-medium">
												Email
												<input
													required
													type="email"
													value={form.email}
													onChange={e => setForm(current => ({ ...current, email: e.target.value }))}
													className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
												/>
											</label>
											<label className="block text-sm font-medium">
												WhatsApp
												<input
													required
													value={form.phone}
													onChange={e => setForm(current => ({ ...current, phone: e.target.value }))}
													className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
												/>
											</label>
											<label className="block text-sm font-medium">
												Perusahaan <span className="font-normal text-slate-500">(opsional)</span>
												<input
													value={form.company_name}
													onChange={e => setForm(current => ({ ...current, company_name: e.target.value }))}
													className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
												/>
											</label>
											<button
												type="submit"
												disabled={submitting}
												className="inline-flex h-11 w-full items-center justify-center rounded-md bg-[#3d8c40] text-sm font-semibold text-white disabled:opacity-60"
											>
												{submitting ? 'Menyimpan…' : event.pricing === 'free' ? 'Daftar sekarang' : 'Lanjut pembayaran'}
											</button>
										</form>
									)
								) : null}
								<div className="mt-5 space-y-1 border-t border-slate-200 pt-4 text-sm text-[#4b5563]">
									<p>SKU: N/A</p>
									<p>
										Category: <span className="text-[#c0392b]">{event.mode === 'online' ? 'Online' : 'Onsite'}</span>
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
