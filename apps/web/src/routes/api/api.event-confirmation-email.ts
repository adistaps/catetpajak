import { withApi, apiError, readJsonBody, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { getActiveBankAccounts } from '@/lib/bank-accounts.server';
import logger from '@/lib/logger.server';

type SendResult = {
	ok?: boolean;
	alreadySent?: boolean;
	to?: string;
	error?: string;
	via?: string;
	sender?: string;
};

type Body = {
	registrationId?: string;
	resend?: boolean;
};

/**
 * Mengirim email konfirmasi tagihan lewat hook `/send-document-email` dan
 * mengembalikan jalur pengiriman (SMTP vs relay) serta alamat pengirim, agar
 * halaman dapat membedakan "email diterima/terkirim" dari "pengiriman gagal"
 * dan memberi umpan balik yang jujur — bukan sekadar "berhasil".
 */
async function dispatchConfirmationEmail(
	toEmail: string,
	subject: string,
	html: string,
): Promise<{ via: string; sender: string }> {
	const result = await pocketbaseAdmin.send<SendResult>('/send-document-email', {
		method: 'POST',
		body: {
			to: toEmail,
			subject,
			html,
			fromName: 'Catet Pajak',
			fromEmail: '',
		},
	});

	if (!result.ok) {
		const reason = (result.error || 'Pengiriman email gagal.').trim();
		throw new Error(reason);
	}
	return { via: result.via || 'relay', sender: result.sender || '' };
}

type EventRegistration = {
	id: string;
	event_title?: string;
	name?: string;
	email?: string;
	quantity?: number;
	price_option?: string;
	amount?: number;
	amount_formatted?: string;
	payment_status?: string;
	confirmation_email_sent?: boolean;
};

/**
 * Sends the unpaid-invoice confirmation email for a paid event registration.
 *
 * Triggered right after a registrant clicks "Lanjutkan Pembayaran" and the
 * registration record is created with status `menunggu_pembayaran`. The email
 * carries the event name, order reference, amount due, manual transfer
 * instructions, and next steps for uploading payment proof.
 *
 * Payment status stays unpaid/pending — sending this email never marks the
 * registration as paid. Repeated clicks are idempotent: once the confirmation
 * email has been sent, subsequent requests return `alreadySent: true` without
 * sending again.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') throw apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const registrationId = body.registrationId?.trim();

	if (!registrationId) throw apiError(422, 'registrationId wajib diisi.');

	const registration = await pocketbaseAdmin.getRecord<EventRegistration>(
		'event_registrations',
		registrationId,
	);

	const toEmail = (registration.email || '').trim();
	if (!toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
		throw apiError(422, 'Email pendaftar tidak ditemukan atau tidak valid.');
	}

	// Idempotent guard: never send the confirmation email twice for the same
	// registration, even on repeated button clicks. A manual `resend` request
	// (from the "Kirim ulang" button) bypasses this guard so a registrant can
	// retry when the first email never arrived (e.g. landed in spam).
	const resend = body.resend === true;
	if (registration.confirmation_email_sent && !resend) {
		return json({ ok: true, alreadySent: true, to: toEmail });
	}

	// Only paid events awaiting payment should trigger this confirmation.
	const status = registration.payment_status;
	if (status && status !== 'menunggu_pembayaran') {
		return json({ ok: true, alreadySent: true, to: toEmail });
	}

	const banks = await getActiveBankAccounts().catch(() => []);
	const orderRef = registration.id.slice(0, 8).toUpperCase();
	const eventName = registration.event_title || 'Event Catet Pajak';
	const amountDue = registration.amount_formatted || 'Rp 0';
	const quantity = Number(registration.quantity) || 1;
	const priceOption = registration.price_option || '';
	const recipientName = registration.name || 'Peserta';

	const html = buildConfirmationHtml({
		recipientName,
		eventName,
		orderRef,
		amountDue,
		quantity,
		priceOption,
		banks,
	});

	try {
		const { via, sender } = await dispatchConfirmationEmail(
			toEmail,
			`Konfirmasi tagihan ${eventName} — ${orderRef}`,
			html,
		);

		// Mark as sent so repeated clicks do not duplicate the email.
		await pocketbaseAdmin.updateRecord('event_registrations', registration.id, {
			confirmation_email_sent: true,
			confirmation_email_sent_at: new Date().toISOString(),
		});

		return json({ ok: true, alreadySent: false, to: toEmail, via, sender });
	} catch (err) {
		const reason = (err as Error)?.message || 'Gagal mengirim email konfirmasi tagihan.';
		logger.error('event confirmation email failed', reason);
		// Kembalikan alasan asli (bukan pesan generik) agar pengguna tahu mengapa
		// email belum terkirim — mis. SMTP belum dikonfigurasi atau relay gagal.
		throw apiError(502, reason);
	}
});

function escapeHtml(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function buildConfirmationHtml(input: {
	recipientName: string;
	eventName: string;
	orderRef: string;
	amountDue: string;
	quantity: number;
	priceOption: string;
	banks: { bank_name: string; account_number: string; account_holder: string }[];
}): string {
	const bankRows = input.banks.length
		? input.banks
				.map(
					(b) => `
				<tr>
					<td style="padding:6px 0;font-size:14px;color:#222;">
						<strong>${escapeHtml(b.bank_name)}</strong><br/>
						<span style="font-size:15px;font-weight:700;">${escapeHtml(b.account_number)}</span><br/>
						<span style="color:#666;">a.n. ${escapeHtml(b.account_holder)}</span>
					</td>
				</tr>`,
				)
				.join('')
		: `<tr><td style="padding:6px 0;font-size:14px;color:#b45309;">Rekening tujuan belum tersedia. Hubungi admin Catet Pajak untuk informasi rekening.</td></tr>`;

	const priceLine = input.priceOption
		? `${escapeHtml(input.priceOption)} · ${input.quantity} orang`
		: `${input.quantity} orang`;

	return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Konfirmasi tagihan ${escapeHtml(input.eventName)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#222222;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td style="padding:28px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">
<tr><td style="font-size:15px;line-height:1.6;color:#222222;">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#059669;">Konfirmasi tagihan belum terbayar</p>
<h1 style="font-size:22px;margin:0 0 14px;color:#0f2744;">${escapeHtml(input.eventName)}</h1>
<p style="margin:0 0 16px;">Yth. ${escapeHtml(input.recipientName)},</p>
<p style="margin:0 0 16px;">Pendaftaran Anda telah kami terima. <strong>Tagihan belum terbayar.</strong> Selesaikan pembayaran agar pendaftaran dapat diverifikasi dan dikonfirmasi.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin:0 0 18px;">
<tr><td style="padding:12px 14px;border-bottom:1px solid #f1f5f4;">
	<span style="font-size:12px;color:#64748b;">Acara</span><br/>
	<span style="font-size:15px;font-weight:700;color:#0f2744;">${escapeHtml(input.eventName)}</span>
</td></tr>
<tr><td style="padding:12px 14px;border-bottom:1px solid #f1f5f4;">
	<span style="font-size:12px;color:#64748b;">Referensi pendaftaran</span><br/>
	<span style="font-size:15px;font-weight:700;color:#0f2744;">${escapeHtml(input.orderRef)}</span>
</td></tr>
<tr><td style="padding:12px 14px;border-bottom:1px solid #f1f5f4;">
	<span style="font-size:12px;color:#64748b;">Rincian</span><br/>
	<span style="font-size:15px;font-weight:600;color:#222;">${priceLine}</span>
</td></tr>
<tr><td style="padding:12px 14px;">
	<span style="font-size:12px;color:#64748b;">Jumlah tagihan</span><br/>
	<span style="font-size:20px;font-weight:800;color:#0f7050;">${escapeHtml(input.amountDue)}</span>
</td></tr>
</table>

<p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f2744;">Instruksi transfer manual</p>
<p style="margin:0 0 10px;font-size:14px;color:#222;">Transfer ke salah satu rekening berikut. Pada halaman pembayaran Anda akan melihat <strong>nominal unik tiga digit</strong> yang ditambahkan ke jumlah tagihan — transfer dengan nominal sama persis agar verifikasi otomatis.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
${bankRows}
</table>

<p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f2744;">Langkah berikutnya</p>
<ol style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.7;color:#222;">
	<li>Kembali ke halaman pembayaran event Anda.</li>
	<li>Transfer sesuai nominal unik yang ditampilkan ke rekening di atas.</li>
	<li>Unggah bukti transfer pada formulir pembayaran.</li>
	<li>Tunggu verifikasi admin, biasanya dalam 1×24 jam.</li>
</ol>

<p style="margin:0 0 6px;font-size:14px;color:#222;">Email ini adalah konfirmasi tagihan, bukan bukti pembayaran. Pendaftaran berstatus <strong>menunggu pembayaran</strong> hingga bukti transfer Anda diverifikasi.</p>
<p style="margin:18px 0 4px;font-size:14px;color:#666;">— Tim Catet Pajak</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
