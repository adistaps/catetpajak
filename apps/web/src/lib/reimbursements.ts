import pb from '@/lib/pocketbase-client';
import { todayIso, type Company } from '@/lib/accounting';

export type ReimbursementStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface StatusHistoryEntry {
	status: ReimbursementStatus;
	at: string;
	by?: string;
	note?: string;
}

export interface Reimbursement {
	id: string;
	company: string;
	employee: string;
	amount: number;
	date: string;
	description: string;
	proof: string;
	status: ReimbursementStatus;
	rejection_reason: string;
	processed_by: string;
	processed_date: string;
	paid_date: string;
	transaction: string;
	/** Pengaturan jenis reimbursement tertaut (opsional). */
	setting: string;
	status_history: StatusHistoryEntry[];
	owner: string;
	created: string;
	updated: string;
	expand?: {
		employee?: { id: string; name: string; position?: string };
		processed_by?: { id: string; name?: string; email?: string };
	};
}

export const REIMBURSEMENT_STATUS_LABELS: Record<ReimbursementStatus, string> = {
	pending: 'Menunggu',
	approved: 'Disetujui',
	rejected: 'Ditolak',
	paid: 'Dibayar',
};

export function emptyReimbursement(): Omit<
	Reimbursement,
	'id' | 'company' | 'employee' | 'owner' | 'created' | 'updated' | 'expand'
> {
	return {
		amount: 0,
		date: todayIso(),
		description: '',
		proof: '',
		status: 'pending',
		rejection_reason: '',
		processed_by: '',
		processed_date: '',
		paid_date: '',
		transaction: '',
		setting: '',
		status_history: [],
	};
}

/** URL aman untuk berkas bukti reimbursement. */
export function proofUrl(rec: Reimbursement): string {
	if (!rec.proof) return '';
	try {
		return pb.files.getURL(rec, rec.proof);
	} catch {
		return '';
	}
}

/** Tambah entri jejak status baru ke riwayat. */
export function appendStatusHistory(
	history: StatusHistoryEntry[] | undefined | null,
	entry: StatusHistoryEntry,
): StatusHistoryEntry[] {
	const list = Array.isArray(history) ? [...history] : [];
	list.push(entry);
	return list;
}

/**
 * Pengajuan reimbursement karyawan (ESS) tercatat sebagai transaksi Biaya yang
 * belum dibukukan, sehingga akuntan dapat memproses atau menolaknya. Bila
 * transaksi gagal dibuat saat pengajuan, pembuatan ulang dilakukan saat
 * halaman Biaya dibuka agar pengajuan yang menunggu tetap terlihat. Tidak ada
 * jurnal/akun yang dicatat di sini — pemrosesan ke pembukuan tetap dilakukan
 * akuntan, dan transaksi yang sudah ada tidak digandakan.
 */
export async function ensureReimbursementTransaction(
	company: Company,
	reimbursement: Reimbursement,
	employeeName: string,
): Promise<void> {
	// Idempoten: lewati bila pengajuan ini sudah memiliki transaksi Biaya tertaut.
	const existing = await pb
		.collection('transactions')
		.getFullList({
			filter: pb.filter('company = {:company} && reimbursement = {:r}', {
				company: company.id,
				r: reimbursement.id,
			}),
			fields: 'id',
			requestKey: `reimb-tx-check-${reimbursement.id}`,
		})
		.catch(() => [] as { id: string }[]);
	if (existing.length > 0) return;

	const ownerId = reimbursement.owner || pb.authStore.record?.id || company.owner;
	await pb.collection('transactions').create(
		{
			company: company.id,
			category: 'biaya',
			date: (reimbursement.date || todayIso()).slice(0, 10),
			description: `Reimbursement — ${employeeName}${reimbursement.description ? ` · ${reimbursement.description}` : ''}`,
			amount: Number(reimbursement.amount) || 0,
			partner: employeeName,
			debit_account: null,
			credit_account: null,
			contact: null,
			product: null,
			reimbursement: reimbursement.id,
			expense_detail: {
				kind: 'reimbursement',
				reimbursementId: reimbursement.id,
				employeeId: reimbursement.employee,
				employeeName,
				booked: false,
			},
			owner: ownerId,
		},
		{ requestKey: `reimb-tx-${reimbursement.id}` },
	);
}

/**
 * Pastikan setiap pengajuan reimbursement yang belum dibukukan (status
 * "pending" atau "approved") memiliki transaksi Biaya tertaut. Dipanggil dari
 * halaman Biaya, sehingga akuntan tetap melihat pengajuannya untuk dipetakan
 * ke akun/jurnal. Tidak menandai dibukukan: pemrosesan ke jurnal tetap
 * dilakukan akuntan. Mengembalikan jumlah transaksi yang dibuat.
 */
export async function reconcileReimbursementTransactions(company: Company): Promise<number> {
	const [reimbursements, transactions] = await Promise.all([
		pb.collection('reimbursements').getFullList<Reimbursement>({
			filter: pb.filter(
				'company = {:company} && (status = "pending" || status = "approved")',
				{ company: company.id },
			),
			sort: '-created',
			expand: 'employee',
			requestKey: `reimb-reconcile-list-${company.id}`,
		}),
		pb.collection('transactions').getFullList({
			filter: pb.filter('company = {:company} && category = "biaya"', { company: company.id }),
			fields: 'id,reimbursement,expense_detail',
			requestKey: `reimb-reconcile-tx-${company.id}`,
		}),
	]);

	const linkedIds = new Set<string>();
	for (const transaction of transactions) {
		const record = transaction as {
			reimbursement?: string;
			expense_detail?: { kind?: string; reimbursementId?: string };
		};
		if (record.reimbursement) linkedIds.add(record.reimbursement);
		if (record.expense_detail?.kind === 'reimbursement' && record.expense_detail.reimbursementId) {
			linkedIds.add(record.expense_detail.reimbursementId);
		}
	}

	let created = 0;
	for (const rec of reimbursements) {
		if (!rec.employee || linkedIds.has(rec.id)) continue;
		let employeeName = rec.expand?.employee?.name || '';
		if (!employeeName) {
			try {
				const employee = await pb.collection('employees').getOne(rec.employee, {
					fields: 'name',
					requestKey: `reimb-reconcile-emp-${rec.id}`,
				});
				employeeName = (employee as { name?: string }).name || '';
			} catch {
				employeeName = '';
			}
		}
		try {
			await ensureReimbursementTransaction(company, rec, employeeName || 'Karyawan');
			linkedIds.add(rec.id);
			created += 1;
		} catch {
			// Gagal membuat ulang — biarkan akuntan memproses manual lewat Penggajian.
		}
	}
	return created;
}
