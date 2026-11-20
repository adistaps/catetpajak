import { withApi, apiError, readJsonBody, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import logger from '@/lib/logger.server';

const FULL_ACCESS_ROLES = new Set(['pemilik', 'admin', 'akuntan']);

function randomPassword(length = 14): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
	let out = '';
	for (let i = 0; i < length; i += 1) {
		out += chars[Math.floor(Math.random() * chars.length)];
	}
	return out;
}

/**
 * Verifies the caller may manage parents for the given company: company owner,
 * central admin, or an active member with a full-access role. Company data
 * isolation is preserved — a member of company A cannot manage company B.
 */
async function assertCompanyManager(userId: string, companyId: string): Promise<void> {
	const company = await pocketbaseAdmin
		.getRecord<{ id: string; owner: string }>('companies', companyId)
		.catch(() => null);

	if (!company) throw apiError(404, 'Perusahaan tidak ditemukan.');

	if (company.owner === userId) return;

	const members = await pocketbaseAdmin.listRecords<{
		user: string;
		role: string;
		status: string;
	}>('company_members', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('company = {:companyId} && user = {:userId} && status = "active"', { companyId, userId }),
	});

	const member = members.items[0];
	if (!member || !FULL_ACCESS_ROLES.has(member.role)) {
		throw apiError(403, 'Anda tidak memiliki izin mengelola parent untuk perusahaan ini.');
	}
}

type Body = {
	action?: string;
	companyId?: string;
	name?: string;
	email?: string;
	phone?: string;
	parentId?: string;
	studentId?: string;
	studentIds?: string[];
	password?: string;
	passwordConfirm?: string;
};

