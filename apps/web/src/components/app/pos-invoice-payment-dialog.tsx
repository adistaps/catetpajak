import { useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, formatDate, todayIso, type Account, type Company } from '@/lib/accounting';
import { buildDocumentNumber, type BusinessDocument } from '@/lib/documents';
import type { Transaction } from '@/lib/transactions';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/components/ui/dialog';

interface PosInvoicePaymentDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Invoice yang belum lunas yang akan dibayar. */
	invoice: BusinessDocument | null;
	/** Perusahaan aktif. */
	company: Company | null;
	/** Daftar akun kas/bank yang tersedia sebagai metode pembayaran. */
	paymentAccounts: Account[];
	/** Jumlah dokumen pembayaran yang sudah ada (untuk nomor urut). */
	existingPaymentCount: number;
	/** Dipanggil setelah pembayaran berhasil tercatat. */
	onPaid: () => void;
}

/**
 * Dialog pencatatan pembayaran invoice belum lunas langsung dari POS.
 *
 * Membuat dokumen tahap "pembayaran" (tanpa item barang), memposting jurnal
 * (debit kas/bank, kredit akun piutang invoice), dan memperbarui paid_amount
 * invoice sumber. Tidak membuat transaksi penjualan baru dan tidak mengurangi
 * stok.
 */
