import type { Company } from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import type { Product } from '@/lib/products';
import { formatRupiah, formatDate } from '@/lib/accounting';
import { printDocument, escapeHtml } from '@/lib/pdf-print';
import { companyLogoUrl } from '@/lib/company-logo';

export type DocumentDirection = 'penjualan' | 'pembelian';

export type DocumentStage =
	| 'penawaran'
	| 'pemesanan'
	| 'invoice'
	| 'pengiriman'
	| 'pembayaran';

export interface DocumentItem {
	product: string;
	name: string;
	code: string;
	quantity: number;
	unitPrice: number;
	discount: number;
	taxRate: number;
	total: number;
}

export interface BusinessDocument {
	id: string;
	company: string;
	direction: DocumentDirection;
	stage: DocumentStage;
	number: string;
	date: string;
	contact: string;
	partner: string;
	description: string;
	items: DocumentItem[];
	subtotal: number;
	discount_total: number;
	tax_total: number;
	total: number;
	/** Uang muka pada penawaran. Tidak mengubah total item; sisa = total − uang muka. */
	down_payment?: number;
	/** Akun pemetaan untuk mencatat uang muka (mis. Uang Muka Penjualan / Kas). */
	down_payment_account?: string;
	/** Akun utang pajak untuk pemotongan pembelian (mis. Utang PPh 21/23). */
	withholding_account?: string;
	/** Nilai pemotongan: persen atau nominal, sesuai withholding_mode. */
	withholding_value?: number;
	withholding_mode?: 'percent' | 'amount';
	/** Pesan pada penawaran (tampil di dokumen). */
	message?: string;
	/** Memo internal pada penawaran. */
	memo?: string;
	attachments?: string[];
	/** Diskon header (bukan diskon per baris): persen atau nominal. */
	header_discount_value?: number;
	header_discount_mode?: 'percent' | 'amount';
	/** Ongkos kirim pada invoice penjualan. Ditambahkan ke total. */
	shipping_cost?: number;
	paid_amount: number;
	debit_account: string;
	credit_account: string;
	transaction: string;
	source_document: string;
	student?: string;
	/** Syarat pembayaran, mis. "2/3 N/30" (diskon 2% dalam 3 hari, tempo 30 hari). */
	payment_terms?: string;
	/** Tanggal jatuh tempo pada penawaran. */
	due_date?: string;
	status: 'draft' | 'confirmed' | 'cancelled' | 'sudah_dikirim';
	/** Penanda stok produk sudah disesuaikan untuk invoice pembelian (idempotensi). */
	stock_applied?: boolean;
	owner: string;
	created: string;
	updated: string;
	warehouse?: string;
	table?: string;
	expand?: {
		contact?: Contact;
		debit_account?: { id: string; code: string; name: string };
		credit_account?: { id: string; code: string; name: string };
		source_document?: BusinessDocument;
		student?: { id: string; student_name: string; parent?: string };
		warehouse?: { id: string; name: string };
	};
}

export interface StageConfig {
	key: DocumentStage;
	label: string;
	singular: string;
	description: string;
	numberPrefix: string;
	/** Tahap berikutnya yang tersedia dari tahap ini. */
	next: DocumentStage[];
	/** Apakah tahap ini memerlukan akun debit/kredit untuk posting jurnal. */
	postsJournal: boolean;
	/** Apakah tahap ini mencatat penerimaan/pembayaran kas. */
	isPayment: boolean;
}

export const STAGE_ORDER: DocumentStage[] = [
	'penawaran',
	'pemesanan',
	'invoice',
	'pembayaran',
];

