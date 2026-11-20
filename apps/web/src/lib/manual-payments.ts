import pb from '@/lib/pocketbase-client';
import type { RecordModel } from 'pocketbase';

const VERIFY_PATH = '/api/akuntan/manual-payments/verify';
const EXPECTED_AMOUNT_PATH = '/api/akuntan/manual-payments/expected-amount';

/**
 * Pembayaran manual langganan Pencari Akuntan. Pencari mengunggah bukti
 * transfer bank; admin pusat memverifikasi, dan setelah diverifikasi catatan
 * berstatus `aktif` memberi akses langganan selama periode berlaku.
 *
 * Isolasi data ditegakkan oleh access rule koleksi `pencari_manual_payments`:
 * pencari hanya melihat catatannya sendiri. Verifikasi hanya dilakukan admin
 * pusat melalui route server (superuser).
 */
export type ManualPaymentStatus =
	| 'menunggu_verifikasi'
	| 'aktif'
	| 'ditolak'
	| 'kedaluwarsa';

export type ManualPayment = {
	id: string;
	seeker: string;
	plan_title: string;
	variant_id: string;
	amount_formatted: string;
	expected_amount: number;
	expected_amount_formatted: string;
	payment_method: string;
	bank: string;
	proof: string;
	payer_name: string;
	payer_email: string;
	payment_date: string;
	notes: string;
	status: ManualPaymentStatus;
	period_start: string;
	period_end: string;
	verifier: string;
	verified_at: string;
	rejection_reason: string;
	auto_verified: boolean;
	verification_notes: string;
	created: string;
	updated: string;
	expand?: {
		seeker?: { id: string; name: string; email: string };
		verifier?: { id: string; name: string; email: string };
	};
};

export type ManualPaymentVerifyResult = {
	verified: boolean;
	status: string;
	reason: string;
};

export const MANUAL_PAYMENT_STATUS_LABELS: Record<ManualPaymentStatus, string> = {
	menunggu_verifikasi: 'Menunggu verifikasi',
	aktif: 'Aktif',
	ditolak: 'Ditolak',
	kedaluwarsa: 'Kedaluwarsa',
};

export function manualPaymentStatusClass(status: ManualPaymentStatus): string {
	if (status === 'menunggu_verifikasi') return 'bg-amber-50 text-amber-700 border-amber-200';
	if (status === 'aktif') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
	if (status === 'ditolak') return 'bg-red-50 text-red-700 border-red-200';
	return 'bg-slate-50 text-slate-600 border-slate-200';
}

/**
 * Apakah catatan pembayaran manual ini masih memberi akses langganan: status
 * `aktif` dan periode berlaku belum lewat (hingga akhir hari period_end).
 */
export function isManualPaymentActive(payment: ManualPayment): boolean {
	if (payment.status !== 'aktif') return false;
	if (!payment.period_end) return true;
	const end = new Date(`${payment.period_end}T23:59:59`);
	if (Number.isNaN(end.getTime())) return true;
	return end.getTime() >= Date.now();
}

export type ManualPaymentInput = {
	plan_title: string;
	variant_id: string;
	amount_formatted: string;
	expected_amount: number;
	expected_amount_formatted: string;
	payment_method: string;
	bank: string;
	payer_name: string;
	payer_email: string;
	payment_date: string;
	notes: string;
	proof: File;
};

export type ExpectedAmountResult = {
	expected_amount: number;
	expected_amount_formatted: string;
};

/**
 * Meminta nominal unik (harga paket + tiga digit acak) yang belum dipakai
 * pembayaran aktif/menunggu lain. Nominal ini ditampilkan ke pelanggan sebagai
 * jumlah yang harus ditransfer dan dipakai verifikasi otomatis.
 *
 * Harga dasar diambil server-side dari pengaturan harga paket Admin Pusat
 * berdasarkan `planKey`, sehingga klien tidak dapat memanipulasi nominal dasar.
 */
