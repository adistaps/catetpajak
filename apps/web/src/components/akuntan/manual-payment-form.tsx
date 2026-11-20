import { useEffect, useState } from 'react';
import { Building2, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
	createManualPayment,
	fetchExpectedAmount,
	verifyMyManualPayment,
} from '@/lib/manual-payments';
import { fetchActiveBankAccounts, type BankAccount } from '@/lib/bank-accounts';
import type { PlanPriceKey } from '@/lib/plan-prices';

const fieldClass =
	'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const labelClass = 'text-[13px] font-semibold text-foreground';

function indonesianFieldError(field: string, message: string | undefined): string {
	const raw = (message ?? '').trim();
	if (field === 'bank' || /invalid value/i.test(raw)) {
		return 'Bank tujuan tidak valid. Pilih rekening aktif lalu kirim ulang.';
	}
	if (/must be unique/i.test(raw)) return 'Nilai ini sudah digunakan.';
	if (/required|missing/i.test(raw)) return 'Kolom ini wajib diisi.';
	if (!raw || /^[A-Za-z]/.test(raw)) return 'Nilai tidak valid. Periksa isian lalu coba lagi.';
	return raw;
}

/**
 * Formulir pembayaran manual langganan Pencari Akuntan. Pencari melihat
 * instruksi transfer, mengunggah bukti, dan mengirim. Status berubah menjadi
 * menunggu verifikasi hingga admin pusat memverifikasi.
 */
