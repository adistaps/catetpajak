import { withApi, apiError, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { isCompanyFeatureEnabledServer } from '@/lib/feature-flags.server';
import { requireParentId } from '@/lib/parent-auth.server';

/**
 * Mengembalikan pengguna perusahaan (users) yang dapat dihubungi Parent —
 * pemilik perusahaan serta anggota aktif dari perusahaan tempat Parent
 * terdaftar (parent.company). Server memverifikasi sesi Parent terlebih
 * dahulu, lalu memastikan perusahaan yang dikembalikan benar-benar milik
 * Parent sehingga tidak ada kebocoran data antar perusahaan.
 */
export const loader = withApi(async ({ request }) => {
	if (request.method !== 'GET') throw apiError(405, 'Method not allowed');

	// Pemeriksaan fitur per perusahaan dilakukan setelah company Parent
	// teresolusi (lihat di bawah).

	const parentId = await requireParentId(request);

	let parentCompany = '';
	try {
		const parent = await pocketbaseAdmin.getRecord<{ company: string }>('parents', parentId);
		parentCompany = parent.company || '';
	} catch {
		throw apiError(404, 'Akun parent tidak ditemukan.');
	}
	if (!parentCompany) throw apiError(403, 'Akun parent belum terhubung ke perusahaan.');

	if (!(await isCompanyFeatureEnabledServer(parentCompany, 'parent'))) {
		throw apiError(403, 'Fitur Portal Parent sedang dinonaktifkan untuk perusahaan ini.');
	}

	// Pemilik perusahaan.
	const peers: Array<{ id: string; name: string; email: string; role?: string; position?: string; type: 'user' }> = [];
	try {
		const company = await pocketbaseAdmin.getRecord<{ owner: string; name?: string }>('companies', parentCompany);
		if (company.owner) {
			try {
				const owner = await pocketbaseAdmin.getRecord<{ email: string; name?: string }>('users', company.owner);
				peers.push({
					id: company.owner,
					name: owner.name || owner.email || 'Pemilik',
					email: owner.email,
					role: 'pemilik',
					type: 'user',
				});
			} catch {
				// skip missing owner user
			}
		}
	} catch {
		throw apiError(404, 'Perusahaan tidak ditemukan.');
	}

	// Anggota aktif perusahaan (bukan pemilik, sudah ditambahkan di atas).
	const members = await pocketbaseAdmin.listRecords<{
		user: string;
		name: string;
		email: string;
		role: string;
		status: string;
	}>('company_members', {
		page: 1,
		perPage: 500,
		filter: pocketbaseAdmin.filter('company = {:parentCompany} && status = "active"', { parentCompany }),
		sort: 'name',
	});

	const userIds = [...new Set(members.items.map(m => m.user).filter(Boolean))];
	const userMap = new Map<string, { email: string; name?: string }>();
	for (const id of userIds) {
		try {
			const u = await pocketbaseAdmin.getRecord<{ email: string; name?: string }>('users', id);
			userMap.set(id, { email: u.email, name: u.name });
		} catch {
			// skip missing users
		}
	}

	// Jabatan dari data karyawan perusahaan tempat Parent terdaftar.
	const positionByUser = new Map<string, string>();
	try {
		const employees = await pocketbaseAdmin.listRecords<{ user: string; position: string }>('employees', {
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('company = {:parentCompany} && user != ""', { parentCompany }),
		});
		for (const emp of employees.items) {
			if (emp.user && emp.position) positionByUser.set(emp.user, emp.position);
		}
	} catch {
		// jabatan opsional
	}

	for (const m of members.items) {
		if (peers.some(p => p.id === m.user)) continue;
		const u = userMap.get(m.user);
		peers.push({
			id: m.user,
			name: m.name || u?.name || u?.email || 'Anggota',
			email: u?.email ?? m.email,
			role: m.role,
			position: positionByUser.get(m.user) ?? '',
			type: 'user',
		});
	}

	return json({ peers });
});