export async function fetchExpectedAmount(
	planKey: string,
): Promise<ExpectedAmountResult> {
	const response = await fetch(EXPECTED_AMOUNT_PATH, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(pb.authStore.isValid ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
		},
		body: JSON.stringify({ plan: planKey }),
	});

	if (!response.ok) {
		let message = 'Gagal membuat nominal unik.';
		try {
			const data = (await response.json()) as { error?: string; message?: string };
			if (data.error ?? data.message) message = data.error ?? data.message!;
		} catch {
			// abaikan body yang tidak terurai
		}
		throw new Error(message);
	}

	return (await response.json()) as ExpectedAmountResult;
}

/** Kirim pembayaran manual baru atas nama pengguna yang sedang masuk. */
export async function createManualPayment(
	input: ManualPaymentInput,
	seekerId: string,
): Promise<ManualPayment> {
	const fd = new FormData();
	fd.append('seeker', seekerId);
	fd.append('plan_title', input.plan_title);
	fd.append('variant_id', input.variant_id);
	fd.append('amount_formatted', input.amount_formatted);
	fd.append('expected_amount', String(input.expected_amount));
	fd.append('expected_amount_formatted', input.expected_amount_formatted);
	fd.append('payment_method', input.payment_method);
	fd.append('bank', input.bank);
	fd.append('payer_name', input.payer_name);
	fd.append('payer_email', input.payer_email);
	fd.append('payment_date', input.payment_date);
	fd.append('notes', input.notes);
	fd.append('status', 'menunggu_verifikasi');
	fd.append('proof', input.proof);
	const record = await pb.collection('pencari_manual_payments').create(fd);
	return record as unknown as ManualPayment;
}

/**
 * Meminta verifikasi otomatis bukti transfer untuk pembayaran manual yang baru
 * dikirim. Server memeriksa kecocokan jumlah dan nama bank pada bukti; jika
 * berhasil langganan diaktifkan otomatis, jika tidak tetap menunggu admin.
 */
export async function verifyMyManualPayment(
	paymentId: string,
): Promise<ManualPaymentVerifyResult> {
	const response = await fetch(VERIFY_PATH, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(pb.authStore.isValid ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
		},
		body: JSON.stringify({ id: paymentId }),
	});

	if (!response.ok) {
		let message = 'Verifikasi otomatis gagal.';
		try {
			const data = (await response.json()) as { error?: string; message?: string };
			if (data.error ?? data.message) message = data.error ?? data.message!;
		} catch {
			// abaikan body yang tidak terurai
		}
		return { verified: false, status: 'menunggu_verifikasi', reason: message };
	}

	return (await response.json()) as ManualPaymentVerifyResult;
}

const paymentListeners = new Set<() => void>();
let paymentSubscribed = false;

/**
 * Mendengarkan perubahan pembayaran manual milik pengguna yang sedang masuk.
 * Dipakai agar kartu langganan dan halaman status memuat ulang begitu verifikasi
 * otomatis atau persetujuan Admin Pusat mengubah catatan.
 */
export function subscribeMyManualPayments(onChange: () => void): () => void {
	paymentListeners.add(onChange);
	if (!paymentSubscribed && pb.authStore.isValid) {
		paymentSubscribed = true;
		pb.collection('pencari_manual_payments')
			.subscribe('*', () => {
				paymentListeners.forEach(listener => listener());
			})
			.catch(() => {
				paymentSubscribed = false;
			});
	}
	return () => {
		paymentListeners.delete(onChange);
	};
}

/** Catatan pembayaran manual milik pengguna (pencari), terbaru di atas. */
export async function listMyManualPayments(seekerId: string): Promise<ManualPayment[]> {
	const records = await pb.collection('pencari_manual_payments').getFullList({
		filter: pb.filter('seeker = {:id}', { id: seekerId }),
		sort: '-created',
	});
	return records as unknown as ManualPayment[];
}

/**
 * URL bukti pembayaran untuk pemilik (memerlukan token file singkat yang
 * dihasilkan dari sesi pengguna). Berkas dilindungi, jadi URL kosong bila
 * tidak ada bukti.
 */
export async function manualPaymentProofUrl(payment: ManualPayment): Promise<string | null> {
	if (!payment.proof) return null;
	const token = await pb.files.getToken();
	return pb.files.getURL(
		{ id: payment.id, collectionId: 'pencari_manual_payments' } as RecordModel,
		payment.proof,
		{ token },
	);
}
