import pb from '@/lib/pocketbase-client';

export type InvoicePaymentStatus = 'menunggu_verifikasi' | 'aktif' | 'ditolak';

export interface InvoicePayment {
	id: string;
	company: string;
	invoice: {
		id: string;
		number: string;
		total: number;
		paid_amount: number;
		partner: string;
	};
	contact: { id: string; name: string };
	amount: number;
	expected_amount: number;
	expected_amount_formatted: string;
	auto_verified: boolean;
	verification_notes: string;
	payment_method: string;
	bank: string;
	proof_url: string;
	payer_name: string;
	payment_date: string;
	notes: string;
	status: InvoicePaymentStatus;
	submitted_by: { id: string; name: string; email: string };
	verifier: { id: string; name: string; email: string } | null;
	verified_at: string;
	rejection_reason: string;
	created: string;
}

export interface InvoicePaymentRecord {
	id: string;
	company: string;
	invoice: string;
	contact: string;
	amount: number;
	expected_amount?: number;
	expected_amount_formatted?: string;
	auto_verified?: boolean;
	verification_notes?: string;
	payment_method: string;
	bank: string;
	proof: string;
	payer_name: string;
	payment_date: string;
	notes: string;
	status: InvoicePaymentStatus;
	submitted_by: string;
	verifier: string;
	verified_at: string;
	rejection_reason: string;
	created: string;
	updated: string;
	expand?: {
		invoice?: { id: string; number: string; total: number; paid_amount: number; partner: string };
		contact?: { id: string; name: string };
		submitted_by?: { id: string; name: string; email: string };
		verifier?: { id: string; name: string; email: string };
	};
}

export const INVOICE_PAYMENT_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
	menunggu_verifikasi: 'Menunggu verifikasi',
	aktif: 'Disetujui',
	ditolak: 'Ditolak',
};

/**
 * Daftar pembayaran manual invoice untuk company aktif (semua status), diurutkan
 * menunggu verifikasi lebih dulu. Membaca langsung koleksi `invoice_payments`;
 * aturan akses koleksi membatasi per company.
 */
export async function fetchInvoicePayments(companyId: string): Promise<InvoicePayment[]> {
	const records = await pb
		.collection('invoice_payments')
		.getFullList<InvoicePaymentRecord>({
			filter: pb.filter('company = {:company}', { company: companyId }),
			sort: '-created',
			expand: 'invoice,contact,submitted_by,verifier',
			requestKey: null,
		});

	const token = await pb.files.getToken().catch(() => '');
	const mapped = records.map(record => mapInvoicePayment(record, token));
	// Menunggu verifikasi lebih dulu, lalu terbaru.
	mapped.sort((a, b) => {
		if (a.status === 'menunggu_verifikasi' && b.status !== 'menunggu_verifikasi') return -1;
		if (a.status !== 'menunggu_verifikasi' && b.status === 'menunggu_verifikasi') return 1;
		return new Date(b.created).getTime() - new Date(a.created).getTime();
	});
	return mapped;
}

export function mapInvoicePayment(record: InvoicePaymentRecord, token: string): InvoicePayment {
	const invoice = record.expand?.invoice;
	const contact = record.expand?.contact;
	const proofUrl = record.proof
		? `${pb.baseUrl}/api/files/invoice_payments/${record.id}/${record.proof}${token ? `?token=${encodeURIComponent(token)}` : ''}`
		: '';
	return {
		id: record.id,
		company: record.company,
		invoice: {
			id: invoice?.id ?? record.invoice,
			number: invoice?.number ?? '',
			total: Number(invoice?.total ?? 0),
			paid_amount: Number(invoice?.paid_amount ?? 0),
			partner: invoice?.partner ?? '',
		},
		contact: contact ? { id: contact.id, name: contact.name } : { id: record.contact ?? '', name: '' },
		amount: Number(record.amount) || 0,
		expected_amount: Number(record.expected_amount) || 0,
		expected_amount_formatted: record.expected_amount_formatted ?? '',
		auto_verified: Boolean(record.auto_verified),
		verification_notes: record.verification_notes ?? '',
		payment_method: record.payment_method,
		bank: record.bank,
		proof_url: proofUrl,
		payer_name: record.payer_name,
		payment_date: record.payment_date,
		notes: record.notes,
		status: record.status,
		submitted_by: record.expand?.submitted_by
			? {
					id: record.expand.submitted_by.id,
					name: record.expand.submitted_by.name ?? '',
					email: record.expand.submitted_by.email ?? '',
				}
			: { id: record.submitted_by, name: '', email: '' },
		verifier: record.expand?.verifier
			? {
					id: record.expand.verifier.id,
					name: record.expand.verifier.name ?? '',
					email: record.expand.verifier.email ?? '',
				}
			: null,
		verified_at: record.verified_at,
		rejection_reason: record.rejection_reason,
		created: record.created,
	};
}

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

	const res = await fetch('/api/invoice-payments', {
		method: 'POST',
		headers: token ? { Authorization: `Bearer ${token}` } : {},
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

export async function approveInvoicePayment(id: string): Promise<InvoicePayment> {
	const token = pb.authStore.token;
	const res = await fetch('/api/invoice-payments', {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ id, action: 'verify' }),
	});
	const data = (await res.json().catch(() => ({}))) as { payment?: InvoicePayment; error?: string };
	if (!res.ok) {
		throw new Error(data.error || `Gagal menyetujui pembayaran (${res.status}).`);
	}
	return data.payment as InvoicePayment;
}

