import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import {
	createBankAccount,
	deleteBankAccount,
	getBankAccounts,
	updateBankAccount,
	type BankAccountInput,
} from '@/lib/bank-accounts.server';

type BankAccountBody = {
	id?: string;
	bank_name?: string;
	account_holder?: string;
	account_number?: string;
	is_active?: boolean;
	sort?: number;
};

function validateInput(body: BankAccountBody, requireAll: boolean): BankAccountInput {
	const bank_name = (body.bank_name ?? '').trim();
	const account_holder = (body.account_holder ?? '').trim();
	const account_number = (body.account_number ?? '').trim();
	if (requireAll) {
		if (!bank_name) throw apiError(422, 'Nama bank wajib diisi.');
		if (!account_holder) throw apiError(422, 'Nama pemilik rekening wajib diisi.');
		if (!account_number) throw apiError(422, 'Nomor rekening wajib diisi.');
	}
	return {
		bank_name,
		account_holder,
		account_number,
		is_active: Boolean(body.is_active),
		sort: Number.isFinite(body.sort) ? Number(body.sort) : 0,
	};
}

/**
 * POST /api/central-admin/bank-accounts — daftar seluruh rekening bank.
 * PATCH /api/central-admin/bank-accounts — tambah, ubah, atau hapus rekening.
 *
 * Non-GET agar respons per-admin tidak di-cache edge.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const accounts = await getBankAccounts();
		return json({ accounts });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{ action: 'create' | 'update' | 'delete' } & BankAccountBody>(
			request,
		);

		if (body.action === 'create') {
			const input = validateInput(body, true);
			const account = await createBankAccount(input);
			return json({ account });
		}

		if (body.action === 'update') {
			const id = (body.id ?? '').trim();
			if (!id) throw apiError(422, 'ID rekening wajib disertakan.');
			const patch: Partial<BankAccountInput> = {};
			if (body.bank_name !== undefined) patch.bank_name = body.bank_name.trim();
			if (body.account_holder !== undefined) patch.account_holder = body.account_holder.trim();
			if (body.account_number !== undefined) patch.account_number = body.account_number.trim();
			if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
			if (body.sort !== undefined) patch.sort = Number.isFinite(body.sort) ? Number(body.sort) : 0;
			if (patch.bank_name === '') throw apiError(422, 'Nama bank wajib diisi.');
			if (patch.account_holder === '') throw apiError(422, 'Nama pemilik rekening wajib diisi.');
			if (patch.account_number === '') throw apiError(422, 'Nomor rekening wajib diisi.');
			const account = await updateBankAccount(id, patch);
			return json({ account });
		}

		if (body.action === 'delete') {
			const id = (body.id ?? '').trim();
			if (!id) throw apiError(422, 'ID rekening wajib disertakan.');
			await deleteBankAccount(id);
			return json({ ok: true, id });
		}

		throw apiError(422, 'Aksi tidak valid. Gunakan "create", "update", atau "delete".');
	}

	throw apiError(405, 'Metode tidak didukung.');
});
