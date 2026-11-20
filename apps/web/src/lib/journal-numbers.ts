import pb from '@/lib/pocketbase-client';

export interface JournalLineDraft {
	account: string;
	description: string;
	debit: number;
	credit: number;
}

interface FieldError {
	code?: string;
	message?: string;
}

function responseData(err: unknown): Record<string, FieldError> | null {
	if (!err || typeof err !== 'object') return null;
	const data = (err as { response?: { data?: unknown } }).response?.data;
	if (!data || typeof data !== 'object') return null;
	return data as Record<string, FieldError>;
}

function statusOf(err: unknown): number | undefined {
	if (!err || typeof err !== 'object') return undefined;
	const status = (err as { status?: unknown }).status;
	return typeof status === 'number' ? status : undefined;
}

/** Indeks unik (company, number) menolak nomor kosong maupun nomor yang sudah dipakai. */
export function isJournalNumberConflict(err: unknown): boolean {
	const data = responseData(err);
	if (!data) return false;
	return (
		data.number?.code === 'validation_not_unique' || data.company?.code === 'validation_not_unique'
	);
}

/**
 * Nomor jurnal berikutnya: JU-YYYY-###, unik per perusahaan.
 * Dihitung dari nomor tersimpan agar tidak bentrok dengan indeks unik.
 */
export async function allocateJournalNumbers(
	companyId: string,
	date: string,
	count: number,
	requestKey: string,
): Promise<string[]> {
	if (count <= 0) return [];
	const year = Number(date.slice(0, 4)) || new Date().getFullYear();
	const prefix = `JU-${year}-`;
	const existing = await pb.collection('entries').getFullList<{ number?: string }>({
		filter: pb.filter('company = {:company}', { company: companyId }),
		fields: 'number',
		requestKey,
	});
	let maxSeq = 0;
	let width = 3;
	for (const row of existing) {
		const value = row.number || '';
		if (!value.startsWith(prefix)) continue;
		const raw = value.slice(prefix.length);
		const seq = Number.parseInt(raw, 10);
		if (Number.isNaN(seq)) continue;
		if (seq > maxSeq) maxSeq = seq;
		if (raw.length > width) width = raw.length;
	}
	return Array.from({ length: count }, (_, index) => {
		const seq = maxSeq + index + 1;
		return `${prefix}${String(seq).padStart(width, '0')}`;
	});
}

export function journalIsBalanced(lines: JournalLineDraft[]): boolean {
	const debit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
	const credit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
	return lines.length > 0 && Math.abs(debit - credit) < 0.005;
}

/**
 * Mencatat baris jurnal seimbang dengan nomor unik. Bentrok nomor dicoba sekali lagi
 * dengan nomor berikutnya. Pemanggil harus membatalkan transaksi induk bila ini gagal.
 */
export async function createNumberedJournalLines(input: {
	companyId: string;
	date: string;
	ownerId: string;
	transactionId: string;
	lines: JournalLineDraft[];
	requestKeyPrefix: string;
}): Promise<void> {
	const { companyId, date, ownerId, transactionId, lines, requestKeyPrefix } = input;
	if (!journalIsBalanced(lines)) {
		throw new Error('Jurnal tidak seimbang.');
	}
	if (lines.some(line => !line.account)) {
		throw new Error('Akun jurnal belum dipilih.');
	}
	const numbers = await allocateJournalNumbers(
		companyId,
		date,
		lines.length,
		`${requestKeyPrefix}-numbers`,
	);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const number = numbers[index];
		if (!line || !number) {
			throw new Error('Nomor jurnal tidak tersedia.');
		}
		const payload = {
			company: companyId,
			date,
			description: line.description,
			owner: ownerId,
			transaction: transactionId,
			group: transactionId,
			account: line.account,
			debit: Number(line.debit) || 0,
			credit: Number(line.credit) || 0,
			number,
		};
		try {
			await pb.collection('entries').create(payload, {
				requestKey: `${requestKeyPrefix}-${index}`,
			});
		} catch (err) {
			if (!isJournalNumberConflict(err)) throw err;
			const retryNumbers = await allocateJournalNumbers(
				companyId,
				date,
				1,
				`${requestKeyPrefix}-retry-numbers-${index}`,
			);
			const retryNumber = retryNumbers[0];
			if (!retryNumber) {
				throw new Error('Nomor jurnal tidak tersedia.');
			}
			await pb.collection('entries').create(
				{ ...payload, number: retryNumber },
				{ requestKey: `${requestKeyPrefix}-retry-${index}` },
			);
		}
	}
}

