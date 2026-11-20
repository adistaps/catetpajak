import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, type Account, type Company } from '@/lib/accounting';
import {
	REIMBURSEMENT_STATUS_LABELS,
	appendStatusHistory,
	proofUrl,
	type Reimbursement,
} from '@/lib/reimbursements';
import type { Transaction } from '@/lib/transactions';

interface ReimbursementProcessDialogProps {
	transaction: Transaction | null;
	company: Company;
	accounts: Account[];
	onOpenChange: (open: boolean) => void;
	onDone: () => void;
}

function isCashAccount(account: Account): boolean {
	return account.type === 'aset' && /kas|bank/i.test(account.name);
}

export function ReimbursementProcessDialog({
	transaction,
	company,
	accounts,
	onOpenChange,
	onDone,
}: ReimbursementProcessDialogProps) {
	const detail = transaction?.expense_detail ?? {};
	const isReimbursement = detail?.kind === 'reimbursement';
	const open = Boolean(transaction) && isReimbursement;

	const bebanDefault = accounts.find(a => a.type === 'beban');
	const cashDefault =
		accounts.find(a => a.code === '102') ??
		accounts.find(a => a.code === '101') ??
		accounts.find(isCashAccount);

	const [debitAccount, setDebitAccount] = useState('');
	const [creditAccount, setCreditAccount] = useState('');
	const [saving, setSaving] = useState(false);
	const [mode, setMode] = useState<'idle' | 'process' | 'reject'>('idle');
	const [reimbursement, setReimbursement] = useState<Reimbursement | null>(null);

	useEffect(() => {
		if (transaction && detail.reimbursementId) {
			setDebitAccount(bebanDefault?.id ?? '');
			setCreditAccount(cashDefault?.id ?? '');
			setMode('process');
			pb.collection('reimbursements')
				.getOne<Reimbursement>(detail.reimbursementId, {
					expand: 'employee',
					requestKey: `reimb-process-load-${detail.reimbursementId}`,
				})
				.then(setReimbursement)
				.catch(() => setReimbursement(null));
		} else {
			setReimbursement(null);
			setMode('idle');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transaction?.id]);

	if (!transaction || !isReimbursement) return null;

	const cashAccounts = accounts.filter(isCashAccount);
	const amount = transaction.amount || 0;

	const process = async () => {
		if (!debitAccount) {
			toast.error('Pilih akun debit (beban/pengeluaran).');
			return;
		}
		if (!creditAccount) {
			toast.error('Pilih akun kas/bank pembayaran.');
			return;
		}
		if (debitAccount === creditAccount) {
			toast.error('Akun debit dan kredit tidak boleh sama.');
			return;
		}
		setSaving(true);
		try {
			// Cegah pembukuan ganda: transaksi yang sudah ditandai dibukukan, sudah
			// punya baris jurnal, atau reimbursement yang sudah dibayar tidak boleh
			// dijurnal lagi.
			if (detail.booked) {
				setSaving(false);
				toast.error('Reimbursement ini sudah dibukukan. Tidak ada jurnal baru yang dicatat.');
				return;
			}
			if (detail.reimbursementId) {
				const linked = await pb
					.collection('reimbursements')
					.getOne<Reimbursement>(detail.reimbursementId, {
						requestKey: `reimb-process-check-${detail.reimbursementId}`,
					});
				if (linked.status === 'paid') {
					setSaving(false);
					toast.error(
						`Reimbursement ini sudah ${REIMBURSEMENT_STATUS_LABELS[linked.status]} (dibayar). Tidak ada jurnal baru yang dicatat.`,
					);
					return;
				}
			}
			const existingEntries = await pb
				.collection('entries')
				.getFullList({
					filter: pb.filter('transaction = {:tx}', { tx: transaction.id }),
					fields: 'id',
				})
				.catch(() => [] as { id: string }[]);
			if (existingEntries.length > 0) {
				setSaving(false);
				await pb
					.collection('transactions')
					.update(transaction.id, { expense_detail: { ...detail, booked: true } })
					.catch(() => undefined);
				toast.error('Reimbursement ini sudah memiliki jurnal. Tidak ada jurnal baru yang dicatat.');
				onOpenChange(false);
				onDone();
				return;
			}
			const ownerId = pb.authStore.record?.id ?? '';
			const today = new Date().toISOString().slice(0, 10);
			const base = {
				company: company.id,
				date: transaction.date,
				description: transaction.description,
				owner: ownerId,
				transaction: transaction.id,
			};
			// Debit akun beban/pengeluaran, Kredit Kas/Bank — sekali saja.
			await pb.collection('entries').create(
				{ ...base, account: debitAccount, debit: amount, credit: 0 },
				{ requestKey: `reimb-tx-debit-${transaction.id}` },
			);
			await pb.collection('entries').create(
				{ ...base, account: creditAccount, debit: 0, credit: amount },
				{ requestKey: `reimb-tx-credit-${transaction.id}` },
			);
			// Tandai transaksi sudah dibukukan & simpan akun yang dipakai.
			await pb.collection('transactions').update(transaction.id, {
				debit_account: debitAccount,
				credit_account: creditAccount,
				expense_detail: { ...detail, booked: true },
			});
			// Tandai reimbursement Dibayar HANYA setelah jurnal berhasil dicatat.
			if (detail.reimbursementId) {
				const current = await pb
					.collection('reimbursements')
					.getOne<Reimbursement>(detail.reimbursementId, {
						requestKey: `reimb-mark-paid-${detail.reimbursementId}`,
					});
				await pb.collection('reimbursements').update(detail.reimbursementId, {
					status: 'paid',
					paid_date: today,
					processed_by: ownerId,
					processed_date: today,
					status_history: appendStatusHistory(current.status_history, {
						status: 'paid',
						at: new Date().toISOString(),
						by: ownerId,
						note: 'Pembayaran diproses & jurnal dicatat',
					}),
				});
			}
			toast.success('Reimbursement dibayar dan jurnal dicatat. Status: Dibayar.');
			onOpenChange(false);
			onDone();
		} catch {
			toast.error('Gagal memproses reimbursement ke pembukuan.');
		} finally {
			setSaving(false);
		}
	};

	const reject = async () => {
		if (
			!window.confirm(
				'Tolak pengajuan reimbursement ini? Reimbursement dibatalkan dan transaksi reimbursement dihapus dari Biaya.',
			)
		) {
			return;
		}
		setSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			if (detail.reimbursementId) {
				const current = await pb
					.collection('reimbursements')
					.getOne<Reimbursement>(detail.reimbursementId, {
						requestKey: `reimb-reject-load-${detail.reimbursementId}`,
					});
				await pb.collection('reimbursements').update(detail.reimbursementId, {
					status: 'rejected',
					processed_by: ownerId,
					processed_date: new Date().toISOString().slice(0, 10),
					status_history: appendStatusHistory(current.status_history, {
						status: 'rejected',
						at: new Date().toISOString(),
						by: ownerId,
						note: 'Ditolak saat pemrosesan pembukuan',
					}),
				});
			}
			// Transaksi belum dibukukan (tanpa jurnal) — aman dihapus.
			await pb.collection('transactions').delete(transaction.id);
			toast.success('Pengajuan reimbursement ditolak.');
			onOpenChange(false);
			onDone();
		} catch {
			toast.error('Gagal menolak pengajuan.');
		} finally {
			setSaving(false);
		}
	};

	const proof = reimbursement ? proofUrl(reimbursement) : '';

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Proses Reimbursement</DialogTitle>
					<DialogDescription>
						Tinjau pengajuan reimbursement karyawan, lalu catat pembayaran ke pembukuan.
						Pembayaran dicatat sekali: Debit Beban, Kredit Kas/Bank.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Karyawan</span>
						<span className="font-semibold">{detail.employeeName ?? '—'}</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Tanggal</span>
						<span className="font-semibold">{formatDate(transaction.date)}</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Nominal</span>
						<span className="font-semibold">{formatRupiah(amount)}</span>
					</div>
					{reimbursement?.description ? (
						<p className="border-t border-border pt-2 text-xs text-muted-foreground">
							{reimbursement.description}
						</p>
					) : null}
					{proof ? (
						<a
							href={proof}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
						>
							Lihat bukti struk/foto
						</a>
					) : null}
				</div>

				{mode === 'process' ? (
					<div className="space-y-3">
						<div className="space-y-1.5">
							<label htmlFor="reimb-debit" className="text-xs font-semibold">
								Akun Debit (Beban/Pengeluaran)
							</label>
							<select
								id="reimb-debit"
								value={debitAccount}
								onChange={e => setDebitAccount(e.target.value)}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								<option value="">Pilih akun debit</option>
								{accounts.map(a => (
									<option key={a.id} value={a.id}>
										{a.code} — {a.name}
									</option>
								))}
							</select>
							{!bebanDefault ? (
								<p className="text-[11px] text-amber-600">
									Belum ada akun beban. Pilih akun beban yang sesuai atau tambahkan akun
									beban di Bagan Akun.
								</p>
							) : null}
						</div>
						<div className="space-y-1.5">
							<label htmlFor="reimb-credit" className="text-xs font-semibold">
								Akun Kredit (Kas/Bank)
							</label>
							<select
								id="reimb-credit"
								value={creditAccount}
								onChange={e => setCreditAccount(e.target.value)}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
							>
								<option value="">Pilih akun kas/bank</option>
								{cashAccounts.map(a => (
									<option key={a.id} value={a.id}>
										{a.code} — {a.name}
									</option>
								))}
							</select>
							{cashAccounts.length === 0 ? (
								<p className="text-[11px] text-amber-600">
									Belum ada akun kas/bank. Tambahkan akun Kas (101) atau Bank (102).
								</p>
							) : null}
						</div>
					</div>
				) : null}

				<DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
					<button
						type="button"
						onClick={() => setMode(m => (m === 'process' ? 'reject' : 'process'))}
						className="text-xs font-semibold text-destructive hover:underline"
					>
						{mode === 'process' ? 'Tolak pengajuan…' : 'Kembali'}
					</button>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary"
						>
							Batal
						</button>
						{mode === 'process' ? (
							<button
								type="button"
								onClick={process}
								disabled={saving}
								className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
							>
								{saving ? 'Memproses…' : 'Proses & Catat Jurnal'}
							</button>
						) : (
							<button
								type="button"
								onClick={reject}
								disabled={saving}
								className="rounded-full bg-destructive px-5 py-2 text-sm font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
							>
								{saving ? 'Memproses…' : 'Tolak & Batalkan'}
							</button>
						)}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