export const STAGE_CONFIG: Record<DocumentStage, StageConfig> = {
	penawaran: {
		key: 'penawaran',
		label: 'Penawaran',
		singular: 'Penawaran',
		description: 'Surat penawaran harga kepada pelanggan / pemasok.',
		numberPrefix: 'QT',
		next: ['pemesanan'],
		postsJournal: false,
		isPayment: false,
	},
	pemesanan: {
		key: 'pemesanan',
		label: 'Pemesanan',
		singular: 'Pemesanan',
		description: 'Catatan pesanan (Sales Order / Purchase Order).',
		numberPrefix: 'SO',
		next: ['invoice'],
		postsJournal: false,
		isPayment: false,
	},
	invoice: {
		key: 'invoice',
		label: 'Invoice',
		singular: 'Invoice',
		description: 'Faktur yang diposting ke jurnal keuangan.',
		numberPrefix: 'INV',
		next: ['pembayaran'],
		postsJournal: true,
		isPayment: false,
	},
	pengiriman: {
		key: 'pengiriman',
		label: 'Pengiriman',
		singular: 'Pengiriman',
		description: 'Surat Jalan / Bukti Pengiriman barang.',
		numberPrefix: 'DO',
		next: [],
		postsJournal: false,
		isPayment: false,
	},
	pembayaran: {
		key: 'pembayaran',
		label: 'Pembayaran',
		singular: 'Pembayaran',
		description: 'Penerimaan / Pembayaran kas yang diposting ke jurnal.',
		numberPrefix: 'PAY',
		next: [],
		postsJournal: true,
		isPayment: true,
	},
};

export interface DirectionConfig {
	key: DocumentDirection;
	title: string;
	subtitle: string;
	contactType: 'customer' | 'supplier';
	partyLabel: string;
	/** Akun debit default untuk invoice (tipe akun). */
	invoiceDebitPref: string;
	invoiceCreditPref: string;
	paymentDebitPref: string;
	paymentCreditPref: string;
}

export const DIRECTION_CONFIG: Record<DocumentDirection, DirectionConfig> = {
	penjualan: {
		key: 'penjualan',
		title: 'Penjualan',
		subtitle: 'Kelola penawaran, pesanan, invoice & penerimaan pembayaran.',
		contactType: 'customer',
		partyLabel: 'Pelanggan',
		invoiceDebitPref: 'aset',
		invoiceCreditPref: 'pendapatan',
		paymentDebitPref: 'aset',
		paymentCreditPref: 'aset',
	},
	pembelian: {
		key: 'pembelian',
		title: 'Pembelian',
		subtitle: 'Kelola penawaran, pesanan, invoice, penerimaan barang & pembayaran ke pemasok.',
		contactType: 'supplier',
		partyLabel: 'Pemasok',
		invoiceDebitPref: 'aset',
		invoiceCreditPref: 'liabilitas',
		paymentDebitPref: 'liabilitas',
		paymentCreditPref: 'aset',
	},
};

/** Membuat nomor dokumen: PREFIX-YYYY-### berdasarkan jumlah record sebelumnya. */
export function buildDocumentNumber(prefix: string, count: number): string {
	const year = new Date().getFullYear();
	const seq = String(count + 1).padStart(3, '0');
	return `${prefix}-${year}-${seq}`;
}

/** Menghitung total baris setelah diskon + pajak. */
export function computeItemTotal(item: {
	quantity: number;
	unitPrice: number;
	discount: number;
	taxRate: number;
}): number {
	const subtotal = (item.quantity || 0) * (item.unitPrice || 0);
	const afterDiscount = Math.max(0, subtotal - (item.discount || 0));
	const tax = Math.round((afterDiscount * (item.taxRate || 0)) / 100);
	return afterDiscount + tax;
}

export interface DocumentTotals {
	subtotal: number;
	discountTotal: number;
	taxTotal: number;
	total: number;
}

export function computeDocumentTotals(items: DocumentItem[]): DocumentTotals {
	let subtotal = 0;
	let discountTotal = 0;
	let taxTotal = 0;
	for (const item of items) {
		const lineSubtotal = (item.quantity || 0) * (item.unitPrice || 0);
		const discount = item.discount || 0;
		const afterDiscount = Math.max(0, lineSubtotal - discount);
		const tax = Math.round((afterDiscount * (item.taxRate || 0)) / 100);
		subtotal += lineSubtotal;
		discountTotal += discount;
		taxTotal += tax;
	}
	return {
		subtotal,
		discountTotal,
		taxTotal,
		total: subtotal - discountTotal + taxTotal,
	};
}

