import type { Account } from '@/lib/accounting';
import type { PayrollRun, Payslip, PayrollRunStatus } from '@/lib/payroll';

/** Pengaturan pajak per perusahaan. */
export interface TaxSettings {
	id: string;
	company: string;
	ppn_rate: number;
	ppn_keluaran_account: string;
	ppn_masukan_account: string;
	bupot_account: string;
	npwp: string;
	pkp_status: 'pkp' | 'non_pkp';
	tax_office: string;
	owner: string;
	created: string;
	expand?: {
		ppn_keluaran_account?: Account;
		ppn_masukan_account?: Account;
		bupot_account?: Account;
	};
}

export type BupotType =
	| 'pph21'
	| 'pph22'
	| 'pph23'
	| 'pph4_2'
	| 'pph15'
	| 'pph26';

export type BupotStatus = 'draft' | 'reported';

export interface BupotRecord {
	id: string;
	company: string;
	type: BupotType;
	masa_pajak: string;
	tahun_pajak: string;
	date: string;
	partner: string;
	npwp: string;
	description: string;
	dpp: number;
	rate: number;
	amount: number;
	employee: string;
	status: BupotStatus;
	owner: string;
	created: string;
	expand?: { employee?: { id: string; name: string } };
}

export const BUPOT_TYPE_LABELS: Record<BupotType, string> = {
	pph21: 'PPh 21 — Gaji/Upah',
	pph22: 'PPh 22 — Bendahara',
	pph23: 'PPh 23 — Jasa/ Sewa',
	pph4_2: 'PPh 4(2) — Tanah/Bangunan',
	pph15: 'PPh 15 — Bursa Efek',
	pph26: 'PPh 26 — WNA',
};

export const BUPOT_TYPE_OPTIONS = Object.keys(BUPOT_TYPE_LABELS) as BupotType[];

export const BUPOT_STATUS_LABELS: Record<BupotStatus, string> = {
	draft: 'Draf',
	reported: 'Dilaporkan',
};

/** Tarif standar PPh 23 atas jasa (mis. 2%). */
export const DEFAULT_PPH23_RATE = 2;

/** Jenis pajak yang bisa dipilih di form transaksi / dokumen. */
export type TaxTypeKind = 'ppn' | 'pph' | 'lainnya';

export interface TaxType {
	id: string;
	company: string;
	name: string;
	code: string;
	rate: number;
	kind: TaxTypeKind;
	account: string;
	is_active: boolean;
	sort_order: number;
	owner: string;
	created: string;
}

export const TAX_TYPE_KIND_LABELS: Record<TaxTypeKind, string> = {
	ppn: 'PPN',
	pph: 'PPh',
	lainnya: 'Lainnya',
};

export const DEFAULT_TAX_TYPES: Array<{
	name: string;
	code: string;
	rate: number;
	kind: TaxTypeKind;
	sort_order: number;
}> = [
	{ name: 'Tanpa Pajak', code: 'NONE', rate: 0, kind: 'lainnya', sort_order: 0 },
	{ name: 'PPN 11%', code: 'PPN11', rate: 11, kind: 'ppn', sort_order: 1 },
	{ name: 'PPN 12%', code: 'PPN12', rate: 12, kind: 'ppn', sort_order: 2 },
	{ name: 'PPN 10%', code: 'PPN10', rate: 10, kind: 'ppn', sort_order: 3 },
];

/**
 * Cache promise in-flight per perusahaan agar mount paralel (mis. StrictMode
 * double-mount atau beberapa komponen di `/app/pajak/pengaturan`) tidak
 * memicu banyak `create` bersamaan yang hanya menambah noise 400 "company
 * must be unique" di log PocketBase.
 */
const taxSettingsInFlight = new Map<string, Promise<TaxSettings>>();

/** Ambil atau buat pengaturan pajak untuk perusahaan aktif. */
export async function getOrCreateTaxSettings(
	companyId: string,
	ownerId: string,
): Promise<TaxSettings> {
	const existing = taxSettingsInFlight.get(companyId);
	if (existing) return existing;

	const promise = (async () => {
		const pb = (await import('@/lib/pocketbase-client')).default;
		const filter = pb.filter('company = {:c}', { c: companyId });
		try {
			return await pb.collection('tax_settings').getFirstListItem<TaxSettings>(filter);
		} catch {
			try {
				return await pb.collection('tax_settings').create<TaxSettings>(
					{
						company: companyId,
						ppn_rate: 11,
						pkp_status: 'pkp',
						owner: ownerId,
					},
					{ requestKey: `tax-settings-${companyId}` },
				);
			} catch {
				// Race: permintaan paralel membuat record yang sama (company unik).
				// Ambil record yang baru saja dibuat.
				return pb.collection('tax_settings').getFirstListItem<TaxSettings>(filter);
			}
		}
	})();

	taxSettingsInFlight.set(companyId, promise);
	// Hapus dari cache setelah selesai agar pemanggilan berikutnya tetap segar
	// (mis. setelah record dihapus lalu dibuat ulang).
	promise.finally(() => {
		if (taxSettingsInFlight.get(companyId) === promise) {
			taxSettingsInFlight.delete(companyId);
		}
	});
	return promise;
}

