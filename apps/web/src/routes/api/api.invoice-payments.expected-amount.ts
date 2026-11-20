import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import { requireParentId } from '@/lib/parent-auth.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { formatRupiah } from '@/lib/accounting';
import logger from '@/lib/logger.server';

const MAX_ATTEMPTS = 60;

type InvoiceRecord = {
	id: string;
	company: string;
	student: string;
	stage: string;
	direction: string;
	status: string;
	expand?: { student?: { parent?: string } };
};

type ExistingPayment = {
	expected_amount?: number;
	status: string;
};

/**
 * POST /api/invoice-payments/expected-amount
 *
 * Menghasilkan nominal unik untuk pembayaran manual invoice: jumlah yang
 * harus dibayar (dikirim klien) + tiga digit acak (cth. 500000 + 145 = 500145).
 * Nominal dijamin tidak bentrok dengan pembayaran lain yang masih aktif atau
 * menunggu verifikasi pada koleksi `parent_invoice_payments` maupun
 * `invoice_payments`, sehingga verifikasi otomatis dapat memakainya sebagai
 * acuan tunggal. Berupa action (POST) agar respons per-pengguna tidak di-cache
 * edge.
 *
 * Menerima otentikasi Parent (koleksi `parents`) maupun pengguna aplikasi
 * (koleksi `users`). Akses invoice divalidasi sesuai jenis pemanggil: Parent
 * harus memiliki siswa terkait pada invoice; pengguna aplikasi harus menjadi
 * anggota aktif perusahaan pemilik invoice.
 */
export const action = withApi(async ({ request }) => {
	// Tentukan jenis pemanggil: coba Parent lebih dulu, lalu pengguna aplikasi.
	let callerId: string;
	let callerType: 'parent' | 'user';
	try {
		callerId = await requireParentId(request);
		callerType = 'parent';
	} catch (err) {
		if (err instanceof Response && err.status === 401) {
			callerId = await requireUserId(request);
			callerType = 'user';
		} else {
			throw err;
		}
	}

	const body = await readJsonBody<{ invoiceId?: string; baseAmount?: number }>(request);
	const invoiceId = (body.invoiceId ?? '').trim();
	const baseAmount = Math.round(Number(body.baseAmount) || 0);

	if (!invoiceId) throw apiError(422, 'ID invoice wajib diisi.');
	if (baseAmount <= 0) throw apiError(422, 'Nominal dasar pembayaran tidak valid.');

	const invoice = await pocketbaseAdmin
		.getRecord<InvoiceRecord>('documents', invoiceId, { expand: 'student' })
		.catch(() => null);
	if (!invoice) throw apiError(404, 'Invoice tidak ditemukan.');
	if (invoice.stage !== 'invoice' || invoice.direction !== 'penjualan') {
		throw apiError(422, 'Dokumen ini bukan invoice penjualan.');
	}
	if (invoice.status === 'cancelled') {
		throw apiError(422, 'Invoice telah dibatalkan.');
	}

	// Validasi akses sesuai jenis pemanggil.
	if (callerType === 'parent') {
		const studentParent = invoice.expand?.student?.parent;
		if (!invoice.student || studentParent !== callerId) {
			throw apiError(403, 'Anda tidak memiliki akses ke invoice ini.');
		}
	} else {
		const company = await pocketbaseAdmin
			.getRecord<{ id: string; owner: string }>('companies', invoice.company)
			.catch(() => null);
		if (!company) throw apiError(404, 'Perusahaan tidak ditemukan.');
		if (company.owner !== callerId) {
			const members = await pocketbaseAdmin.listRecords<{
				status: string;
			}>('company_members', {
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter('company = {:company} && user = {:callerId} && status = "active"', { company: invoice.company, callerId }),
			});
			if (members.items.length === 0) {
				throw apiError(403, 'Anda tidak memiliki akses ke invoice ini.');
			}
		}
	}

	let expectedAmount = 0;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		// Tiga digit acak 1..999 ditambahkan ke nominal dasar.
		const suffix = Math.floor(Math.random() * 999) + 1;
		const candidate = baseAmount + suffix;

		// Cek bentrok pada kedua koleksi pembayaran manual invoice.
		const [parentExisting, companyExisting] = await Promise.all([
			pocketbaseAdmin.listRecords<ExistingPayment>('parent_invoice_payments', {
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter("expected_amount = {:candidate} && (status = 'menunggu_verifikasi' || status = 'aktif')", { candidate }),
			}),
			pocketbaseAdmin.listRecords<ExistingPayment>('invoice_payments', {
				page: 1,
				perPage: 1,
				filter: pocketbaseAdmin.filter("expected_amount = {:candidate} && (status = 'menunggu_verifikasi' || status = 'aktif')", { candidate }),
			}),
		]);

		if (parentExisting.items.length === 0 && companyExisting.items.length === 0) {
			expectedAmount = candidate;
			break;
		}
	}

	if (expectedAmount === 0) {
		throw apiError(409, 'Tidak dapat menemukan nominal unik yang tersedia. Coba lagi sebentar.');
	}

	logger.info(
		{ invoiceId, baseAmount, expectedAmount, callerType },
		'invoice payment expected amount generated',
	);

	return json({
		expected_amount: expectedAmount,
		expected_amount_formatted: formatRupiah(expectedAmount),
	});
});