/** Hapus transaksi yang baru dibuat beserta jurnalnya agar simpan ulang tidak menggandakan. */
export async function rollbackTransaction(transactionId: string): Promise<void> {
	try {
		const rows = await pb.collection('entries').getFullList<{ id: string }>({
			filter: pb.filter('transaction = {:id}', { id: transactionId }),
			fields: 'id',
			requestKey: `rollback-entries-${transactionId}`,
		});
		for (const row of rows) {
			await pb.collection('entries').delete(row.id, { requestKey: `rollback-entry-${row.id}` });
		}
	} catch {
		/* jurnal mungkin belum tercatat — lanjut hapus transaksi */
	}
	await pb.collection('transactions').delete(transactionId, {
		requestKey: `rollback-tx-${transactionId}`,
	});
}

const FIELD_LABELS: Record<string, string> = {
	account: 'Akun',
	date: 'Tanggal',
	debit: 'Debit',
	credit: 'Kredit',
	company: 'Perusahaan',
	number: 'Nomor jurnal',
	description: 'Keterangan',
	owner: 'Pemilik',
	amount: 'Nominal',
	debit_account: 'Akun debit',
	credit_account: 'Akun kredit',
	category: 'Jenis transaksi',
};

export function describeSaveError(err: unknown): string {
	if (err instanceof Error && err.message === 'Jurnal tidak seimbang.') {
		return 'Jurnal tidak seimbang. Transaksi tidak disimpan.';
	}
	if (err instanceof Error && err.message === 'Akun jurnal belum dipilih.') {
		return 'Pilih akun debit dan kredit terlebih dahulu.';
	}
	if (err instanceof Error && err.message === 'Nomor jurnal tidak tersedia.') {
		return 'Nomor jurnal tidak bisa dibuat. Transaksi tidak disimpan. Coba lagi.';
	}
	const status = statusOf(err);
	const data = responseData(err);
	if (isJournalNumberConflict(err)) {
		return 'Nomor jurnal bentrok dengan catatan lain. Transaksi dibatalkan agar tidak ganda. Silakan coba simpan lagi.';
	}
	if (status === 403 || status === 404) {
		return 'Anda tidak memiliki izin mencatat transaksi di perusahaan aktif ini.';
	}
	if (status === 0) {
		return 'Koneksi terputus saat menyimpan. Transaksi tidak digandakan. Periksa jaringan, lalu coba lagi.';
	}
	if (data) {
		const parts = Object.entries(data)
			.map(([field, info]) => {
				if (!info?.code && !info?.message) return '';
				const label = FIELD_LABELS[field] ?? 'Isian';
				if (info.code === 'validation_required') return `${label} wajib diisi.`;
				if (info.code === 'validation_not_unique') return `${label} sudah digunakan.`;
				if (info.code === 'validation_min_number_constraint' || info.code === 'validation_max_number_constraint') {
					return `${label} di luar batas yang diizinkan.`;
				}
				return `${label} tidak valid.`;
			})
			.filter(Boolean);
		if (parts.length > 0) return `Gagal menyimpan. ${parts.join(' ')}`;
	}
	return 'Gagal menyimpan transaksi. Periksa kembali isian Anda, lalu coba lagi.';
}
