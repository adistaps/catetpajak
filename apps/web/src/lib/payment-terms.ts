import { todayIso } from '@/lib/accounting';

/**
 * Syarat pembayaran akuntansi dalam notasi "diskon/hari N/jatuh-tempo",
 * mis. "2/3 N/30" = diskon 2% bila dibayar dalam 3 hari, jatuh tempo 30 hari.
 */
export interface ParsedPaymentTerms {
	discountRate: number;
	discountDays: number;
	netDays: number;
	raw: string;
}

/** Pilihan syarat pembayaran yang umum dipakai. */
export const PAYMENT_TERM_PRESETS: { value: string; label: string }[] = [
	{ value: '', label: 'Tanpa syarat (bayar penuh)' },
	{ value: '2/3 N/30', label: '2/3 N/30 — diskon 2% dalam 3 hari, tempo 30 hari' },
	{ value: '2/10 N/30', label: '2/10 N/30 — diskon 2% dalam 10 hari, tempo 30 hari' },
	{ value: '1/10 N/30', label: '1/10 N/30 — diskon 1% dalam 10 hari, tempo 30 hari' },
	{ value: '5/7 N/30', label: '5/7 N/30 — diskon 5% dalam 7 hari, tempo 30 hari' },
	{ value: '2/15 N/45', label: '2/15 N/45 — diskon 2% dalam 15 hari, tempo 45 hari' },
	{ value: '3/10 N/60', label: '3/10 N/60 — diskon 3% dalam 10 hari, tempo 60 hari' },
];

const TERMS_REGEX = /^(\d+(?:[.,]\d+)?)\/(\d+)\s*N\/(\d+)$/i;

/** Mengurai notasi syarat pembayaran. Mengembalikan null bila tidak valid. */
export function parsePaymentTerms(terms: string | null | undefined): ParsedPaymentTerms | null {
	if (!terms) return null;
	const match = terms.trim().match(TERMS_REGEX);
	if (!match) return null;
	const discountRate = Number(match[1].replace(',', '.'));
	const discountDays = Number(match[2]);
	const netDays = Number(match[3]);
	if (!Number.isFinite(discountRate) || !Number.isFinite(discountDays) || !Number.isFinite(netDays)) {
		return null;
	}
	if (discountDays < 0 || netDays < 0 || discountDays > netDays) return null;
	return { discountRate, discountDays, netDays, raw: terms.trim() };
}

/** Menambahkan hari ke tanggal ISO (YYYY-MM-DD) tanpa memengaruhi zona waktu. */
export function addDaysIso(iso: string, days: number): string {
	const parts = iso.slice(0, 10).split('-').map(Number);
	const year = parts[0] ?? 1970;
	const month = (parts[1] ?? 1) - 1;
	const day = parts[2] ?? 1;
	const date = new Date(Date.UTC(year, month, day));
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** Selisih hari antara dua tanggal ISO (YYYY-MM-DD): `end - start` dalam hari penuh. */
export function daysBetweenIso(startIso: string, endIso: string): number {
	const start = startIso.slice(0, 10).split('-').map(Number);
	const end = endIso.slice(0, 10).split('-').map(Number);
	const a = Date.UTC(start[0] ?? 1970, (start[1] ?? 1) - 1, start[2] ?? 1);
	const b = Date.UTC(end[0] ?? 1970, (end[1] ?? 1) - 1, end[2] ?? 1);
	return Math.round((b - a) / 86_400_000);
}

export interface PaymentTermsCalc {
	parsed: ParsedPaymentTerms;
	/** Tanggal batas akhir diskon (invoice date + discountDays). */
	discountDeadline: string;
	/** Tanggal jatuh tempo (invoice date + netDays). */
	dueDate: string;
	/** Nominal tagihan penuh. */
	fullAmount: number;
	/** Nominal diskon. */
	discountAmount: number;
	/** Nominal yang harus dibayar bila diskon berlaku. */
	payableWithDiscount: number;
	/** Apakah diskon masih berlaku pada tanggal acuan. */
	discountActive: boolean;
}

/**
 * Menghitung tanggal & nominal syarat pembayaran berdasarkan tanggal invoice,
 * total tagihan, dan tanggal acuan (default: hari ini). Mengembalikan null bila
 * syarat tidak diatur atau tidak valid.
 */
export function computePaymentTerms(
	terms: string | null | undefined,
	invoiceDate: string,
	total: number,
	referenceDate: string = todayIso(),
): PaymentTermsCalc | null {
	const parsed = parsePaymentTerms(terms);
	if (!parsed) return null;
	const baseDate = (invoiceDate || todayIso()).slice(0, 10);
	const ref = (referenceDate || todayIso()).slice(0, 10);
	const discountDeadline = addDaysIso(baseDate, parsed.discountDays);
	const dueDate = addDaysIso(baseDate, parsed.netDays);
	const fullAmount = Number(total) || 0;
	const discountAmount = Math.round((fullAmount * parsed.discountRate) / 100);
	const payableWithDiscount = fullAmount - discountAmount;
	const discountActive = parsed.discountRate > 0 && ref <= discountDeadline;
	return {
		parsed,
		discountDeadline,
		dueDate,
		fullAmount,
		discountAmount,
		payableWithDiscount,
		discountActive,
	};
}

/** Apakah suatu syarat pembayaran valid (dapat diuraikan). */
export function isValidPaymentTerms(terms: string | null | undefined): boolean {
	return parsePaymentTerms(terms) !== null;
}
