import {
	formatAccounting,
	formatRupiah,
	isCashAccount,
	isCurrentAsset,
	type Account,
	type AccountBalance,
	type Company,
	type JournalEntry,
} from '@/lib/accounting';
import type { Transaction } from '@/lib/transactions';

/**
 * Utilitas cetak PDF berbasis dialog cetak browser (Save as PDF).
 * Membuka jendela baru berisi HTML bergaya, lalu memicu window.print().
 * Tidak memerlukan dependensi tambahan — browser yang merender hasil PDF.
 */

const BASE_STYLES = `
	* { box-sizing: border-box; }
	body {
		font-family: "Inter", system-ui, -apple-system, sans-serif;
		color: #0f1f1a;
		background: #fff;
		margin: 0;
		padding: 32px 40px;
		font-size: 12px;
		line-height: 1.5;
	}
	h1, h2, h3 { margin: 0; }
	.muted { color: #5b6b66; }
	.right { text-align: right; }
	.bold { font-weight: 700; }
	.extrabold { font-weight: 800; }
	.uppercase { text-transform: uppercase; letter-spacing: .04em; }
	.track { letter-spacing: .04em; }
	.primary { color: #0f7050; }
	.bg-primary { background: #0f7050; color: #fff; }
	.bg-soft { background: #effcf6; }
	.border { border: 1px solid #d6e4dd; }
	.border-b { border-bottom: 1px solid #d6e4dd; }
	.border-t { border-top: 1px solid #d6e4dd; }
	.border-2 { border-top: 2px solid #0f1f1a; border-bottom: 2px solid #0f1f1a; }
	table { width: 100%; border-collapse: collapse; }
	th, td { padding: 7px 10px; vertical-align: top; }
	th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #5b6b66; border-bottom: 1px solid #d6e4dd; }
	td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #0f7050; padding-top: 14px; padding-bottom: 6px; }
	.subtle { font-size: 11px; color: #5b6b66; }
	.pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; }
	.row { display: flex; justify-content: space-between; gap: 16px; }
	.gap-2 { gap: 8px; }
	.mt-2 { margin-top: 8px; }
	.mt-4 { margin-top: 16px; }
	.mb-2 { margin-bottom: 8px; }
	.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
	.card { border: 1px solid #d6e4dd; border-radius: 12px; padding: 14px 16px; }
	.total-row td { border-top: 2px solid #0f1f1a; font-weight: 800; }
	.grand { background: #0f7050; color: #fff; }
	.grand td { font-weight: 800; font-size: 14px; }
	.foot { margin-top: 20px; font-size: 9px; color: #9aa8a2; text-align: center; }
	.badge-ok { background: #0f7050; color: #fff; }
	.badge-no { background: #c0392b; color: #fff; }
	@media print {
		body { padding: 18px 22px; }
		.no-print { display: none; }
	}
`;

interface PrintOptions {
	/** Judul dokumen (juga dipakai untuk nama file sugesti). */
	title: string;
	/** HTML isi dokumen. */
	body: string;
	/** CSS tambahan spesifik dokumen. */
	extraStyles?: string;
}

/**
 * Membuka jendela cetak baru dan memicu dialog cetak browser.
 * Pengguna dapat memilih "Save as PDF" pada dialog cetak.
 */
export function printDocument({ title, body, extraStyles = '' }: PrintOptions): void {
	if (typeof window === 'undefined') return;
	const win = window.open('', '_blank', 'width=900,height=1100');
	if (!win) {
		// Popup terblokir — fallback: cetak halaman saat ini.
		window.print();
		return;
	}
	const html = `<!doctype html>
<html lang="id">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapeHtml(title)}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
	<style>${BASE_STYLES}${extraStyles}</style>
</head>
<body>
	${body}
	<div class="foot">Dokumen ini dihasilkan oleh Catet Pajak · ${new Date().toLocaleString('id-ID')}</div>
	<script>
		window.addEventListener('load', function () {
			setTimeout(function () { window.print(); }, 350);
		});
	</script>
</body>
</html>`;
	win.document.open();
	win.document.write(html);
	win.document.close();
}

