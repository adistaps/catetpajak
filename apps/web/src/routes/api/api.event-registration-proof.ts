import { withApi, apiError, json, readFormData } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

const MAX_PROOF_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
// Pendaftar hanya boleh mengirim/ulang bukti selama belum diverifikasi lunas.
const EDITABLE_STATUSES = new Set(['', 'menunggu_pembayaran', 'menunggu_verifikasi', 'ditolak']);

type Registration = { id: string; payment_status?: string; amount?: number };

/**
 * POST /api/event-registration-proof (multipart)
 * Menggantikan update langsung dari browser ke `event_registrations`.
 * Server menentukan sendiri `payment_status`; klien tidak bisa mengisi "lunas".
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const form = await readFormData(request);
	const registrationId = String(form.get('registrationId') ?? '').trim();
	if (!/^[a-z0-9]{15}$/.test(registrationId)) return apiError(400, 'ID pendaftaran tidak valid.');

	const bank = String(form.get('bank') ?? '').trim().slice(0, 60);
	const paymentDate = String(form.get('payment_date') ?? '').trim();
	const notes = String(form.get('verification_notes') ?? '').trim().slice(0, 500);
	const proof = form.get('proof');

	if (!bank) return apiError(422, 'Pilih bank tujuan transfer.');
	if (!/^\d{4}-\d{2}-\d{2}/.test(paymentDate)) return apiError(422, 'Tanggal pembayaran tidak valid.');
	if (!(proof instanceof File) || proof.size === 0) return apiError(422, 'Bukti pembayaran wajib diunggah.');
	if (proof.size > MAX_PROOF_SIZE) return apiError(422, 'Berkas bukti terlalu besar (maksimal 5 MB).');
	if (!ALLOWED_TYPES.has(proof.type)) return apiError(422, 'Format bukti harus JPG, PNG, WEBP, atau PDF.');

	const registration = await pocketbaseAdmin
		.getRecord<Registration>('event_registrations', registrationId)
		.catch(() => null);
	if (!registration) return apiError(404, 'Pendaftaran tidak ditemukan.');
	if (!EDITABLE_STATUSES.has(registration.payment_status ?? '')) {
		return apiError(409, 'Pendaftaran ini sudah diverifikasi.');
	}

	const expected = Number(form.get('expected_amount'));
	const pb = new FormData();
	if (Number.isFinite(expected) && expected >= 0) pb.append('expected_amount', String(expected));
	pb.append('expected_amount_formatted', String(form.get('expected_amount_formatted') ?? '').slice(0, 40));
	pb.append('bank', bank);
	pb.append('payment_date', paymentDate);
	pb.append('payment_status', 'menunggu_verifikasi');
	if (notes) pb.append('verification_notes', notes);
	pb.append('proof', proof, proof.name);

	await pocketbaseAdmin.updateRecord('event_registrations', registrationId, pb);
	return json({ ok: true });
});