export async function rejectInvoicePayment(id: string, reason: string): Promise<InvoicePayment> {
	const token = pb.authStore.token;
	const res = await fetch('/api/invoice-payments', {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ id, action: 'reject', rejection_reason: reason }),
	});
	const data = (await res.json().catch(() => ({}))) as { payment?: InvoicePayment; error?: string };
	if (!res.ok) {
		throw new Error(data.error || `Gagal menolak pembayaran (${res.status}).`);
	}
	return data.payment as InvoicePayment;
}

// ---------------------------------------------------------------------------
// Approval pembayaran manual yang diajukan customer (Parent) untuk invoice
// perusahaan. Perusahaan memvalidasi bukti transfer yang sudah dikirim
// customer, lalu menyetujui (menerapkan ke invoice) atau menolak.
// ---------------------------------------------------------------------------

export type PendingPaymentSource = 'parent' | 'company';

export interface CompanyParentPayment {
	id: string;
	source: PendingPaymentSource;
	parent: { id: string; name: string; email: string };
	student: { id: string; student_name: string };
	invoice: { id: string; number: string; total: number; paid_amount: number };
	company: string;
	amount: number;
	expected_amount: number;
	expected_amount_formatted: string;
	auto_verified: boolean;
	payment_method: string;
	bank: string;
	proof_url: string;
	payer_name: string;
	payment_date: string;
	notes: string;
	status: InvoicePaymentStatus;
	verifier: { id: string; name: string; email: string } | null;
	verified_at: string;
	rejection_reason: string;
	verification_notes: string;
	created: string;
}

/**
 * Daftar pembayaran manual yang diajukan customer (Parent) untuk invoice
 * perusahaan aktif (semua status), diurutkan menunggu verifikasi lebih dulu.
 * Membaca melalui route server (superuser) karena aturan akses koleksi
 * `parent_invoice_payments` membatasi baca hanya untuk Parent.
 */
export async function fetchCompanyParentPayments(companyId: string): Promise<CompanyParentPayment[]> {
	const token = pb.authStore.token;
	const res = await fetch('/api/company-parent-payments', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ companyId }),
	});
	const data = (await res.json().catch(() => ({}))) as { payments?: CompanyParentPayment[]; error?: string };
	if (!res.ok) {
		throw new Error(data.error || `Gagal memuat pembayaran (${res.status}).`);
	}
	const payments = data.payments ?? [];
	for (const p of payments) {
		p.source = 'parent';
	}
	// Menunggu verifikasi lebih dulu, lalu terbaru.
	payments.sort((a, b) => {
		if (a.status === 'menunggu_verifikasi' && b.status !== 'menunggu_verifikasi') return -1;
		if (a.status !== 'menunggu_verifikasi' && b.status === 'menunggu_verifikasi') return 1;
		return new Date(b.created).getTime() - new Date(a.created).getTime();
	});
	return payments;
}

export async function approveCompanyParentPayment(id: string): Promise<CompanyParentPayment> {
	const token = pb.authStore.token;
	const res = await fetch('/api/company-parent-payments', {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ id, action: 'verify' }),
	});
	const data = (await res.json().catch(() => ({}))) as { payment?: CompanyParentPayment; error?: string };
	if (!res.ok) {
		throw new Error(data.error || `Gagal menyetujui pembayaran (${res.status}).`);
	}
	return data.payment as CompanyParentPayment;
}

