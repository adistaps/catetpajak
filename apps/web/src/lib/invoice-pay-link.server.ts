import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Secret HMAC dibaca dari env INVOICE_PAY_SECRET (buat dengan `npm run secrets:generate`).
 * Di produksi wajib diisi (minimal 32 karakter). Di dev dipakai secret acak per proses
 * agar tidak ada nilai bawaan yang bisa ditebak.
 */
const devFallbackSecret = randomBytes(32).toString('hex');

function getSecret(): string {
	const value = process.env.INVOICE_PAY_SECRET?.trim();
	if (value && value.length >= 32) return value;
	if (process.env.NODE_ENV === 'production') {
		throw new Error('INVOICE_PAY_SECRET belum diisi (minimal 32 karakter). Jalankan: npm run secrets:generate');
	}
	return devFallbackSecret;
}

/** Token publik untuk tautan pembayaran dan unduhan PDF. Bukan bukti pembayaran. */
export function signInvoicePayToken(invoiceId: string): string {
	const sig = createHmac('sha256', getSecret()).update(invoiceId).digest('base64url');
	return `${invoiceId}.${sig}`;
}

export function verifyInvoicePayToken(token: string): string | null {
	const dot = token.lastIndexOf('.');
	if (dot < 1) return null;
	const invoiceId = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	if (!invoiceId || !sig) return null;
	const expected = createHmac('sha256', getSecret()).update(invoiceId).digest('base64url');
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	return invoiceId;
}
