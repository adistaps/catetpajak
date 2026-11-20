import pb from '@/lib/pocketbase-client';
import type { RecordModel } from 'pocketbase';
import type { AkuntanProfile } from '@/lib/akuntan';

/** Posting aktivitas harian pada profil publik akuntan. */
export type AccountantPost = {
	id: string;
	accountant: string;
	owner: string;
	body: string;
	kind?: string;
	images: string[] | string;
	created: string;
	updated: string;
};

export const POST_IMAGE_LIMIT = 6;
export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POST_BODY_MAX = 2000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Tujuan posting: `aktivitas` untuk feed Activity, `hl_store` untuk Highlight kartu Akuntan. */
export type PostKind = 'aktivitas' | 'hl_store';

/** Tujuan sebuah posting; posting lama tanpa `kind` dianggap aktivitas. */
export function postKind(post: { kind?: string | null }): PostKind {
	return post.kind === 'hl_store' ? 'hl_store' : 'aktivitas';
}

export function postImageNames(post: { images: string[] | string }): string[] {
	if (Array.isArray(post.images)) return post.images.filter(Boolean);
	return post.images ? [post.images] : [];
}

export function postImageUrl(post: { id: string }, filename: string, thumb?: string): string {
	return pb.files.getURL(
		{ id: post.id, collectionId: 'accountant_posts', collectionName: 'accountant_posts' } as RecordModel,
		filename,
		thumb ? { thumb } : {},
	);
}

/** Validasi draf Highlight HL Store: hanya gambar, tanpa teks. */
export function validateHighlightDraft(files: File[]): string | null {
	if (files.length === 0) return 'Unggah minimal satu gambar untuk Highlight.';
	if (files.length > POST_IMAGE_LIMIT) return `Maksimal ${POST_IMAGE_LIMIT} gambar per Highlight.`;
	for (const file of files) {
		if (!IMAGE_TYPES.includes(file.type)) return 'Gambar harus JPG, PNG, atau WebP.';
		if (file.size > POST_IMAGE_MAX_BYTES) return 'Setiap gambar maksimal 5 MB.';
	}
	return null;
}

export function validatePostDraft(body: string, imageCount: number, files: File[]): string | null {
	const text = body.trim();
	if (!text && imageCount === 0) return 'Tulis aktivitas atau unggah minimal satu gambar.';
	if (text.length > POST_BODY_MAX) return `Teks maksimal ${POST_BODY_MAX} karakter.`;
	if (imageCount > POST_IMAGE_LIMIT) return `Maksimal ${POST_IMAGE_LIMIT} gambar per posting.`;
	for (const file of files) {
		if (!IMAGE_TYPES.includes(file.type)) return 'Gambar harus JPG, PNG, atau WebP.';
		if (file.size > POST_IMAGE_MAX_BYTES) return 'Setiap gambar maksimal 5 MB.';
	}
	return null;
}

export async function listAccountantPosts(accountantId: string): Promise<AccountantPost[]> {
	const records = await pb.collection('accountant_posts').getFullList({
		filter: pb.filter('accountant = {:id} && kind != "hl_store"', { id: accountantId }),
		sort: '-created',
		requestKey: `posts-${accountantId}`,
	});
	return records as unknown as AccountantPost[];
}

export async function createAccountantPost(input: {
	accountantId: string;
	ownerId: string;
	body: string;
	files: File[];
	kind?: PostKind;
}): Promise<AccountantPost> {
	const fd = new FormData();
	fd.append('accountant', input.accountantId);
	fd.append('owner', input.ownerId);
	fd.append('body', input.body.trim());
	fd.append('kind', input.kind ?? 'aktivitas');
	for (const file of input.files) fd.append('images', file);
	const record = await pb.collection('accountant_posts').create(fd);
	return record as unknown as AccountantPost;
}

export async function updateAccountantPost(
	id: string,
	input: { body: string; files: File[]; remove: string[] },
): Promise<AccountantPost> {
	const fd = new FormData();
	fd.append('body', input.body.trim());
	for (const file of input.files) fd.append('images', file);
	for (const name of input.remove) fd.append('images-', name);
	const record = await pb.collection('accountant_posts').update(id, fd);
	return record as unknown as AccountantPost;
}

export async function deleteAccountantPost(id: string): Promise<void> {
	await pb.collection('accountant_posts').delete(id);
}

/** Posting aktivitas dengan profil akuntan yang diperluas, untuk feed publik Activity. */
export type AccountantFeedPost = AccountantPost & {
	expand?: {
		accountant?: Pick<
			AkuntanProfile,
			'id' | 'name' | 'cv_name' | 'city' | 'photo' | 'owner'
		>;
	};
};

