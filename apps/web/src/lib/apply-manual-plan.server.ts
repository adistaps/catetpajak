import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

const PLAN_BY_TITLE: Record<string, 'pro' | 'enterprise'> = {
	Pro: 'pro',
	Enterprise: 'enterprise',
};

/**
 * Setelah pembayaran manual Pro/Enterprise aktif, paket perusahaan milik
 * pembayar ikut diperbarui supaya menu dan kuota tidak tetap di batas uji coba.
 */
export async function applyManualPlanToOwnedCompanies(
	userId: string,
	planTitle: string,
): Promise<void> {
	const plan = PLAN_BY_TITLE[planTitle];
	if (!plan || !userId) return;

	const result = await pocketbaseAdmin.listRecords<{ id: string; plan?: string }>(
		'companies',
		{
			filter: pocketbaseAdmin.filter('owner = {:userId}', { userId }),
			perPage: 200,
		},
	);

	for (const company of result.items) {
		if (company.plan === plan) continue;
		await pocketbaseAdmin.updateRecord('companies', company.id, { plan });
	}
}
