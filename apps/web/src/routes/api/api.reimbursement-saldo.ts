import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

interface SaldoRow {
	settingId: string;
	budget: number;
	used: number;
	remaining: number;
}

/** Ambil seluruh record sebuah koleksi dengan paginasi (perPage maks 500). */
async function fetchAll<T>(
	collection: string,
	filter: string,
	fields: string,
): Promise<T[]> {
	const all: T[] = [];
	let page = 1;
	for (;;) {
		const res = await pocketbaseAdmin.listRecords<T>(collection, {
			page,
			perPage: 500,
			filter,
			fields,
		});
		all.push(...res.items);
		if (res.items.length === 0 || all.length >= res.totalItems) break;
		page += 1;
	}
	return all;
}

/**
 * POST /api/reimbursement-saldo
 *
 * Mengembalikan sisa saldo (budget) per jenis reimbursement untuk perusahaan:
 * total alokasi (`budget`), total terpakai dari pengajuan yang belum ditolak
 * (pending/approved/paid), dan sisa saldo. Dipakai oleh portal karyawan dan
 * pengaturan reimbursement untuk menampilkan dan memvalidasi sisa saldo per
 * jenis. Berupa action (POST) agar respons per-pengguna tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	const callerId = await requireUserId(request);
	const body = await readJsonBody<{ companyId?: string }>(request);
	const companyId = (body.companyId ?? '').trim();
	if (!companyId) throw apiError(422, 'ID perusahaan wajib diisi.');

	const company = await pocketbaseAdmin
		.getRecord<{ id: string; owner: string }>('companies', companyId)
		.catch(() => null);
	if (!company) throw apiError(404, 'Perusahaan tidak ditemukan.');

	if (company.owner !== callerId) {
		const members = await pocketbaseAdmin.listRecords<{ status: string }>(
			'company_members',
			{
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter(
					'company = {:company} && user = {:callerId} && status = "active"',
					{ company: companyId, callerId },
				),
			},
		);
		if (members.items.length === 0) {
			throw apiError(403, 'Anda tidak memiliki akses ke perusahaan ini.');
		}
	}

	const [settings, reimbursements] = await Promise.all([
		fetchAll<{ id: string; budget?: number }>(
			'reimbursement_settings',
			pocketbaseAdmin.filter('company = {:company}', { company: companyId }),
			'id,budget',
		),
		fetchAll<{ setting?: string; amount: number; status: string }>(
			'reimbursements',
			pocketbaseAdmin.filter('company = {:company} && status != "rejected"', {
				company: companyId,
			}),
			'setting,amount,status',
		),
	]);

	const usedBySetting = new Map<string, number>();
	for (const r of reimbursements) {
		if (!r.setting) continue;
		usedBySetting.set(r.setting, (usedBySetting.get(r.setting) ?? 0) + (Number(r.amount) || 0));
	}

	const saldos: SaldoRow[] = settings.map(s => {
		const budget = Number(s.budget) || 0;
		const used = usedBySetting.get(s.id) ?? 0;
		return {
			settingId: s.id,
			budget,
			used,
			remaining: Math.max(0, budget - used),
		};
	});

	return json({ saldos });
});
