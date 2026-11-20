import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type { AkuntanProfile } from '@/lib/akuntan';

type IdRecord = { id: string; akuntan_role?: string };

function ownerIdOf(value: unknown): string {
	if (typeof value === 'string') return value.trim();
	if (Array.isArray(value)) return ownerIdOf(value[0]);
	if (value && typeof value === 'object' && 'id' in value) {
		return ownerIdOf((value as { id: unknown }).id);
	}
	return '';
}

const PAGE_SIZE = 200;

/**
 * Seluruh baris koleksi, bukan hanya halaman pertama. Batas 500 pada
 * pemanggilan sebelumnya bisa melewatkan akun pemilik yang masih ada
 * (lalu menyembunyikan profil yang sah) atau, sebaliknya, tidak melihat
 * profil yatim di halaman berikutnya.
 */
async function listAll<T extends IdRecord>(collection: string): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1; page <= 50; page += 1) {
		const result = await pocketbaseAdmin.listRecords<T>(collection, {
			page,
			perPage: PAGE_SIZE,
		});
		items.push(...result.items);
		if (result.items.length < PAGE_SIZE) break;
	}
	return items;
}

async function deleteIfPresent(collection: string, id: string): Promise<void> {
	try {
		await pocketbaseAdmin.deleteRecord(collection, id);
	} catch {
		// Sudah terhapus lewat cascade, atau tidak ada. Profil lain tidak disentuh.
	}
}

/**
 * Hapus hanya profil (dan posting yang menempel) yang akun pemiliknya sudah
 * tidak ada. Profil yang pemiliknya masih terdaftar tidak diubah.
 */
async function purgeOrphanProfiles(
	profiles: AkuntanProfile[],
	usersById: Map<string, IdRecord>,
): Promise<AkuntanProfile[]> {
	const valid: AkuntanProfile[] = [];
	const removedProfileIds = new Set<string>();

	for (const profile of profiles) {
		const ownerId = ownerIdOf(profile.owner);
		const owner = ownerId ? usersById.get(ownerId) : undefined;
		// Akun masih ada tetapi bukan Akuntan: sembunyikan, jangan hapus.
		if (owner && owner.akuntan_role === 'akuntan') {
			valid.push({ ...profile, owner: ownerId });
			continue;
		}
		if (owner) continue;
		removedProfileIds.add(profile.id);
		await deleteIfPresent('accountant_profiles', profile.id);
	}

	if (removedProfileIds.size === 0) return valid;

	const posts = await listAll<IdRecord & { owner?: string; accountant?: string }>('accountant_posts');
	for (const post of posts) {
		const ownerId = ownerIdOf(post.owner);
		const accountantId = ownerIdOf(post.accountant);
		if (removedProfileIds.has(accountantId) || !ownerId || !usersById.has(ownerId)) {
			await deleteIfPresent('accountant_posts', post.id);
		}
	}

	return valid;
}

/**
 * Profil akuntan yang akun pemiliknya masih ada.
 * Profil yatim dibersihkan di sini supaya data lama ikut hilang, bukan hanya
 * disembunyikan untuk permintaan berikutnya.
 */
export async function listValidAkuntanProfiles(): Promise<AkuntanProfile[]> {
	const [profiles, users] = await Promise.all([
		listAll<AkuntanProfile>('accountant_profiles'),
		listAll<IdRecord>('users'),
	]);
	const usersById = new Map(users.filter(user => user.id).map(user => [user.id, user]));
	const valid = await purgeOrphanProfiles(profiles, usersById);
	return valid.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}

type PostRecord = {
	id: string;
	accountant: unknown;
	owner: unknown;
	body: string;
	kind?: string;
	images: string[] | string;
	created: string;
	updated: string;
};

type ProfileSummary = {
	id: string;
	name: string;
	cv_name: string;
	city: string;
	photo: string;
	owner: string;
};

export type PublicAccountantPost = {
	id: string;
	accountant: string;
	owner: string;
	body: string;
	kind?: string;
	images: string[] | string;
	created: string;
	updated: string;
	expand?: {
		accountant?: ProfileSummary;
	};
};

/**
 * Hanya posting yang benar-benar publik untuk feed Aktivitas: `kind` bukan
 * `hl_store`, pemilik masih merupakan Akuntan aktif, dan profil direktori
 * pemiliknya masih ada. Diputuskan di sisi server (superuser) agar feed publik
 * konsisten untuk semua pengunjung — cabang aturan "pemilik dapat melihat
 * postingnya sendiri" pada `accountant_posts` tidak ikut membocorkan posting
 * yang sebenarnya tidak publik (mis. peran pemilik dikosongkan) ke feed
 * "untuk semua orang". Tidak menghapus data apa pun.
 */
export async function listPublicAccountantPosts(): Promise<PublicAccountantPost[]> {
	const [posts, profiles, users] = await Promise.all([
		listAll<PostRecord>('accountant_posts'),
		listAll<ProfileSummary & { owner: unknown }>('accountant_profiles'),
		listAll<IdRecord>('users'),
	]);
	const usersById = new Map(users.filter(user => user.id).map(user => [user.id, user]));
	const profilesById = new Map(
		profiles
			.filter(profile => profile.id)
			.map(profile => [
				profile.id,
				{
					id: profile.id,
					name: profile.name,
					cv_name: profile.cv_name,
					city: profile.city,
					photo: profile.photo,
					owner: ownerIdOf(profile.owner),
				} satisfies ProfileSummary,
			]),
	);

	const publicPosts: PublicAccountantPost[] = [];
	for (const post of posts) {
		if (post.kind === 'hl_store') continue;
		const ownerId = ownerIdOf(post.owner);
		const accountantId = ownerIdOf(post.accountant);
		const owner = ownerId ? usersById.get(ownerId) : undefined;
		if (!owner || owner.akuntan_role !== 'akuntan') continue;
		const profile = accountantId ? profilesById.get(accountantId) : undefined;
		if (!profile) continue;
		publicPosts.push({
			id: post.id,
			accountant: accountantId,
			owner: ownerId,
			body: post.body ?? '',
			kind: post.kind,
			images: post.images ?? [],
			created: post.created,
			updated: post.updated,
			expand: { accountant: profile },
		});
	}
	return publicPosts.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}
