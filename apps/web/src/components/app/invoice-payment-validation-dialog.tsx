import { useState } from 'react';
import { BadgeCheck, Ban, Loader2, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/accounting';
import { computePaymentTerms } from '@/lib/payment-terms';
import { computeLatePenalty, type LatePenaltySettings } from '@/lib/late-penalty-settings';
import {
	INVOICE_PAYMENT_STATUS_LABELS,
	approvePendingPayment,
	rejectPendingPayment,
	type CompanyParentPayment,
} from '@/lib/invoice-payments';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from '@/components/ui/dialog';

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

interface InvoicePaymentValidationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Invoice yang sedang divalidasi. */
	invoice: {
		id: string;
		number: string;
		total: number;
		paid_amount: number;
		partner?: string;
		date?: string;
		payment_terms?: string;
	} | null;
	/** Pengajuan pembayaran transfer manual untuk invoice ini. */
	payments: CompanyParentPayment[];
	/** Pengaturan denda keterlambatan per company (untuk menampilkan denda). */
	penaltySettings?: LatePenaltySettings | null;
	/** Rekening bank perusahaan aktif untuk konfirmasi tujuan transfer customer. */
	companyBank?: { bank_name?: string; account_holder?: string; account_number?: string } | null;
	/** Pengguna berwenang (pemilik/admin/akuntan/finance atau punya izin penjualan/kas_bank). */
	canApprove: boolean;
	/** Dipanggil setelah pembayaran disetujui agar daftar invoice memuat ulang. */
	onPaymentApplied: () => void;
}

/**
 * Dialog validasi pembayaran transfer manual yang diajukan customer (Parent)
 * untuk SATU invoice. Pengguna berwenang memeriksa bukti transfer dan
 * kecocokan nominal, lalu menyetujui (menerapkan ke invoice) atau menolak
 * dengan alasan. Mencegah persetujuan ganda dan memperbarui status lokal.
 */
