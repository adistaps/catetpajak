import pb from '@/lib/pocketbase-client';

/**
 * Informasi rekening bank yang ditampilkan kepada pelanggan saat membayar
 * manual. Nilai tersimpan di koleksi PocketBase `bank_accounts` (baca publik,
 * tulis hanya lewat rute server Admin Pusat). Hanya rekening aktif yang
 * ditampilkan pada instruksi pembayaran manual.
 */
export type BankAccount = {
	id: string;
	bank_name: string;
	account_holder: string;
	account_number: string;
	is_active: boolean;
	sort: number;
};

function mapAccount(record: Partial<BankAccount> & { id: string }): BankAccount {
	return {
		id: record.id,
		bank_name: record.bank_name ?? '',
		account_holder: record.account_holder ?? '',
		account_number: record.account_number ?? '',
		is_active: record.is_active !== false,
		sort: typeof record.sort === 'number' ? record.sort : Number(record.sort ?? 0),
	};
}

/**
 * Rekening aktif dari pengaturan Admin Pusat. Utama lewat API server (data
 * tersimpan, bukan contoh). Jika API gagal, baca langsung koleksi publik.
 */
export async function fetchActiveBankAccounts(): Promise<BankAccount[]> {
	try {
		const response = await fetch('/api/bank-accounts', { method: 'POST' });
		if (response.ok) {
			const data = (await response.json()) as { accounts?: BankAccount[] };
			if (Array.isArray(data.accounts)) {
				return data.accounts
					.filter(account => account.is_active !== false && account.bank_name && account.account_number)
					.map(account => mapAccount(account))
					.sort((a, b) => a.sort - b.sort);
			}
		}
	} catch {
		// Lanjut ke pembacaan langsung.
	}

	const records = await pb.collection('bank_accounts').getFullList({
		sort: 'sort,created',
		requestKey: 'bank-accounts-active',
	});
	return records
		.filter(record => record.is_active !== false)
		.map(record =>
			mapAccount({
				id: record.id,
				bank_name: record.bank_name ?? '',
				account_holder: record.account_holder ?? '',
				account_number: record.account_number ?? '',
				is_active: Boolean(record.is_active),
				sort: typeof record.sort === 'number' ? record.sort : Number(record.sort ?? 0),
			}),
		);
}
