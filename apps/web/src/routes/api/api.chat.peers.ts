import PocketBase from 'pocketbase';
import { withApi, apiError, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { isCompanyFeatureEnabledServer } from '@/lib/feature-flags.server';
import logger from '@/lib/logger.server';

/**
 * Returns active company members the caller may chat with — same company,
 * excluding the caller. Uses superuser reads so non-owner members are not
 * blocked by the company_members list rule (which only lets owners list all).
 * Access is verified: the caller must own the company or hold an active
 * membership in it.
 */
export const loader = withApi(async ({ request }) => {
	if (request.method !== 'GET') throw apiError(405, 'Method not allowed');

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
		logger.warn({ error }, 'chat-peers authRefresh failed');
		throw apiError(401, 'Sesi tidak valid. Silakan masuk kembali.');
	}
	if (!userId) throw apiError(401, 'Sesi tidak valid.');

	const url = new URL(request.url);
	const companyId = url.searchParams.get('company');
	if (!companyId) throw apiError(422, 'Parameter company wajib.');

	if (!(await isCompanyFeatureEnabledServer(companyId, 'chat'))) {
		throw apiError(403, 'Fitur Chat sedang dinonaktifkan untuk perusahaan ini.');
	}

	// Verify the caller belongs to this company (owner or active member).
	const myMemberships = await pocketbaseAdmin.listRecords<{ company: string; status: string }>(
		'company_members',
		{ page: 1, perPage: 200, filter: pocketbaseAdmin.filter('user = {:userId} && status = "active"', { userId }) },
	);
	const isMember = myMemberships.items.some(m => m.company === companyId);
	let isOwner = false;
	let ownerId = '';
	try {
		const company = await pocketbaseAdmin.getRecord<{ owner: string }>('companies', companyId);
		ownerId = company.owner;
		isOwner = company.owner === userId;
	} catch {
		throw apiError(404, 'Perusahaan tidak ditemukan.');
	}
	if (!isMember && !isOwner) throw apiError(403, 'Anda tidak memiliki akses ke perusahaan ini.');

	const members = await pocketbaseAdmin.listRecords<{
		user: string;
		name: string;
		email: string;
		role: string;
		status: string;
	}>('company_members', {
		page: 1,
		perPage: 500,
		filter: pocketbaseAdmin.filter('company = {:companyId} && status = "active" && user != {:userId}', { companyId, userId }),
		sort: 'name',
	});

	// Resolve user emails/names not stored on the member record.
	const userIds = [...new Set([...members.items.map(m => m.user).filter(Boolean), ownerId].filter(Boolean))];
	const userMap = new Map<string, { email: string; name?: string }>();
	for (const id of userIds) {
		try {
			const u = await pocketbaseAdmin.getRecord<{ email: string; name?: string }>('users', id);
			userMap.set(id, { email: u.email, name: u.name });
		} catch {
			// skip missing users
		}
	}

	// Jabatan diambil dari data karyawan perusahaan ini (opsional).
	const positionByUser = new Map<string, string>();
	try {
		const employees = await pocketbaseAdmin.listRecords<{ user: string; position: string }>('employees', {
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('company = {:companyId} && user != ""', { companyId }),
		});
		for (const emp of employees.items) {
			if (emp.user && emp.position) positionByUser.set(emp.user, emp.position);
		}
	} catch (error) {
		logger.warn({ error }, 'chat-peers employee position listing failed');
	}

	const peers = members.items
		.map(m => {
			const u = userMap.get(m.user);
			return {
				id: m.user,
				name: m.name || u?.name || u?.email || 'Tanpa nama',
				email: u?.email ?? m.email,
				role: m.role,
				position: positionByUser.get(m.user) ?? '',
				type: 'user' as const,
			};
		})
		.filter(p => p.id !== userId);

	// Tambahkan Owner perusahaan ke daftar peer jika pemanggil bukan owner dan owner belum ada di list
	if (ownerId && ownerId !== userId && !peers.some(p => p.id === ownerId)) {
		const ownerUser = userMap.get(ownerId);
		if (ownerUser) {
			peers.unshift({
				id: ownerId,
				name: ownerUser.name || ownerUser.email || 'Pemilik Perusahaan',
				email: ownerUser.email,
				role: 'owner',
				position: positionByUser.get(ownerId) ?? 'Owner',
				type: 'user' as const,
			});
		}
	}

	// Tambahkan akun Parent yang terdaftar di perusahaan ini. Parent tidak
	// diekspos secara global — hanya Parent yang company-nya sama dengan
	// perusahaan aktif pemanggil yang dikembalikan.
	let parentPeers: Array<{ id: string; name: string; email: string; type: 'parent' }> = [];
	try {
		const parents = await pocketbaseAdmin.listRecords<{ id: string; name: string; phone: string }>(
			'parents',
			{ page: 1, perPage: 500, filter: pocketbaseAdmin.filter('company = {:companyId}', { companyId }), sort: 'name' },
		);
		parentPeers = parents.items.map(p => ({
			id: p.id,
			name: p.name || 'Parent',
			email: p.phone || '',
			type: 'parent' as const,
		}));
	} catch (error) {
		logger.warn({ error }, 'chat-peers parent listing failed');
	}

	return json({ peers: [...peers, ...parentPeers] });
});
