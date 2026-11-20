import pb from '@/lib/pocketbase-client';
import { parsePaymentTerms, addDaysIso, daysBetweenIso } from '@/lib/payment-terms';
import { todayIso } from '@/lib/accounting';

/** Satu tahapan surat peringatan (rentang hari keterlambatan). */
export interface WarningLetterTier {
	from_day: number;
	to_day: number;
	/** Level surat, mis. "SP1", "SP2", "SP3". */
	level: string;
	/** Judul surat peringatan. */
	title: string;
	/** Isi pesan surat peringatan. */
	message: string;
}

/** Pengaturan surat peringatan per perusahaan. */
export interface WarningLetterSettings {
	id: string;
	company: string;
	/** Daftar tahapan surat peringatan bertingkat. */
	tiers: WarningLetterTier[] | null;
	is_active: boolean;
	owner: string;
	created: string;
	updated: string;
}

/** Nilai awal: nonaktif, tanpa tahapan. */
export const DEFAULT_WARNING_LETTER = {
	tiers: [] as WarningLetterTier[],
	is_active: false,
};

/** Tahapan contoh untuk pratinjau/reset. */
export const SAMPLE_WARNING_TIERS: WarningLetterTier[] = [
	{
		from_day: 1,
		to_day: 7,
		level: 'SP1',
		title: 'Surat Peringatan I',
		message:
			'Dengan hormat, kami ingatkan bahwa tagihan Anda telah melewati tanggal jatuh tempo. Mohon segera lakukan pembayaran agar tidak dikenakan denda lebih lanjut.',
	},
	{
		from_day: 8,
		to_day: 14,
		level: 'SP2',
		title: 'Surat Peringatan II',
		message:
			'Dengan hormat, tagihan Anda masih belum terselesaikan melebihi batas waktu pertama. Mohon segera melunasi tagihan ini paling lambat 7 hari sejak surat ini diterima.',
	},
	{
		from_day: 15,
		to_day: 30,
		level: 'SP3',
		title: 'Surat Peringatan III',
		message:
			'Dengan hormat, tagihan Anda telah lama melewati jatuh tempo. Apabila tidak dilunasi segera, kami akan meneruskan penagihan melalui proses hukum.',
	},
];

export interface WarningLetterCalc {
	/** Tahapan surat peringatan yang berlaku, bila ada. */
	appliedTier: WarningLetterTier | null;
	/** Apakah invoice sudah melewati jatuh tempo. */
	isOverdue: boolean;
	/** Tanggal jatuh tempo invoice. */
	dueDate: string;
	/** Jumlah hari terlambat dari jatuh tempo (0 bila belum jatuh tempo). */
	daysOverdue: number;
}

/** Mengurai `tiers` dari nilai PocketBase (bisa array/null/apa pun). */
export function parseWarningTiers(raw: unknown): WarningLetterTier[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => {
			if (!item || typeof item !== 'object') return null;
			const t = item as Record<string, unknown>;
			const from_day = Number(t.from_day);
			const to_day = Number(t.to_day);
			if (!Number.isFinite(from_day) || !Number.isFinite(to_day)) return null;
			return {
				from_day: Math.max(1, Math.round(from_day)),
				to_day: Math.max(Math.round(to_day), Math.max(1, Math.round(from_day))),
				level: typeof t.level === 'string' ? t.level : '',
				title: typeof t.title === 'string' ? t.title : '',
				message: typeof t.message === 'string' ? t.message : '',
			} as WarningLetterTier;
		})
		.filter((t): t is WarningLetterTier => t !== null)
		.sort((a, b) => a.from_day - b.from_day);
}

/**
 * Memilih tahapan surat peringatan yang berlaku untuk jumlah hari terlambat
 * tertentu. Bila hari terlambat melebihi semua rentang, tahapan dengan
 * `to_day` tertinggi yang dipakai.
 */