export const action = withApi(async ({ request }) => {
	const userId = await requireUserId(request);
	const body = await readJsonBody<Body>(request);
	const action = body.action;
	const companyId = body.companyId;

	if (!companyId) throw apiError(422, 'ID perusahaan wajib diisi.');

	if (action === 'list') {
		await assertCompanyManager(userId, companyId);

		const students = await pocketbaseAdmin.listRecords<{
			id: string;
			student_name: string;
			student_id_number: string;
			parent: string;
		}>('students', {
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('company = {:companyId}', { companyId }),
			sort: 'student_name',
		});

		const parentIds = [
			...new Set(students.items.map((s) => s.parent).filter(Boolean) as string[]),
		];
		const parents: {
			id: string;
			name: string;
			email: string;
			phone: string;
			students: { id: string; student_name: string; student_id_number: string }[];
		}[] = [];

		for (const parentId of parentIds) {
			try {
				const rec = await pocketbaseAdmin.getRecord<{
					id: string;
					name: string;
					email: string;
					phone: string;
				}>('parents', parentId);
				parents.push({
					id: rec.id,
					name: rec.name || '',
					email: rec.email || '',
					phone: rec.phone || '',
					students: students.items
						.filter((s) => s.parent === parentId)
						.map((s) => ({
							id: s.id,
							student_name: s.student_name,
							student_id_number: s.student_id_number,
						})),
				});
			} catch (error) {
				logger.warn({ error, parentId }, 'parent manage: missing parent record');
			}
		}

		return json({ parents });
	}

	if (action === 'create') {
		await assertCompanyManager(userId, companyId);
		const email = (body.email || '').trim().toLowerCase();
		const name = (body.name || '').trim();
		if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			throw apiError(422, 'Email parent tidak valid.');
		}
		if (!name) throw apiError(422, 'Nama parent wajib diisi.');

		const password = randomPassword();
		try {
			const rec = await pocketbaseAdmin.createRecord<{
				id: string;
				email: string;
			}>('parents', {
				email,
				password,
				passwordConfirm: password,
				name,
				phone: (body.phone || '').trim(),
				company: companyId,
				emailVisibility: true,
			});

			// Kaitkan siswa terpilih ke parent baru (validasi company).
			const studentIds = Array.isArray(body.studentIds) ? body.studentIds : [];
			for (const sid of studentIds) {
				try {
					const student = await pocketbaseAdmin.getRecord<{ id: string; company: string }>(
						'students',
						sid,
					);
					if (student.company === companyId) {
						await pocketbaseAdmin.updateRecord('students', sid, { parent: rec.id });
					}
				} catch (error) {
					logger.warn({ error, sid }, 'parent create: skip invalid student link');
				}
			}

			// Kirim email undangan berisi tautan untuk mengatur kata sandi.
			// Sandi acak tidak dibagikan; parent menentukan sendiri sandinya.
			try {
				await pocketbaseAdmin.send('/api/collections/parents/request-password-reset', {
					method: 'POST',
					body: { email },
				});
			} catch (error) {
				logger.warn('parent invite: failed to send password-setup email', { error: String(error) });
			}

			return json({ parent: { id: rec.id, email: rec.email, name }, temporaryPassword: '', invitationSent: true });
		} catch (error) {
			logger.error({ error }, 'parent create failed');
			throw apiError(400, 'Gagal membuat akun parent. Email mungkin sudah terdaftar.');
		}
	}

	if (action === 'resend') {
		await assertCompanyManager(userId, companyId);
		const parentId = body.parentId;
		if (!parentId) throw apiError(422, 'Parent wajib diisi.');
		const parent = await pocketbaseAdmin
			.getRecord<{ id: string; email: string; company: string }>('parents', parentId)
			.catch(() => null);
		if (!parent || parent.company !== companyId) {
			throw apiError(404, 'Parent tidak ditemukan pada perusahaan ini.');
		}
		if (!parent.email) throw apiError(422, 'Email parent tidak ditemukan.');
		try {
			await pocketbaseAdmin.send('/api/collections/parents/request-password-reset', {
				method: 'POST',
				body: { email: parent.email },
			});
		} catch (error) {
			logger.warn('parent resend: failed to send password-setup email', { error: String(error) });
			throw apiError(400, 'Gagal mengirim ulang email undangan. Coba lagi nanti.');
		}
		return json({ ok: true, invitationSent: true });
	}

	if (action === 'link') {
		await assertCompanyManager(userId, companyId);
		const parentId = body.parentId;
		const studentId = body.studentId;
		if (!parentId || !studentId) throw apiError(422, 'Parent dan siswa wajib diisi.');

		const student = await pocketbaseAdmin
			.getRecord<{ id: string; company: string; parent: string }>('students', studentId)
			.catch(() => null);
		if (!student || student.company !== companyId) {
			throw apiError(404, 'Siswa tidak ditemukan pada perusahaan ini.');
		}
		const parent = await pocketbaseAdmin
			.getRecord<{ id: string; company: string }>('parents', parentId)
			.catch(() => null);
		if (!parent || parent.company !== companyId) {
			throw apiError(404, 'Parent tidak ditemukan pada perusahaan ini.');
		}

		await pocketbaseAdmin.updateRecord('students', studentId, { parent: parentId });
		return json({ ok: true });
	}

	if (action === 'reset-password') {
		await assertCompanyManager(userId, companyId);
		const parentId = body.parentId;
		const password = body.password || '';
		const passwordConfirm = body.passwordConfirm || '';
		if (!parentId) throw apiError(422, 'Parent wajib diisi.');
		if (password.length < 8) throw apiError(422, 'Kata sandi baru minimal 8 karakter.');
		if (password !== passwordConfirm) throw apiError(422, 'Konfirmasi tidak cocok dengan kata sandi baru.');

		const parent = await pocketbaseAdmin
			.getRecord<{ id: string; company: string }>('parents', parentId)
			.catch(() => null);
		if (!parent || parent.company !== companyId) {
			throw apiError(404, 'Parent tidak ditemukan pada perusahaan ini.');
		}

		try {
			await pocketbaseAdmin.updateRecord('parents', parentId, {
				password,
				passwordConfirm,
			});
		} catch (error) {
			logger.error({ error, parentId }, 'parent password reset failed');
			throw apiError(400, 'Gagal memperbarui kata sandi parent.');
		}

		return json({ ok: true });
	}

	if (action === 'unlink') {
		await assertCompanyManager(userId, companyId);
		const studentId = body.studentId;
		if (!studentId) throw apiError(422, 'Siswa wajib diisi.');
		const student = await pocketbaseAdmin
			.getRecord<{ id: string; company: string }>('students', studentId)
			.catch(() => null);
		if (!student || student.company !== companyId) {
			throw apiError(404, 'Siswa tidak ditemukan pada perusahaan ini.');
		}
		await pocketbaseAdmin.updateRecord('students', studentId, { parent: null });
		return json({ ok: true });
	}

	throw apiError(422, 'Aksi tidak dikenal.');
});
