import type { Route } from './+types/bayar.pdf';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { formatDate, formatRupiah } from '@/lib/accounting';
import { verifyInvoicePayToken } from '@/lib/invoice-pay-link.server';
import { buildSimplePdf } from '@/lib/simple-pdf.server';
import type { BusinessDocument } from '@/lib/documents';

export async function loader({ params }: Route.LoaderArgs) {
	const invoiceId = verifyInvoicePayToken(params.token ?? '');
	if (!invoiceId) throw new Response('Tautan tidak valid', { status: 404 });
	const doc = await pocketbaseAdmin
		.getRecord<BusinessDocument>('documents', invoiceId, { expand: 'contact' })
		.catch(() => null);
	if (!doc) throw new Response('Invoice tidak ditemukan', { status: 404 });
	const company = await pocketbaseAdmin
		.getRecord<{ name: string; address?: string; bank_name?: string; account_number?: string; account_holder?: string }>(
			'companies',
			doc.company,
		)
		.catch(() => null);
	const docNo = doc.number || doc.id.slice(0, 8).toUpperCase();
	const party = doc.expand?.contact?.name || doc.partner || 'Pelanggan';
	const pdf = buildSimplePdf([
		company?.name || 'Perusahaan',
		company?.address || '',
		'',
		`INVOICE ${docNo}`,
		`Tanggal: ${formatDate(doc.date)}`,
		`Kepada: ${party}`,
		`Jumlah: ${formatRupiah(Number(doc.total) || 0)}`,
		doc.description ? `Keterangan: ${doc.description}` : '',
		'',
		...(doc.items || []).map(
			(item, index) =>
				`${index + 1}. ${item.name || '-'} x${item.quantity || 0}  ${formatRupiah(item.total || 0)}`,
		),
		'',
		`Total: ${formatRupiah(Number(doc.total) || 0)}`,
		company?.bank_name
			? `Bank: ${company.bank_name} ${company.account_number || ''} a.n. ${company.account_holder || company.name}`
			: '',
		'Lampiran ini bukan bukti pelunasan.',
	]);
	const filename = `${docNo.replace(/[^\w.-]+/g, '_')}.pdf`;
	return new Response(Buffer.from(pdf), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
}
