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

const PLANS = ['starter', 'pro', 'enterprise'];

/**
 * POST /api/central-admin/companies — every registered company with its plan,
 * access status, member count, and the owner's store subscription status.
 * PATCH /api/central-admin/companies — create or delete a company.
 *
 * Deliberately non-GET so per-admin responses are never edge-cached.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
		const monthStart = `${year}-${month}-01`;
		const monthEnd = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

		const [companiesResult, membersResult, employeesResult, invoicesResult] = await Promise.all([
			pocketbaseAdmin.listRecords<CompanyRecord>('companies', {
				page: 1,
				perPage: 500,
				sort: 'name',
				expand: 'owner',
			}),
			pocketbaseAdmin.listRecords<{ company: string }>('company_members', {
				page: 1,
				perPage: 1000,
			}),
			pocketbaseAdmin.listRecords<{ company: string }>('employees', {
				page: 1,
				perPage: 1000,
			}),
			pocketbaseAdmin.listRecords<{ company: string }>('documents', {
				page: 1,
				perPage: 1000,
				filter: pocketbaseAdmin.filter('stage = "invoice" && date >= {:monthStart} && date <= {:monthEnd}', { monthStart, monthEnd }),
			}),
		]);

		const memberCounts = new Map<string, number>();
		for (const member of membersResult.items) {
			if (!member.company) continue;
			memberCounts.set(member.company, (memberCounts.get(member.company) ?? 0) + 1);
		}

		const employeeCounts = new Map<string, number>();
		for (const employee of employeesResult.items) {
			if (!employee.company) continue;
			employeeCounts.set(employee.company, (employeeCounts.get(employee.company) ?? 0) + 1);
		}

		const invoiceCounts = new Map<string, number>();
		for (const invoice of invoicesResult.items) {
			if (!invoice.company) continue;
			invoiceCounts.set(invoice.company, (invoiceCounts.get(invoice.company) ?? 0) + 1);
		}

		const ownerIds = [...new Set(companiesResult.items.map(company => company.owner).filter(Boolean))];
		const subscriptions = await Promise.all(
			ownerIds.map(async ownerId => [ownerId, await getOwnerSubscriptionInfo(ownerId)] as const),
		);
		const subscriptionByOwner = new Map(
			subscriptions.map(([ownerId, info]) => [ownerId, info] as const),
		);

		const companies = companiesResult.items.map(company => ({
			id: company.id,
			name: company.name,
			code: company.code ?? '',
			address: company.address ?? '',
			plan: company.plan ?? 'starter',
			access_status: company.access_status === 'suspended' ? 'suspended' : 'active',
			employee_quota: company.employee_quota ?? null,
			employee_count: employeeCounts.get(company.id) ?? 0,
			invoice_quota: company.invoice_quota ?? null,
			invoice_count: invoiceCounts.get(company.id) ?? 0,
			subscription_end: company.subscription_end ?? null,
			created: company.created,
			owner: {
				id: company.owner,
				name: company.expand?.owner?.name ?? '',
				email: company.expand?.owner?.email ?? '',
			},
			memberCount: memberCounts.get(company.id) ?? 0,
			subscription: subscriptionByOwner.get(company.owner) ?? null,
		}));

		return json({ companies });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{
			action: 'create' | 'delete';
			name?: string;
			code?: string;
			address?: string;
			plan?: string;
			ownerId?: string;
			id?: string;
		}>(request);

		if (body.action === 'create') {
			const name = (body.name ?? '').trim();
			const ownerId = (body.ownerId ?? '').trim();
			if (!name) throw apiError(422, 'Nama perusahaan wajib diisi.');
			if (!ownerId) throw apiError(422, 'Pemilik perusahaan wajib dipilih.');
			const plan = PLANS.includes(body.plan ?? '') ? body.plan! : 'starter';

			// Verify the owner exists.
			try {
				await pocketbaseAdmin.getRecord('users', ownerId);
			} catch {
				throw apiError(404, 'Pengguna pemilik tidak ditemukan.');
			}

			const created = await pocketbaseAdmin.createRecord<CompanyRecord>('companies', {
				name,
				code: (body.code ?? '').trim(),
				address: (body.address ?? '').trim(),
				plan,
				access_status: 'active',
				owner: ownerId,
			});

			return json({
				company: {
					id: created.id,
					name: created.name,
					code: created.code ?? '',
					address: created.address ?? '',
					plan: created.plan ?? 'starter',
					access_status: 'active',
					employee_quota: created.employee_quota ?? null,
					invoice_quota: created.invoice_quota ?? null,
					subscription_end: created.subscription_end ?? null,
					created: created.created,
				},
			});
		}

		if (body.action === 'delete') {
			const id = (body.id ?? '').trim();
			if (!id) throw apiError(422, 'ID perusahaan wajib disertakan.');

			try {
				await pocketbaseAdmin.getRecord<CompanyRecord>('companies', id);
			} catch {
				throw apiError(404, 'Perusahaan tidak ditemukan.');
			}

			await pocketbaseAdmin.deleteRecord('companies', id);
			return json({ ok: true, id });
		}

		throw apiError(422, 'Aksi tidak valid. Gunakan "create" atau "delete".');
	}

	throw apiError(405, 'Metode tidak didukung.');
});
