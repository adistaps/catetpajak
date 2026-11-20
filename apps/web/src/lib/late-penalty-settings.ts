import pb from '@/lib/pocketbase-client';
import { parsePaymentTerms, addDaysIso, daysBetweenIso } from '@/lib/payment-terms';
import { todayIso } from '@/lib/accounting';

/** Metode perhitungan denda keterlambatan. */
export type LatePenaltyMethod = 'percentage' | 'nominal';

/** Satu rentang denda bertingkat (hari ke-X sampai ke-Y). */
export interface LatePenaltyTier {
	from_day: number;
	to_day: number;
	method: LatePenaltyMethod;
	value: number;
}

/** Pengaturan denda keterlambatan pembayaran per perusahaan. */
export interface LatePenaltySettings {
	id: string;
	company: string;
	/** Metode lama (fallback bila `tiers` kosong). */
	method: LatePenaltyMethod;
	/** Nilai lama (fallback bila `tiers` kosong). */
	value: number;
	/** Daftar rentang denda bertingkat. */
	tiers: LatePenaltyTier[] | null;
	is_active: boolean;
	owner: string;
	created: string;
	updated: string;
}

/** Nilai awal: nonaktif, tanpa rentang denda. */
export const DEFAULT_LATE_PENALTY = {
	method: 'percentage' as LatePenaltyMethod,
	value: 0,
	tiers: [] as LatePenaltyTier[],
	is_active: false,
};

/** Rentang denda contoh untuk pratinjau/reset. */
export const SAMPLE_TIERS: LatePenaltyTier[] = [
	{ from_day: 1, to_day: 2, method: 'percentage', value: 5 },
	{ from_day: 3, to_day: 5, method: 'nominal', value: 50000 },
];

export interface LatePenaltyCalc {
	/** Nominal denda (0 bila tidak berlaku). */
	penalty: number;
	/** Total tagihan + denda. */
	totalWithPenalty: number;
	/** Apakah invoice sudah melewati jatuh tempo. */
	isOverdue: boolean;
	/** Tanggal jatuh tempo invoice. */
	dueDate: string;
	/** Jumlah hari terlambat dari jatuh tempo (0 bila belum jatuh tempo). */
	daysOverdue: number;
	/** Rentang denda yang diterapkan, bila ada. */
	appliedTier: LatePenaltyTier | null;
}

/** Mengurai `tiers` dari nilai PocketBase (bisa array/null/apa pun). */
export function parseTiers(raw: unknown): LatePenaltyTier[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => {
			if (!item || typeof item !== 'object') return null;
			const t = item as Record<string, unknown>;
			const from_day = Number(t.from_day);
			const to_day = Number(t.to_day);
			const method = t.method === 'nominal' ? 'nominal' : 'percentage';
			const value = Number(t.value);
			if (!Number.isFinite(from_day) || !Number.isFinite(to_day) || !Number.isFinite(value)) {
				return null;
			}
			return {
				from_day: Math.max(1, Math.round(from_day)),
				to_day: Math.max(Math.round(to_day), Math.max(1, Math.round(from_day))),
				method,
				value: Math.max(0, value),
			} as LatePenaltyTier;
		})
		.filter((t): t is LatePenaltyTier => t !== null)
		.sort((a, b) => a.from_day - b.from_day);
}

/**
 * Memilih rentang denda yang berlaku untuk jumlah hari terlambat tertentu.
 * Bila hari terlambat melebihi semua rentang, rentang dengan `to_day` tertinggi
 * yang dipakai (denda tertinggi berlaku terus).
 */
export function resolveTier(
	tiers: LatePenaltyTier[],
	daysOverdue: number,
): LatePenaltyTier | null {
	if (tiers.length === 0 || daysOverdue <= 0) return null;
	const sorted = [...tiers].sort((a, b) => a.from_day - b.from_day);
	const exact = sorted.find((t) => daysOverdue >= t.from_day && daysOverdue <= t.to_day);
	if (exact) return exact;
	// Lewat semua rentang → pakai rentang dengan to_day tertinggi.
	const highest = sorted.reduce((max, t) => (t.to_day > max.to_day ? t : max), sorted[0]);
	if (daysOverdue > highest.to_day) return highest;
	return null;
}

