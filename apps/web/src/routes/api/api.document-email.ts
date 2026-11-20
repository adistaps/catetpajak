import { withApi, apiError, readJsonBody, json } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { documentEmailSubject, type BusinessDocument, type DocumentDirection } from '@/lib/documents';
import { formatDate, formatRupiah, type Company } from '@/lib/accounting';
import { siteOrigin } from '@/lib/site-origin.server';
import { signInvoicePayToken } from '@/lib/invoice-pay-link.server';
import { buildSimplePdf } from '@/lib/simple-pdf.server';
import { getActiveBankAccounts } from '@/lib/bank-accounts.server';

type Body = {
	docId?: string;
	toEmail?: string;
	actorUserId?: string;
	note?: string;
};

type CompanyMail = Company & {
	bank_name?: string;
	account_holder?: string;
	account_number?: string;
	address?: string;
	phone?: string;
	email?: string;
};

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') throw apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const docId = body.docId?.trim();
	const toEmail = body.toEmail?.trim();
	const actorUserId = body.actorUserId?.trim();
	const note = (body.note ?? '').toString().trim();

	if (!docId) throw apiError(422, 'docId wajib diisi.');
	if (!toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
		throw apiError(422, 'Alamat email penerima tidak valid.');
	}
	if (!actorUserId) throw apiError(422, 'Sesi login tidak ditemukan. Silakan login ulang.');

	const doc = await pocketbaseAdmin.getRecord<BusinessDocument>('documents', docId, {
		expand: 'contact',
	});
	const company = await pocketbaseAdmin.getRecord<CompanyMail>('companies', doc.company);

	if (doc.owner !== actorUserId && company.owner !== actorUserId) {
		throw apiError(403, 'Anda tidak berwenang mengirim dokumen ini.');
	}

	const direction = doc.direction as DocumentDirection;
	const subject = documentEmailSubject(doc, direction);
	const origin = siteOrigin(request);
	const token = signInvoicePayToken(doc.id);
	const payUrl = `${origin}/bayar/${token}`;
	const pdfUrl = `${origin}/bayar/${token}/pdf`;
	const docNo = doc.number || doc.id.slice(0, 8).toUpperCase();
	const amount = formatRupiah(Number(doc.total) || 0);
	const party = doc.expand?.contact?.name || doc.partner || 'Pelanggan';
	const isInvoice = doc.stage === 'invoice' && direction === 'penjualan' && doc.status !== 'cancelled';
	const alreadyPaid = (Number(doc.paid_amount) || 0) >= (Number(doc.total) || 0) && (Number(doc.total) || 0) > 0;

	const banks = await getActiveBankAccounts().catch(() => []);
	const bankName = company.bank_name || banks[0]?.bank_name || '';
	const bankNumber = company.account_number || banks[0]?.account_number || '';
	const bankHolder = company.account_holder || banks[0]?.account_holder || company.name;
	const fromEmail = (company.email || '').trim();

	const pdf = buildSimplePdf([
		company.name || 'Perusahaan',
		company.address || '',
		'',
		`INVOICE ${docNo}`,
		`Tanggal: ${formatDate(doc.date)}`,
		`Kepada: ${party}`,
		`Jumlah: ${amount}`,
		doc.description ? `Keterangan: ${doc.description}` : '',
		'',
		...(doc.items || []).map(
			(item, index) =>
				`${index + 1}. ${item.name || '-'} x${item.quantity || 0}  ${formatRupiah(item.total || 0)}`,
		),
		'',
		`Total: ${amount}`,
		bankName ? `Bank: ${bankName} ${bankNumber} a.n. ${bankHolder}` : '',
		'Lampiran ini bukan bukti pelunasan.',
	].filter(line => line !== undefined));

	const html = buildLetterHtml({
		party,
		companyName: company.name || 'Perusahaan',
		address: company.address || '',
		docNo,
		amount,
		note,
		isInvoice,
		alreadyPaid,
		payUrl,
		pdfUrl,
		pdfName: `${docNo.replace(/[^\w.-]+/g, '_')}.pdf`,
		bankName,
		bankNumber,
		bankHolder,
		contactEmail: doc.expand?.contact?.email || '',
		companyPhone: company.phone || '',
	});

	await pocketbaseAdmin.send<{ ok?: boolean; error?: string }>('/send-document-email', {
		method: 'POST',
		body: {
			to: toEmail,
			subject,
			html,
			fromName: company.name || 'Catet Pajak',
			fromEmail,
			pdfBase64: Buffer.from(pdf).toString('base64'),
			pdfName: `${docNo.replace(/[^\w.-]+/g, '_')}.pdf`,
		},
	});

	return json({ ok: true, to: toEmail, subject });
});

