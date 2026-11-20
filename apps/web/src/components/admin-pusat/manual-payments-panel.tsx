import { useCallback, useEffect, useState } from 'react';
import {
	BadgeCheck,
	Ban,
	Clock,
	Loader2,
	RefreshCw,
	Sparkles,
	Wallet,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	fetchCentralAdminManualPayments,
	rejectCentralAdminManualPayment,
	verifyCentralAdminManualPayment,
	type ManualPaymentSummary,
} from '@/lib/central-admin';

const STATUS_LABELS: Record<string, string> = {
	menunggu_verifikasi: 'Menunggu verifikasi',
	aktif: 'Aktif',
	ditolak: 'Ditolak',
	kedaluwarsa: 'Kedaluwarsa',
};

function statusClass(status: string): string {
	if (status === 'menunggu_verifikasi') return 'bg-amber-50 text-amber-700 border-amber-200';
	if (status === 'aktif') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
	if (status === 'ditolak') return 'bg-red-50 text-red-700 border-red-200';
	return 'bg-slate-50 text-slate-600 border-slate-200';
}

function formatDate(iso: string): string {
	if (!iso) return '-';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '-';
	return date.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

/**
 * Panel verifikasi pembayaran manual Pencari Akuntan untuk Admin Pusat.
 * Admin dapat melihat bukti transfer, mengaktifkan (memberi akses 30 hari),
 * atau menolak pembayaran.
 */
export function ManualPaymentsPanel() {
	const [payments, setPayments] = useState<ManualPaymentSummary[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [busyId, setBusyId] = useState<string | null>(null);
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [proofUrl, setProofUrl] = useState<string | null>(null);

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		try {
			const data = await fetchCentralAdminManualPayments();
			setPayments(data);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				setError(err.message);
			} else {
				setError('Gagal memuat pembayaran manual. Periksa koneksi lalu coba lagi.');
			}
			setPayments([]);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleVerify(id: string) {
		setBusyId(id);
		try {
			const { payment } = await verifyCentralAdminManualPayment(id);
			setPayments(prev => prev?.map(item => (item.id === id ? payment : item)) ?? null);
			toast.success('Pembayaran diverifikasi. Status langganan dan akses paket diperbarui.');
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal memverifikasi pembayaran.',
			);
		} finally {
			setBusyId(null);
		}
	}

	function startReject(id: string) {
		setRejectingId(id);
		setRejectReason('');
	}

	async function handleReject() {
		if (!rejectingId) return;
		setBusyId(rejectingId);
		try {
			const { payment } = await rejectCentralAdminManualPayment(rejectingId, rejectReason);
			setPayments(prev => prev?.map(item => (item.id === payment.id ? payment : item)) ?? null);
			toast.success('Pembayaran ditolak.');
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal menolak pembayaran.',
			);
		} finally {
			setBusyId(null);
			setRejectingId(null);
			setRejectReason('');
		}
	}

	const pendingCount = payments?.filter(item => item.status === 'menunggu_verifikasi').length ?? 0;

	return (
		<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
						<Wallet className="size-5 text-primary" strokeWidth={2} />
						Verifikasi Pembayaran Manual
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Verifikasi pembayaran manual Pencari Akuntan (Rp49.000/bulan) dan aplikasi (Pro/Enterprise).
					</p>
				</div>
				<div className="flex items-center gap-2">
					{pendingCount > 0 ? (
						<span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
							<Clock className="size-3.5" /> {pendingCount} menunggu
						</span>
					) : null}
					<button
						type="button"
						onClick={() => void load(true)}
						disabled={isRefreshing}
						className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
					>
						{isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
						Muat ulang
					</button>
				</div>
			</div>

			{error ? (
				<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
					{error}
				</p>
			) : null}

			{isLoading ? (
				<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat pembayaran manual…
				</div>
			) : !payments || payments.length === 0 ? (
				<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
					Belum ada pembayaran manual.
				</p>
			) : (
				<div className="grid gap-3 md:grid-cols-2">
					{payments.map(payment => (
						<article
							key={payment.id}
							className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
						>
							<div className="flex flex-wrap items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="truncate text-sm font-bold text-foreground">
										{payment.seeker.name || payment.payer_name || 'Pencari Akuntan'}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{payment.seeker.email || payment.payer_email}
									</p>
									<span className="mt-1 inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
										{payment.plan_title}
									</span>
								</div>
								<span
									className={cn(
										'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
										statusClass(payment.status),
									)}
								>
									{STATUS_LABELS[payment.status] ?? payment.status}
								</span>
								{payment.auto_verified ? (
									<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
										<Sparkles className="size-3" strokeWidth={2} /> Otomatis
									</span>
								) : null}
							</div>

							<dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
								<div>
									<dt className="font-semibold text-muted-foreground">Nominal unik</dt>
									<dd className="font-semibold text-foreground">{payment.expected_amount_formatted || payment.amount_formatted}</dd>
								</div>
								<div>
									<dt className="font-semibold text-muted-foreground">Tgl. bayar</dt>
									<dd className="font-semibold text-foreground">{formatDate(payment.payment_date)}</dd>
								</div>
								<div>
									<dt className="font-semibold text-muted-foreground">Periode aktif</dt>
									<dd className="font-semibold text-foreground">
										{payment.status === 'aktif'
											? `${formatDate(payment.period_start)} — ${formatDate(payment.period_end)}`
											: '-'}
									</dd>
								</div>
								<div>
									<dt className="font-semibold text-muted-foreground">Diverifikasi oleh</dt>
									<dd className="font-semibold text-foreground">
										{payment.verifier ? payment.verifier.email : '-'}
									</dd>
								</div>
							</dl>

							{payment.notes ? (
								<p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
									{payment.notes}
								</p>
							) : null}

							{payment.verification_notes ? (
								<p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-700">
									<span className="font-semibold">Hasil verifikasi otomatis:</span>{' '}
									{payment.verification_notes}
								</p>
							) : null}

							{payment.status === 'ditolak' && payment.rejection_reason ? (
								<p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
									Alasan penolakan: {payment.rejection_reason}
								</p>
							) : null}

							{payment.proof_url ? (
								<button
									type="button"
									onClick={() => setProofUrl(payment.proof_url)}
									className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-border bg-secondary px-3.5 text-xs font-bold transition-colors hover:text-primary"
								>
									Lihat bukti pembayaran
								</button>
							) : null}

							{payment.status === 'menunggu_verifikasi' ? (
								<div className="flex flex-wrap items-center gap-2">
									<button
										type="button"
										onClick={() => void handleVerify(payment.id)}
										disabled={busyId === payment.id}
										className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
									>
										{busyId === payment.id ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />}
										Verifikasi & aktifkan
									</button>
									<button
										type="button"
										onClick={() => startReject(payment.id)}
										disabled={busyId === payment.id}
										className="inline-flex h-9 items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
									>
										<Ban className="size-3.5" /> Tolak
									</button>
								</div>
							) : null}

							{rejectingId === payment.id ? (
								<div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-3">
									<label className="flex flex-col gap-1">
										<span className="text-xs font-semibold text-foreground">Alasan penolakan</span>
										<textarea
											value={rejectReason}
											onChange={event => setRejectReason(event.target.value)}
											rows={2}
											maxLength={500}
											placeholder="cth. bukti transfer tidak terbaca / jumlah tidak sesuai"
											className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-2"
										/>
									</label>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => void handleReject()}
											disabled={busyId === payment.id}
											className="inline-flex h-8 items-center rounded-full bg-red-600 px-3.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
										>
											{busyId === payment.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
											Konfirmasi tolak
										</button>
										<button
											type="button"
											onClick={() => {
												setRejectingId(null);
												setRejectReason('');
											}}
											className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3.5 text-xs font-semibold"
										>
											Batal
										</button>
									</div>
								</div>
							) : null}
						</article>
					))}
				</div>
			)}

			{proofUrl ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
					onClick={() => setProofUrl(null)}
				>
					<button
						type="button"
						className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
						onClick={() => setProofUrl(null)}
						aria-label="Tutup"
					>
						<X className="size-5" />
					</button>
					{proofUrl.toLowerCase().endsWith('.pdf') ? (
						<iframe
							src={proofUrl}
							title="Bukti pembayaran"
							className="max-h-[90vh] max-w-[90vw] rounded-xl bg-white"
							onClick={event => event.stopPropagation()}
						/>
					) : (
						<img
							src={proofUrl}
							alt="Bukti pembayaran"
							className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
							onClick={event => event.stopPropagation()}
						/>
					)}
				</div>
			) : null}
		</section>
	);
}
