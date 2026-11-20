import pb from '@/lib/pocketbase-client';
import type { Account } from '@/lib/accounting';

export interface DeliveryJournalInput {
	companyId: string;
	ownerId: string;
	docId: string;
	date: string;
	description: string;
	number: string;
	/** Nilai pengiriman termasuk ongkos kirim. */
	amount: number;
	sourceDocumentId?: string;
}

function matchAccount(list: Account[], patterns: RegExp[]): Account | undefined {
	for (const pattern of patterns) {
		const found = list.find(account => pattern.test(`${account.code} ${account.name}`));
		if (found) return found;
	}
	return undefined;
}

async function nextJournalNumbers(companyId: string, date: string, count: number, requestKey: string): Promise<string[]> {
	const year = Number(date.slice(0, 4)) || new Date().getFullYear();
	const prefix = `JU-${year}-`;
	const existing = await pb.collection('entries').getFullList<{ number?: string }>({
		filter: pb.filter('company = {:company} && number ~ {:prefix}', {
			company: companyId,
			prefix,
		}),
		fields: 'number',
		requestKey,
	});
	let maxSeq = 0;
	for (const row of existing) {
		const value = row.number || '';
		if (!value.startsWith(prefix)) continue;
		const seq = Number.parseInt(value.slice(prefix.length), 10);
		if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
	}
	return Array.from({ length: count }, (_, index) => `${prefix}${String(maxSeq + index + 1).padStart(3, '0')}`);
}

/**
 * Mencatat jurnal Pengiriman Penjualan bila belum ada: debit akun Piutang
 * invoice sumber, kredit Pendapatan Belum Ditagih. Jurnal yang sudah seimbang
 * dan nilainya sama tidak diubah. Penyimpanan ulang hanya menyesuaikan nominal
 * pada baris yang sama, tanpa nomor baru.
 */
const inflight = new Map<string, Promise<boolean>>();

export function ensureSalesDeliveryJournal(input: DeliveryJournalInput): Promise<boolean> {
	const pending = inflight.get(input.docId);
	if (pending) return pending;
	const run = writeSalesDeliveryJournal(input).finally(() => {
		if (inflight.get(input.docId) === run) inflight.delete(input.docId);
	});
	inflight.set(input.docId, run);
	return run;
}

async function writeSalesDeliveryJournal(input: DeliveryJournalInput): Promise<boolean> {
	const amount = Math.round(Number(input.amount) || 0);
	if (!input.companyId || !input.docId || !input.ownerId || amount <= 0) return false;

	const group = `doc-${input.docId}`;
	const accounts = await pb.collection('accounts').getFullList<Account>({
		filter: pb.filter('company = {:company}', { company: input.companyId }),
		sort: 'code',
		requestKey: `delivery-accounts-${input.docId}`,
	});

	let receivable: Account | undefined;
	if (input.sourceDocumentId) {
		try {
			const source = await pb.collection('documents').getOne<{ debit_account?: string }>(input.sourceDocumentId, {
				fields: 'debit_account',
				requestKey: `delivery-source-debit-${input.docId}`,
			});
			if (source.debit_account) {
				receivable = accounts.find(account => account.id === source.debit_account);
			}
		} catch {
			/* invoice sumber tidak ada — lanjut deteksi otomatis */
		}
	}
	if (!receivable) {
		receivable =
			matchAccount(accounts, [/piutang usaha/i, /\b103\b/]) ??
			accounts.find(account => account.code === '103') ??
			accounts.find(
				account => account.type === 'aset' && /piutang/i.test(account.name) && !/pinjaman/i.test(account.name),
			);
	}
	let unbilled =
		matchAccount(accounts, [/pendapatan belum ditagih/i]) ?? accounts.find(account => account.code === '402');

	if (!receivable) {
		receivable = await pb.collection('accounts').create<Account>(
			{
				company: input.companyId,
				code: '103',
				name: 'Piutang Usaha',
				type: 'aset',
				owner: input.ownerId,
			},
			{ requestKey: `receivable-account-${input.docId}` },
		);
	}
	if (!unbilled) {
		unbilled = await pb.collection('accounts').create<Account>(
			{
				company: input.companyId,
				code: '402',
				name: 'Pendapatan Belum Ditagih',
				type: 'pendapatan',
				owner: input.ownerId,
			},
			{ requestKey: `unbilled-account-${input.docId}` },
		);
	}
	if (!receivable || !unbilled || receivable.id === unbilled.id) return false;

	const existing = await pb.collection('entries').getFullList<{
		id: string;
		debit?: number;
		credit?: number;
		account: string;
	}>({
		filter: pb.filter('company = {:company} && group = {:group}', {
			company: input.companyId,
			group,
		}),
		sort: 'created',
		requestKey: `delivery-journal-existing-${input.docId}`,
	});

	const debitTotal = existing.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
	const creditTotal = existing.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
	const balanced = existing.length > 0 && Math.abs(debitTotal - creditTotal) <= 1 && Math.abs(debitTotal - amount) <= 1;
	if (balanced) return true;

	const description = input.description?.trim() || `Pengiriman ${input.number}`.trim();
	const base = {
		company: input.companyId,
		date: input.date,
		description,
		owner: input.ownerId,
		group,
	};

	if (existing.length === 2) {
		const debitLine = existing.find(line => (Number(line.debit) || 0) > 0) ?? existing[0];
		const creditLine = existing.find(line => line.id !== debitLine.id) ?? existing[1];
		await pb.collection('entries').update(
			debitLine.id,
			{ ...base, account: receivable.id, debit: amount, credit: 0 },
			{ requestKey: `delivery-journal-upd-d-${input.docId}` },
		);
		await pb.collection('entries').update(
			creditLine.id,
			{ ...base, account: unbilled.id, debit: 0, credit: amount },
			{ requestKey: `delivery-journal-upd-c-${input.docId}` },
		);
		return true;
	}

	for (const [index, line] of existing.entries()) {
		await pb.collection('entries').delete(line.id, {
			requestKey: `delivery-journal-del-${input.docId}-${index}`,
		});
	}

	const numbers = await nextJournalNumbers(input.companyId, input.date, 2, `delivery-journal-numbers-${input.docId}`);
	const lines = [
		{ ...base, account: receivable.id, debit: amount, credit: 0, number: numbers[0] },
		{ ...base, account: unbilled.id, debit: 0, credit: amount, number: numbers[1] },
	];
	for (const [index, line] of lines.entries()) {
		await pb.collection('entries').create(line, {
			requestKey: `delivery-entry-${input.docId}-${index}`,
		});
	}
	return true;
}
