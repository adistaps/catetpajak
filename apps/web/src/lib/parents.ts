import pb from '@/lib/pocketbase-client';
import { formatRupiah, todayIso } from '@/lib/accounting';
import type { BusinessDocument } from '@/lib/documents';
import type { Student } from '@/lib/students';

export interface ParentAccount {
	id: string;
	name: string;
	email: string;
	phone: string;
	company: string;
}

export interface ParentStudent extends Student {
	expand?: { parent?: ParentAccount };
}

export interface ParentInvoice extends BusinessDocument {
	expand?: { student?: Student };
}

export type ParentInvoicePaymentStatus =
	| 'menunggu_verifikasi'
	| 'aktif'
	| 'ditolak';

export interface ParentInvoicePayment {
	id: string;
	parent: string;
	student: string;
	invoice: string;
	company: string;
	amount: number;
	expected_amount?: number;
	expected_amount_formatted?: string;
	auto_verified?: boolean;
	payment_method: string;
	bank: string;
	proof: string;
	payer_name: string;
	payment_date: string;
	notes: string;
	status: ParentInvoicePaymentStatus;
	verifier: string;
	verified_at: string;
	rejection_reason: string;
	verification_notes: string;
	created: string;
	updated: string;
}

export interface InvoiceWithStatus {
	invoice: ParentInvoice;
	paid: number;
	remaining: number;
	isPaid: boolean;
	/** Pembayaran manual yang masih menunggu verifikasi untuk invoice ini. */
	pendingPayment: ParentInvoicePayment | null;
}

/** Login parent dengan email & password (koleksi auth `parents`). */
export async function loginParent(email: string, password: string): Promise<ParentAccount> {
	const result = await pb.collection('parents').authWithPassword<ParentAccount>(email, password);
	return result.record;
}

/** Parent yang sedang masuk, atau null. */
export function currentParent(): ParentAccount | null {
	const record = pb.authStore.record;
	if (!record || record.collectionName !== 'parents') return null;
	return record as unknown as ParentAccount;
}

/** Apakah sesi parent aktif. */
export function isParentAuthed(): boolean {
	return pb.authStore.isValid && currentParent() !== null;
}

/** Logout parent. */
export function logoutParent(): void {
	pb.authStore.clear();
}

/** Siswa yang terhubung dengan parent yang masuk. */
export async function fetchMyStudents(): Promise<ParentStudent[]> {
	const parent = currentParent();
	if (!parent) return [];
	return pb.collection('students').getFullList<ParentStudent>({
		filter: pb.filter('parent = {:id}', { id: parent.id }),
		sort: 'student_name',
		requestKey: null,
	});
}

/**
 * Hanya invoice penjualan milik siswa yang terhubung dengan parent ini.
 * Aturan akses koleksi `documents` sudah membatasi berdasarkan
 * `student.parent = @request.auth.id`, tetapi di sini kita juga memfilter
 * secara eksplisit berdasarkan ID siswa parent agar tidak ada invoice siswa
 * lain yang ikut muncul.
 */
export async function fetchMyInvoices(): Promise<ParentInvoice[]> {
	const parent = currentParent();
	if (!parent) return [];

	const students = await pb.collection('students').getFullList<{ id: string }>({
		filter: pb.filter('parent = {:id}', { id: parent.id }),
		fields: 'id',
		requestKey: 'parent-my-student-ids',
	});
	if (students.length === 0) return [];

	const studentFilter = students
		.map((s, i) => `student = {:sid${i}}`)
		.join(' || ');
	const params: Record<string, string> = {};
	students.forEach((s, i) => {
		params[`sid${i}`] = s.id;
	});

	return pb.collection('documents').getFullList<ParentInvoice>({
		filter: pb.filter(
			`stage = "invoice" && direction = "penjualan" && status != "cancelled" && (${studentFilter})`,
			params,
		),
		sort: '-date',
		expand: 'student',
		requestKey: null,
	});
}

/** Semua catatan pembayaran manual milik parent (semua status). */
export async function fetchMyInvoicePayments(): Promise<ParentInvoicePayment[]> {
	const parent = currentParent();
	if (!parent) return [];
	return pb.collection('parent_invoice_payments').getFullList<ParentInvoicePayment>({
		filter: pb.filter('parent = {:id}', { id: parent.id }),
		sort: '-created',
		requestKey: null,
	});
}