const STAGE_DOC_TITLE: Record<DocumentStage, string> = {
	penawaran: 'PENAWARAN',
	pemesanan: 'PEMESANAN',
	invoice: 'FAKTUR',
	pengiriman: 'SURAT JALAN',
	pembayaran: 'BUKTI PEMBAYARAN',
};

const STAGE_DOC_LABEL: Record<DocumentStage, string> = {
	penawaran: 'PENAWARAN #',
	pemesanan: 'PEMESANAN #',
	invoice: 'FAKTUR #',
	pengiriman: 'SURAT JALAN #',
	pembayaran: 'PEMBAYARAN #',
};

/** Format angka Indonesia: 1.500.000,00 */
function formatIdNumber(value: number): string {
	const n = Number(value) || 0;
	const fixed = n.toFixed(2);
	const [intPart, decPart] = fixed.split('.');
	const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${withDots},${decPart}`;
}

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];

function terbilangBelowThousand(n: number): string {
	if (n === 0) return '';
	if (n < 10) return SATUAN[n];
	if (n === 10) return 'sepuluh';
	if (n === 11) return 'sebelas';
	if (n < 20) return `${SATUAN[n - 10]} belas`;
	if (n < 100) {
		const puluh = Math.floor(n / 10);
		const sisa = n % 10;
		return `${SATUAN[puluh]} puluh${sisa ? ` ${SATUAN[sisa]}` : ''}`;
	}
	const ratus = Math.floor(n / 100);
	const sisa = n % 100;
	const head = ratus === 1 ? 'seratus' : `${SATUAN[ratus]} ratus`;
	return sisa ? `${head} ${terbilangBelowThousand(sisa)}` : head;
}

/** Konversi angka ke terbilang Bahasa Indonesia (untuk rupiah). */
export function terbilangRupiah(value: number): string {
	const n = Math.floor(Math.abs(Number(value) || 0));
	if (n === 0) return 'NOL RUPIAH';

	const scales = [
		{ v: 1_000_000_000_000, name: 'triliun' },
		{ v: 1_000_000_000, name: 'miliar' },
		{ v: 1_000_000, name: 'juta' },
		{ v: 1_000, name: 'ribu' },
	];

	let remaining = n;
	const parts: string[] = [];
	for (const scale of scales) {
		if (remaining >= scale.v) {
			const chunk = Math.floor(remaining / scale.v);
			remaining %= scale.v;
			if (scale.v === 1_000 && chunk === 1) {
				parts.push('seribu');
			} else {
				parts.push(`${terbilangBelowThousand(chunk)} ${scale.name}`);
			}
		}
	}
	if (remaining > 0) parts.push(terbilangBelowThousand(remaining));
	return `${parts.join(' ').toUpperCase()} RUPIAH`;
}

function kvRow(label: string, value: string): string {
	return `<tr>
		<td class="kv-label">${escapeHtml(label)}</td>
		<td class="kv-sep">:</td>
		<td class="kv-value">${value || '—'}</td>
	</tr>`;
}

/** Membangun HTML isi dokumen bisnis (untuk cetak PDF / kirim email) — template faktur klasik. */
export function buildBusinessDocumentHtml(
	doc: BusinessDocument,
	company: Company,
	direction: DocumentDirection,
): string {
	const stage = STAGE_CONFIG[doc.stage];
	const dir = DIRECTION_CONFIG[direction];
	const contact = doc.expand?.contact;
	const partyName = contact?.name || doc.partner || '—';
	const docNo = doc.number || `${stage.numberPrefix}-${doc.id.slice(0, 8).toUpperCase()}`;
	const paid = Number(doc.paid_amount) || 0;
	const total = Number(doc.total) || 0;
	const balance = Math.max(0, total - paid);

	// Logo perusahaan: URL dari PocketBase bersifat relatif, sedangkan jendela
	// cetak dibuka pada about:blank. Jadikan absolut agar gambar termuat.
	const logoUrl = companyLogoUrl(company);
	const logoSrc =
		logoUrl && typeof window !== 'undefined' && logoUrl.startsWith('/')
			? `${window.location.origin}${logoUrl}`
			: logoUrl;
	const logoImg = logoSrc
		? `<img src="${escapeHtml(logoSrc)}" alt="Logo" style="height:52px;width:auto;max-width:130px;object-fit:contain;" />`
		: '';

	const itemsRows = (doc.items || [])
		.map((item, idx) => {
			const lineSub = (item.quantity || 0) * (item.unitPrice || 0);
			const discPct =
				lineSub > 0 && item.discount
					? `${Math.round(((item.discount || 0) / lineSub) * 100)}%`
					: item.discount
						? formatIdNumber(item.discount)
						: '';
			const taxMark = item.taxRate ? `${item.taxRate}%` : '';
			const desc = item.code
				? `${escapeHtml(item.code)} ${escapeHtml(item.name || '')}`.trim()
				: escapeHtml(item.name || '—');
			return `<tr>
				<td class="c-no">${idx + 1}</td>
				<td class="c-ket">${desc}</td>
				<td class="c-qty">${item.quantity || 0} Pcs</td>
				<td class="c-num">${formatIdNumber(item.unitPrice || 0)}</td>
				<td class="c-num">${discPct}</td>
				<td class="c-center">${taxMark}</td>
				<td class="c-num">${formatIdNumber(item.total || 0)}</td>
			</tr>`;
		})
		.join('');

	const taxLabel =
		(doc.items || []).some((i) => i.taxRate === 11)
			? 'PPN 11%'
			: (doc.items || []).some((i) => i.taxRate === 10)
				? 'PPN 10%'
				: 'Pajak';

	const body = `
<style>
	.inv-wrap { color: #111; font-size: 12px; line-height: 1.45; }
	.inv-wrap table { border-collapse: collapse; }
	.inv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
	.inv-brand { font-size: 22px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; margin: 0 0 6px; }
	.inv-meta { font-size: 12px; color: #222; }
	.inv-meta-table td { padding: 1px 0; vertical-align: top; }
	.inv-meta-table .ml { padding-right: 10px; white-space: nowrap; font-weight: 600; }
	.inv-meta-table .ms { padding: 0 8px; }
	.inv-rule { border: none; border-top: 1px solid #222; margin: 18px 0 16px; }
	.inv-rule-short { width: 42%; margin-left: auto; border-top: 1px solid #222; }
	.inv-section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 6px; }
	.inv-party { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14px; margin-bottom: 16px; }
	.inv-box { border: none; padding: 10px 12px; }
	.kv-label { width: 140px; white-space: nowrap; vertical-align: top; padding: 2px 0; font-size: 11.5px; }
	.kv-sep { width: 14px; vertical-align: top; padding: 2px 4px; }
	.kv-value { vertical-align: top; padding: 2px 0; font-size: 11.5px; }
	.inv-items { width: 100%; border: 1.5px solid #222; margin-bottom: 0; }
	.inv-items th {
		border: 1px solid #222; background: #f7f7f7; font-size: 11px; font-weight: 700;
		text-transform: uppercase; letter-spacing: 0.03em; padding: 8px 6px; text-align: center; color: #111;
	}
	.inv-items td { border: 1px solid #222; padding: 8px 6px; vertical-align: top; font-size: 11.5px; }
	.inv-items .c-no { width: 36px; text-align: center; }
	.inv-items .c-ket { text-align: left; }
	.inv-items .c-qty { width: 70px; text-align: center; white-space: nowrap; }
	.inv-items .c-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
	.inv-items .c-center { text-align: center; white-space: nowrap; }
	.inv-bottom { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 18px; margin-top: 0; align-items: start; }
	.inv-totals { width: 100%; margin-top: 0; }
	.inv-totals td { padding: 4px 8px; font-size: 12px; }
	.inv-totals .t-label { text-align: left; }
	.inv-totals .t-val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; min-width: 120px; }
	.inv-totals .t-total td { font-weight: 800; border-top: 1.5px solid #222; border-bottom: 1.5px solid #222; padding-top: 6px; padding-bottom: 6px; }
	.inv-totals .t-balance td { font-weight: 600; }
	.inv-pesan { border: 1.5px solid #222; padding: 8px 12px; margin-top: 14px; min-height: 52px; }
	.inv-pesan-title { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 4px; }
	.inv-pay { border: 1.5px solid #222; padding: 8px 12px; margin-top: 14px; }
	.inv-pay-title { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; margin: 0 0 6px; text-transform: uppercase; }
	.inv-terbilang { border: 1.5px solid #222; padding: 8px 12px; margin-top: 14px; }
	.inv-terbilang-title { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 4px; text-transform: uppercase; }
	.inv-terbilang-text { font-size: 11.5px; font-weight: 700; text-transform: uppercase; line-height: 1.4; }
	.inv-sign { text-align: right; margin-top: 28px; padding-right: 8px; }
	.inv-sign-line { border-top: 1px solid #222; width: 200px; margin: 56px 0 6px auto; }
	.inv-sign-name { font-weight: 700; font-size: 12px; }
	.inv-sign-role { font-size: 11px; color: #333; }
	@media print {
		.inv-wrap { font-size: 11px; }
	}
</style>
<div class="inv-wrap">
	<div class="inv-head">
		<div style="display:flex;align-items:center;gap:12px;">
			${logoImg}
			<div>
				<h1 class="inv-brand" style="margin:0 0 6px;">${escapeHtml(company.name || 'PERUSAHAAN')}</h1>
				${company.address ? `<p class="inv-meta">${escapeHtml(company.address)}</p>` : ''}
				${company.phone ? `<p class="inv-meta">Telp: ${escapeHtml(company.phone)}</p>` : ''}
				${company.email ? `<p class="inv-meta">Email: ${escapeHtml(company.email)}</p>` : ''}
				${company.code ? `<p class="inv-meta">Kode: ${escapeHtml(company.code)}</p>` : ''}
			</div>
		</div>
		<div class="inv-meta" style="min-width:240px;">
			<table class="inv-meta-table">
				<tr>
					<td class="ml">${escapeHtml(STAGE_DOC_LABEL[doc.stage])}</td>
					<td class="ms">:</td>
					<td>${escapeHtml(docNo)}</td>
				</tr>
				<tr>
					<td class="ml">TANGGAL</td>
					<td class="ms">:</td>
					<td>${escapeHtml(formatDate(doc.date))}</td>
				</tr>
			</table>
		</div>
	</div>

	<hr class="inv-rule" />
	<div style="display:flex;justify-content:flex-end;margin-top:-16px;margin-bottom:12px;">
		<hr class="inv-rule" style="width:38%;margin:0;" />
	</div>

	<p class="inv-section-label">${escapeHtml(dir.partyLabel.toUpperCase())}</p>
	<div class="inv-party">
		<div class="inv-box">
			<table style="width:100%;">
				${kvRow('NAMA', escapeHtml(partyName))}
				${kvRow('NAMA PERUSAHAAN', escapeHtml(partyName))}
				${kvRow('KODE', escapeHtml(contact?.code || '—'))}
				${kvRow('ALAMAT', escapeHtml(contact?.address || '—'))}
				${kvRow('TELP', escapeHtml(contact?.phone || '—'))}
				${kvRow('EMAIL', escapeHtml(contact?.email || '—'))}
			</table>
		</div>
		<div class="inv-box">
			<table style="width:100%;">
				${kvRow('NO DOKUMEN', escapeHtml(docNo))}
				${kvRow('TANGGAL', escapeHtml(formatDate(doc.date)))}
				${doc.due_date ? kvRow('JATUH TEMPO', escapeHtml(formatDate(doc.due_date))) : ''}
				${kvRow('STATUS', escapeHtml(doc.status || '—'))}
				${kvRow('SUMBER', escapeHtml(doc.expand?.source_document?.number || '—'))}
				${kvRow('ARAH', escapeHtml(dir.title))}
				${kvRow('TAHAP', escapeHtml(stage.singular))}
			</table>
		</div>
	</div>

	<table class="inv-items">
		<thead>
			<tr>
				<th style="width:40px;">NO.</th>
				<th>KETERANGAN</th>
				<th style="width:72px;">QTY</th>
				<th style="width:110px;">HARGA SATUAN<br/>(RP.)</th>
				<th style="width:70px;">DISKON</th>
				<th style="width:60px;">PAJAK</th>
				<th style="width:120px;">JUMLAH (RP.)</th>
			</tr>
		</thead>
		<tbody>
			${itemsRows || `<tr><td colspan="7" style="text-align:center;color:#666;">Tidak ada item</td></tr>`}
		</tbody>
	</table>

	<div class="inv-bottom">
		<div>
			<div class="inv-pesan">
				<div class="inv-pesan-title">PESAN</div>
				<div>${escapeHtml(doc.description || '—')}</div>
			</div>

			${company.bank_name || company.account_number || company.account_holder ? `
			<p class="inv-pay-title" style="margin-top:16px;">DETAIL PEMBAYARAN</p>
			<div class="inv-pay">
				<table style="width:100%;">
					${company.bank_name ? kvRow('NAMA BANK', escapeHtml(company.bank_name)) : ''}
					${company.account_number ? kvRow('NOMOR AKUN BANK', escapeHtml(company.account_number)) : ''}
					${company.account_holder ? kvRow('ATAS NAMA', escapeHtml(company.account_holder)) : ''}
				</table>
			</div>` : ''}

			<div class="inv-terbilang">
				<div class="inv-terbilang-title">TERBILANG</div>
				<div class="inv-terbilang-text">${escapeHtml(terbilangRupiah(total))}</div>
			</div>
		</div>

		<div>
			<table class="inv-totals">
				<tr>
					<td class="t-label">Subtotal</td>
					<td class="t-val">${formatIdNumber(doc.subtotal || 0)}</td>
				</tr>
				<tr>
					<td class="t-label">Diskon</td>
					<td class="t-val">${formatIdNumber(doc.discount_total || 0)}</td>
				</tr>
				<tr>
					<td class="t-label">${escapeHtml(taxLabel)}</td>
					<td class="t-val">${formatIdNumber(doc.tax_total || 0)}</td>
				</tr>
				${Number(doc.shipping_cost) > 0 ? `<tr>
					<td class="t-label">Ongkos Kirim</td>
					<td class="t-val">${formatIdNumber(Number(doc.shipping_cost) || 0)}</td>
				</tr>` : ''}
				<tr class="t-total">
					<td class="t-label">TOTAL</td>
					<td class="t-val">${formatIdNumber(total)}</td>
				</tr>
				<tr>
					<td class="t-label">Bayaran Diterima</td>
					<td class="t-val">${formatIdNumber(paid)}</td>
				</tr>
				<tr class="t-balance">
					<td class="t-label">Sisa Tagihan</td>
					<td class="t-val">${formatIdNumber(balance)}</td>
				</tr>
			</table>

			<div class="inv-sign">
				<div class="inv-sign-line"></div>
				<div class="inv-sign-name">${escapeHtml(company.name)}</div>
				<div class="inv-sign-role">Finance Manager</div>
				<div class="inv-sign-role">Direktur Utama</div>
			</div>
		</div>
	</div>
</div>
`;

	return body;
}

/** Mencetak dokumen bisnis (penawaran/pesanan/invoice/pengiriman/pembayaran) ke PDF. */
export function printBusinessDocument(
	doc: BusinessDocument,
	company: Company,
	direction: DocumentDirection,
): void {
	const stage = STAGE_CONFIG[doc.stage];
	const docTitle = STAGE_DOC_TITLE[doc.stage];
	const docNo = doc.number || `${stage.numberPrefix}-${doc.id.slice(0, 8).toUpperCase()}`;
	const body = buildBusinessDocumentHtml(doc, company, direction);
	printDocument({ title: `${docTitle}-${docNo}`, body });
}

/** Subjek email untuk dokumen bisnis. */
export function documentEmailSubject(
	doc: BusinessDocument,
	direction: DocumentDirection,
): string {
	const stage = STAGE_CONFIG[doc.stage];
	const docTitle = STAGE_DOC_TITLE[doc.stage];
	const dir = DIRECTION_CONFIG[direction];
	const docNo = doc.number || `${stage.numberPrefix}-${doc.id.slice(0, 8).toUpperCase()}`;
	return `${docTitle} ${dir.title} ${docNo} — ${doc.expand?.contact?.name || doc.partner || ''}`.trim();
}
