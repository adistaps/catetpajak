/**
 * Server-only helpers for managing webinar events. Uses the superuser
 * PocketBase client so Admin Pusat routes can read/write the `events`
 * collection regardless of its public-read rules.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { apiError } from '@/lib/api.server';

export type EventRecord = {
	id: string;
	slug: string;
	badge: string;
	kicker: string;
	headline: string;
	title: string;
	topics: string[] | { name?: string }[];
	speakers: { name: string; role: string }[];
	date_label: string;
	time_label: string;
	venue: string;
	mode: 'onsite' | 'online';
	pricing: 'free' | 'paid';
	price_note: string;
	price: number;
	accent: 'navy' | 'cream' | 'maroon' | '';
	published: boolean;
	sort: number;
	created: string;
	updated: string;
};

export type ManagedEvent = {
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
	mode: 'onsite' | 'online';
	pricing: 'free' | 'paid';
	priceNote: string;
	price: number;
	accent: 'navy' | 'cream' | 'maroon';
	published: boolean;
	sort: number;
	created: string;
	updated: string;
	registrationCount?: number;
};

/** Jumlah peserta per slug. Satu pendaftaran dihitung sesuai quantity (minimal 1). */
export async function getRegistrationCounts(): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	let page = 1;
	for (;;) {
		const result = await pocketbaseAdmin.listRecords<{ event_slug?: string; quantity?: number }>(
			'event_registrations',
			{ page, perPage: 200, fields: 'event_slug,quantity' },
		);
		for (const item of result.items) {
			const slug = item.event_slug ?? '';
			if (!slug) continue;
			const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
			counts[slug] = (counts[slug] ?? 0) + qty;
		}
		if (page >= result.totalPages) break;
		page += 1;
	}
	return counts;
}

export function withRegistrationCount(
	event: ManagedEvent,
	counts: Record<string, number>,
): ManagedEvent {
	return { ...event, registrationCount: counts[event.slug] ?? 0 };
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
			return {
				name: String(obj.name ?? ''),
				role: String(obj.role ?? ''),
			};
		})
		.filter((item): item is { name: string; role: string } => item !== null);
}

function toManagedEvent(record: EventRecord): ManagedEvent {
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
		price: typeof record.price === 'number' ? record.price : Number(record.price ?? 0),
		accent:
			record.accent === 'cream' || record.accent === 'maroon' ? record.accent : 'navy',
		published: Boolean(record.published),
		sort: typeof record.sort === 'number' ? record.sort : Number(record.sort ?? 0),
		created: record.created ?? '',
		updated: record.updated ?? '',
	};
}

/** Semua event terdaftar (termasuk draft), terurut berdasarkan sort lalu judul. */
export async function getAllEvents(): Promise<ManagedEvent[]> {
	const result = await pocketbaseAdmin.listRecords<EventRecord>('events', {
		page: 1,
		perPage: 200,
		sort: 'sort,title',
	});
	return result.items.map(toManagedEvent);
}

export async function getEvent(id: string): Promise<ManagedEvent> {
	const record = await pocketbaseAdmin.getRecord<EventRecord>('events', id);
	return toManagedEvent(record);
}

export type EventInput = {
	slug: string;
	badge: string;
	kicker: string;
	headline: string;
	title: string;
	topics: string[];
	speakers: { name: string; role: string }[];
	date_label: string;
	time_label: string;
	venue: string;
	mode: 'onsite' | 'online';
	pricing: 'free' | 'paid';
	price_note: string;
	price: number;
	accent: 'navy' | 'cream' | 'maroon';
	published: boolean;
	sort: number;
};

const VALID_MODES = ['onsite', 'online'] as const;
const VALID_PRICING = ['free', 'paid'] as const;
const VALID_ACCENTS = ['navy', 'cream', 'maroon'] as const;

/** Memvalidasi input event; melempar 422 apiError bila tidak valid. */
export function validateEventInput(input: Partial<EventInput>): void {
	const title = (input.title ?? '').trim();
	if (!title) throw apiError(422, 'Judul event wajib diisi.');

	const slug = (input.slug ?? '').trim();
	if (!slug) throw apiError(422, 'Slug event wajib diisi.');
	if (!/^[a-z0-9-]+$/.test(slug)) {
		throw apiError(422, 'Slug hanya boleh huruf kecil, angka, dan tanda hubung.');
	}

	if (!VALID_MODES.includes(input.mode as (typeof VALID_MODES)[number])) {
		throw apiError(422, 'Mode event tidak valid (onsite/online).');
	}
	if (!VALID_PRICING.includes(input.pricing as (typeof VALID_PRICING)[number])) {
		throw apiError(422, 'Jenis harga tidak valid (free/paid).');
	}
	if (!VALID_ACCENTS.includes(input.accent as (typeof VALID_ACCENTS)[number])) {
		throw apiError(422, 'Tema warna poster tidak valid.');
	}

	if (!(input.date_label ?? '').trim()) {
		throw apiError(422, 'Tanggal (label) wajib diisi.');
	}

	const price = Number(input.price ?? 0);
	if (!Number.isFinite(price) || price < 0) {
		throw apiError(422, 'Harga tidak valid.');
	}
	if (input.pricing === 'paid' && price <= 0) {
		throw apiError(422, 'Event berbayar wajib memiliki harga lebih dari 0.');
	}
}

export async function createEvent(input: EventInput): Promise<ManagedEvent> {
	validateEventInput(input);
	const created = await pocketbaseAdmin.createRecord<EventRecord>('events', {
		slug: input.slug.trim(),
		badge: input.badge.trim(),
		kicker: input.kicker.trim(),
		headline: input.headline.trim(),
		title: input.title.trim(),
		topics: input.topics,
		speakers: input.speakers,
		date_label: input.date_label.trim(),
		time_label: input.time_label.trim(),
		venue: input.venue.trim(),
		mode: input.mode,
		pricing: input.pricing,
		price_note: input.price_note.trim(),
		price: Number(input.price ?? 0),
		accent: input.accent,
		published: Boolean(input.published),
		sort: Number(input.sort ?? 0),
	});
	return toManagedEvent(created);
}

export async function updateEvent(
	id: string,
	input: Partial<EventInput>,
): Promise<ManagedEvent> {
	validateEventInput(input);
	const updated = await pocketbaseAdmin.updateRecord<EventRecord>('events', id, {
		slug: input.slug?.trim(),
		badge: input.badge?.trim(),
		kicker: input.kicker?.trim(),
		headline: input.headline?.trim(),
		title: input.title?.trim(),
		topics: input.topics,
		speakers: input.speakers,
		date_label: input.date_label?.trim(),
		time_label: input.time_label?.trim(),
		venue: input.venue?.trim(),
		mode: input.mode,
		pricing: input.pricing,
		price_note: input.price_note?.trim(),
		price: Number(input.price ?? 0),
		accent: input.accent,
		published: Boolean(input.published),
		sort: Number(input.sort ?? 0),
	});
	return toManagedEvent(updated);
}

export async function deleteEvent(id: string): Promise<void> {
	await pocketbaseAdmin.deleteRecord('events', id);
}
