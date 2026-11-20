import type { Account, AccountBalance } from '@/lib/accounting';

/** Kategori penyajian pos laba rugi menurut PSAK 118. */
export type PsakCategory = 'operasi' | 'investasi' | 'pendanaan' | 'pajak';

export const PSAK_CATEGORIES: PsakCategory[] = [
	'operasi',
	'investasi',
	'pendanaan',
	'pajak',
];

export const PSAK_CATEGORY_LABELS: Record<PsakCategory, string> = {
	operasi: 'Operasi',
	investasi: 'Investasi',
	pendanaan: 'Pendanaan',
	pajak: 'Pajak penghasilan',
};

/**
 * Klasifikasi awal otomatis berdasarkan nama akun.
 * Hanya dipakai untuk akun pendapatan/beban; pinjaman pokok (liabilitas)
 * bukan pos laba rugi dan tidak pernah masuk pemetaan ini.
 */
export function classifyPsakHeuristic(
	name: string,
	type: 'pendapatan' | 'beban',
): PsakCategory {
	const lower = name.toLowerCase();

	// Pajak penghasilan selalu kategori tersendiri.
	if (/pajak|pph|pajak penghasilan/i.test(lower)) return 'pajak';

	if (type === 'beban') {
		// Beban pendanaan: bunga, jasa giro, sewa pembiayaan.
		if (/bunga|jasa giro|sewa pembiayaan|pembiayaan|kredit bank/i.test(lower)) {
			return 'pendanaan';
		}
		// Beban investasi: penyusutan, amortisasi, kerugian penjualan aset.
		if (
			/penyusutan|depresiasi|amortisasi|aset tetap|investasi|kerugian penjualan|penjualan aset/i.test(
				lower,
			)
		) {
			return 'investasi';
		}
		return 'operasi';
	}

	// Pendapatan investasi: bunga, dividen, sewa, keuntungan penjualan aset.
	if (/bunga|dividen|sewa|investasi|keuntungan penjualan|penjualan aset/i.test(lower)) {
		return 'investasi';
	}
	return 'operasi';
}

/**
 * Klasifikasi PSAK 118 sebuah akun.
 * Memakai pemetaan eksplisit pengguna bila ada, jika tidak jatuh ke heuristik.
 */
export function classifyPsakAccount(account: Account): PsakCategory {
	const explicit = account.psak118_category;
	if (
		explicit === 'operasi' ||
		explicit === 'investasi' ||
		explicit === 'pendanaan' ||
		explicit === 'pajak'
	) {
		return explicit;
	}
	if (account.type !== 'pendapatan' && account.type !== 'beban') return 'operasi';
	return classifyPsakHeuristic(account.name, account.type);
}

export interface PsakGroup {
	pendapatan: AccountBalance[];
	beban: AccountBalance[];
	net: number;
}

/** Kelompokkan saldo akun pendapatan/beban ke kategori PSAK 118. */
export function buildPsakGroups(
	balances: AccountBalance[],
): Record<PsakCategory, PsakGroup> {
	const groups: Record<PsakCategory, PsakGroup> = {
		operasi: { pendapatan: [], beban: [], net: 0 },
		investasi: { pendapatan: [], beban: [], net: 0 },
		pendanaan: { pendapatan: [], beban: [], net: 0 },
		pajak: { pendapatan: [], beban: [], net: 0 },
	};

	for (const row of balances) {
		if (row.balance === 0) continue;
		if (row.account.type !== 'pendapatan' && row.account.type !== 'beban') continue;
		const cat = classifyPsakAccount(row.account);
		const group = groups[cat];
		if (row.account.type === 'pendapatan') {
			group.pendapatan.push(row);
			group.net += row.balance;
		} else {
			group.beban.push(row);
			group.net -= row.balance;
		}
	}

	return groups;
}
