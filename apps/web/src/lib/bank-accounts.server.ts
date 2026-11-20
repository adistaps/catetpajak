/**
 * Server-only helpers for reading and managing bank account information shown
 * to customers during manual payment. Uses the superuser PocketBase client so
 * Admin Pusat routes can read/write the `bank_accounts` collection.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

export type BankAccountRecord = {
	id: string;
	bank_name: string;
	account_holder: string;
	account_number: string;
	is_active: boolean;
	sort: number;
	created: string;
	updated: string;
};

export type BankAccount = {
	id: string;
	bank_name: string;
	account_holder: string;
	account_number: string;
	is_active: boolean;
	sort: number;
};

function toBankAccount(record: BankAccountRecord): BankAccount {
	return {
		id: record.id,
		bank_name: record.bank_name ?? '',
		account_holder: record.account_holder ?? '',
		account_number: record.account_number ?? '',
		is_active: Boolean(record.is_active),
		sort: typeof record.sort === 'number' ? record.sort : Number(record.sort ?? 0),
	};
}

/** Semua rekening terdaftar, terurut berdasarkan sort lalu waktu dibuat. */
export async function getBankAccounts(): Promise<BankAccount[]> {
	const result = await pocketbaseAdmin.listRecords<BankAccountRecord>('bank_accounts', {
		page: 1,
		perPage: 100,
		sort: 'sort,created',
	});
	return result.items.map(toBankAccount);
}

/** Hanya rekening aktif, untuk ditampilkan pada instruksi pembayaran manual. */
export async function getActiveBankAccounts(): Promise<BankAccount[]> {
	const result = await pocketbaseAdmin.listRecords<BankAccountRecord>('bank_accounts', {
		page: 1,
		perPage: 100,
		filter: 'is_active = true',
		sort: 'sort,created',
	});
	return result.items.map(toBankAccount);
}

export type BankAccountInput = {
	bank_name: string;
	account_holder: string;
	account_number: string;
	is_active: boolean;
	sort: number;
};

export async function createBankAccount(input: BankAccountInput): Promise<BankAccount> {
	const created = await pocketbaseAdmin.createRecord<BankAccountRecord>('bank_accounts', {
		bank_name: input.bank_name,
		account_holder: input.account_holder,
		account_number: input.account_number,
		is_active: input.is_active,
		sort: input.sort,
	});
	return toBankAccount(created);
}

export async function updateBankAccount(
	id: string,
	input: Partial<BankAccountInput>,
): Promise<BankAccount> {
	const updated = await pocketbaseAdmin.updateRecord<BankAccountRecord>('bank_accounts', id, input);
	return toBankAccount(updated);
}

export async function deleteBankAccount(id: string): Promise<void> {
	await pocketbaseAdmin.deleteRecord('bank_accounts', id);
}