/**
 * Gabungkan invoice dengan status pembayaran. `paid` mengikuti `paid_amount`
 * invoice (hanya diperbarui setelah Admin Pusat memverifikasi pembayaran
 * manual). Pembayaran yang masih menunggu verifikasi tidak dihitung sebagai
 * lunas, tetapi ditampilkan sebagai `pendingPayment`.
 */
export function computeInvoiceStatus(
	invoices: ParentInvoice[],
	payments: ParentInvoicePayment[],
): InvoiceWithStatus[] {
	const pendingByInvoice = new Map<string, ParentInvoicePayment>();
	for (const payment of payments) {
		if (payment.status === 'menunggu_verifikasi') {
			// Ambil yang terbaru jika ada beberapa.
			if (!pendingByInvoice.has(payment.invoice)) {
				pendingByInvoice.set(payment.invoice, payment);
			}
		}
	}

	return invoices.map((invoice) => {
		const total = Number(invoice.total) || 0;
		const paid = Number(invoice.paid_amount) || 0;
		const remaining = Math.max(0, total - paid);
		return {
			invoice,
			paid,
			remaining,
			isPaid: remaining <= 0.5,
			pendingPayment: pendingByInvoice.get(invoice.id) ?? null,
		};
	});
}

/** Nominal unik (jumlah bayar + tiga digit) yang harus ditransfer customer. */
export async function fetchInvoiceExpectedAmount(
	invoiceId: string,
	baseAmount: number,
): Promise<{ expected_amount: number; expected_amount_formatted: string }> {
	const token = pb.authStore.token;
	const res = await fetch('/api/invoice-payments/expected-amount', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ invoiceId, baseAmount }),
	});
	const data = (await res.json().catch(() => ({}))) as {
		expected_amount?: number;
		expected_amount_formatted?: string;
		error?: string;
	};
	if (!res.ok || !data.expected_amount) {
		throw new Error(data.error || 'Gagal membuat nominal unik. Muat ulang halaman lalu coba lagi.');
	}
	return {
		expected_amount: data.expected_amount,
		expected_amount_formatted: data.expected_amount_formatted ?? '',
	};
}

/** Kirim bukti pembayaran manual untuk sebuah invoice melalui route server. */
export async function submitInvoicePayment(input: {
	invoiceId: string;
	amount: number;
	expectedAmount: number;
	bank: string;
	paymentDate: string;
	payerName: string;
	notes: string;
	proof: File;
}): Promise<{ ok: boolean; verified: boolean; reason: string }> {
	const token = pb.authStore.token;
	const form = new FormData();
	form.append('invoiceId', input.invoiceId);
	form.append('amount', String(input.amount));
	form.append('expectedAmount', String(input.expectedAmount));
	form.append('bank', input.bank);
	form.append('paymentDate', input.paymentDate);
	form.append('payerName', input.payerName);
	form.append('notes', input.notes);
	form.append('proof', input.proof);

	const res = await fetch('/api/parent/pay-invoice', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
		},
		body: form,
	});
	const data = (await res.json().catch(() => ({}))) as {
		ok?: boolean;
		verified?: boolean;
		reason?: string;
		error?: string;
	};
	if (!res.ok) {
		throw new Error(data.error || `Gagal mengirim pembayaran (${res.status}).`);
	}
	return {
		ok: true,
		verified: Boolean(data.verified),
		reason: data.reason ?? '',
	};
}

export { formatRupiah, todayIso };

/** Informasi rekening bank perusahaan pemilik invoice (untuk instruksi transfer). */
export interface CompanyBankAccount {
	bank_name: string;
	account_holder: string;
	account_number: string;
	company_name: string;
}

/**
 * Mengambil rekening bank perusahaan untuk sebuah invoice. Server memverifikasi
 * bahwa invoice milik siswa parent ini sebelum mengembalikan data rekening.
 * Mengembalikan null bila perusahaan belum mengisi rekeningnya.
 */
export async function fetchCompanyBankAccount(invoiceId: string): Promise<CompanyBankAccount | null> {
	const token = pb.authStore.token;
	const res = await fetch('/api/company-bank-account', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ invoiceId }),
	});
	if (!res.ok) return null;
	const data = (await res.json().catch(() => ({}))) as Partial<CompanyBankAccount>;
	if (!data.bank_name && !data.account_number) return null;
	return {
		bank_name: data.bank_name ?? '',
		account_holder: data.account_holder ?? '',
		account_number: data.account_number ?? '',
		company_name: data.company_name ?? '',
	};
}
