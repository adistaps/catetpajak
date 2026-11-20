import pb from '@/lib/pocketbase-client';
import type { RecordModel } from 'pocketbase';

/**
 * Peran pengguna di aplikasi Catet Akuntan: `akuntan` menawarkan jasa dan
 * mengelola profil, `pencari` mencari dan menjelajah direktori. Pengguna
 * lama tanpa peran tetap diarahkan ke dasbor (perilaku sebelumnya).
 */
export type AkuntanRole = 'akuntan' | 'pencari';

/** Membaca peran Catet Akuntan dari record pengguna PocketBase. */
export function getAkuntanRole(
	record: Record<string, unknown> | null | undefined,
): AkuntanRole | null {
	const value = record?.akuntan_role;
	return value === 'pencari' || value === 'akuntan' ? (value as AkuntanRole) : null;
}

/** Halaman tujuan setelah masuk/daftar, sesuai peran pengguna. */
export function akuntanLandingPath(role: AkuntanRole | null): string {
	return role === 'pencari' ? '/akuntan/langganan' : '/akuntan/dasbor';
}

/**
 * Profil akuntan pada direktori publik `/akuntan`. Satu profil per pengguna
 * (indeks unik pada `owner`); hanya pemiliknya yang dapat membuat dan
 * mengubah, ditegakkan oleh access rule koleksi `accountant_profiles`.
 */
export type AkuntanProfile = {
	id: string;
	name: string;
	cv_name: string;
	city: string;
	phone: string;
	description: string;
	photo: string;
	birth_place: string;
	birth_date: string;
	residence: string;
	domicile: string;
	certifications: string;
	education: string;
	education_entries: unknown;
	work_history: string;
	work_history_entries: unknown;
	headline: string;
	service_mode: string;
	meeting_location: string;
	strengths: unknown;
	highlight: string;
	cv_file: string;
	owner: string;
	created: string;
};

/** Satu entri riwayat pekerjaan pada profil akuntan. */
export type WorkHistoryEntry = {
	company: string;
	start_date: string;
	end_date: string;
	position: string;
	description: string;
};

/** Satu entri jenjang pendidikan pada profil akuntan. */
export type EducationEntry = {
	level: string;
	start_year: string;
	university: string;
	major: string;
};

/** Label mode layanan yang tampil di halaman detail profil. */
export const SERVICE_MODE_LABELS: Record<string, string> = {
	online: 'Online',
	tatap_muka: 'Tatap muka',
	hybrid: 'Online & tatap muka',
};

/** Normalisasi daftar keunggulan dari JSON. */
export function parseStrengths(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map(item => String(item ?? '').trim()).filter(Boolean).slice(0, 8);
}

/** Normalisasi nilai JSON `education_entries` menjadi daftar entri pendidikan. */
export function parseEducationEntries(value: unknown): EducationEntry[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
		.map(entry => ({
			level: String(entry.level ?? ''),
			start_year: String(entry.start_year ?? '').slice(0, 4),
			university: String(entry.university ?? ''),
			major: String(entry.major ?? ''),
		}));
}

/** Jenjang tertinggi dari daftar entri pendidikan, untuk kolom legacy `education`. */
export function highestEducationLevel(entries: EducationEntry[]): string {
	const order = ['D3', 'S1', 'S2', 'S3'];
	let best = '';
	for (const entry of entries) {
		if (order.indexOf(entry.level) > order.indexOf(best)) best = entry.level;
	}
	return best;
}

/** Normalisasi nilai JSON `work_history_entries` menjadi daftar entri pekerjaan. */
export function parseWorkHistoryEntries(value: unknown): WorkHistoryEntry[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
		.map(entry => ({
			company: String(entry.company ?? ''),
			start_date: String(entry.start_date ?? '').slice(0, 10),
			end_date: String(entry.end_date ?? '').slice(0, 10),
			position: String(entry.position ?? ''),
			description: String(entry.description ?? ''),
		}));
}

/** URL foto profil (thumbnail 400x400 mode fit — tanpa crop, rasio asli dipertahankan), atau null bila belum ada foto. */
export function akuntanPhotoUrl(record: { id: string; photo: string }): string | null {
	if (!record.photo) return null;
	return pb.files.getURL(
		{ id: record.id, collectionId: 'accountant_profiles' } as RecordModel,
		record.photo,
		{ thumb: '400x400f' },
	);
}

/**
 * URL lampiran CV. Berkas dilindungi: hanya pemilik yang menerima nama file,
 * dan unduhan membutuhkan token singkat.
 */
export async function akuntanCvFileUrl(record: {
	id: string;
	cv_file?: string;
}): Promise<string | null> {
	if (!record.cv_file) return null;
	const token = await pb.files.getToken();
	return pb.files.getURL(
		{ id: record.id, collectionId: 'accountant_profiles' } as RecordModel,
		record.cv_file,
		{ token },
	);
}

/**
 * Seluruh profil akuntan untuk ditampilkan di direktori publik.
 *
 * Diambil lewat route server `/api/akuntan/profiles` yang menyaring profil
 * yatim (pemilik sudah dihapus) secara eksplisit di sisi server, sehingga
 * kartu direktori tidak menampilkan akuntan yang akunnya sudah tidak aktif
 * meskipun aturan akses koleksi belum diterapkan di lingkungan ini.
 */
export async function listAkuntanProfiles(): Promise<AkuntanProfile[]> {
	const res = await fetch(`/api/akuntan/profiles?t=${Date.now()}`, {
		method: 'POST',
		cache: 'no-store',
		headers: { 'cache-control': 'no-cache' },
	});
	if (!res.ok) {
		throw new Error('Gagal memuat direktori akuntan.');
	}
	const data = (await res.json()) as { profiles: AkuntanProfile[] };
	return data.profiles.filter(profile => Boolean(profile.owner));
}

/** Satu profil publik berdasarkan id. */
export async function getAkuntanProfile(id: string): Promise<AkuntanProfile | null> {
	try {
		const record = await pb.collection('accountant_profiles').getOne(id);
		return record as unknown as AkuntanProfile;
	} catch {
		return null;
	}
}

/**
 * Profil milik pengguna yang sedang masuk, atau null bila memang belum dibuat.
 *
 * Pencarian dilakukan dua cara: `getFirstListItem` lebih dulu, lalu
 * `getFullList` sebagai cadangan. Percobaan pertama dapat gagal bukan karena
 * profil tidak ada (mis. izin/aturan atau permintaan yang saling membatalkan
 * karena auto-cancellation SDK), dan menampilkannya sebagai "belum punya
 * profil" membuat pengguna diarahkan ke formulir profil baru yang kosong
 * padahal recordnya masih ada. Cadangan memakai `requestKey: null` agar tidak
 * dibatalkan oleh permintaan lain ke koleksi yang sama.
 */
export async function getMyAkuntanProfile(userId: string): Promise<AkuntanProfile | null> {
	if (!userId) return null;
	try {
		const record = await pb
			.collection('accountant_profiles')
			.getFirstListItem(pb.filter('owner = {:owner}', { owner: userId }));
		if (record) return record as unknown as AkuntanProfile;
	} catch {
		// lanjut ke pencadangan di bawah
	}

	try {
		const records = await pb.collection('accountant_profiles').getFullList({
			filter: pb.filter('owner = {:owner}', { owner: userId }),
			requestKey: null,
		});
		return (records[0] as unknown as AkuntanProfile) ?? null;
	} catch {
		return null;
	}
}
