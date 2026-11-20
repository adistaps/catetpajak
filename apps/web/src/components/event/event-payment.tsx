import { useEffect, useState } from 'react';
import { Building2, Check, Loader2, Mail, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchActiveBankAccounts, type BankAccount } from '@/lib/bank-accounts';

const fieldClass =
	'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const labelClass = 'text-[13px] font-semibold text-foreground';

/** Parse "Rp 499.000" → 499000 */
function parseRupiah(text: string): number {
	const digits = Number(String(text).replace(/[^\d]/g, ''));
	return Number.isFinite(digits) ? digits : 0;
}

function formatRupiah(value: number): string {
	return `Rp ${value.toLocaleString('id-ID')}`;
}

/**
 * Membuat nominal unik: harga dasar + tiga digit acak (100–999). Dipakai
 * verifikasi manual oleh admin Catet Pajak. Nominal dibuat di sisi klien
 * karena pendaftaran event bersifat publik tanpa autentikasi.
 */
function generateExpectedAmount(baseAmount: number): { amount: number; formatted: string } {
	const unique = Math.floor(Math.random() * 900) + 100;
	const total = baseAmount + unique;
	return { amount: total, formatted: formatRupiah(total) };
}

/**
 * Langkah pembayaran manual (transfer bank) untuk event berbayar. Setelah
 * pendaftaran dibuat dengan status menunggu_pembayaran, peserta melihat
 * nominal unik + rekening tujuan, lalu mengunggah bukti transfer. Catatan
 * diperbarui ke status menunggu_verifikasi hingga admin memverifikasi.
 */
