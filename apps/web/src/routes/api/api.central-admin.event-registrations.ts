import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

type RegistrationRecord = {
	id: string;
	event_slug: string;
	event_title: string;
	name: string;
	email: string;
	phone: string;
	company_name: string;
	notes: string;
	quantity: number;
	price_option: string;
	amount: number;
	amount_formatted: string;
	expected_amount: number;
	expected_amount_formatted: string;
	bank: string;
	proof: string;
	payment_status: string;
	payment_date: string;
	verification_notes: string;
	confirmation_email_sent: boolean;
	confirmation_email_sent_at: string;
	created: string;
	updated: string;
};

export type RegistrationListItem = {
	id: string;
	name: string;
	email: string;
	phone: string;
	company_name: string;
	notes: string;
	quantity: number;
	price_option: string;
	amount: number;
	amount_formatted: string;
	expected_amount: number;
	expected_amount_formatted: string;
	bank: string;
	proof_url: string;
	payment_status: string;
	payment_date: string;
	verification_notes: string;
	confirmation_email_sent: boolean;
	confirmation_email_sent_at: string;
	created: string;
};

const PUBLIC_PB_PREFIX = '/hcgi/platform';

function proofUrl(record: RegistrationRecord, token: string): string {
	if (!record.proof) return '';
	return `${PUBLIC_PB_PREFIX}/api/files/event_registrations/${record.id}/${record.proof}?token=${encodeURIComponent(token)}`;
}

function toListItem(record: RegistrationRecord, token: string): RegistrationListItem {
	return {
		id: record.id,
		name: record.name ?? '',
		email: record.email ?? '',
		phone: record.phone ?? '',
		company_name: record.company_name ?? '',
		notes: record.notes ?? '',
		quantity: typeof record.quantity === 'number' ? record.quantity : Number(record.quantity ?? 1) || 1,
		price_option: record.price_option ?? '',
		amount: typeof record.amount === 'number' ? record.amount : Number(record.amount ?? 0),
		amount_formatted: record.amount_formatted ?? '',
		expected_amount:
			typeof record.expected_amount === 'number'
				? record.expected_amount
				: Number(record.expected_amount ?? 0),
		expected_amount_formatted: record.expected_amount_formatted ?? '',
		bank: record.bank ?? '',
		proof_url: proofUrl(record, token),
		payment_status: record.payment_status ?? '',
		payment_date: record.payment_date ?? '',
		verification_notes: record.verification_notes ?? '',
		confirmation_email_sent: Boolean(record.confirmation_email_sent),
		confirmation_email_sent_at: record.confirmation_email_sent_at ?? '',
		created: record.created ?? '',
	};
}

/**
 * POST /api/central-admin/event-registrations — daftar peserta untuk satu event.
 * Body: { eventSlug: string }.
 *
 * Non-GET agar respons per-admin tidak di-cache edge. Hanya Admin Pusat yang
 * berwenang; data pribadi peserta tidak pernah tampil ke pengunjung publik.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method !== 'POST') {
		throw apiError(405, 'Metode tidak didukung.');
	}

	const body = await readJsonBody<{ eventSlug?: string }>(request);
	const slug = (body.eventSlug ?? '').trim();
	if (!slug) {
		throw apiError(422, 'Slug event wajib disertakan.');
	}

	const result = await pocketbaseAdmin.listRecords<RegistrationRecord>('event_registrations', {
		page: 1,
		perPage: 500,
		filter: pocketbaseAdmin.filter('event_slug = {:slug}', { slug }),
		sort: '-created',
	});

	const token = await pocketbaseAdmin.getFileToken();
	return json({ registrations: result.items.map(item => toListItem(item, token)) });
});