export function InvoicePaymentValidationDialog({
	open,
	onOpenChange,
	invoice,
	payments,
	penaltySettings,
	companyBank,
	canApprove,
	onPaymentApplied,
}: InvoicePaymentValidationDialogProps) {
	const [busyId, setBusyId] = useState<string | null>(null);
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [proofUrl, setProofUrl] = useState<string | null>(null);
	const [localPayments, setLocalPayments] = useState<CompanyParentPayment[] | null>(null);

	const list = localPayments ?? payments;

	const close = () => {
		setRejectingId(null);
		setRejectReason('');
		setProofUrl(null);
		setLocalPayments(null);
		onOpenChange(false);
	};

	async function handleVerify(id: string) {
		setBusyId(id);
		try {
			const target = list.find((p) => p.id === id);
			const updated = await approvePendingPayment(target ?? { id, source: 'parent' } as CompanyParentPayment);
			setLocalPayments(prev => (prev ?? payments).map(item => (item.id === id ? updated : item)));
			toast.success('Pembayaran disetujui. Invoice dan riwayat pembayaran diperbarui.');
			onPaymentApplied();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Gagal menyetujui pembayaran.');
		} finally {
			setBusyId(null);
		}
	}

	function startReject(id: string) {
		setRejectingId(id);
		setRejectReason('');
	}

	async function handleReject(id: string) {
		setBusyId(id);
		try {
			const target = list.find((p) => p.id === id);
			const updated = await rejectPendingPayment(target ?? { id, source: 'parent' } as CompanyParentPayment, rejectReason);
			setLocalPayments(prev => (prev ?? payments).map(item => (item.id === updated.id ? updated : item)));
			toast.success('Pembayaran ditolak.');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Gagal menolak pembayaran.');
		} finally {
			setBusyId(null);
			setRejectingId(null);
			setRejectReason('');
		}
	}

	if (!invoice) return null;

	const invoiceTotal = Number(invoice.total) || 0;
	const invoicePaid = Number(invoice.paid_amount) || 0;
	const penaltyCalc = computeLatePenalty(
		penaltySettings ?? null,
		{
			total: invoiceTotal,
			payment_terms: invoice.payment_terms,
			date: invoice.date || '',
			paid_amount: invoicePaid,
		},
	);
	const penaltyAmount = penaltyCalc?.penalty ?? 0;
	const settlementTotal = penaltyCalc ? penaltyCalc.totalWithPenalty : invoiceTotal;
	const remaining = Math.max(0, settlementTotal - invoicePaid);
	const termsCalc = computePaymentTerms(invoice.payment_terms, invoice.date || '', invoiceTotal);

	return (
		<Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
			<DialogContent className="max-w-2xl gap-4 overflow-y-auto p-5 sm:p-6">
				<DialogHeader className="space-y-1">
					<DialogTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
						<Wallet className="size-5 text-primary" strokeWidth={2} />
						Validasi Pembayaran Customer
					</DialogTitle>
					<DialogDescription className="text-sm text-muted-foreground">
						Tinjau bukti transfer yang dikirim customer, lalu setujui (terapkan ke invoice) atau tolak.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-xs">
					<p className="flex items-center gap-1 font-semibold text-muted-foreground">
						<Receipt className="size-3" />
						Invoice: <span className="font-bold text-foreground">{invoice.number || '—'}</span>
					</p>
					<p className="mt-1 text-muted-foreground">
						Pelanggan: <span className="font-semibold text-foreground">{invoice.partner || '—'}</span>
					</p>
					<div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1">
						<span className="text-muted-foreground">
							Total: <span className="font-bold text-foreground">{formatRupiah(invoiceTotal)}</span>
						</span>
						<span className="text-muted-foreground">
							Sudah dibayar: <span className="font-bold text-foreground">{formatRupiah(invoicePaid)}</span>
						</span>
						{penaltyAmount > 0 ? (
							<span className="text-muted-foreground">
								Terlambat {penaltyCalc?.daysOverdue ?? 0} hari · Denda: <span className="font-bold text-amber-600">{formatRupiah(penaltyAmount)}</span>
							</span>
						) : null}
						<span className="text-muted-foreground">
							{penaltyAmount > 0 ? 'Total + denda' : 'Sisa tagihan'}:{' '}
							<span className="font-bold text-primary">{formatRupiah(remaining)}</span>
						</span>
					</div>
				</div>

				{termsCalc ? (
					<div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs">
						<p className="flex items-center gap-1 font-bold text-emerald-700">
							Syarat pembayaran: {invoice.payment_terms}
						</p>
						<div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-emerald-800">
							<span>
								Batas diskon: <span className="font-bold">{formatDate(termsCalc.discountDeadline)}</span>
							</span>
							<span>
								Diskon: <span className="font-bold">{formatRupiah(termsCalc.discountAmount)}</span>
							</span>
							<span>
								Bayar jika memenuhi syarat: <span className="font-bold">{formatRupiah(termsCalc.payableWithDiscount)}</span>
							</span>
							<span>
								Jatuh tempo: <span className="font-bold">{formatDate(termsCalc.dueDate)}</span>
							</span>
						</div>
					</div>
				) : null}

				{companyBank && companyBank.bank_name && companyBank.account_number ? (
					<div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs">
						<p className="flex items-center gap-1 font-bold text-emerald-700">
							<Wallet className="size-3.5" /> Rekening tujuan perusahaan
						</p>
						<div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-emerald-800">
							<span>
								Bank: <span className="font-bold">{companyBank.bank_name}</span>
							</span>
							<span>
								No. rekening: <span className="font-bold">{companyBank.account_number}</span>
							</span>
							<span>
								a.n. <span className="font-bold">{companyBank.account_holder || '—'}</span>
							</span>
						</div>
						<p className="mt-1 text-[11px] text-emerald-700">
							Pastikan customer mentransfer ke rekening perusahaan di atas.
						</p>
					</div>
				) : (
					<p className="rounded-xl border border-dashed border-border bg-background px-4 py-2 text-xs text-muted-foreground">
						Informasi rekening perusahaan belum tersedia. Tambahkan rekening di menu Perusahaan.
					</p>
				)}

				{list.length === 0 ? (
					<p className="border border-dashed border-border bg-background px-5 py-8 text-center text-sm text-muted-foreground">
						Tidak ada pengajuan pembayaran untuk invoice ini.
					</p>
				) : (
					<div className="flex flex-col gap-3">
						{list.map(payment => {
							const customerName = payment.parent.name || payment.payer_name || '—';
							const studentName = payment.student.student_name || '—';
							const paymentTermsCalc = computePaymentTerms(invoice.payment_terms, invoice.date || '', invoiceTotal, payment.payment_date || '');
							const discountApplies = Boolean(paymentTermsCalc?.discountActive);
							const expectedAmount = discountApplies ? (paymentTermsCalc?.payableWithDiscount ?? remaining) : remaining;
							const amountMatches =
								Math.abs(payment.amount - expectedAmount) <= 1 || (discountApplies ? payment.amount >= (paymentTermsCalc?.payableWithDiscount ?? 0) - 1 && payment.amount <= invoiceTotal + 1 : payment.amount <= settlementTotal + 1);
							return (
								<article
									key={payment.id}
									className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate text-sm font-bold text-foreground">{customerName}</p>
											<p className="text-xs text-muted-foreground">
												Siswa: <span className="font-semibold text-foreground">{studentName}</span>
											</p>
										</div>
										<span
											className={cn(
												'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
												statusClass(payment.status),
											)}
										>
											{INVOICE_PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
										</span>
									</div>

									<dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
										<div>
											<dt className="font-semibold text-muted-foreground">Jumlah dibayar</dt>
											<dd className="font-bold text-emerald-600">{formatRupiah(payment.amount)}</dd>
										</div>
										<div>
											<dt className="font-semibold text-muted-foreground">Nominal unik transfer</dt>
											<dd className="font-bold text-foreground">
												{payment.expected_amount_formatted || (payment.expected_amount ? formatRupiah(payment.expected_amount) : '-')}
											</dd>
										</div>
										<div>
											<dt className="font-semibold text-muted-foreground">Bank tujuan</dt>
											<dd className="font-semibold text-foreground">{payment.bank || '-'}</dd>
										</div>
										<div>
											<dt className="font-semibold text-muted-foreground">Tgl. bayar</dt>
											<dd className="font-semibold text-foreground">{formatDate(payment.payment_date)}</dd>
										</div>
										<div>
											<dt className="font-semibold text-muted-foreground">Sisa tagihan</dt>
											<dd className="font-semibold text-foreground">{formatRupiah(remaining)}</dd>
										</div>
									</dl>

									{payment.auto_verified ? (
										<p className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
											<BadgeCheck className="size-3" /> Diverifikasi otomatis
										</p>
									) : null}

									{payment.verification_notes ? (
										<p className="rounded-lg bg-secondary/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
											{payment.verification_notes}
										</p>
									) : null}

									{payment.status === 'menunggu_verifikasi' ? (
										<p
											className={cn(
												'rounded-lg px-3 py-1.5 text-[11px] font-semibold',
												amountMatches
													? 'bg-emerald-50 text-emerald-700'
													: 'bg-amber-50 text-amber-700',
											)}
										>
											{amountMatches
												? (discountApplies ? 'Pembayaran memenuhi syarat diskon — nominal sesuai.' : 'Jumlah pembayaran sesuai dengan sisa tagihan.')
												: 'Periksa kembali: jumlah pembayaran berbeda dengan sisa tagihan.'}
										</p>
									) : null}

									{payment.notes ? (
										<p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
											{payment.notes}
										</p>
									) : null}

									{payment.status === 'ditolak' && payment.rejection_reason ? (
										<p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
											Alasan penolakan: {payment.rejection_reason}
										</p>
									) : null}

									{payment.status === 'aktif' && payment.verifier ? (
										<p className="text-[11px] text-muted-foreground">
											Diverifikasi oleh {payment.verifier.name || payment.verifier.email || '—'}
											{payment.verified_at ? ` · ${formatDate(payment.verified_at)}` : ''}
										</p>
									) : null}

									{payment.proof_url ? (
										<button
											type="button"
											onClick={() => setProofUrl(payment.proof_url)}
											className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-border bg-secondary px-3.5 text-xs font-bold transition-colors hover:text-primary"
										>
											Lihat bukti transfer
										</button>
									) : null}

									{payment.status === 'menunggu_verifikasi' && canApprove ? (
										<div className="flex flex-wrap items-center gap-2">
											<button
												type="button"
												onClick={() => void handleVerify(payment.id)}
												disabled={busyId === payment.id}
												className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
											>
												{busyId === payment.id ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />}
												Setujui & terapkan
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
													onClick={() => void handleReject(payment.id)}
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
							);
						})}
					</div>
				)}

				{proofUrl ? (
					<div
						className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
						onClick={() => setProofUrl(null)}
					>
						<button
							type="button"
							className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
							onClick={() => setProofUrl(null)}
							aria-label="Tutup"
						>
							✕
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
			</DialogContent>
		</Dialog>
	);
}
