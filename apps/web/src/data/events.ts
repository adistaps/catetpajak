import pocketbaseClient from '@/lib/pocketbase-client';

export type EventMode = 'onsite' | 'online';

/**
 * Bentuk tampilan event yang dipakai komponen publik (poster, detail, payment).
 * `price` diformat sebagai string "Rp 499.000" agar cocok dengan komponen
 * yang sudah ada. Sumber data: koleksi `events` yang dikelola Admin Pusat.
 */
export type WebinarEvent = {
	id: string;
	slug: string;
	badge: string;
	kicker: string;
	headline: string;
	title: string;
	topics: string[];
	speakers: { name: string; role: string }[];
	dateLabel: string;
	timeLabel: string;
	venue: string;
	mode: EventMode;
	pricing: 'free' | 'paid';
	priceNote: string;
	price: string;
	accent: 'navy' | 'cream' | 'maroon';
};

type EventRecord = {
	id: string;
	slug: string;
	badge: string;
	kicker: string;
	headline: string;
	title: string;
	topics: unknown;
	speakers: unknown;
	date_label: string;
	time_label: string;
	venue: string;
	mode: string;
	pricing: string;
	price_note: string;
	price: number;
	accent: string;
};

/** Format angka rupiah → "Rp 499.000". */
export function formatRupiah(value: number): string {
	const safe = Number.isFinite(value) ? value : 0;
	return `Rp ${safe.toLocaleString('id-ID')}`;
}

function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map(item => (typeof item === 'string' ? item : String(item ?? '')));
	}
	return [];
}

function toSpeakers(value: unknown): { name: string; role: string }[] {
	if (!Array.isArray(value)) return [];
	return value
		.map(item => {
			if (typeof item !== 'object' || item === null) return null;
			const obj = item as Record<string, unknown>;
			return { name: String(obj.name ?? ''), role: String(obj.role ?? '') };
		})
		.filter((item): item is { name: string; role: string } => item !== null);
}

function toWebinarEvent(record: EventRecord): WebinarEvent {
	const price = typeof record.price === 'number' ? record.price : Number(record.price ?? 0);
	return {
		id: record.id,
		slug: record.slug ?? '',
		badge: record.badge ?? '',
		kicker: record.kicker ?? '',
		headline: record.headline ?? '',
		title: record.title ?? '',
		topics: toStringArray(record.topics),
		speakers: toSpeakers(record.speakers),
		dateLabel: record.date_label ?? '',
		timeLabel: record.time_label ?? '',
		venue: record.venue ?? '',
		mode: record.mode === 'online' ? 'online' : 'onsite',
		pricing: record.pricing === 'paid' ? 'paid' : 'free',
		priceNote: record.price_note ?? '',
		price: formatRupiah(price),
		accent:
			record.accent === 'cream' || record.accent === 'maroon' ? record.accent : 'navy',
	};
}

/**
 * Memuat seluruh event yang sudah dipublikasikan dari koleksi `events`.
 * Dipakai halaman publik /event. Permintaan tidak membatalkan otomatis agar
 * daftar tetap termuat saat efek React berjalan ulang.
 */
export async function fetchPublishedEvents(): Promise<WebinarEvent[]> {
	const result = await pocketbaseClient.collection('events').getFullList({
		filter: 'published = true',
		sort: 'sort,created',
		requestKey: null,
	});
	return result.map(record => toWebinarEvent(record as unknown as EventRecord));
}