/** Menghitung nominal denda dari sebuah rentang terhadap total invoice. */
export function tierPenaltyAmount(tier: LatePenaltyTier, total: number): number {
	const value = Number(tier.value) || 0;
	if (value <= 0) return 0;
	return tier.method === 'percentage'
		? Math.round((total * value) / 100)
		: Math.round(value);
}

/**
 * Menghitung denda keterlambatan satu kali setelah jatuh tempo. Deterministik
 * berdasarkan data invoice + pengaturan company + tanggal acuan, sehingga
 * membuka invoice berulang kali atau mengulang pembayaran tidak menambah denda
 * ganda. Mengembalikan null bila pengaturan nonaktif atau invoice tidak punya
 * syarat pembayaran (tanpa jatuh tempo).
 */
export function computeLatePenalty(
	settings: LatePenaltySettings | null,
	invoice: {
		total: number;
		payment_terms?: string | null;
		date: string;
		paid_amount?: number;
	},
	referenceDate: string = todayIso(),
): LatePenaltyCalc | null {
	if (!settings || settings.is_active === false) return null;
	const terms = parsePaymentTerms(invoice.payment_terms);
	if (!terms) return null;
	const baseDate = (invoice.date || todayIso()).slice(0, 10);
	const dueDate = addDaysIso(baseDate, terms.netDays);
	const ref = (referenceDate || todayIso()).slice(0, 10);
	const total = Number(invoice.total) || 0;
	const paid = Number(invoice.paid_amount) || 0;

	if (ref <= dueDate) {
		return { penalty: 0, totalWithPenalty: total, isOverdue: false, dueDate, daysOverdue: 0, appliedTier: null };
	}
	if (paid >= total) {
		return { penalty: 0, totalWithPenalty: total, isOverdue: false, dueDate, daysOverdue: 0, appliedTier: null };
	}
	const daysOverdue = daysBetweenIso(dueDate, ref);
	const tiers = parseTiers(settings.tiers);
	let tier: LatePenaltyTier | null = null;
	let penalty = 0;
	if (tiers.length > 0) {
		tier = resolveTier(tiers, daysOverdue);
		penalty = tier ? tierPenaltyAmount(tier, total) : 0;
	} else {
		// Fallback metode/value lama.
		const value = Number(settings.value) || 0;
		if (value > 0) {
			penalty =
				settings.method === 'percentage'
					? Math.round((total * value) / 100)
					: Math.round(value);
		}
	}
	return {
		penalty,
		totalWithPenalty: total + penalty,
		isOverdue: true,
		dueDate,
		daysOverdue,
		appliedTier: tier,
	};
}

const settingsInFlight = new Map<string, Promise<LatePenaltySettings>>();

/** Ambil atau buat pengaturan denda untuk perusahaan aktif (sisi company). */
export async function getOrCreateLatePenaltySettings(
	companyId: string,
	ownerId: string,
): Promise<LatePenaltySettings> {
	const existing = settingsInFlight.get(companyId);
	if (existing) return existing;

	const promise = (async () => {
		const filter = pb.filter('company = {:c}', { c: companyId });
		try {
			return await pb
				.collection('late_penalty_settings')
				.getFirstListItem<LatePenaltySettings>(filter);
		} catch {
			try {
				return await pb.collection('late_penalty_settings').create<LatePenaltySettings>(
					{
						company: companyId,
						...DEFAULT_LATE_PENALTY,
						is_active: false,
						owner: ownerId,
					},
					{ requestKey: `late-penalty-settings-${companyId}` },
				);
			} catch {
				return pb
					.collection('late_penalty_settings')
					.getFirstListItem<LatePenaltySettings>(filter);
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

/** Ambil pengaturan denda hanya untuk dibaca (mis. sisi parent). Mengembalikan null bila belum ada. */
export async function fetchLatePenaltySettings(
	companyId: string,
): Promise<LatePenaltySettings | null> {
	try {
		const filter = pb.filter('company = {:c}', { c: companyId });
		return await pb
			.collection('late_penalty_settings')
			.getFirstListItem<LatePenaltySettings>(filter);
	} catch {
		return null;
	}
}

/** Simpan pengaturan denda (rentang bertingkat + status aktif). */
export async function saveLatePenaltySettings(
	id: string,
	data: {
		tiers: LatePenaltyTier[];
		is_active: boolean;
	},
): Promise<LatePenaltySettings> {
	return pb.collection('late_penalty_settings').update<LatePenaltySettings>(id, data);
}
