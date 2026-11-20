/**
 * Server-only helpers for late-payment penalty. Mirrors the client
 * `computeLatePenalty` but reads settings via the superuser PocketBase client,
 * so it can be used inside loaders/actions/resource routes. Never imported
 * from a component or clientLoader.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { parsePaymentTerms, addDaysIso, daysBetweenIso } from '@/lib/payment-terms';
import { todayIso } from '@/lib/accounting';
import {
	parseTiers,
	resolveTier,
	tierPenaltyAmount,
	type LatePenaltySettings,
	type LatePenaltyTier,
} from '@/lib/late-penalty-settings';

/** Ambil pengaturan denda keterlambatan untuk sebuah perusahaan. */
export async function getLatePenaltySettingsServer(
	companyId: string,
): Promise<LatePenaltySettings | null> {
	try {
		const res = await pocketbaseAdmin.listRecords<LatePenaltySettings>(
			'late_penalty_settings',
			{
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter('company = {:companyId}', { companyId }),
			},
		);
		return res.items[0] ?? null;
	} catch {
		return null;
	}
}

/**
 * Nominal denda keterlambatan satu kali setelah jatuh tempo. Deterministik
 * berdasarkan data invoice + pengaturan company + tanggal acuan, sehingga
 * tidak menambah denda ganda saat invoice dibuka berulang atau pembayaran
 * diulang. Mengembalikan 0 bila denda tidak berlaku.
 */
export function computeLatePenaltyServer(
	settings: LatePenaltySettings | null,
	invoice: {
		total: number;
		payment_terms?: string | null;
		date: string;
		paid_amount?: number;
	},
	referenceDate: string = todayIso(),
): number {
	if (!settings || settings.is_active === false) return 0;
	const terms = parsePaymentTerms(invoice.payment_terms);
	if (!terms) return 0;
	const dueDate = addDaysIso((invoice.date || todayIso()).slice(0, 10), terms.netDays);
	const ref = (referenceDate || todayIso()).slice(0, 10);
	const total = Number(invoice.total) || 0;
	const paid = Number(invoice.paid_amount) || 0;
	if (ref <= dueDate) return 0;
	if (paid >= total) return 0;
	const daysOverdue = daysBetweenIso(dueDate, ref);
	const tiers = parseTiers(settings.tiers);
	if (tiers.length > 0) {
		const tier: LatePenaltyTier | null = resolveTier(tiers, daysOverdue);
		return tier ? tierPenaltyAmount(tier, total) : 0;
	}
	// Fallback metode/value lama.
	const value = Number(settings.value) || 0;
	if (value <= 0) return 0;
	return settings.method === 'percentage'
		? Math.round((total * value) / 100)
		: Math.round(value);
}