/**
 * Seluruh posting aktivitas akuntan yang benar-benar publik, terbaru duluan,
 * beserta profil pemiliknya. Diambil lewat route server `/api/akuntan/posts`
 * yang menyaring hanya posting `kind != hl_store` milik Akuntan aktif yang
 * profilnya masih ada — sehingga feed publik konsisten untuk semua pengunjung
 * dan tidak membocorkan posting yang sebenarnya tidak publik (mis. peran
 * pemilik dikosongkan) lewat cabang aturan "pemilik dapat melihat postingnya
 * sendiri".
 */
export async function listAllAccountantPosts(): Promise<AccountantFeedPost[]> {
	const res = await fetch(`/api/akuntan/posts?t=${Date.now()}`, {
		method: 'POST',
		cache: 'no-store',
		headers: { 'cache-control': 'no-cache' },
	});
	if (!res.ok) {
		throw new Error('Gagal memuat aktivitas.');
	}
	const data = (await res.json()) as { posts?: AccountantFeedPost[] };
	const posts = Array.isArray(data.posts) ? data.posts : [];
	// Lapisan kedua: server sudah menyaring, tapi pastikan klien juga hanya
	// menampilkan posting aktivitas milik profil yang benar-benar ada.
	return posts.filter(
		post => postKind(post) !== 'hl_store' && Boolean(post.expand?.accountant?.id && post.owner),
	);
}

/** Satu posting publik beserta profil pemiliknya. */
export async function getAccountantPost(id: string): Promise<AccountantFeedPost | null> {
	try {
		const record = await pb.collection('accountant_posts').getOne(id, {
			expand: 'accountant',
			requestKey: `activity-post-${id}`,
		});
		const post = record as unknown as AccountantFeedPost;
		// Highlight HL Store bukan bagian feed Activity publik.
		if (postKind(post) === 'hl_store') return null;
		if (!post.expand?.accountant?.id || !post.owner) return null;
		return post;
	} catch {
		return null;
	}
}

export const COMMENT_BODY_MAX = 1000;
export const COMMENT_BODY_MIN = 2;

export type PostComment = {
	id: string;
	post: string;
	owner: string;
	author_name: string;
	body: string;
	created: string;
};

export function validateComment(body: string): string | null {
	const text = body.trim();
	if (text.length < COMMENT_BODY_MIN) return 'Komentar minimal 2 karakter.';
	if (text.length > COMMENT_BODY_MAX) return `Komentar maksimal ${COMMENT_BODY_MAX} karakter.`;
	return null;
}

export function commentAuthorName(user: Record<string, unknown> | null): string {
	const name = typeof user?.name === 'string' ? user.name.trim() : '';
	if (name) return name.slice(0, 120);
	const email = typeof user?.email === 'string' ? user.email : '';
	const local = email.split('@')[0]?.trim();
	return (local || 'Pengguna').slice(0, 120);
}

/** Jumlah komentar per posting, satu permintaan untuk seluruh feed. */
export async function listCommentCounts(postIds: string[]): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	if (postIds.length === 0) return counts;
	// Dipecah per kelompok agar filter tidak melebihi batas panjang, dan
	// requestKey null agar permintaan ini tidak saling membatalkan.
	const BATCH = 40;
	for (let start = 0; start < postIds.length; start += BATCH) {
		const batch = postIds.slice(start, start + BATCH);
		const records = await pb.collection('accountant_post_comments').getFullList({
			fields: 'post',
			filter: batch.map(id => pb.filter('post = {:id}', { id })).join(' || '),
			requestKey: null,
		});
		for (const record of records) {
			const post = String(record.post ?? '');
			if (!post) continue;
			counts[post] = (counts[post] ?? 0) + 1;
		}
	}
	return counts;
}

export async function listPostComments(postId: string): Promise<PostComment[]> {
	const records = await pb.collection('accountant_post_comments').getFullList({
		filter: pb.filter('post = {:id}', { id: postId }),
		sort: 'created',
		requestKey: `comments-${postId}`,
	});
	return records as unknown as PostComment[];
}

export async function createPostComment(input: {
	postId: string;
	ownerId: string;
	authorName: string;
	body: string;
}): Promise<PostComment> {
	const record = await pb.collection('accountant_post_comments').create({
		post: input.postId,
		owner: input.ownerId,
		author_name: input.authorName.slice(0, 120),
		body: input.body.trim(),
	});
	return record as unknown as PostComment;
}

