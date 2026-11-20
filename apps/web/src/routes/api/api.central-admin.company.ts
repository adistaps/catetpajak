import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin, getOwnerSubscriptionInfo } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

type CompanyRecord = {
	id: string;
	name: string;
	code?: string;
	address?: string;
	plan?: string;
	access_status?: string;
	employee_quota?: number | null;
	invoice_quota?: number | null;
	subscription_end?: string | null;
	owner: string;
	created: string;
	expand?: { owner?: { id: string; email?: string; name?: string } };
};

type MemberRecord = {
	id: string;
	name: string;
	email: string;
	role: string;
	status: string;
	permissions?: string[];
	can_edit?: boolean;
	created: string;
};

type CompanyDetailBody = {
	company: {
		id: string;
		name: string;
		code: string;
		address: string;
		plan: string;
		access_status: string;
		employee_quota: number | null;
		invoice_quota: number | null;
		subscription_end: string | null;
		created: string;
		owner: { id: string; name: string; email: string };
	};
	members: {
		id: string;
		name: string;
		email: string;
		role: string;
		status: string;
		permissions: string[];
		can_edit: boolean;
		created: string;
	}[];
	stats: { employees: number; documents: number; accounts: number; entries: number };
	subscription: { title: string; status: string; currentPeriodEnd: string } | null;
};

const PLANS = ['starter', 'pro', 'enterprise'];
const ACCESS_STATUSES = ['active', 'suspended'];

async function countRecords(collection: string, companyId: string): Promise<number> {
	const result = await pocketbaseAdmin.listRecords(collection, {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('company = {:companyId}', { companyId }),
	});
	return result.totalItems ?? 0;
}

/**
 * POST /api/central-admin/company/:id — full detail of one company: info,
 * users and their roles, data counts, and the owner's subscription status.
 * PATCH on the same path updates the company's plan and/or access status.
 *
 * Both are actions (non-GET) so per-admin responses are never edge-cached.
 */
export const action = withApi(async ({ request, params }) => {
	await requireCentralAdmin(request);

	const id = params.id;
	if (!id) throw apiError(400, 'ID perusahaan wajib disertakan.');

	if (request.method === 'POST') {
		let company: CompanyRecord;
		try {
			company = await pocketbaseAdmin.getRecord<CompanyRecord>('companies', id, {
				expand: 'owner',
			});
		} catch {
			throw apiError(404, 'Perusahaan tidak ditemukan.');
		}

		const members = await pocketbaseAdmin
			.listRecords<MemberRecord>('company_members', {
				page: 1,
				perPage: 500,
				filter: pocketbaseAdmin.filter('company = {:id}', { id }),
				sort: 'name',
			})
			.then(result => result.items)
			.catch(() => [] as MemberRecord[]);

		const [employees, documents, accounts, entries, subscription] = await Promise.all([
			countRecords('employees', id).catch(() => 0),
			countRecords('documents', id).catch(() => 0),
			countRecords('accounts', id).catch(() => 0),
			countRecords('entries', id).catch(() => 0),
			getOwnerSubscriptionInfo(company.owner),
		]);

		const detail: CompanyDetailBody = {
			company: {
				id: company.id,
				name: company.name,
				code: company.code ?? '',
				address: company.address ?? '',
				plan: company.plan ?? 'starter',
				access_status: company.access_status === 'suspended' ? 'suspended' : 'active',
				employee_quota: company.employee_quota ?? null,
				invoice_quota: company.invoice_quota ?? null,
				subscription_end: company.subscription_end ?? null,
				created: company.created,
				owner: {
					id: company.owner,
					name: company.expand?.owner?.name ?? '',
					email: company.expand?.owner?.email ?? '',
				},
			},
			members: members.map(member => ({
				id: member.id,
				name: member.name,
				email: member.email,
				role: member.role,
				status: member.status,
				permissions: member.permissions ?? [],
				can_edit: Boolean(member.can_edit),
				created: member.created,
			})),
			stats: { employees, documents, accounts, entries },
			subscription,
		};

		return json(detail);
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{
			plan?: string;
			access_status?: string;
			employee_quota?: number | null;
			invoice_quota?: number | null;
			subscription_end?: string | null;
		}>(request);

		const updates: {
			plan?: string;
			access_status?: string;
			employee_quota?: number | null;
			invoice_quota?: number | null;
			subscription_end?: string | null;
		} = {};
		if (body.plan !== undefined) {
			if (!PLANS.includes(body.plan)) {
				throw apiError(422, 'Paket tidak valid. Pilih Starter, Pro, atau Enterprise.');
			}
			updates.plan = body.plan;
		}
		if (body.access_status !== undefined) {
			if (!ACCESS_STATUSES.includes(body.access_status)) {
				throw apiError(422, 'Status akses tidak valid. Pilih Aktif atau Ditangguhkan.');
			}
			updates.access_status = body.access_status;
		}
		if (body.employee_quota !== undefined) {
			// null atau 0 = nonaktifkan kuota kustom, kembali ke batas paket.
			const quota = body.employee_quota === null ? null : Number(body.employee_quota);
			if (quota !== null) {
				if (!Number.isFinite(quota) || quota < 0 || quota > 100000) {
					throw apiError(422, 'Kuota karyawan harus antara 0 dan 100000.');
				}
				updates.employee_quota = Math.floor(quota);
			} else {
				updates.employee_quota = null;
			}
		}
		if (body.invoice_quota !== undefined) {
			// null atau 0 = nonaktifkan kuota invoice kustom, kembali ke batas paket.
			const quota = body.invoice_quota === null ? null : Number(body.invoice_quota);
			if (quota !== null) {
				if (!Number.isFinite(quota) || quota < 0 || quota > 100000) {
					throw apiError(422, 'Kuota invoice harus antara 0 dan 100000.');
				}
				updates.invoice_quota = Math.floor(quota);
			} else {
				updates.invoice_quota = null;
			}
		}
		if (body.subscription_end !== undefined) {
			// null = hapus tanggal berakhir langganan (kembali tanpa batas admin).
			const value = body.subscription_end === null ? '' : String(body.subscription_end).trim();
			if (!value) {
				updates.subscription_end = null;
			} else {
				// Validasi format YYYY-MM-DD dan tanggal kalender yang sah.
				if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
					throw apiError(422, 'Tanggal berakhir langganan harus dalam format YYYY-MM-DD.');
				}
				const parsed = new Date(`${value}T00:00:00`);
				if (Number.isNaN(parsed.getTime())) {
					throw apiError(422, 'Tanggal berakhir langganan tidak valid.');
				}
				updates.subscription_end = value;
			}
		}
		if (Object.keys(updates).length === 0) {
			throw apiError(422, 'Tidak ada perubahan yang dikirim.');
		}

		try {
			const updated = await pocketbaseAdmin.updateRecord<CompanyRecord>('companies', id, updates);
			return json({
				company: {
					id: updated.id,
					name: updated.name,
					code: updated.code ?? '',
					address: updated.address ?? '',
					plan: updated.plan ?? 'starter',
					access_status: updated.access_status === 'suspended' ? 'suspended' : 'active',
					employee_quota: updated.employee_quota ?? null,
					invoice_quota: updated.invoice_quota ?? null,
					subscription_end: updated.subscription_end ?? null,
					created: updated.created,
				},
			});
		} catch {
			throw apiError(404, 'Perusahaan tidak ditemukan atau perubahan gagal disimpan.');
		}
	}

	throw apiError(405, 'Metode tidak didukung.');
});
