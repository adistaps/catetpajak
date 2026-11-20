import { withApi, apiError, readJsonBody, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import logger from '@/lib/logger.server';

const ROLES = new Set([
	'pemilik',
	'admin',
	'akuntan',
	'finance',
	'hr',
	'pembaca',
	'karyawan',
	'kasir',
	'custom',
]);
const PERMS = new Set([
	'dasbor',
	'penjualan',
	'pembelian',
	'kas_bank',
	'aset',
	'biaya',
	'kontak',
	'produk',
	'perusahaan',
	'akun',
	'jurnal',
	'laporan',
	'pengguna',
	'payroll',
	'pajak',
	'karyawan',
]);

const ROLE_PERMS: Record<string, string[]> = {
	pemilik: [...PERMS],
	admin: [...PERMS],
	akuntan: [...PERMS].filter(p => p !== 'payroll'),
	finance: ['dasbor', 'payroll', 'kontak'],
	hr: ['dasbor', 'payroll', 'kontak'],
	pembaca: ['dasbor', 'laporan'],
	karyawan: ['dasbor', 'karyawan'],
	kasir: ['dasbor', 'penjualan'],
};

function randomPassword(length = 14): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
	let out = '';
	for (let i = 0; i < length; i += 1) {
		out += chars[Math.floor(Math.random() * chars.length)];
	}
	return out;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Resolves the caller from their PocketBase user token — never from the body. */
async function resolveActor(request: Request): Promise<string> {
	const header = request.headers.get('authorization') ?? '';
	const token = header.replace(/^Bearer\s+/i, '').trim();

	if (!token) throw apiError(401, 'Sesi tidak ditemukan. Silakan masuk kembali lalu coba lagi.');

	try {
		const auth = await pocketbaseAdmin.send<{ record?: { id?: string } }>(
			'/api/collections/users/auth-refresh',
			{ method: 'POST', headers: { Authorization: token } },
		);
		const id = auth.record?.id;

		if (!id) throw new Error('missing record id');

		return id;
	} catch {
		throw apiError(401, 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.');
	}
}

type Body = {
	action?: string;
	companyId?: string;
	actorUserId?: string;
	name?: string;
	email?: string;
	role?: string;
	permissions?: string[];
	canEdit?: boolean;
	accessLimited?: boolean;
	accessUntil?: string | null;
	memberId?: string;
	status?: string;
};

async function assertCanManage(companyId: string, actorUserId: string) {
	const company = await pocketbaseAdmin.getRecord<{ id: string; owner: string }>(
		'companies',
		companyId,
	);
	if (company.owner === actorUserId) return company;

	const memberships = await pocketbaseAdmin.listRecords<{
		id: string;
		role: string;
		permissions: string[];
		status: string;
	}>('company_members', {
		page: 1,
		perPage: 5,
		filter: pocketbaseAdmin.filter('company = {:companyId} && user = {:actorUserId} && status = "active"', { companyId, actorUserId }),
	});
	const m = memberships.items[0];
	if (!m) throw apiError(403, 'Tidak berwenang mengelola pengguna.');
	const perms = m.permissions ?? [];
	if (m.role !== 'pemilik' && m.role !== 'admin' && !perms.includes('pengguna')) {
		throw apiError(403, 'Peran Anda tidak dapat mengelola pengguna.');
	}
	return company;
}

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') throw apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const actionName = body.action ?? 'invite';
	const companyId = body.companyId?.trim();

	if (!companyId) throw apiError(422, 'companyId wajib.');

	// The actor is whoever owns the presented session token, so a request cannot
	// act on behalf of another user by passing their id in the body.
	const actorUserId = await resolveActor(request);

	const company = await assertCanManage(companyId, actorUserId);

	if (actionName === 'delete') {
		if (!body.memberId) throw apiError(422, 'memberId wajib.');
		const member = await pocketbaseAdmin.getRecord<{ user: string; owner: string }>(
			'company_members',
			body.memberId,
		);
		if (member.user === company.owner) {
			throw apiError(422, 'Pemilik perusahaan tidak dapat dihapus dari daftar anggota.');
		}
		await pocketbaseAdmin.deleteRecord('company_members', body.memberId);
		return json({ ok: true });
	}

	if (actionName === 'update') {
		if (!body.memberId) throw apiError(422, 'memberId wajib.');
		const role = body.role ?? 'akuntan';
		if (!ROLES.has(role)) throw apiError(422, 'Peran tidak valid.');
		let permissions =
			role === 'custom'
				? (body.permissions ?? []).filter(p => PERMS.has(p))
				: (ROLE_PERMS[role] ?? ['dasbor']);
		if (role === 'custom' && permissions.length === 0) permissions = ['dasbor', 'laporan'];
		const canEdit = role === 'pembaca' || role === 'karyawan' ? false : role === 'custom' ? Boolean(body.canEdit) : true;

		const patch: Record<string, unknown> = {
			role,
			permissions,
			can_edit: canEdit,
			access_limited: Boolean(body.accessLimited),
			access_until: body.accessLimited && body.accessUntil ? body.accessUntil : null,
		};
		if (body.name?.trim()) patch.name = body.name.trim();
		if (body.status && ['active', 'invited', 'disabled'].includes(body.status)) {
			patch.status = body.status;
		}

		const updated = await pocketbaseAdmin.updateRecord('company_members', body.memberId, patch);
		return json({ member: updated });
	}

	if (actionName === 'resend') {
		if (!body.memberId) throw apiError(422, 'memberId wajib.');
		const member = await pocketbaseAdmin.getRecord<{ user: string; email: string; status: string }>(
			'company_members',
			body.memberId,
		);
		if (member.status !== 'invited') {
			throw apiError(422, 'Hanya anggota berstatus diundang yang dapat dikirim ulang emailnya.');
		}
		if (!member.email) throw apiError(422, 'Email anggota tidak ditemukan.');
		try {
			await pocketbaseAdmin.send('/api/collections/users/request-password-reset', {
				method: 'POST',
				body: { email: member.email },
			});
		} catch (error) {
			logger.warn('resend invite: failed to send password-setup email', { error: String(error) });
			throw apiError(400, 'Gagal mengirim ulang email undangan. Coba lagi nanti.');
		}
		return json({ ok: true, invitationSent: true });
	}

	const name = body.name?.trim();
	const email = body.email?.trim().toLowerCase();
	const role = body.role ?? 'akuntan';
	if (!name || !email) throw apiError(422, 'Nama dan email wajib diisi.');
	if (!EMAIL_PATTERN.test(email)) throw apiError(422, 'Format email tidak valid.');
	if (!ROLES.has(role)) throw apiError(422, 'Peran tidak valid.');

	let permissions =
		role === 'custom'
			? (body.permissions ?? []).filter(p => PERMS.has(p))
			: (ROLE_PERMS[role] ?? ['dasbor']);
	if (role === 'custom' && permissions.length === 0) permissions = ['dasbor', 'laporan'];
	const canEdit = role === 'pembaca' || role === 'karyawan' ? false : role === 'custom' ? Boolean(body.canEdit) : true;

	let userId: string | null = null;
	let createdUser = false;
	let emailSent = false;

	try {
		const found = await pocketbaseAdmin.listRecords<{ id: string }>('users', {
			page: 1,
			perPage: 1,
			filter: pocketbaseAdmin.filter('email = {:email}', { email }),
		});
		if (found.items[0]) userId = found.items[0].id;
	} catch (error) {
		logger.warn('lookup user by email failed', { error: String(error) });
	}

	if (!userId) {
		const temporaryPassword = randomPassword();
		try {
			const created = await pocketbaseAdmin.createRecord<{ id: string }>('users', {
				email,
				password: temporaryPassword,
				passwordConfirm: temporaryPassword,
				name,
				emailVisibility: true,
				verified: true,
			});
			userId = created.id;
		} catch (error) {
			logger.warn('invite: failed to create user account', { error: String(error) });
			throw apiError(
				409,
				'Email ini sudah terdaftar dengan akun lain, atau data akun tidak valid. Gunakan email karyawan yang berbeda.',
			);
		}
		createdUser = true;
	}

	// Idempotent: inviting an email that already belongs to this company returns
	// the existing membership so the employee can simply be linked to it.
	const existing = await pocketbaseAdmin.listRecords<{ id: string }>('company_members', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('company = {:companyId} && user = {:userId}', { companyId, userId }),
	});
	if (existing.items[0]) {
		const member = await pocketbaseAdmin.getRecord('company_members', existing.items[0].id);
		return json({ member, createdUser: false, alreadyMember: true, invitationSent: false });
	}

	const member = await pocketbaseAdmin.createRecord('company_members', {
		company: companyId,
		user: userId,
		name,
		email,
		role,
		permissions,
		status: createdUser ? 'invited' : 'active',
		can_edit: canEdit,
		access_limited: Boolean(body.accessLimited),
		access_until: body.accessLimited && body.accessUntil ? body.accessUntil : null,
		owner: company.owner,
	});

	if (createdUser) {
		// Kirim email undangan berisi tautan untuk mengatur kata sandi. Sandi acak
		// tidak dibagikan; karyawan menentukan sendiri kata sandinya. Kegagalan
		// pengiriman tidak membatalkan undangan — UI memberi tahu bahwa email
		// perlu dikirim ulang.
		try {
			await pocketbaseAdmin.send('/api/collections/users/request-password-reset', {
				method: 'POST',
				body: { email },
			});
			emailSent = true;
		} catch (error) {
			logger.warn('invite: failed to send password-setup email', { error: String(error) });
		}
	}

	return json({
		member,
		createdUser,
		alreadyMember: false,
		temporaryPassword: '',
		invitationSent: createdUser && emailSent,
	});
});