export function resolveWarningTier(
	tiers: WarningLetterTier[],
	daysOverdue: number,
): WarningLetterTier | null {
	if (tiers.length === 0 || daysOverdue <= 0) return null;
	const sorted = [...tiers].sort((a, b) => a.from_day - b.from_day);
	const exact = sorted.find((t) => daysOverdue >= t.from_day && daysOverdue <= t.to_day);
	if (exact) return exact;
	const highest = sorted.reduce((max, t) => (t.to_day > max.to_day ? t : max), sorted[0]);
	if (daysOverdue > highest.to_day) return highest;
	return null;
}

/**
 * Menentukan tahapan surat peringatan yang berlaku untuk sebuah invoice
 * berdasarkan tanggal jatuh tempo dan tanggal acuan. Mengembalikan null bila
 * pengaturan nonaktif atau invoice tidak punya syarat pembayaran (tanpa
 * jatuh tempo). Deterministik — tidak mengubah invoice lama secara retroaktif.
 */
export function computeWarningLetter(
	settings: WarningLetterSettings | null,
	invoice: {
		total: number;
		payment_terms?: string | null;
		date: string;
		paid_amount?: number;
	},
	referenceDate: string = todayIso(),
): WarningLetterCalc | null {
	if (!settings || settings.is_active === false) return null;
	const terms = parsePaymentTerms(invoice.payment_terms);
	if (!terms) return null;
	const baseDate = (invoice.date || todayIso()).slice(0, 10);
	const dueDate = addDaysIso(baseDate, terms.netDays);
	const ref = (referenceDate || todayIso()).slice(0, 10);
	const total = Number(invoice.total) || 0;
	const paid = Number(invoice.paid_amount) || 0;

	if (ref <= dueDate) {
		return { appliedTier: null, isOverdue: false, dueDate, daysOverdue: 0 };
	}
	if (paid >= total && total > 0) {
		return { appliedTier: null, isOverdue: false, dueDate, daysOverdue: 0 };
	}
	const daysOverdue = daysBetweenIso(dueDate, ref);
	const tiers = parseWarningTiers(settings.tiers);
	const tier = resolveWarningTier(tiers, daysOverdue);
	return { appliedTier: tier, isOverdue: true, dueDate, daysOverdue };
}

const settingsInFlight = new Map<string, Promise<WarningLetterSettings>>();

/** Ambil atau buat pengaturan surat peringatan untuk perusahaan aktif. */
export async function getOrCreateWarningLetterSettings(
	companyId: string,
	ownerId: string,
): Promise<WarningLetterSettings> {
	const existing = settingsInFlight.get(companyId);
	if (existing) return existing;

	const promise = (async () => {
		const filter = pb.filter('company = {:c}', { c: companyId });
		try {
			return await pb
				.collection('warning_letter_settings')
				.getFirstListItem<WarningLetterSettings>(filter);
		} catch {
			try {
				return await pb.collection('warning_letter_settings').create<WarningLetterSettings>(
					{
						company: companyId,
						...DEFAULT_WARNING_LETTER,
						is_active: false,
						owner: ownerId,
					},
					{ requestKey: `warning-letter-settings-${companyId}` },
				);
			} catch {
				return pb
					.collection('warning_letter_settings')
					.getFirstListItem<WarningLetterSettings>(filter);
			}
		}
	})();

	settingsInFlight.set(companyId, promise);
	promise.finally(() => {
		if (settingsInFlight.get(companyId) === promise) {
			settingsInFlight.delete(companyId);
		}
	});
	return promise;
}

/** Ambil pengaturan surat peringatan hanya untuk dibaca. Mengembalikan null bila belum ada. */
export async function fetchWarningLetterSettings(
	companyId: string,
): Promise<WarningLetterSettings | null> {
	try {
		const filter = pb.filter('company = {:c}', { c: companyId });
		return await pb
			.collection('warning_letter_settings')
			.getFirstListItem<WarningLetterSettings>(filter);
	} catch {
		return null;
	}
}

/** Simpan pengaturan surat peringatan (tahapan + status aktif). */
export async function saveWarningLetterSettings(
	id: string,
	data: {
		tiers: WarningLetterTier[];
		is_active: boolean;
	},
): Promise<WarningLetterSettings> {
	return pb.collection('warning_letter_settings').update<WarningLetterSettings>(id, data);
}
