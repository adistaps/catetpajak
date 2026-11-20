import { apiError } from '@/lib/api.server';

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/**
 * Verifies a `parents` auth-collection Bearer token and returns the parent id.
 * Mirrors `requireUserId` but for the separate `parents` auth collection, so a
 * regular `users` session cannot impersonate a parent.
 */
export const requireParentId = async (request: Request): Promise<string> => {
	const header = request.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

	if (!token) {
		throw apiError(401, 'Sesi parent tidak ditemukan. Silakan masuk ulang.');
	}

	const response = await fetch(`${pocketbaseUrl()}/api/collections/parents/auth-refresh`, {
		method: 'POST',
		headers: { Authorization: token },
	}).catch(() => {
		throw new Error('Tidak dapat menghubungi PocketBase untuk memverifikasi sesi parent.');
	});

	if (!response.ok) {
		throw apiError(401, 'Sesi parent tidak valid. Silakan masuk ulang.');
	}

	const { record } = (await response.json()) as { record?: { id?: string } };

	if (!record?.id) {
		throw apiError(401, 'Sesi parent tidak valid. Silakan masuk ulang.');
	}

	return record.id;
};
