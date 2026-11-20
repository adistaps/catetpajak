import { useCallback, useEffect, useState } from 'react';
import pb from '@/lib/pocketbase-client';

export interface JobLevel {
	id: string;
	company: string;
	name: string;
	description: string;
	sort: number;
	owner: string;
	created: string;
	updated: string;
}

export function emptyJobLevel(): Omit<JobLevel, 'id' | 'company' | 'owner' | 'created' | 'updated'> {
	return { name: '', description: '', sort: 0 };
}

/** Ambil daftar level jabatan per perusahaan, urut nama. */
export async function listJobLevels(companyId: string): Promise<JobLevel[]> {
	const filter = pb.filter('company = {:company}', { company: companyId });
	return pb.collection('job_levels').getFullList<JobLevel>({
		filter,
		sort: 'name',
		requestKey: null,
	});
}

export async function createJobLevel(
	companyId: string,
	data: { name: string; description?: string; sort?: number },
): Promise<JobLevel> {
	const ownerId = pb.authStore.record?.id ?? '';
	return pb.collection('job_levels').create<JobLevel>({
		company: companyId,
		name: data.name.trim(),
		description: (data.description ?? '').trim(),
		sort: Number(data.sort) || 0,
		owner: ownerId,
	});
}

export async function updateJobLevel(
	id: string,
	data: { name: string; description?: string; sort?: number },
): Promise<JobLevel> {
	return pb.collection('job_levels').update<JobLevel>(id, {
		name: data.name.trim(),
		description: (data.description ?? '').trim(),
		sort: Number(data.sort) || 0,
	});
}

export async function deleteJobLevel(id: string): Promise<void> {
	await pb.collection('job_levels').delete(id);
}

/**
 * Gabungkan level terdaftar dengan level lama (nilai `level` karyawan yang
 * belum ada di daftar terdaftar) agar opsi di semua tempat konsisten dan
 * nilai lama tidak hilang. Hasil unik, urut abjad.
 */
export function mergeLevelOptions(
	managed: JobLevel[],
	legacy: string[] = [],
): string[] {
	const set = new Set<string>();
	for (const m of managed) {
		const n = (m.name || '').trim();
		if (n) set.add(n);
	}
	for (const l of legacy) {
		const n = (l ?? '').trim();
		if (n) set.add(n);
	}
	return [...set].sort((a, b) => a.localeCompare(b, 'id'));
}

/** Kumpulkan nilai `level` unik dari daftar karyawan (untuk migrasi implisit). */
export function collectLegacyLevels(employees: { level?: string }[]): string[] {
	const set = new Set<string>();
	for (const e of employees) {
		const n = (e.level ?? '').trim();
		if (n) set.add(n);
	}
	return [...set];
}

/**
 * Hook sederhana: memuat daftar level jabatan per perusahaan dan menyegarkan
 * otomatis bila ada perubahan (realtime). Mengembalikan daftar, status memuat,
 * dan fungsi refresh manual.
 */
export function useJobLevels(companyId: string | undefined | null) {
	const [levels, setLevels] = useState<JobLevel[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		if (!companyId) {
			setLevels([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const list = await listJobLevels(companyId);
			setLevels(list);
		} catch {
			setLevels([]);
		} finally {
			setLoading(false);
		}
	}, [companyId]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	// Realtime: segarkan daftar saat ada perubahan koleksi job_levels.
	useEffect(() => {
		if (!companyId) return;
		let cancelled = false;
		void pb
			.collection('job_levels')
			.subscribe('*', () => {
				if (!cancelled) void refresh();
			})
			.catch(() => {});
		return () => {
			cancelled = true;
			void pb.collection('job_levels').unsubscribe('*').catch(() => {});
		};
	}, [companyId, refresh]);

	return { levels, loading, refresh };
}