export async function rejectCompanyParentPayment(id: string, reason: string): Promise<CompanyParentPayment> {
	const token = pb.authStore.token;
	const res = await fetch('/api/company-parent-payments', {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ id, action: 'reject', rejection_reason: reason }),
	});
	const data = (await res.json().catch(() => ({}))) as { payment?: CompanyParentPayment; error?: string };
	if (!res.ok) {
		throw new Error(data.error || `Gagal menolak pembayaran (${res.status}).`);
	}
	const payment = data.payment as CompanyParentPayment;
	if (payment) payment.source = 'parent';
	return payment;
}

// ---------------------------------------------------------------------------
// Gabungan: pembayaran manual yang menunggu validasi dari DUA sumber —
// `parent_invoice_payments` (diajukan Parent via dashboard) dan
// `invoice_payments` (diajukan customer atas nama company). Tombol Validasi
// pada daftar invoice harus muncul bila ada pengajuan tertunda dari sumber
// mana pun untuk invoice tersebut.
// ---------------------------------------------------------------------------

/** Mapping `InvoicePayment` (company-scoped) ke `CompanyParentPayment`. */
export function mapInvoicePaymentToPending(ip: InvoicePayment): CompanyParentPayment {
	return {
		id: ip.id,
		source: 'company',
		parent: {
			id: ip.contact?.id ?? '',
			name: ip.contact?.name || ip.payer_name || '',
			email: '',
		},
		student: { id: '', student_name: '' },
		invoice: {
			id: ip.invoice.id,
			number: ip.invoice.number,
			total: ip.invoice.total,
			paid_amount: ip.invoice.paid_amount,
		},
		company: ip.company,
		amount: ip.amount,
		expected_amount: ip.expected_amount,
		expected_amount_formatted: ip.expected_amount_formatted,
		auto_verified: ip.auto_verified,
		payment_method: ip.payment_method,
		bank: ip.bank,
		proof_url: ip.proof_url,
		payer_name: ip.payer_name,
		payment_date: ip.payment_date,
		notes: ip.notes,
		status: ip.status,
		verifier: ip.verifier,
		verified_at: ip.verified_at,
		rejection_reason: ip.rejection_reason,
		verification_notes: ip.verification_notes,
		created: ip.created,
	};
}

function sortPending(payments: CompanyParentPayment[]): CompanyParentPayment[] {
	return payments.sort((a, b) => {
		if (a.status === 'menunggu_verifikasi' && b.status !== 'menunggu_verifikasi') return -1;
		if (a.status !== 'menunggu_verifikasi' && b.status === 'menunggu_verifikasi') return 1;
		return new Date(b.created).getTime() - new Date(a.created).getTime();
	});
}

/**
 * Semua pengajuan pembayaran manual untuk company aktif (gabungan Parent +
 * company-scoped), diurutkan menunggu verifikasi lebih dulu. Kegagalan salah
 * satu sumber tidak menyembunyikan sumber lainnya.
 */
export async function fetchCompanyPendingPayments(companyId: string): Promise<CompanyParentPayment[]> {
	const [parentResult, invoiceResult] = await Promise.allSettled([
		fetchCompanyParentPayments(companyId),
		fetchInvoicePayments(companyId),
	]);

	const list: CompanyParentPayment[] = [];
	if (parentResult.status === 'fulfilled') {
		list.push(...parentResult.value);
	}
	if (invoiceResult.status === 'fulfilled') {
		list.push(...invoiceResult.value.map(mapInvoicePaymentToPending));
	}
	return sortPending(list);
}

/** Menyetujui pengajuan pembayaran dari sumber mana pun. */
export async function approvePendingPayment(payment: CompanyParentPayment): Promise<CompanyParentPayment> {
	if (payment.source === 'company') {
		const updated = await approveInvoicePayment(payment.id);
		return mapInvoicePaymentToPending(updated);
	}
	const updated = await approveCompanyParentPayment(payment.id);
	return updated;
}

/** Menolak pengajuan pembayaran dari sumber mana pun. */
export async function rejectPendingPayment(
	payment: CompanyParentPayment,
	reason: string,
): Promise<CompanyParentPayment> {
	if (payment.source === 'company') {
		const updated = await rejectInvoicePayment(payment.id, reason);
		return mapInvoicePaymentToPending(updated);
	}
	const updated = await rejectCompanyParentPayment(payment.id, reason);
	return updated;
}