/** Meloloskan teks untuk HTML. */
export function escapeHtml(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Membungkus nilai sebagai baris tabel dua kolom (label · nilai). */
function lineRow(label: string, value: string, opts: { bold?: boolean; border?: 'top' | 'double'; indent?: boolean } = {}): string {
	const cls = [
		opts.bold ? 'bold' : '',
		opts.border === 'top' ? 'border-t' : '',
		opts.border === 'double' ? 'border-2' : '',
	].join(' ');
	const pad = opts.indent ? 'padding-left:24px;' : '';
	return `<tr class="${cls}"><td style="${pad}">${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td></tr>`;
}

/** Header dokumen laporan: nama entitas, judul, periode. */
function reportHeader(entityName: string, reportTitle: string, subtitle: string): string {
	return `
		<div class="row" style="align-items:flex-start;">
			<div>
				<h1 class="extrabold" style="font-size:20px;">${escapeHtml(entityName)}</h1>
				<p class="muted mt-2">${escapeHtml(subtitle)}</p>
			</div>
			<div class="right">
				<p class="uppercase track muted" style="font-size:10px;">Catet Pajak</p>
				<h2 class="extrabold primary" style="font-size:16px;">${escapeHtml(reportTitle)}</h2>
				<p class="subtle">Dicetak: ${new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}</p>
			</div>
		</div>
		<div class="border-t mt-4 mb-2"></div>
	`;
}

export type SingleReportId =
	| 'neraca'
	| 'buku-besar'
	| 'laba-rugi'
	| 'jurnal'
	| 'arus-kas'
	| 'neraca-saldo'
	| 'perubahan-modal'
	| 'ringkasan-bisnis'
	| 'laba-rugi-fiskal'
	| 'rekonsiliasi-pajak'
	| 'posisi-keuangan-yayasan'
	| 'perubahan-aset-neto';

interface ReportPdfArgs {
	company: Company;
	/** Laporan tunggal yang diekspor — hanya isi laporan ini yang masuk PDF. */
	reportId: SingleReportId;
	reportTitle: string;
	balances: AccountBalance[];
	accounts: Account[];
	entries: JournalEntry[];
}

/** Membangun HTML satu laporan keuangan untuk cetak PDF (tanpa UI hub). */
export function buildReportHtml({
	company,
	reportId,
	reportTitle,
	balances,
	accounts,
	entries,
}: ReportPdfArgs): string {
	const active = balances.filter(b => Math.round(b.balance) !== 0);
	const pendapatan = active.filter(b => b.account.type === 'pendapatan');
	const beban = active.filter(b => b.account.type === 'beban');
	const totalPendapatan = pendapatan.reduce((s, b) => s + b.balance, 0);
	const totalBeban = beban.reduce((s, b) => s + b.balance, 0);
	const labaBersih = totalPendapatan - totalBeban;

	const asetLancar = active.filter(b => b.account.type === 'aset' && isCurrentAsset(b.account));
	const asetTetap = active.filter(b => b.account.type === 'aset' && !isCurrentAsset(b.account));
	const liabilitas = active.filter(b => b.account.type === 'liabilitas');
	const ekuitas = active.filter(b => b.account.type === 'ekuitas');

	const totalAsetLancar = asetLancar.reduce((s, b) => s + b.balance, 0);
	const totalAsetTetap = asetTetap.reduce((s, b) => s + b.balance, 0);
	const totalAset = totalAsetLancar + totalAsetTetap;
	const totalLiabilitas = liabilitas.reduce((s, b) => s + b.balance, 0);
	const totalEkuitas = ekuitas.reduce((s, b) => s + b.balance, 0) + labaBersih;
	const totalPasiva = totalLiabilitas + totalEkuitas;
	const seimbang = Math.round(totalAset) === Math.round(totalPasiva);

	const piutang = active.filter(b => b.account.type === 'aset' && /piutang/i.test(b.account.name));
	const persediaan = active.filter(b => b.account.type === 'aset' && /persediaan/i.test(b.account.name));
	const utangUsaha = active.filter(b => b.account.type === 'liabilitas' && /utang usaha/i.test(b.account.name));
	const kasOperasi =
		labaBersih -
		piutang.reduce((s, b) => s + b.balance, 0) -
		persediaan.reduce((s, b) => s + b.balance, 0) +
		utangUsaha.reduce((s, b) => s + b.balance, 0);
	const kasInvestasi = -asetTetap.reduce((s, b) => s + b.balance, 0);
	const pendanaanLiab = active.filter(
		b => b.account.type === 'liabilitas' && !/utang usaha/i.test(b.account.name),
	);
	const kasPendanaan =
		pendanaanLiab.reduce((s, b) => s + b.balance, 0) +
		ekuitas.reduce((s, b) => s + b.balance, 0);
	const saldoAkhirKas = active
		.filter(b => isCashAccount(b.account))
		.reduce((s, b) => s + b.balance, 0);

	const rows = (list: AccountBalance[]) =>
		list.length === 0
			? `<tr><td class="muted">—</td><td class="num muted">${formatRupiah(0)}</td></tr>`
			: list.map(b => lineRow(b.account.name, formatRupiah(b.balance), { indent: true })).join('');

	const header = reportHeader(company.name, reportTitle, `${company.address || ''}`.trim());

	const neracaBody = `
		<div class="grid-2">
			<div class="card">
				<p class="bold uppercase track muted" style="font-size:10px;">Aset</p>
				<p class="subtle mt-2">Aset Lancar</p>
				<table>${rows(asetLancar)}${lineRow('Total Aset Lancar', formatRupiah(totalAsetLancar), { bold: true, border: 'top' })}</table>
				${
					asetTetap.length > 0
						? `<p class="subtle mt-4">Aset Tetap</p><table>${rows(asetTetap)}${lineRow('Total Aset Tetap', formatRupiah(totalAsetTetap), { bold: true, border: 'top' })}</table>`
						: ''
				}
				<table class="mt-4">${lineRow('TOTAL ASET', formatRupiah(totalAset), { bold: true, border: 'double' })}</table>
			</div>
			<div class="card">
				<p class="bold uppercase track muted" style="font-size:10px;">Liabilitas &amp; Ekuitas</p>
				<p class="subtle mt-2">Liabilitas</p>
				<table>${rows(liabilitas)}${lineRow('Total Liabilitas', formatRupiah(totalLiabilitas), { bold: true, border: 'top' })}</table>
				<p class="subtle mt-4">Ekuitas</p>
				<table>${rows(ekuitas)}${lineRow('Laba Berjalan', formatRupiah(labaBersih), { indent: true })}${lineRow('Total Ekuitas', formatRupiah(totalEkuitas), { bold: true, border: 'top' })}</table>
				<table class="mt-4">${lineRow('TOTAL LIABILITAS &amp; EKUITAS', formatRupiah(totalPasiva), { bold: true, border: 'double' })}</table>
			</div>
		</div>
		<p class="mt-2"><span class="pill ${seimbang ? 'badge-ok' : 'badge-no'}">${seimbang ? 'Neraca seimbang' : 'Neraca belum seimbang'}</span></p>
	`;

	const labaRugiBody = `
		<div class="card">
			<table>
				${pendapatan.length === 0 ? lineRow('Pendapatan', formatRupiah(0), { indent: true }) : rows(pendapatan)}
				${lineRow('Total Pendapatan', formatRupiah(totalPendapatan), { bold: true, border: 'top' })}
				${
					beban.length === 0
						? lineRow('Beban', formatRupiah(0), { indent: true })
						: beban
								.map(b =>
									lineRow(b.account.name, `(${formatRupiah(b.balance)})`, {
										indent: true,
									}),
								)
								.join('')
				}
				${lineRow('Total Beban', `(${formatRupiah(totalBeban)})`, { bold: true, border: 'top' })}
				${lineRow(
					labaBersih >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH',
					formatAccounting(labaBersih),
					{ bold: true, border: 'double' },
				)}
			</table>
		</div>
	`;

	const arusKasBody = `
		<div class="card">
			<table>
				${lineRow('Laba Bersih', formatAccounting(labaBersih), { indent: true })}
				${piutang.map(b => lineRow(`Kenaikan ${b.account.name}`, formatAccounting(-b.balance), { indent: true })).join('')}
				${persediaan.map(b => lineRow(`Kenaikan ${b.account.name}`, formatAccounting(-b.balance), { indent: true })).join('')}
				${utangUsaha.map(b => lineRow(`Kenaikan ${b.account.name}`, formatAccounting(b.balance), { indent: true })).join('')}
				${lineRow('Kas Bersih dari Aktivitas Operasi', formatAccounting(kasOperasi), { bold: true, border: 'top' })}
				${asetTetap.map(b => lineRow(`Perolehan ${b.account.name}`, formatAccounting(-b.balance), { indent: true })).join('')}
				${lineRow('Kas Bersih dari Aktivitas Investasi', formatAccounting(kasInvestasi), { bold: true, border: 'top' })}
				${pendanaanLiab.map(b => lineRow(b.account.name, formatAccounting(b.balance), { indent: true })).join('')}
				${ekuitas.map(b => lineRow(b.account.name, formatAccounting(b.balance), { indent: true })).join('')}
				${lineRow('Kas Bersih dari Aktivitas Pendanaan', formatAccounting(kasPendanaan), { bold: true, border: 'top' })}
				${lineRow('KENAIKAN / (PENURUNAN) KAS', formatAccounting(kasOperasi + kasInvestasi + kasPendanaan), { bold: true, border: 'double' })}
				${lineRow('Saldo Kas Akhir', formatRupiah(saldoAkhirKas), { bold: true })}
			</table>
		</div>
	`;

	const bbAccounts = accounts
		.map(account => {
			const accEntries = entries.filter(e => e.account === account.id);
			const debit = accEntries.reduce((s, e) => s + (e.debit || 0), 0);
			const credit = accEntries.reduce((s, e) => s + (e.credit || 0), 0);
			const bal = balances.find(b => b.account.id === account.id);
			return { account, debit, credit, balance: bal?.balance ?? 0 };
		})
		.filter(r => r.debit !== 0 || r.credit !== 0 || Math.round(r.balance) !== 0);

	const bukuBesarBody = `
		<div class="card">
			<table>
				<thead><tr><th>Kode</th><th>Nama Akun</th><th>Tipe</th><th class="num">Debit</th><th class="num">Kredit</th><th class="num">Saldo</th></tr></thead>
				<tbody>
					${bbAccounts
						.map(
							r =>
								`<tr><td>${escapeHtml(r.account.code)}</td><td>${escapeHtml(r.account.name)}</td><td class="muted">${escapeHtml(r.account.type)}</td><td class="num">${formatRupiah(r.debit)}</td><td class="num">${formatRupiah(r.credit)}</td><td class="num bold">${formatRupiah(r.balance)}</td></tr>`,
						)
						.join('')}
				</tbody>
			</table>
		</div>
	`;

	const jurnalBody = (() => {
		const sorted = [...entries].sort((a, b) =>
			(a.date || '').localeCompare(b.date || ''),
		);
		const map = new Map(accounts.map(a => [a.id, a]));
		const totalD = sorted.reduce((s, e) => s + (e.debit || 0), 0);
		const totalC = sorted.reduce((s, e) => s + (e.credit || 0), 0);
		return `
		<div class="card">
			<table>
				<thead><tr><th>Tanggal</th><th>Akun</th><th>Keterangan</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead>
				<tbody>
					${sorted
						.map(e => {
							const acc = map.get(e.account);
							const label = acc ? `${acc.code} — ${acc.name}` : e.account;
							return `<tr><td>${escapeHtml((e.date || '').slice(0, 10))}</td><td>${escapeHtml(label)}</td><td>${escapeHtml(e.description || '—')}</td><td class="num">${e.debit ? formatRupiah(e.debit) : '—'}</td><td class="num">${e.credit ? formatRupiah(e.credit) : '—'}</td></tr>`;
						})
						.join('')}
					<tr class="total-row"><td colspan="3">Total</td><td class="num">${formatRupiah(totalD)}</td><td class="num">${formatRupiah(totalC)}</td></tr>
				</tbody>
			</table>
		</div>`;
	})();

	const neracaSaldoBody = `
		<div class="card">
			<table>
				<thead><tr><th>Kode</th><th>Nama Akun</th><th>Tipe</th><th class="num">Debit</th><th class="num">Kredit</th><th class="num">Saldo</th></tr></thead>
				<tbody>
					${bbAccounts
						.map(
							r =>
								`<tr><td>${escapeHtml(r.account.code)}</td><td>${escapeHtml(r.account.name)}</td><td class="muted">${escapeHtml(r.account.type)}</td><td class="num">${formatRupiah(r.debit)}</td><td class="num">${formatRupiah(r.credit)}</td><td class="num bold">${formatRupiah(r.balance)}</td></tr>`,
						)
						.join('')}
				</tbody>
			</table>
		</div>
	`;

	const perubahanModalBody = `
		<div class="card">
			<table>
				${ekuitas.map(b => lineRow(b.account.name, formatRupiah(b.balance), { indent: true })).join('')}
				${lineRow(
					labaBersih >= 0 ? 'Laba tahun berjalan' : 'Rugi tahun berjalan',
					formatAccounting(labaBersih),
					{ indent: true },
				)}
				${lineRow('MODAL AKHIR', formatRupiah(totalEkuitas), { bold: true, border: 'double' })}
			</table>
		</div>
	`;

	const ringkasanBody = `
		<div class="grid-2">
			<div class="card bg-soft"><p class="uppercase track muted" style="font-size:10px;">Pendapatan</p><p class="extrabold" style="font-size:16px;">${formatRupiah(totalPendapatan)}</p></div>
			<div class="card bg-soft"><p class="uppercase track muted" style="font-size:10px;">Beban</p><p class="extrabold" style="font-size:16px;">${formatRupiah(totalBeban)}</p></div>
		</div>
		<div class="card bg-primary mt-4"><p class="uppercase track" style="font-size:10px;opacity:.85;">${labaBersih >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}</p><p class="extrabold" style="font-size:18px;">${formatAccounting(labaBersih)}</p></div>
		<div class="grid-2 mt-4">
			<div class="card"><p class="uppercase track muted" style="font-size:10px;">Total Aset</p><p class="extrabold">${formatRupiah(totalAset)}</p></div>
			<div class="card"><p class="uppercase track muted" style="font-size:10px;">Total Liabilitas</p><p class="extrabold">${formatRupiah(totalLiabilitas)}</p></div>
			<div class="card"><p class="uppercase track muted" style="font-size:10px;">Total Ekuitas</p><p class="extrabold">${formatRupiah(totalEkuitas)}</p></div>
			<div class="card"><p class="uppercase track muted" style="font-size:10px;">Saldo Kas</p><p class="extrabold">${formatRupiah(saldoAkhirKas)}</p></div>
		</div>
	`;

	const fiskalBody = `
		<div class="card">
			<table>
				${lineRow('Laba Komersial', formatAccounting(labaBersih), { bold: true, border: 'top' })}
				${lineRow('Koreksi positif (penambah)', formatRupiah(0), { indent: true })}
				${lineRow('Koreksi negatif (pengurang)', `(${formatRupiah(0)})`, { indent: true })}
				${lineRow('Laba Fiskal Kena Pajak', formatAccounting(Math.max(0, labaBersih)), { bold: true, border: 'top' })}
				${lineRow('PPh Badan (tarif 22%)', formatRupiah(Math.max(0, labaBersih) * 0.22), { bold: true, border: 'double' })}
			</table>
		</div>
	`;

	const rekonsiliasiBody = `
		<div class="card">
			<table>
				${lineRow('Laba / (Rugi) Komersial', formatAccounting(labaBersih), { bold: true })}
				${lineRow('Koreksi positif', formatRupiah(0), { indent: true })}
				${lineRow('Koreksi negatif', `(${formatRupiah(0)})`, { indent: true })}
				${lineRow('Laba Fiskal', formatAccounting(Math.max(0, labaBersih)), { bold: true, border: 'double' })}
			</table>
		</div>
	`;

	const yayasanNeracaBody = neracaBody.replace(
		/Liabilitas &amp; Ekuitas/g,
		'Liabilitas &amp; Aset Neto',
	).replace(/Total Ekuitas/g, 'Total Aset Neto').replace(
		/TOTAL LIABILITAS &amp; EKUITAS/g,
		'TOTAL LIABILITAS &amp; ASET NETO',
	);

	const perubahanAsetNetoBody = `
		<div class="card">
			<table>
				${lineRow('Surplus / (Defisit) tahun berjalan', formatAccounting(labaBersih), { bold: true })}
				${ekuitas.map(b => lineRow(b.account.name, formatRupiah(b.balance), { indent: true })).join('')}
				${lineRow('TOTAL ASET NETO', formatRupiah(totalEkuitas), { bold: true, border: 'double' })}
			</table>
		</div>
	`;

	const bodyById: Record<SingleReportId, string> = {
		neraca: neracaBody,
		'buku-besar': bukuBesarBody,
		'laba-rugi': labaRugiBody,
		jurnal: jurnalBody,
		'arus-kas': arusKasBody,
		'neraca-saldo': neracaSaldoBody,
		'perubahan-modal': perubahanModalBody,
		'ringkasan-bisnis': ringkasanBody,
		'laba-rugi-fiskal': fiskalBody,
		'rekonsiliasi-pajak': rekonsiliasiBody,
		'posisi-keuangan-yayasan': yayasanNeracaBody,
		'perubahan-aset-neto': perubahanAsetNetoBody,
	};

	return header + (bodyById[reportId] || neracaBody);
}

/** Memicu cetak PDF satu laporan keuangan saja. */
export function exportReportPdf(args: ReportPdfArgs): void {
	const body = buildReportHtml(args);
	printDocument({
		title: `${args.reportTitle}-${args.company.name}`,
		body,
	});
}

// ============================ INVOICE ============================

interface InvoicePdfArgs {
	company: Company;
	transaction: Transaction;
	/** "Faktur Penjualan" / "Faktur Pembelian". */
	docTitle: string;
	/** "Pelanggan" / "Pemasok". */
	partyLabel: string;
	/** Awalan nomor faktur, mis. "INV" / "PO". */
	numberPrefix: string;
}

/** Membangun HTML faktur untuk satu transaksi penjualan/pembelian. */
export function buildInvoiceHtml({
	company,
	transaction,
	docTitle,
	partyLabel,
	numberPrefix,
}: InvoicePdfArgs): string {
	const tx = transaction;
	const party = tx.expand?.contact;
	const product = tx.expand?.product;
	const qty = tx.quantity || (product ? 1 : 0);
	const unitPrice = tx.unit_price || tx.amount || 0;
	const subtotal = qty * unitPrice;
	const discount = tx.discount || 0;
	const afterDiscount = Math.max(0, subtotal - discount);
	const taxRate = tx.tax_rate || 0;
	const taxAmount = tx.tax_amount || 0;
	const total = tx.amount || (afterDiscount + taxAmount);

	const invoiceNo = `${numberPrefix}-${tx.id.slice(0, 8).toUpperCase()}`;
	const partyName = party?.name || tx.partner || '—';
	const partyLines = [
		party?.address,
		party?.phone,
		party?.email,
	].filter(Boolean).map(escapeHtml).join('<br/>');

	const itemDesc = product
		? `${product.name}${product.code ? ` (${product.code})` : ''}`
		: tx.description || '—';

	const companyLines = [company.address].filter(Boolean).map(escapeHtml).join('<br/>');

	const body = `
		<div class="row" style="align-items:flex-start;">
			<div>
				<h1 class="extrabold primary" style="font-size:22px;">Catet Pajak</h1>
				<p class="bold" style="font-size:13px;">${escapeHtml(company.name)}</p>
				${companyLines ? `<p class="subtle">${companyLines}</p>` : ''}
			</div>
			<div class="right">
				<h2 class="extrabold" style="font-size:18px;">${escapeHtml(docTitle)}</h2>
				<p class="subtle">No: <span class="bold">${escapeHtml(invoiceNo)}</span></p>
				<p class="subtle">Tanggal: <span class="bold">${escapeHtml(formatDateId(tx.date))}</span></p>
			</div>
		</div>
		<div class="border-t mt-4 mb-2"></div>

		<div class="grid-2 mt-4">
			<div class="card">
				<p class="uppercase track muted" style="font-size:10px;">${escapeHtml(partyLabel)}</p>
				<p class="bold mt-2" style="font-size:14px;">${escapeHtml(partyName)}</p>
				${partyLines ? `<p class="subtle mt-2">${partyLines}</p>` : ''}
			</div>
			<div class="card">
				<p class="uppercase track muted" style="font-size:10px;">Keterangan</p>
				<p class="mt-2">${escapeHtml(tx.description || '—')}</p>
			</div>
		</div>

		<table class="mt-4">
			<thead>
				<tr>
					<th>Deskripsi</th>
					<th class="num">Qty</th>
					<th class="num">Harga Satuan</th>
					<th class="num">Diskon</th>
					<th class="num">Pajak (%)</th>
					<th class="num">Jumlah</th>
				</tr>
			</thead>
			<tbody>
				<tr class="border-b">
					<td>${escapeHtml(itemDesc)}</td>
					<td class="num">${qty}</td>
					<td class="num">${formatRupiah(unitPrice)}</td>
					<td class="num">${formatRupiah(discount)}</td>
					<td class="num">${taxRate}%</td>
					<td class="num">${formatRupiah(afterDiscount)}</td>
				</tr>
			</tbody>
		</table>

		<div class="row mt-4" style="align-items:flex-start;">
			<div></div>
			<div class="card" style="min-width:280px;">
				<table>
					${lineRow('Subtotal', formatRupiah(subtotal))}
					${lineRow('Diskon', `- ${formatRupiah(discount)}`)}
					${lineRow(`Pajak (${taxRate}%)`, formatRupiah(taxAmount))}
				</table>
				<table class="mt-2">
					<tr class="grand"><td>TOTAL</td><td class="num">${formatRupiah(total)}</td></tr>
				</table>
			</div>
		</div>

		<div class="grid-2 mt-4">
			<div class="card">
				<p class="uppercase track muted" style="font-size:10px;">Akun Pembukuan</p>
				<p class="mt-2">Debit: <span class="bold">${escapeHtml(tx.expand?.debit_account ? `${tx.expand.debit_account.code} — ${tx.expand.debit_account.name}` : '—')}</span></p>
				<p>Kredit: <span class="bold">${escapeHtml(tx.expand?.credit_account ? `${tx.expand.credit_account.code} — ${tx.expand.credit_account.name}` : '—')}</span></p>
			</div>
			<div class="card right">
				<p class="uppercase track muted" style="font-size:10px;">Diterbitkan oleh</p>
				<p class="bold mt-2">${escapeHtml(company.name)}</p>
				<p class="subtle mt-4">Tanda tangan</p>
				<div style="height:48px;"></div>
				<p class="border-t subtle">_____________________</p>
			</div>
		</div>
	`;
	return body;
}

/** Memicu cetak PDF faktur untuk transaksi penjualan/pembelian. */
export function exportInvoicePdf(args: InvoicePdfArgs): void {
	const body = buildInvoiceHtml(args);
	const no = `${args.numberPrefix}-${args.transaction.id.slice(0, 8).toUpperCase()}`;
	printDocument({ title: `${args.numberPrefix}-${no}-${args.transaction.date}`, body });
}

function formatDateId(value: string): string {
	const [y, m, d] = (value || '').slice(0, 10).split('-');
	if (!y || !m || !d) return value || '';
	return `${d}/${m}/${y}`;
}
