import pb from '@/lib/pocketbase-client';

/** Jenis item yang dapat diberi like. */
export type LikeTarget = 'post' | 'comment' | 'reply';

const TARGET_FIELD: Record<LikeTarget, string> = {
	post: 'post',
	comment: 'comment',
	reply: 'reply',
};

function currentUserId(): string {
	return pb.authStore.record?.id ?? '';
}

/** Jumlah like untuk beberapa item sekaligus, satu permintaan. */
export async function listLikeCounts(
	target: LikeTarget,
	ids: string[],
): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	if (ids.length === 0) return counts;
	const field = TARGET_FIELD[target];
	const records = await pb.collection('accountant_likes').getFullList({
		fields: field,
		filter: ids.map(id => pb.filter(`${field} = {:id}`, { id })).join(' || '),
		requestKey: null,
	});
	for (const record of records) {
		const key = String(record[field] ?? '');
		if (!key) continue;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

/** Peta item yang sudah disukai pengguna login. */
export async function listMyLikes(
	target: LikeTarget,
	ids: string[],
): Promise<Record<string, boolean>> {
	const liked: Record<string, boolean> = {};
	const userId = currentUserId();
	if (!userId || ids.length === 0) return liked;
	const field = TARGET_FIELD[target];
	const records = await pb.collection('accountant_likes').getFullList({
		fields: field,
		filter: ids
			.map(id => pb.filter(`owner = {:uid} && ${field} = {:id}`, { uid: userId, id }))
			.join(' || '),
		requestKey: null,
	});
	for (const record of records) {
		const key = String(record[field] ?? '');
		if (key) liked[key] = true;
	}
	return liked;
}

/** Menambah atau menghapus like pengguna login; mengembalikan status akhir. */
export async function toggleLike(target: LikeTarget, id: string): Promise<boolean> {
	const userId = currentUserId();
	if (!userId) throw new Error('Masuk dulu untuk memberi suka.');
	const field = TARGET_FIELD[target];
	const existing = await pb.collection('accountant_likes').getFullList({
		filter: pb.filter(`owner = {:uid} && ${field} = {:id}`, { uid: userId, id }),
		requestKey: null,
	});
	if (existing.length > 0) {
		await pb.collection('accountant_likes').delete(existing[0].id);
		return false;
	}
	await pb.collection('accountant_likes').create({ owner: userId, [field]: id });
	return true;
}
