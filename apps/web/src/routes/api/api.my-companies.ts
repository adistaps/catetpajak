import PocketBase from 'pocketbase';
import { withApi, apiError, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import logger from '@/lib/logger.server';

/**
 * Returns companies the caller can access (owned + active memberships).
 * Uses the caller's Bearer token to identify them, then superuser reads so
 * ESS members are not blocked by fragile @collection list rules on companies.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') throw apiError(405, 'Method not allowed');

	const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) throw apiError(401, 'Autentikasi diperlukan.');

	const pbUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
	const userPb = new PocketBase(pbUrl);
	userPb.authStore.save(token, null);

	let userId = '';
	try {
		const refreshed = await userPb.collection('users').authRefresh();
		userId = refreshed.record?.id || userPb.authStore.record?.id || '';
	} catch (error) {
		logger.warn({ error }, 'my-companies authRefresh failed');
		throw apiError(401, 'Sesi tidak valid. Silakan masuk kembali.');
	}

	if (!userId) throw apiError(401, 'Sesi tidak valid.');

	const memberships = await pocketbaseAdmin.listRecords<{
		id: string;
		company: string;
		user: string;
		role: string;
		status: string;
		name: string;
		email: string;
		permissions: string[];
		can_edit: boolean;
		access_limited: boolean;
		access_until?: string;
		owner: string;
		created: string;
		updated: string;
	}>('company_members', {
		page: 1,
		perPage: 200,
		filter: pocketbaseAdmin.filter('user = {:userId} && status = "active"', { userId }),
	});

	const owned = await pocketbaseAdmin.listRecords<{
		id: string;
		name: string;
		code?: string;
		address?: string;
		owner: string;
		conversion_date?: string;
		created: string;
		updated: string;
	}>('companies', {
		page: 1,
		perPage: 200,
		filter: pocketbaseAdmin.filter('owner = {:userId}', { userId }),
		sort: 'name',
	});

	const byId = new Map<string, (typeof owned.items)[number]>();
	for (const company of owned.items) byId.set(company.id, company);

	for (const member of memberships.items) {
		if (!member.company || byId.has(member.company)) continue;
		try {
			const company = await pocketbaseAdmin.getRecord<(typeof owned.items)[number]>(
				'companies',
				member.company,
			);
			byId.set(company.id, company);
		} catch (error) {
			logger.warn({ error, companyId: member.company }, 'my-companies missing company');
		}
	}

	const companies = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
	const isKaryawan =
		memberships.items.length > 0 &&
		memberships.items.every(m => m.role === 'karyawan') &&
		owned.items.length === 0;

	return json({
		companies,
		memberships: memberships.items.map(m => ({
			id: m.id,
			company: m.company,
			user: m.user,
			role: m.role,
			status: m.status,
			name: m.name,
			email: m.email,
			// permissions/can_edit/access_* wajib dikembalikan agar pemeriksaan
			// izin peran (memberHasPermission) di sisi klien tidak salah tolak —
			// tanpa ini kasir/akuntan/role lain memantul ke dasbor.
			permissions: m.permissions ?? [],
			can_edit: m.can_edit ?? false,
			access_limited: m.access_limited ?? false,
			access_until: m.access_until ?? undefined,
			owner: m.owner,
			created: m.created,
			updated: m.updated,
		})),
		isKaryawan,
		userId,
	});
});