export function ManualPaymentForm({
	variantId,
	amountFormatted,
	planKey,
	planTitle = 'Pencari Akuntan',
	onSubmitted,
}: {
	variantId: string | null;
	amountFormatted: string;
	planKey: PlanPriceKey;
	planTitle?: string;
	onSubmitted?: () => void;
}) {
	const { user } = useAuth();
	const [payerName, setPayerName] = useState('');
	const [payerEmail, setPayerEmail] = useState('');
	const [bank, setBank] = useState('');
	const [paymentDate, setPaymentDate] = useState('');
	const [notes, setNotes] = useState('');
	const [file, setFile] = useState<File | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState('');
	const [sending, setSending] = useState(false);
	const [verifying, setVerifying] = useState(false);
	const [expectedAmount, setExpectedAmount] = useState<number | null>(null);
	const [expectedAmountFormatted, setExpectedAmountFormatted] = useState<string | null>(null);
	const [amountLoading, setAmountLoading] = useState(false);
	const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
	const [banksLoading, setBanksLoading] = useState(true);

	useEffect(() => {
		if (!user) return;
		const record = user as unknown as Record<string, string>;
		setPayerName(record.name ?? '');
		setPayerEmail(user.email ?? '');
		const today = new Date();
		const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		setPaymentDate(iso);
	}, [user]);

	// Muat rekening bank aktif yang ditampilkan sebagai tujuan transfer. Hanya
	// rekening aktif yang dikembalikan. Jika belum ada rekening terdaftar,
	// pelanggan melihat pesan agar menghubungi admin.
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

	// Minta nominal unik (harga paket + tiga digit acak) yang belum dipakai
	// pembayaran aktif/menunggu lain. Nominal ini ditampilkan sebagai jumlah
	// yang harus ditransfer dan dipakai verifikasi otomatis. Harga dasar
	// diambil server-side dari pengaturan harga Admin Pusat berdasarkan planKey.
	useEffect(() => {
		if (!variantId) return;
		let cancelled = false;
		setAmountLoading(true);
		fetchExpectedAmount(planKey)
			.then(result => {
				if (cancelled) return;
				setExpectedAmount(result.expected_amount);
				setExpectedAmountFormatted(result.expected_amount_formatted);
			})
			.catch(() => {
				if (cancelled) return;
				setFormError('Gagal membuat nominal unik. Muat ulang halaman lalu coba lagi.');
			})
			.finally(() => {
				if (!cancelled) setAmountLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [planKey, variantId]);

	function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
		const selected = event.target.files?.[0] ?? null;
		setFile(selected);
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError('');
		const nextErrors: Record<string, string> = {};
		if (!payerName.trim()) nextErrors.payerName = 'Nama wajib diisi.';
		if (!payerEmail.trim()) {
			nextErrors.payerEmail = 'Email wajib diisi.';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail.trim())) {
			nextErrors.payerEmail = 'Format email tidak valid.';
		}
		if (!paymentDate) nextErrors.paymentDate = 'Tanggal pembayaran wajib diisi.';
		if (!bank) nextErrors.bank = 'Pilih bank tujuan transfer.';
		if (!file) nextErrors.proof = 'Bukti pembayaran wajib diunggah.';
		if (!variantId) nextErrors.proof = 'Paket tidak tersedia. Muat ulang halaman.';
		if (!expectedAmount || !expectedAmountFormatted) {
			nextErrors.proof = 'Nominal unik belum siap. Muat ulang halaman.';
		}
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0 || !user || !variantId || !expectedAmount || !expectedAmountFormatted) return;

		setSending(true);
		setVerifying(false);
		try {
			const record = await createManualPayment(
				{
					plan_title: planTitle,
					variant_id: variantId,
					amount_formatted: amountFormatted,
					expected_amount: expectedAmount,
					expected_amount_formatted: expectedAmountFormatted,
					payment_method: 'transfer_bank',
					bank,
					payer_name: payerName.trim(),
					payer_email: payerEmail.trim(),
					payment_date: paymentDate,
					notes: notes.trim(),
					proof: file!,
				},
				user.id,
			);

			// Jalankan verifikasi otomatis bukti transfer. Jika jumlah dan nama bank
			// cocok, langganan diaktifkan otomatis; jika tidak, tetap menunggu admin.
			setVerifying(true);
			const result = await verifyMyManualPayment(record.id);
			if (result.verified) {
				toast.success('Pembayaran terverifikasi otomatis. Langganan aktif selama 30 hari.');
			} else {
				toast.info(result.reason || 'Bukti terkirim. Menunggu verifikasi admin.');
			}
			onSubmitted?.();
		} catch (err) {
			const data = (
				err as { response?: { data?: Record<string, { message?: string }> } }
			)?.response?.data;
			if (data && Object.keys(data).length > 0) {
				const fieldErrors: Record<string, string> = {};
				for (const [key, value] of Object.entries(data)) {
					fieldErrors[key] = indonesianFieldError(key, value?.message);
				}
				setErrors(fieldErrors);
			} else {
				setFormError('Gagal mengirim bukti pembayaran. Coba lagi sebentar lagi.');
			}
		} finally {
			setSending(false);
			setVerifying(false);
		}
	}

	return (
		<div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
			<div className="flex items-center gap-2">
				<Building2 className="size-5 text-emerald-600" strokeWidth={1.75} />
				<h3 className="text-base font-extrabold tracking-tight text-[#102a4c]">
					Bayar manual (transfer bank)
				</h3>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Transfer nominal unik berikut ke salah satu rekening di bawah, lalu unggah
				bukti transfer. Nominal unik ini dipakai sistem untuk verifikasi otomatis
				— pastikan jumlah transfer sama persis.
			</p>

			<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
				Nominal yang harus ditransfer
				</p>
				{!variantId ? (
					<p className="mt-1 text-sm font-semibold text-red-700">Paket belum tersedia untuk pembayaran. Silakan hubungi admin Catet Pajak.</p>
				) : formError && !expectedAmountFormatted && !amountLoading ? (
					<p className="mt-1 text-sm font-semibold text-red-700">Nominal unik belum tersedia. Muat ulang halaman untuk mencoba lagi.</p>
				) : amountLoading || !expectedAmountFormatted ? (
					<p className="mt-1 flex items-center gap-2 text-lg font-extrabold text-foreground">
						<Loader2 className="size-4 animate-spin" /> Menyiapkan nominal unik…
					</p>
				) : (
					<p className="mt-1 text-2xl font-extrabold tracking-tight text-[#102a4c]">
						{expectedAmountFormatted}
					</p>
				)}
				<p className="mt-1 text-xs text-muted-foreground">
					Harga paket {amountFormatted} + kode unik tiga digit untuk verifikasi otomatis.
				</p>
			</div>

			{banksLoading ? (
				<p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat rekening tujuan…
				</p>
			) : bankAccounts.length === 0 ? (
				<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
					Belum ada rekening bank aktif yang dikonfigurasi. Silakan hubungi admin Catet Pajak
					untuk informasi rekening tujuan transfer.
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
							Nama <span className="text-red-500">*</span>
						</span>
						<input
							value={payerName}
							onChange={event => setPayerName(event.target.value)}
							placeholder="Nama pemilik rekening pengirim"
							className={fieldClass}
							maxLength={120}
						/>
						{errors.payerName ? (
							<span className="text-xs font-medium text-red-600">{errors.payerName}</span>
						) : null}
					</label>
					<label className="flex flex-col gap-1.5">
						<span className={labelClass}>
							Email <span className="text-red-500">*</span>
						</span>
						<input
							type="email"
							value={payerEmail}
							onChange={event => setPayerEmail(event.target.value)}
							placeholder="email@anda.com"
							className={fieldClass}
							maxLength={160}
						/>
						{errors.payerEmail ? (
							<span className="text-xs font-medium text-red-600">{errors.payerEmail}</span>
						) : null}
					</label>
				</div>

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
					disabled={sending || verifying}
					className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-6 text-[15px] font-semibold text-emerald-700 shadow-soft-sm transition hover:bg-emerald-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
				>
					{sending || verifying ? (
						<Loader2 className="size-4 animate-spin" strokeWidth={2} />
					) : (
						<Upload className="size-4" strokeWidth={1.75} />
					)}
					{verifying ? 'Memverifikasi bukti…' : sending ? 'Mengirim…' : 'Kirim bukti pembayaran'}
				</button>
			</form>
		</div>
	);
}