/** Muat jenis pajak aktif perusahaan; seed default jika belum ada. */
export async function loadTaxTypes(
	companyId: string,
	ownerId: string,
	options?: { activeOnly?: boolean },
): Promise<TaxType[]> {
	const pb = (await import('@/lib/pocketbase-client')).default;
	const filter = pb.filter('company = {:c}', { c: companyId });
	let list = await pb.collection('tax_types').getFullList<TaxType>({
		filter,
		sort: 'sort_order,name',
	});

	if (list.length === 0) {
		const created: TaxType[] = [];
		for (let i = 0; i < DEFAULT_TAX_TYPES.length; i++) {
			const def = DEFAULT_TAX_TYPES[i];
			try {
				const rec = await pb.collection('tax_types').create<TaxType>(
					{
						company: companyId,
						name: def.name,
						code: def.code,
						rate: def.rate,
						kind: def.kind,
						is_active: true,
						sort_order: def.sort_order,
						owner: ownerId,
					},
					{ requestKey: `seed-tax-type-${companyId}-${i}` },
				);
				created.push(rec);
			} catch {
				// race / unique — ignore
			}
		}
		list = await pb.collection('tax_types').getFullList<TaxType>({
			filter,
			sort: 'sort_order,name',
		});
		if (list.length === 0) list = created;
	}

	if (options?.activeOnly) {
		return list.filter(t => t.is_active !== false);
	}
	return list;
}

/** Status rekonsilasi pajak unifikasi suatu masa pajak. */
export type TaxUnificationStatus = 'draft' | 'reconciled';

/** Catatan rekonsiliasi pajak unifikasi per perusahaan per masa pajak. */
export interface TaxUnification {
	id: string;
	company: string;
	masa_pajak: string;
	tahun_pajak: string;
	status: TaxUnificationStatus;
	notes: string;
	reconciled_at: string;
	owner: string;
	created: string;
	updated: string;
}

export const TAX_UNIFICATION_STATUS_LABELS: Record<TaxUnificationStatus, string> = {
	draft: 'Belum Direkonsiliasi',
	reconciled: 'Sudah Direkonsiliasi',
};

/** Ambil catatan unifikasi pajak untuk masa pajak tertentu (bila ada). */
export async function getTaxUnification(
	companyId: string,
	masaPajak: string,
	tahunPajak: string,
): Promise<TaxUnification | null> {
	const pb = (await import('@/lib/pocketbase-client')).default;
	const filter = pb.filter(
		'company = {:c} && masa_pajak = {:m} && tahun_pajak = {:y}',
		{ c: companyId, m: masaPajak, y: tahunPajak },
	);
	try {
		return await pb.collection('tax_unifications').getFirstListItem<TaxUnification>(filter);
	} catch {
		return null;
	}
}

/** Entri PPh 21 aktual dari slip gaji yang sudah dihitung di menu Penggajian. */
export interface PayslipPph21Entry {
	employeeId: string;
	gross: number;
	pph21: number;
	runId: string;
	runStatus: PayrollRunStatus;
	posted: boolean;
}

/**
 * Muat PPh 21 aktual dari slip gaji pada periode (YYYY-MM) terpilih.
 * Mengikat menu Pajak dengan menu Penggajian: hanya slip dari periode penggajian
 * yang cocok dengan masa pajak yang dipakai. Mengembalikan peta employeeId → entri.
 */
export async function loadPayslipPph21Map(
	companyId: string,
	period: string,
): Promise<Map<string, PayslipPph21Entry>> {
	const pb = (await import('@/lib/pocketbase-client')).default;
	const map = new Map<string, PayslipPph21Entry>();
	try {
		const runs = await pb.collection('payroll_runs').getFullList<PayrollRun>({
			filter: pb.filter('company = {:c} && period = {:p}', { c: companyId, p: period }),
		});
		if (runs.length === 0) return map;

		const runFilter = runs.map(r => `run = '${r.id}'`).join(' || ');
		const slips = await pb.collection('payslips').getFullList<Payslip>({
			filter: runFilter,
			expand: 'employee',
		});

		for (const slip of slips) {
			const empId = slip.employee;
			if (!empId) continue;
			const run = runs.find(r => r.id === slip.run);
			const posted = run?.status === 'posted';
			const existing = map.get(empId);
			// Utamakan slip dari run yang sudah diterbitkan (posted).
			if (existing && existing.posted && !posted) continue;
			map.set(empId, {
				employeeId: empId,
				gross: slip.gross || 0,
				pph21: slip.pph21 || 0,
				runId: slip.run,
				runStatus: run?.status ?? 'draft',
				posted,
			});
		}
	} catch {
		// abaikan — pemanggil jatuh ke estimasi dari data karyawan
	}
	return map;
}
