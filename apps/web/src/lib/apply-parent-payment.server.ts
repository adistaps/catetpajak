/**
 * Server-only helper that applies a verified invoice payment to the company's
 * books: creates a `pembayaran` document, the matching transaction and journal
 * entries (debit kas, kredit piutang), and bumps the invoice's `paid_amount`.
 *
 * Used by both the Parent invoice-payment verification route and the company
 * customer manual-transfer approval route. Never called from the browser,
 * because applying a payment requires superuser access and must only happen
 * after a payment is verified/approved.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { todayIso } from '@/lib/accounting';
import { computePaymentTerms } from '@/lib/payment-terms';
import {
	getLatePenaltySettingsServer,
	computeLatePenaltyServer,
} from '@/lib/late-penalty-settings.server';
import logger from '@/lib/logger.server';

type InvoiceRecord = {
	id: string;
	company: string;
	student: string;
	total: number;
	paid_amount: number;
	date: string;
		payment_terms?: string;
	number: string;
	partner: string;
	contact: string;
	debit_account: string;
	credit_account: string;
	owner: string;
	status: string;
	stage: string;
	direction: string;
};

export type ParentPaymentRecord = {
	id: string;
	parent: string;
	student: string;
	invoice: string;
	company: string;
	amount: number;
	bank: string;
	payer_name: string;
	payment_date: string;
};

export type InvoicePaymentApplyInput = {
	invoiceId: string;
	amount: number;
	paymentDate?: string;
	payerName?: string;
	bank?: string;
	student?: string;
	/** Label untuk deskripsi dokumen pembayaran, cth. "parent" / "customer". */
	label?: string;
};

/**
 * Inti penerapan pembayaran invoice. Membuat dokumen pembayaran, transaksi,
 * jurnal, dan memperbarui paid_amount invoice. Idempotent-ish: selalu membuat
 * dokumen pembayaran baru, jadi pemanggil harus memastikan ini hanya dipanggil
 * sekali per pembayaran (rute verifikasi menjaganya via cek status).
 */
