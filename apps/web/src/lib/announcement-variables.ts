import { formatRupiah, formatDate } from '@/lib/accounting';
import { computePaymentTerms } from '@/lib/payment-terms';
import type { BusinessDocument } from '@/lib/documents';

/**
 * Variabel/placeholder yang dapat disisipkan ke dalam isi pengumuman. Token
 * ditulis dalam bentuk `{{nama_variabel}}` dan akan diisi dengan data nyata
 * saat pengumuman ditampilkan di Portal Parent.
 */
export interface AnnouncementVariable {
	token: string;
	label: string;
	description: string;
}

export const ANNOUNCEMENT_VARIABLES: AnnouncementVariable[] = [
	{ token: 'nama_parent', label: 'Nama Parent', description: 'Nama orang tua/wali penerima pengumuman.' },
	{ token: 'nama_siswa', label: 'Nama Siswa', description: 'Nama siswa yang terhubung dengan parent.' },
	{ token: 'jumlah_tagihan', label: 'Jumlah Tagihan', description: 'Total sisa tagihan belum lunas siswa.' },
	{ token: 'nomor_invoice', label: 'Nomor Invoice', description: 'Nomor invoice belum lunas siswa.' },
	{ token: 'tanggal_jatuh_tempo', label: 'Tanggal Jatuh Tempo', description: 'Tanggal jatuh tempo invoice belum lunas terdekat.' },
];

const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/** Apakah teks mengandung token variabel yang perlu diisi. */
export function hasVariables(text: string | null | undefined): boolean {
	if (!text) return false;
	return /\{\{\s*[a-z_]+\s*\}\}/i.test(text);
}

/** Bentuk token lengkap, mis. `{{nama_siswa}}`. */
export function variableToken(name: string): string {
	return `{{${name}}}`;
}

export interface VariableContext {
	parentName: string;
	studentName: string;
	/** Invoice belum lunas milik siswa. */
	unpaidInvoices: BusinessDocument[];
}

/** Ringkasan tagihan belum lunas untuk konteks variabel. */
export interface InvoiceSummary {
	/** Total sisa tagihan (total - paid_amount) dari invoice belum lunas. */
	totalRemaining: number;
	/** Nomor invoice belum lunas (gabungan, unik, urut). */
	invoiceNumbers: string[];
	/** Tanggal jatuh tempo terdekat dari invoice belum lunas (ISO). */
	earliestDueDate: string | null;
}

/** Hitung ringkasan invoice belum lunas untuk sebuah siswa. */
export function summarizeUnpaidInvoices(invoices: BusinessDocument[]): InvoiceSummary {
	const unpaid = invoices.filter((inv) => {
		const total = Number(inv.total) || 0;
		const paid = Number(inv.paid_amount) || 0;
		return total - paid > 0.5;
	});
	const totalRemaining = unpaid.reduce((sum, inv) => {
		const total = Number(inv.total) || 0;
		const paid = Number(inv.paid_amount) || 0;
		return sum + Math.max(0, total - paid);
	}, 0);
	const numbers = Array.from(
		new Set(unpaid.map((inv) => inv.number).filter(Boolean)),
	).sort((a, b) => a.localeCompare(b, 'id'));
	const dueDates = unpaid
		.map((inv) => {
			const calc = computePaymentTerms(inv.payment_terms, inv.date, Number(inv.total) || 0);
			return calc?.dueDate ?? null;
		})
		.filter((d): d is string => Boolean(d))
		.sort((a, b) => a.localeCompare(b));
	return {
		totalRemaining,
		invoiceNumbers: numbers,
		earliestDueDate: dueDates[0] ?? null,
	};
}

/**
 * Ganti token variabel pada teks dengan nilai nyata dari konteks. Nilai yang
 * tidak tersedia diganti dengan tanda hubung "—" agar jelas kosong, bukan
 * mengarang data.
 */
export function resolveVariables(text: string, ctx: VariableContext): string {
	if (!text) return '';
	const summary = summarizeUnpaidInvoices(ctx.unpaidInvoices);
	const values: Record<string, string> = {
		nama_parent: ctx.parentName?.trim() || '—',
		nama_siswa: ctx.studentName?.trim() || '—',
		jumlah_tagihan: formatRupiah(summary.totalRemaining),
		nomor_invoice: summary.invoiceNumbers.length > 0 ? summary.invoiceNumbers.join(', ') : '—',
		tanggal_jatuh_tempo: summary.earliestDueDate ? formatDate(summary.earliestDueDate) : '—',
	};
	return text.replace(TOKEN_PATTERN, (match, name: string) => {
		const key = String(name).toLowerCase();
		return values[key] ?? match;
	});
}

/** Konteks contoh untuk pratinjau di editor. */
export const SAMPLE_VARIABLE_CONTEXT: VariableContext = {
	parentName: 'Budi Santoso',
	studentName: 'Andi Pratama',
	unpaidInvoices: [
		{
			id: 'sample',
			company: '',
			direction: 'penjualan',
			stage: 'invoice',
			number: 'INV-001',
			date: new Date().toISOString().slice(0, 10),
			contact: '',
			partner: '',
			description: '',
			items: [],
			subtotal: 0,
			discount_total: 0,
			tax_total: 0,
			total: 500000,
			paid_amount: 0,
			debit_account: '',
			credit_account: '',
			transaction: '',
			source_document: '',
			payment_terms: '2/3 N/30',
			status: 'confirmed',
			owner: '',
			created: '',
			updated: '',
		},
	],
};
