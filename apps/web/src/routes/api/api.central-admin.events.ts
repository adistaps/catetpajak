import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import {
	createEvent,
	deleteEvent,
	getAllEvents,
	getRegistrationCounts,
	updateEvent,
	withRegistrationCount,
	type EventInput,
} from '@/lib/events.server';

type EventPayload = {
	slug?: string;
	badge?: string;
	kicker?: string;
	headline?: string;
	title?: string;
	topics?: string[];
	speakers?: { name: string; role: string }[];
	date_label?: string;
	time_label?: string;
	venue?: string;
	mode?: string;
	pricing?: string;
	price_note?: string;
	price?: number;
	accent?: string;
	published?: boolean;
	sort?: number;
};

function toInput(payload: EventPayload): Partial<EventInput> {
	return {
		slug: payload.slug ?? '',
		badge: payload.badge ?? '',
		kicker: payload.kicker ?? '',
		headline: payload.headline ?? '',
		title: payload.title ?? '',
		topics: Array.isArray(payload.topics) ? payload.topics : [],
		speakers: Array.isArray(payload.speakers) ? payload.speakers : [],
		date_label: payload.date_label ?? '',
		time_label: payload.time_label ?? '',
		venue: payload.venue ?? '',
		mode: (payload.mode === 'online' ? 'online' : 'onsite') as 'onsite' | 'online',
		pricing: (payload.pricing === 'paid' ? 'paid' : 'free') as 'free' | 'paid',
		price_note: payload.price_note ?? '',
		price: Number(payload.price ?? 0),
		accent: (payload.accent === 'cream' || payload.accent === 'maroon'
			? payload.accent
			: 'navy') as 'navy' | 'cream' | 'maroon',
		published: Boolean(payload.published),
		sort: Number(payload.sort ?? 0),
	};
}

/**
 * POST /api/central-admin/events — daftar seluruh event (termasuk draft).
 * PATCH /api/central-admin/events — buat, perbarui, atau hapus event.
 *
 * Sengaja non-GET agar respons per-admin tidak di-cache di edge.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const [events, counts] = await Promise.all([getAllEvents(), getRegistrationCounts()]);
		return json({ events: events.map(event => withRegistrationCount(event, counts)) });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{ action: 'create' | 'update' | 'delete'; id?: string } & EventPayload>(
			request,
		);

		if (body.action === 'create') {
			const event = await createEvent(toInput(body) as EventInput);
			const counts = await getRegistrationCounts();
			return json({ event: withRegistrationCount(event, counts) });
		}

		if (body.action === 'update') {
			const id = (body.id ?? '').trim();
			if (!id) throw apiError(422, 'ID event wajib disertakan.');
			const event = await updateEvent(id, toInput(body));
			const counts = await getRegistrationCounts();
			return json({ event: withRegistrationCount(event, counts) });
		}

		if (body.action === 'delete') {
			const id = (body.id ?? '').trim();
			if (!id) throw apiError(422, 'ID event wajib disertakan.');
			await deleteEvent(id);
			return json({ ok: true, id });
		}

		throw apiError(422, 'Aksi tidak valid. Gunakan "create", "update", atau "delete".');
	}

	throw apiError(405, 'Metode tidak didukung.');
});