export async function applyInvoicePaymentServer(
	input: InvoicePaymentApplyInput,
): Promise<{ payDocId: string; payNumber: string; newPaidAmount: number }> {
	const invoice = await pocketbaseAdmin.getRecord<InvoiceRecord>(
		'documents',
		input.invoiceId,
		{ expand: 'student' },
	);

	if (invoice.stage !== 'invoice' || invoice.direction !== 'penjualan') {
		throw new Error('Dokumen ini bukan invoice penjualan.');
	}
	if (invoice.status === 'cancelled') {
		throw new Error('Invoice telah dibatalkan.');
	}

	const amount = Math.round(Number(input.amount) || 0);
	if (amount <= 0) {
		throw new Error('Nominal pembayaran tidak valid.');
	}

	const total = Number(invoice.total) || 0;
	const directPaid = Number(invoice.paid_amount) || 0;
	const payments = await pocketbaseAdmin.listRecords<{ paid_amount: number; total: number }>(
		'documents',
		{
			page: 1,
			perPage: 500,
			filter: pocketbaseAdmin.filter('source_document = {:invoiceId} && stage = "pembayaran" && status != "cancelled"', { invoiceId: invoice.id }),
		},
	);
	const linkedPaid = payments.items.reduce(
		(sum, p) => sum + (Number(p.paid_amount) || Number(p.total) || 0),
		0,
	);
	const alreadyPaid = Math.max(directPaid, linkedPaid);
	const paymentDate = input.paymentDate || todayIso();

	// Denda keterlambatan satu kali setelah jatuh tempo (berdasarkan pengaturan
	// company). Deterministik — tidak menambah denda ganda saat invoice dibuka
	// berulang atau pembayaran diulang.
	const penaltySettings = await getLatePenaltySettingsServer(invoice.company);
	const penalty =
		alreadyPaid < total
			? computeLatePenaltyServer(
					penaltySettings,
					{
						total,
						payment_terms: invoice.payment_terms,
						date: invoice.date,
						paid_amount: alreadyPaid,
					},
					paymentDate,
				)
			: 0;
	const settlementTotal = total + penalty;
	const remaining = Math.max(0, settlementTotal - alreadyPaid);

	if (amount > remaining + 1) {
		throw new Error(
			`Nominal melebihi sisa tagihan (Rp${remaining.toLocaleString('id-ID')}).`,
		);
	}

	const accounts = await pocketbaseAdmin.listRecords<{
		id: string;
		code: string;
		name: string;
		type: string;
	}>('accounts', {
		page: 1,
		perPage: 200,
		filter: pocketbaseAdmin.filter('company = {:company}', { company: invoice.company }),
		sort: 'code',
	});
	const cashAccount =
		accounts.items.find((a) => a.code === '101') ||
		accounts.items.find((a) => a.type === 'aset' && a.id !== invoice.debit_account) ||
		accounts.items[0];

	if (!cashAccount || !invoice.debit_account) {
		throw new Error('Bagan akun perusahaan belum siap untuk mencatat pembayaran.');
	}
	if (cashAccount.id === invoice.debit_account) {
		throw new Error('Akun kas dan akun piutang tidak boleh sama.');
	}

	const countRes = await pocketbaseAdmin.listRecords('documents', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('company = {:company} && direction = "penjualan" && stage = "pembayaran"', { company: invoice.company }),
	});
	const seq = String((countRes.totalItems || 0) + 1).padStart(3, '0');
	const year = new Date().getFullYear();
	const payNumber = `PAY-${year}-${seq}`;
	const date = input.paymentDate || todayIso();
	const label = input.label || 'manual';
	const docDescription = `Pembayaran ${label} untuk ${invoice.number || 'invoice'}`;
	const termsCalc = computePaymentTerms(invoice.payment_terms, invoice.date, total, date);
	const discountAccount = termsCalc
		? accounts.items.find((a) => /potongan penjualan|diskon penjualan/i.test(a.name))
		: undefined;
	const discountSettles =
		Boolean(termsCalc?.discountActive) &&
		Boolean(discountAccount) &&
		amount >= (termsCalc?.payableWithDiscount ?? 0) - 1 &&
		amount <= total + 1;

	// Denda berlaku (sudah lewat jatuh tempo) dan pembayaran menyelesaikan
	// tagihan termasuk denda. Diskon dan denda saling eksklusif.
	const penaltyAccount = penalty > 0
		? accounts.items.find((a) => a.code === '404' || /pendapatan denda/i.test(a.name))
		: undefined;
	const penaltySettles = penalty > 0 && amount >= settlementTotal - alreadyPaid - 1;

	const payDoc = await pocketbaseAdmin.createRecord<{ id: string }>('documents', {
		company: invoice.company,
		direction: 'penjualan',
		stage: 'pembayaran',
		number: payNumber,
		date,
		contact: invoice.contact || null,
		partner: invoice.partner || '',
		description: docDescription,
		items: [],
		subtotal: amount,
		discount_total: 0,
		tax_total: 0,
		total: amount,
		paid_amount: amount,
		debit_account: cashAccount.id,
		credit_account: invoice.debit_account,
		source_document: invoice.id,
		student: input.student || invoice.student || null,
		status: 'confirmed',
		owner: invoice.owner,
	});

	const tx = await pocketbaseAdmin.createRecord<{ id: string }>('transactions', {
		company: invoice.company,
		category: 'penjualan',
		date,
		description: `${docDescription}`,
		amount,
		partner: invoice.partner || '',
		debit_account: cashAccount.id,
		credit_account: invoice.debit_account,
		contact: invoice.contact || null,
		owner: invoice.owner,
	});

	await pocketbaseAdmin.createRecord('entries', {
		company: invoice.company,
		date,
		description: docDescription,
		owner: invoice.owner,
		transaction: tx.id,
		account: cashAccount.id,
		debit: amount,
		credit: 0,
	});
	await pocketbaseAdmin.createRecord('entries', {
		company: invoice.company,
		date,
		description: docDescription,
		owner: invoice.owner,
		transaction: tx.id,
		account: invoice.debit_account,
		debit: 0,
		credit: discountSettles ? total : penaltySettles ? amount - penalty : amount,
	});

	if (discountSettles && discountAccount && termsCalc) {
		await pocketbaseAdmin.createRecord('entries', {
			company: invoice.company,
			date,
			description: docDescription,
			owner: invoice.owner,
			transaction: tx.id,
			account: discountAccount.id,
			debit: Math.max(0, total - amount),
			credit: 0,
		});
	}
	if (penaltySettles && penaltyAccount && penalty > 0) {
		await pocketbaseAdmin.createRecord('entries', {
			company: invoice.company,
			date,
			description: docDescription,
			owner: invoice.owner,
			transaction: tx.id,
			account: penaltyAccount.id,
			debit: 0,
			credit: penalty,
		});
	}
	await pocketbaseAdmin.updateRecord('documents', payDoc.id, { transaction: tx.id });

	const newPaidAmount = discountSettles
		? total
		: penaltySettles
			? settlementTotal
			: Math.min(settlementTotal, alreadyPaid + amount);
	await pocketbaseAdmin.updateRecord('documents', invoice.id, {
		paid_amount: newPaidAmount,
	});

	logger.info(
		{ invoiceId: invoice.id, amount, payDocId: payDoc.id, label },
		'invoice payment applied',
	);

	return { payDocId: payDoc.id, payNumber, newPaidAmount };
}

/**
 * Wrapper untuk alur pembayaran Parent (Admin Pusat memverifikasi). Mempertahankan
 * signature lama agar rute verifikasi parent tetap kompatibel.
 */
export async function applyParentInvoicePayment(
	payment: ParentPaymentRecord,
): Promise<{ payDocId: string; payNumber: string; newPaidAmount: number }> {
	return applyInvoicePaymentServer({
		invoiceId: payment.invoice,
		amount: payment.amount,
		paymentDate: payment.payment_date,
		payerName: payment.payer_name,
		bank: payment.bank,
		student: payment.student,
		label: 'parent',
	});
}