export function EventPayment({
	registrationId,
	email,
	amountLabel,
	quantity,
	priceOption,
	onDone,
}: {
	registrationId: string;
	email: string;
	amountLabel: string;
	quantity: number;
	priceOption: string;
	onDone: () => void;
}) {
	const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
	const [banksLoading, setBanksLoading] = useState(true);
	const [bank, setBank] = useState('');
	const [paymentDate, setPaymentDate] = useState('');
	const [notes, setNotes] = useState('');
	const [file, setFile] = useState<File | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState('');
	const [sending, setSending] = useState(false);
	const [done, setDone] = useState(false);
	const [resending, setResending] = useState(false);
	const [emailSent, setEmailSent] = useState(false);
	const [delivery, setDelivery] = useState<
		| { status: 'idle' | 'sending' | 'smtp' | 'relay' | 'failed'; reason?: string; sender?: string }
	>({ status: 'idle' });

	const baseAmount = parseRupiah(amountLabel) * quantity;
	const [expected, setExpected] = useState(() => generateExpectedAmount(baseAmount));

	useEffect(() => {
		const today = new Date();
		const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		setPaymentDate(iso);
	}, []);

	useEffect(() => {
		let cancelled = false;
		setBanksLoading(true);
		fetchActiveBankAccounts()
			.then(items => {
				if (!cancelled) setBankAccounts(items);
			})
			.catch(() => {
				if (!cancelled) setBankAccounts([]);
			})
			.finally(() => {
				if (!cancelled) setBanksLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
		setFile(event.target.files?.[0] ?? null);
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError('');
		const nextErrors: Record<string, string> = {};
		if (!paymentDate) nextErrors.paymentDate = 'Tanggal pembayaran wajib diisi.';
		if (!bank) nextErrors.bank = 'Pilih bank tujuan transfer.';
		if (!file) nextErrors.proof = 'Bukti pembayaran wajib diunggah.';
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;

		setSending(true);
		try {
			const fd = new FormData();
			fd.append('registrationId', registrationId);
			fd.append('expected_amount', String(expected.amount));
			fd.append('expected_amount_formatted', expected.formatted);
			fd.append('bank', bank);
			fd.append('payment_date', paymentDate);
			if (notes.trim()) fd.append('verification_notes', notes.trim());
			fd.append('proof', file!);

			const res = await fetch('/api/event-registration-proof', { method: 'POST', body: fd });
			if (!res.ok) throw new Error('upload failed');
			setDone(true);
			toast.success('Bukti pembayaran terkirim. Menunggu verifikasi admin.');
		} catch {
			setFormError('Gagal mengirim bukti pembayaran. Coba lagi sebentar.');
		} finally {
			setSending(false);
		}
	}

	async function handleResendEmail() {
		setResending(true);
		setDelivery({ status: 'sending' });
		let data: {
			ok?: boolean;
			alreadySent?: boolean;
			via?: string;
			sender?: string;
			error?: string;
			message?: string;
		} | null = null;
		try {
			const response = await fetch('/api/event-confirmation-email', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ registrationId, resend: true }),
			});
			data = (await response.json().catch(() => null));
			if (!response.ok) {
				const reason = data?.error ?? data?.message ?? `${response.status} ${response.statusText}`;
				throw new Error(reason);
			}
		} catch (err) {
			const reason = (err as Error)?.message || 'Pengiriman email gagal.';
			setDelivery({ status: 'failed', reason });
			toast.error(`Email konfirmasi gagal dikirim: ${reason}`, { duration: 8000 });
			return;
		} finally {
			setResending(false);
		}

		if (!data?.ok) {
			const reason = data?.error || 'Pengiriman email gagal.';
			setDelivery({ status: 'failed', reason });
			toast.error(`Email konfirmasi gagal dikirim: ${reason}`, { duration: 8000 });
			return;
		}

		setEmailSent(true);
		const via = data.via || 'relay';
		const sender = data.sender || '';
		if (via === 'smtp') {
			setDelivery({ status: 'smtp', sender });
			toast.success(
				`Email konfirmasi dikirim via SMTP dari ${sender || 'info@catetpajak.com'} ke ${email}. Periksa kotak masuk (atau folder spam).`,
				{ duration: 7000 },
			);
		} else {
			// Relay menerima email (HTTP 200) tetapi BUKAN jaminan sampai ke kotak
			// masuk — pengirim generik sering masuk spam/ditolak. Jangan klaim terkirim.
			setDelivery({ status: 'relay', sender });
			toast.warning(
				`Email diterima relay platform untuk ${email}, namun relay TIDAK menjamin sampai ke kotak masuk (sering masuk spam). Untuk pengiriman andal dari info@catetpajak.com, minta admin mengaktifkan SMTP di Admin Pusat.`,
				{ duration: 10000 },
			);
		}
	}

	if (done) {
		return (
			<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-900">
				<div className="flex items-center gap-2">
					<Check className="size-5 text-emerald-600" strokeWidth={2.5} />
					<p className="font-semibold">Bukti pembayaran terkirim</p>
				</div>
				<p className="mt-2">
					Pendaftaran <span className="font-semibold">{priceOption}</span> untuk {quantity} orang
					telah dicatat. Pembayaran Anda sedang diverifikasi admin Catet Pajak, biasanya dalam
					1×24 jam. Konfirmasi dikirim ke email yang didaftarkan.
				</p>
				<p className="mt-2 text-xs text-emerald-700">
					Nominal unik: <span className="font-bold">{expected.formatted}</span>
				</p>
				<button
					type="button"
					onClick={onDone}
					className="mt-4 inline-flex h-10 items-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
				>
					Selesai
				</button>
			</div>
		);
	}

	return (
		<div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
			<div className="flex items-center gap-2">
				<Building2 className="size-5 text-emerald-600" strokeWidth={1.75} />
				<h3 className="text-base font-extrabold tracking-tight text-[#102a4c]">
					Pembayaran manual (transfer bank)
				</h3>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Transfer nominal unik berikut ke salah satu rekening di bawah, lalu unggah bukti
				transfer. Nominal unik dipakai admin untuk verifikasi — pastikan jumlah transfer sama persis.
			</p>

			<div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-xs text-emerald-800">
				<Mail className="size-3.5 shrink-0 text-emerald-600" strokeWidth={2} />
				<span>
					Email konfirmasi tagihan dikirim ke <strong>{email}</strong>. Belum terima?
					Cek folder spam terlebih dahulu.
				</span>
				<button
					type="button"
					onClick={handleResendEmail}
					disabled={resending}
					className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{resending ? <Loader2 className="size-3 animate-spin" /> : null}
					{resending ? 'Mengirim…' : emailSent ? 'Kirim ulang' : 'Kirim ulang email'}
				</button>
			</div>

			{delivery.status === 'failed' ? (
				<div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
					<strong>Email konfirmasi gagal terkirim.</strong>{' '}
					{delivery.reason ? `Alasan: ${delivery.reason} ` : ''}
					Anda tetap dapat menyelesaikan pembayaran di bawah. Hubungi admin Catet Pajak bila masalah berlanjut.
				</div>
			) : delivery.status === 'relay' ? (
				<div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
					<strong>Email belum terkirim secara andal.</strong> Relay platform menerima email,
					tetapi pengirim generik (<span className="font-mono">@horizons.hostinger.com</span>)
					sering masuk folder spam atau ditolak server penerima — email belum tentu sampai ke
					kotak masuk. Pengiriman andal dari <strong>info@catetpajak.com</strong> hanya bisa
					dilakukan setelah admin mengaktifkan SMTP di <strong>Admin Pusat</strong> (masukkan
					kata sandi mailbox). Ini pengaturan server, bukan bug kode. Anda tetap dapat
					menyelesaikan pembayaran di bawah.
				</div>
			) : delivery.status === 'smtp' ? (
				<div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
					Email terkirim melalui SMTP dari{' '}
					<strong>{delivery.sender || 'info@catetpajak.com'}</strong>. Periksa kotak masuk dan folder spam.
				</div>
			) : null}

			<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
					Nominal yang harus ditransfer
				</p>
				<p className="mt-1 text-2xl font-extrabold tracking-tight text-[#102a4c]">
					{expected.formatted}
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					{priceOption} · {amountLabel} × {quantity} orang + kode unik tiga digit.
				</p>
				<button
					type="button"
					onClick={() => setExpected(generateExpectedAmount(baseAmount))}
					className="mt-2 text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
				>
					Buat ulang kode unik
				</button>
			</div>

			{banksLoading ? (
				<p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat rekening tujuan…
				</p>
			) : bankAccounts.length === 0 ? (
				<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
					Belum ada rekening bank aktif. Hubungi admin Catet Pajak untuk informasi rekening tujuan.
				</p>
			) : (
				<dl className="mt-4 grid gap-2 sm:grid-cols-2">
					{bankAccounts.map(account => (
						<div
							key={account.id}
							className="rounded-xl border border-border bg-card px-4 py-3 text-sm"
						>
							<dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								{account.bank_name}
							</dt>
							<dd className="mt-1 font-bold tracking-tight text-foreground">{account.account_number}</dd>
							<dd className="text-xs text-muted-foreground">a.n. {account.account_holder}</dd>
						</div>
					))}
				</dl>
			)}

			<form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4" noValidate>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="flex flex-col gap-1.5">
						<span className={labelClass}>
							Tanggal pembayaran <span className="text-red-500">*</span>
						</span>
						<input
							type="date"
							value={paymentDate}
							onChange={event => setPaymentDate(event.target.value)}
							className={fieldClass}
						/>
						{errors.paymentDate ? (
							<span className="text-xs font-medium text-red-600">{errors.paymentDate}</span>
						) : null}
					</label>
					<label className="flex flex-col gap-1.5">
						<span className={labelClass}>
							Bank tujuan transfer <span className="text-red-500">*</span>
						</span>
						<select
							value={bank}
							onChange={event => setBank(event.target.value)}
							className={fieldClass}
							disabled={banksLoading || bankAccounts.length === 0}
						>
							<option value="">
								{banksLoading ? 'Memuat rekening…' : 'Pilih bank tujuan…'}
							</option>
							{bankAccounts.map(account => (
								<option key={account.id} value={account.bank_name}>
									{account.bank_name} — {account.account_number} (a.n. {account.account_holder})
								</option>
							))}
						</select>
						{errors.bank ? (
							<span className="text-xs font-medium text-red-600">{errors.bank}</span>
						) : null}
					</label>
				</div>

				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Catatan (opsional)</span>
					<textarea
						value={notes}
						onChange={event => setNotes(event.target.value)}
						rows={2}
						maxLength={500}
						placeholder="cth. transfer dari Bank BCA atas nama Rina Hartono"
						className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100"
					/>
				</label>

				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>
						Bukti pembayaran <span className="text-red-500">*</span>
					</span>
					{file ? (
						<div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-card px-4 py-3">
							<span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
								<Upload className="size-4 shrink-0 text-emerald-600" strokeWidth={1.75} />
								<span className="truncate">{file.name}</span>
							</span>
							<button
								type="button"
								onClick={() => setFile(null)}
								className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
								aria-label="Hapus berkas"
							>
								<X className="size-4" />
							</button>
						</div>
					) : (
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,application/pdf"
							onChange={handleFile}
							className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
						/>
					)}
					{errors.proof ? (
						<span className="text-xs font-medium text-red-600">{errors.proof}</span>
					) : null}
					<span className="text-xs text-muted-foreground">
						Gambar (JPG/PNG/WebP) atau PDF, maksimal 5 MB.
					</span>
				</label>

				{formError ? (
					<p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
						{formError}
					</p>
				) : null}

				<button
					type="submit"
					disabled={sending}
					className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-6 text-[15px] font-semibold text-emerald-700 shadow-soft-sm transition hover:bg-emerald-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
				>
					{sending ? (
						<Loader2 className="size-4 animate-spin" strokeWidth={2} />
					) : (
						<Upload className="size-4" strokeWidth={1.75} />
					)}
					{sending ? 'Mengirim…' : 'Kirim bukti pembayaran'}
				</button>
			</form>
		</div>
	);
}