export function PosInvoicePaymentDialog({
	open,
	onOpenChange,
	invoice,
	company,
	paymentAccounts,
	existingPaymentCount,
	onPaid,
}: PosInvoicePaymentDialogProps) {
	const [amount, setAmount] = useState('');
	const [paymentAccountId, setPaymentAccountId] = useState('');
	const [date, setDate] = useState(todayIso());
	const [notes, setNotes] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState('');

	const total = Number(invoice?.total) || 0;
	const paid = Number(invoice?.paid_amount) || 0;
	const remaining = Math.max(0, total - paid);
	const creditAccountId = invoice?.debit_account || '';

	useEffect(() => {
		if (open) {
			setAmount(remaining > 0 ? String(remaining) : '');
			setPaymentAccountId(paymentAccounts[0]?.id ?? '');
			setDate(todayIso());
			setNotes('');
			setError('');
			setIsSaving(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, invoice?.id]);

	const paymentAmount = useMemo(() => {
		const value = Number(amount) || 0;
		return Math.min(value, remaining);
	}, [amount, remaining]);

	const creditAccount = useMemo(
		() => paymentAccounts.find(a => a.id === creditAccountId) ?? null,
		// paymentAccounts mungkin tidak memuat akun piutang; ini hanya untuk label.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[creditAccountId, paymentAccounts],
	);

	if (!invoice || !company) return null;

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		if (!creditAccountId) {
			setError('Invoice tidak memiliki akun piutang (debit). Tidak dapat mencatat pembayaran.');
			return;
		}
		if (!paymentAccountId) {
			setError('Pilih metode pembayaran (akun kas/bank).');
			return;
		}
		if (paymentAccountId === creditAccountId) {
			setError('Akun pembayaran dan akun piutang tidak boleh sama.');
			return;
		}
		const value = Number(amount) || 0;
		if (value <= 0) {
			setError('Nominal pembayaran harus lebih dari 0.');
			return;
		}
		if (value > remaining) {
			setError(`Nominal melebihi sisa tagihan (${formatRupiah(remaining)}).`);
			return;
		}
		setIsSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const docNumber = buildDocumentNumber('PAY', existingPaymentCount);
			const partner = invoice.partner || invoice.expand?.contact?.name || '—';

			// 1. Buat dokumen pembayaran (tanpa item barang, tanpa pengurangan stok).
			const docPayload: Record<string, unknown> = {
				company: company.id,
				direction: 'penjualan',
				stage: 'pembayaran',
				number: docNumber,
				date,
				contact: invoice.contact || null,
				student: invoice.student || null,
				partner,
				description: notes || `Pembayaran invoice ${invoice.number || ''}`.trim(),
				items: [],
				subtotal: value,
				discount_total: 0,
				tax_total: 0,
				total: value,
				paid_amount: value,
				debit_account: paymentAccountId,
				credit_account: creditAccountId,
				source_document: invoice.id,
				status: 'confirmed',
				owner: ownerId,
			};
			const created = await pb.collection('documents').create<BusinessDocument>(docPayload);
			const docId = created.id;

			// 2. Posting jurnal: debit kas/bank, kredit akun piutang invoice.
			const txPayload: Record<string, unknown> = {
				company: company.id,
				category: 'kas_bank',
				date,
				description: `Pembayaran invoice ${invoice.number || docNumber}`,
				amount: value,
				partner,
				debit_account: paymentAccountId,
				credit_account: creditAccountId,
				contact: invoice.contact || null,
				owner: ownerId,
			};
			if (invoice.student) txPayload.student = invoice.student;
			const tx = await pb.collection('transactions').create<Transaction>(txPayload);

			const baseEntry = {
				company: company.id,
				date,
				description: `Pembayaran invoice ${invoice.number || docNumber}`,
				owner: ownerId,
				transaction: tx.id,
			};
			await pb.collection('entries').create(
				{ ...baseEntry, account: paymentAccountId, debit: value, credit: 0 },
				{ requestKey: `pos-pay-debit-${docId}` },
			);
			await pb.collection('entries').create(
				{ ...baseEntry, account: creditAccountId, debit: 0, credit: value },
				{ requestKey: `pos-pay-credit-${docId}` },
			);
			await pb.collection('documents').update(docId, { transaction: tx.id });

			// 3. Perbarui paid_amount invoice sumber (gabung dengan yang sudah
			//    dibayar, jangan melebihi total).
			try {
				const fresh = await pb.collection('documents').getOne<BusinessDocument>(invoice.id);
				const currentPaid = Number(fresh.paid_amount) || 0;
				const newPaid = Math.min(total, currentPaid + value);
				await pb.collection('documents').update(invoice.id, { paid_amount: newPaid });
			} catch {
				/* invoice gagal diperbarui — dokumen pembayaran tetap tersimpan */
			}

			toast.success('Pembayaran berhasil dicatat.');
			onPaid();
			onOpenChange(false);
		} catch {
			setError('Gagal mencatat pembayaran. Periksa koneksi lalu coba lagi.');
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Banknote className="size-5 text-primary" /> Catat Pembayaran Invoice
					</DialogTitle>
					<DialogDescription>
						Catat pembayaran penuh atau sebagian untuk invoice yang belum lunas.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-xl bg-secondary px-4 py-3 text-xs">
					<div className="flex items-center gap-1.5 font-bold">
						<Receipt className="size-3.5 text-primary" /> {invoice.number || '—'}
					</div>
					<div className="mt-1.5 flex flex-col gap-1 text-muted-foreground">
						<div className="flex justify-between">
							<span>Pelanggan</span>
							<span className="font-semibold text-foreground">
								{invoice.expand?.contact?.name || invoice.partner || '—'}
							</span>
						</div>
						<div className="flex justify-between">
							<span>Tanggal invoice</span>
							<span className="font-semibold text-foreground">{formatDate(invoice.date)}</span>
						</div>
						<div className="flex justify-between">
							<span>Total invoice</span>
							<span className="font-semibold text-foreground">{formatRupiah(total)}</span>
						</div>
						<div className="flex justify-between">
							<span>Sudah dibayar</span>
							<span className="font-semibold text-foreground">{formatRupiah(paid)}</span>
						</div>
						<div className="mt-1 flex justify-between border-t border-border pt-1">
							<span className="font-bold">Sisa tagihan</span>
							<span className="font-extrabold text-primary">{formatRupiah(remaining)}</span>
						</div>
					</div>
				</div>

				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="pos-pay-amount" className="text-xs font-semibold">
							Nominal Pembayaran (Rp)
						</label>
						<input
							id="pos-pay-amount"
							type="number"
							min="1"
							max={remaining}
							required
							value={amount}
							onChange={e => setAmount(e.target.value)}
							placeholder={String(remaining)}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
						<div className="flex flex-wrap gap-1.5">
							<button
								type="button"
								onClick={() => setAmount(String(remaining))}
								className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								Lunas penuh
							</button>
							<button
								type="button"
								onClick={() => setAmount(String(Math.round(remaining / 2)))}
								className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								Setengah
							</button>
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<label htmlFor="pos-pay-method" className="text-xs font-semibold">
							Metode Pembayaran
						</label>
						<select
							id="pos-pay-method"
							value={paymentAccountId}
							onChange={e => setPaymentAccountId(e.target.value)}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						>
							{paymentAccounts.length === 0 ? (
								<option value="">Belum ada akun kas</option>
							) : null}
							{paymentAccounts.map(a => (
								<option key={a.id} value={a.id}>
									{a.code} — {a.name}
								</option>
							))}
						</select>
					</div>

					<div className="flex flex-col gap-2">
						<label htmlFor="pos-pay-date" className="text-xs font-semibold">
							Tanggal Pembayaran
						</label>
						<input
							id="pos-pay-date"
							type="date"
							required
							value={date}
							onChange={e => setDate(e.target.value)}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<label htmlFor="pos-pay-notes" className="text-xs font-semibold">
							Keterangan
						</label>
						<input
							id="pos-pay-notes"
							value={notes}
							onChange={e => setNotes(e.target.value)}
							placeholder="Catatan pembayaran (opsional)"
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>

					{creditAccount ? (
						<p className="text-[11px] text-muted-foreground">
							Akun piutang (kredit): <span className="font-semibold">{creditAccount.code} — {creditAccount.name}</span>
						</p>
					) : null}

					{error ? (
						<p className="text-xs font-semibold text-destructive">{error}</p>
					) : null}

					<DialogFooter>
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-full border border-border px-5 py-2.5 text-sm font-bold transition-colors hover:bg-accent"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={isSaving || remaining <= 0}
							className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{isSaving ? (
								<>
									<Loader2 className="size-4 animate-spin" /> Menyimpan…
								</>
							) : (
								<>
									<Banknote className="size-4" /> Bayar {formatRupiah(paymentAmount)}
								</>
							)}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
