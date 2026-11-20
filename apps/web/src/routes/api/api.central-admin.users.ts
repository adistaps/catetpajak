import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

type UserRecord = {
	id: string;
	email: string;
	name?: string;
	phone?: string;
	verified?: boolean;
	akuntan_role?: string;
	created: string;
};

function randomPassword(length = 14): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, b => chars[b % chars.length]).join('');
}

async function deleteOwned(collection: string, filter: string) {
	const result = await pocketbaseAdmin.listRecords<{ id: string }>(collection, {
		page: 1,
		perPage: 200,
		filter,
	});
	for (const record of result.items) {
		try {
			await pocketbaseAdmin.deleteRecord(collection, record.id);
		} catch {
			// record mungkin sudah terhapus lewat cascade
		}
	}
}

/** Profil, posting, dan permintaan CV yang dimiliki akun ini — bukan pengguna lain. */
async function deleteAccountantPublicData(userId: string) {
	const profiles = await pocketbaseAdmin.listRecords<{ id: string }>('accountant_profiles', {
		page: 1,
		perPage: 20,
		filter: pocketbaseAdmin.filter('owner = {:userId}', { userId }),
	});
	for (const profile of profiles.items) {
		await deleteOwned('accountant_posts', pocketbaseAdmin.filter('accountant = {:id}', { id: profile.id }));
		await deleteOwned('cv_requests', pocketbaseAdmin.filter('accountant = {:id}', { id: profile.id }));
		try {
			await pocketbaseAdmin.deleteRecord('accountant_profiles', profile.id);
		} catch {
			// hook penghapusan akun akan mencoba lagi di transaksi yang sama
		}
	}
	await deleteOwned('accountant_posts', pocketbaseAdmin.filter('owner = {:userId}', { userId }));
	await deleteOwned('cv_requests', pocketbaseAdmin.filter('seeker = {:userId}', { userId }));
}

async function findUserByEmail(email: string): Promise<UserRecord | null> {
	const result = await pocketbaseAdmin.listRecords<UserRecord>('users', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('email = {:email}', { email }),
	});
	return result.items[0] ?? null;
}

