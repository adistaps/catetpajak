import { withApi, apiError, readJsonBody, json } from '@/lib/api.server';
import { requireParentId } from '@/lib/parent-auth.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

type InvoiceRecord = {
	id: string;
	company: string;
	student: string;
	expand?: { student?: { parent?: string } };
};

type CompanyRecord = {
	id: string;
	bank_name: string;
	account_holder: string;
	account_number: string;
	name: string;
};

/**
 * POST /api/company-bank-account — mengembalikan informasi rekening bank
 * perusahaan pemilik invoice, agar Parent mengetahui rekening tujuan transfer.
 * Server memverifikasi bahwa invoice benar-benar milik siswa yang terhubung
 * dengan parent ini sebelum mengembalikan data rekening perusahaan.
 *
 * Berupa action (POST) agar respons per-parent tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	const parentId = await requireParentId(request);
	const body = await readJsonBody<{ invoiceId?: string; companyId?: string }>(request);

	let companyId = (body.companyId ?? '').trim();
	const invoiceId = (body.invoiceId ?? '').trim();

	if (invoiceId) {
		const invoice = await pocketbaseAdmin
			.getRecord<InvoiceRecord>('documents', invoiceId, { expand: 'student' })
			.catch(() => null);
		if (!invoice) throw apiError(404, 'Invoice tidak ditemukan.');

		// Verifikasi relasi: siswa pada invoice harus terhubung dengan parent ini.
		const studentParent = invoice.expand?.student?.parent;
		if (!invoice.student || studentParent !== parentId) {
			throw apiError(403, 'Anda tidak memiliki akses ke invoice ini.');
		}
		companyId = invoice.company;
	}

	if (!companyId) throw apiError(422, 'ID invoice atau company wajib disertakan.');

	const company = await pocketbaseAdmin
		.getRecord<CompanyRecord>('companies', companyId)
		.catch(() => null);
	if (!company) throw apiError(404, 'Perusahaan tidak ditemukan.');

	return json({
		bank_name: company.bank_name ?? '',
		account_holder: company.account_holder ?? '',
		account_number: company.account_number ?? '',
		company_name: company.name ?? '',
	});
});