function buildLetterHtml(input: {
	party: string;
	companyName: string;
	address: string;
	docNo: string;
	amount: string;
	note: string;
	isInvoice: boolean;
	alreadyPaid: boolean;
	payUrl: string;
	pdfUrl: string;
	pdfName: string;
	bankName: string;
	bankNumber: string;
	bankHolder: string;
	contactEmail: string;
	companyPhone: string;
}): string {
	const payBlock =
		input.isInvoice && !input.alreadyPaid
			? `<p style="margin:22px 0 8px;">
				<a href="${escapeHtml(input.payUrl)}" style="display:inline-block;background:#0f7050;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;line-height:1;padding:14px 22px;border-radius:6px;">Pembayaran Manual</a>
			</p>
			<p style="margin:0 0 16px;font-size:12px;color:#5b6b66;">Tombol di atas membuka halaman pembayaran invoice ini. Anda dapat melihat rekening tujuan dan mengunggah bukti transfer. Membuka tautan tidak menandai invoice sebagai lunas.</p>`
			: input.isInvoice
				? `<p style="margin:18px 0;font-size:14px;color:#0f7050;font-weight:700;">Invoice ini sudah tercatat lunas. Tidak perlu melakukan pembayaran lagi.</p>`
				: '';

	const bankBlock =
		input.bankName && input.bankNumber
			? `<p style="margin:0 0 14px;font-size:14px;color:#222;">Rekening tujuan: <strong>${escapeHtml(input.bankName)}</strong> ${escapeHtml(input.bankNumber)} a.n. ${escapeHtml(input.bankHolder)}.</p>`
			: '';

	const noteBlock = input.note
		? `<p style="margin:0 0 16px;font-size:14px;color:#222;">${escapeHtml(input.note)}</p>`
		: '';

	return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.docNo)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#222222;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td style="padding:28px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">
<tr><td style="font-size:15px;line-height:1.55;color:#222222;">
<p style="margin:0 0 16px;">Yth. ${escapeHtml(input.party)},</p>
${noteBlock}
<p style="margin:0 0 16px;">Berikut invoice <strong>${escapeHtml(input.docNo)}</strong> sebesar <strong>${escapeHtml(input.amount)}</strong> dari ${escapeHtml(input.companyName)}. Mohon lakukan pembayaran pada kesempatan pertama.</p>
<p style="margin:0 0 16px;">Gunakan referensi berikut untuk pembayaran Anda: <strong>${escapeHtml(input.docNo)}</strong>.</p>
${bankBlock}
<p style="margin:0 0 16px;">Jangan ragu menghubungi kami jika ada pertanyaan.</p>
${payBlock}
<p style="margin:18px 0 4px;">--</p>
<p style="margin:0 0 18px;">${escapeHtml(input.companyName)}</p>
<hr style="border:none;border-top:1px solid #cfcfcf;margin:0 0 14px;" />
<p style="margin:0 0 4px;font-size:14px;font-weight:700;">${escapeHtml(input.companyName)}</p>
<p style="margin:0;font-size:13px;color:#444;">${escapeHtml([input.address, input.companyPhone, input.contactEmail].filter(Boolean).join(' | ') || input.companyName)}</p>
<p style="margin:14px 0 0;font-size:13px;color:#666;">Dikirim melalui Catet Pajak</p>
</td></tr>
<tr><td style="padding-top:22px;">
<p style="margin:0 0 10px;font-size:14px;font-weight:700;border-top:1px dotted #ccc;padding-top:14px;">1 lampiran</p>
<a href="${escapeHtml(input.pdfUrl)}" style="text-decoration:none;color:#222;">
<table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:4px;">
<tr>
<td style="background:#e11d2e;color:#fff;font-size:11px;font-weight:800;padding:14px 10px;">PDF</td>
<td style="padding:10px 14px;font-size:13px;font-weight:700;">${escapeHtml(input.pdfName)}</td>
</tr>
</table>
</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