/**
 * POST /api/central-admin/users — every registered user with their role,
 * central-admin status, and company counts.
 * PATCH /api/central-admin/users — create, delete, or invite (grant back-end
 * access) a user.
 *
 * Non-GET so per-admin responses are never edge-cached.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const [usersResult, adminsResult, companiesResult, membersResult] = await Promise.all([
			pocketbaseAdmin.listRecords<UserRecord>('users', {
				page: 1,
				perPage: 500,
				sort: '-created',
			}),
			pocketbaseAdmin.listRecords<{ user: string }>('central_admins', {
				page: 1,
				perPage: 500,
			}),
			pocketbaseAdmin.listRecords<{ owner: string }>('companies', {
				page: 1,
				perPage: 1000,
			}),
			pocketbaseAdmin.listRecords<{ user: string }>('company_members', {
				page: 1,
				perPage: 1000,
			}),
		]);

		const adminUserIds = new Set(adminsResult.items.map(item => item.user).filter(Boolean));
		const ownedCounts = new Map<string, number>();
		for (const company of companiesResult.items) {
			if (!company.owner) continue;
			ownedCounts.set(company.owner, (ownedCounts.get(company.owner) ?? 0) + 1);
		}
		const memberCounts = new Map<string, number>();
		for (const member of membersResult.items) {
			if (!member.user) continue;
			memberCounts.set(member.user, (memberCounts.get(member.user) ?? 0) + 1);
		}

		// Nomor HP juga dapat diisi pada profil Akuntan. Gunakan nomor akun
		// terlebih dahulu, lalu nomor profil bila nomor akun belum tersedia.
		const profilePhones = new Map<string, string>();
		if (usersResult.items.some(user => user.akuntan_role === 'akuntan' && !user.phone?.trim())) {
			let page = 1;
			let totalPages = 1;
			do {
				const profiles = await pocketbaseAdmin.listRecords<{ owner: string; phone?: string }>('accountant_profiles', {
					page,
					perPage: 500,
					filter: "phone != ''",
					fields: 'owner,phone',
				});
				for (const profile of profiles.items) {
					if (profile.owner && profile.phone?.trim()) profilePhones.set(profile.owner, profile.phone.trim());
				}
				totalPages = profiles.totalPages;
				page += 1;
			} while (page <= totalPages);
		}

		const users = usersResult.items.map(user => {
			const accountPhone = user.phone?.trim() ?? '';
			const profilePhone = user.akuntan_role === 'akuntan' ? profilePhones.get(user.id) ?? '' : '';
			return {
				id: user.id,
				email: user.email,
				name: user.name ?? '',
				phone: accountPhone || profilePhone,
				phoneSource: accountPhone ? 'akun' : profilePhone ? 'profil' : null,
				verified: Boolean(user.verified),
				akuntan_role: user.akuntan_role ?? '',
				isCentralAdmin: adminUserIds.has(user.id),
				ownedCompanies: ownedCounts.get(user.id) ?? 0,
				memberCompanies: memberCounts.get(user.id) ?? 0,
				created: user.created,
			};
		});

		return json({ users });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{
			action: 'create' | 'delete' | 'invite' | 'resend';
			email?: string;
			password?: string;
			name?: string;
			id?: string;
		}>(request);

		if (body.action === 'create') {
			const email = (body.email ?? '').trim().toLowerCase();
			const password = body.password ?? '';
			const name = (body.name ?? '').trim();
			if (!email || !email.includes('@')) {
				throw apiError(422, 'Email yang valid wajib diisi.');
			}
			if (password.length < 8) {
				throw apiError(422, 'Kata sandi minimal 8 karakter.');
			}
			if (!name) {
				throw apiError(422, 'Nama wajib diisi.');
			}

			const existing = await findUserByEmail(email);
			if (existing) {
				throw apiError(409, 'Email sudah terdaftar.');
			}

			const created = await pocketbaseAdmin.createRecord<UserRecord>('users', {
				email,
				password,
				passwordConfirm: password,
				name,
				emailVisibility: true,
			});

			return json({
				user: {
					id: created.id,
					email: created.email,
					name: created.name ?? name,
					created: created.created,
				},
			});
		}

		if (body.action === 'invite') {
			// Invite a user to the back end: create the account (if missing) and
			// grant central-admin access. A password-setup email is sent to new
			// users so they choose their own password; no temp password is shared.
			const email = (body.email ?? '').trim().toLowerCase();
			const name = (body.name ?? '').trim();
			if (!email || !email.includes('@')) {
				throw apiError(422, 'Email yang valid wajib diisi.');
			}

			let user = await findUserByEmail(email);
			let createdUser = false;

			if (!user) {
				if (!name) throw apiError(422, 'Nama wajib diisi untuk pengguna baru.');
				const temporaryPassword = randomPassword();
				user = await pocketbaseAdmin.createRecord<UserRecord>('users', {
					email,
					password: temporaryPassword,
					passwordConfirm: temporaryPassword,
					name,
					emailVisibility: true,
					verified: true,
				});
				createdUser = true;
				try {
					await pocketbaseAdmin.send('/api/collections/users/request-password-reset', {
						method: 'POST',
						body: { email },
					});
				} catch {
					// best-effort: jangan gagalkan undangan jika email gagal terkirim
				}
			}

			// Grant central-admin access if not already.
			const existingAdmins = await pocketbaseAdmin.listRecords<{ user: string }>(
				'central_admins',
				{ page: 1, perPage: 1, filter: pocketbaseAdmin.filter('user = {:id}', { id: user.id }) },
			);
			if (existingAdmins.items.length === 0) {
				await pocketbaseAdmin.createRecord('central_admins', {
					user: user.id,
					name: name || user.name || email,
					notes: 'Diundang ke back end oleh admin pusat.',
				});
			}

			return json({
				user: {
					id: user.id,
					email: user.email,
					name: name || user.name || '',
					isCentralAdmin: true,
				},
				temporaryPassword: '',
				createdUser,
				invitationSent: createdUser,
			});
		}

		if (body.action === 'resend') {
			const id = (body.id ?? '').trim();
			if (!id) throw apiError(422, 'ID pengguna wajib disertakan.');
			const user = await pocketbaseAdmin.getRecord<UserRecord>('users', id);
			if (!user.email) throw apiError(422, 'Email pengguna tidak ditemukan.');
			try {
				await pocketbaseAdmin.send('/api/collections/users/request-password-reset', {
					method: 'POST',
					body: { email: user.email },
				});
			} catch (error) {
				// best-effort: beri tahu admin jika pengiriman gagal total
				throw apiError(400, 'Gagal mengirim ulang email atur kata sandi. Coba lagi nanti.');
			}
			return json({ ok: true, invitationSent: true });
		}

		if (body.action === 'delete') {
			const id = (body.id ?? '').trim();
			if (!id) throw apiError(422, 'ID pengguna wajib disertakan.');
			if (!/^[a-z0-9]{15}$/.test(id)) throw apiError(422, 'ID pengguna tidak valid.');

			// Block deletion when the user owns companies — deleting them would
			// cascade-delete those companies and all their data. The admin must
			// delete or reassign the companies first.
			const owned = await pocketbaseAdmin.listRecords<{ id: string }>('companies', {
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter('owner = {:id}', { id }),
			});
			if (owned.items.length > 0) {
				// Akun tidak boleh dihapus (perusahaan ikut hilang), tetapi kartu
				// direktori publik tetap dicabut agar tidak tampil sebagai akuntan.
				await deleteAccountantPublicData(id);
				try {
					await pocketbaseAdmin.updateRecord('users', id, { akuntan_role: '' });
				} catch {
					// peran terkunci; profil publik sudah dihapus di atas
				}
				throw apiError(
					409,
					'Pengguna ini memiliki perusahaan, jadi akunnya tidak dihapus. Profil publik di direktori akuntan sudah dicabut.',
				);
			}

			// Remove central-admin record first to keep the allowlist clean.
			try {
				const adminRecords = await pocketbaseAdmin.listRecords<{ id: string }>('central_admins', {
					page: 1,
					perPage: 10,
					filter: pocketbaseAdmin.filter('user = {:id}', { id }),
				});
				for (const record of adminRecords.items) {
					await pocketbaseAdmin.deleteRecord('central_admins', record.id);
				}
			} catch {
				// best effort
			}

			// Profil publik milik akun ini saja. Cascade tidak selalu menghapusnya,
			// sehingga kartu direktori tetap tampil setelah akun hilang.
			await deleteAccountantPublicData(id);

			await pocketbaseAdmin.deleteRecord('users', id);
			return json({ ok: true, id });
		}

		throw apiError(422, 'Aksi tidak valid. Gunakan "create", "delete", "invite", atau "resend".');
	}

	throw apiError(405, 'Metode tidak didukung.');
});