export async function deletePostComment(id: string): Promise<void> {
	await pb.collection('accountant_post_comments').delete(id);
}

/** Balasan komentar dengan teks dan gambar. */
export type PostReply = {
	id: string;
	comment: string;
	owner: string;
	author_name: string;
	body: string;
	images: string[] | string;
	created: string;
	updated: string;
};

export const REPLY_BODY_MAX = 1000;
export const REPLY_IMAGE_LIMIT = 6;
export const REPLY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const REPLY_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function replyImageNames(reply: { images: string[] | string }): string[] {
	if (Array.isArray(reply.images)) return reply.images.filter(Boolean);
	return reply.images ? [reply.images] : [];
}

export function replyImageUrl(reply: { id: string }, filename: string, thumb?: string): string {
	return pb.files.getURL(
		{ id: reply.id, collectionId: 'accountant_post_comment_replies', collectionName: 'accountant_post_comment_replies' } as RecordModel,
		filename,
		thumb ? { thumb } : {},
	);
}

export function validateReplyDraft(body: string, files: File[]): string | null {
	const text = body.trim();
	if (!text && files.length === 0) return 'Tulis balasan atau unggah minimal satu gambar.';
	if (text.length > REPLY_BODY_MAX) return `Balasan maksimal ${REPLY_BODY_MAX} karakter.`;
	if (files.length > REPLY_IMAGE_LIMIT) return `Maksimal ${REPLY_IMAGE_LIMIT} gambar per balasan.`;
	for (const file of files) {
		if (!REPLY_IMAGE_TYPES.includes(file.type)) return 'Gambar harus JPG, PNG, atau WebP.';
		if (file.size > REPLY_IMAGE_MAX_BYTES) return 'Setiap gambar maksimal 5 MB.';
	}
	return null;
}

/** Seluruh balasan untuk beberapa komentar sekaligus, dikelompokkan per komentar. */
export async function listCommentReplies(commentIds: string[]): Promise<Record<string, PostReply[]>> {
	const grouped: Record<string, PostReply[]> = {};
	if (commentIds.length === 0) return grouped;
	const records = await pb.collection('accountant_post_comment_replies').getFullList({
		filter: commentIds.map(id => pb.filter('comment = {:id}', { id })).join(' || '),
		sort: 'created',
		requestKey: 'comment-replies',
	});
	for (const record of records as unknown as PostReply[]) {
		const comment = String(record.comment ?? '');
		if (!comment) continue;
		grouped[comment] = [...(grouped[comment] ?? []), record];
	}
	return grouped;
}

export async function createCommentReply(input: {
	commentId: string;
	ownerId: string;
	authorName: string;
	body: string;
	files: File[];
}): Promise<PostReply> {
	const fd = new FormData();
	fd.append('comment', input.commentId);
	fd.append('owner', input.ownerId);
	fd.append('author_name', input.authorName.slice(0, 120));
	fd.append('body', input.body.trim());
	for (const file of input.files) fd.append('images', file);
	const record = await pb.collection('accountant_post_comment_replies').create(fd);
	return record as unknown as PostReply;
}

export async function deleteCommentReply(id: string): Promise<void> {
	await pb.collection('accountant_post_comment_replies').delete(id);
}

/** Seluruh posting HL Store (Highlight kartu Akuntan), terbaru duluan. */
export async function listAllAccountantHighlights(): Promise<AccountantPost[]> {
	const records = await pb.collection('accountant_posts').getFullList({
		filter: 'kind = "hl_store"',
		sort: '-created',
		requestKey: 'hl-store-highlights',
	});
	return records as unknown as AccountantPost[];
}

/** Seluruh posting HL Store per akuntan (terbaru duluan), untuk story HL Store. */
export function hlPostsByAccountant(posts: AccountantPost[]): Map<string, AccountantPost[]> {
	const grouped = new Map<string, AccountantPost[]>();
	for (const post of posts) {
		if (postKind(post) !== 'hl_store' || !post.accountant) continue;
		grouped.set(post.accountant, [...(grouped.get(post.accountant) ?? []), post]);
	}
	return grouped;
}

/** Posting HL Store terbaru per akuntan, untuk badge Highlight pada kartu direktori. */
export function latestHighlightByAccountant(posts: AccountantPost[]): Map<string, AccountantPost> {
	const latest = new Map<string, AccountantPost>();
	for (const post of posts) {
		if (postKind(post) !== 'hl_store' || !post.accountant) continue;
		if (!latest.has(post.accountant)) latest.set(post.accountant, post);
	}
	return latest;
}
