import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, HandCoins, ReceiptText, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, todayIso, type Account, type Company } from '@/lib/accounting';
import {
	REIMBURSEMENT_STATUS_LABELS,
	appendStatusHistory,
	ensureReimbursementTransaction,
	proofUrl,
	type Reimbursement,
	type ReimbursementStatus,
} from '@/lib/reimbursements';
import type { Transaction } from '@/lib/transactions';
import { ReimbursementProcessDialog } from '@/components/app/reimbursement-process-dialog';
import { cn } from '@/lib/utils';

interface ReimbursementManagerProps {
	company: Company;
}

const STATUS_BADGE: Record<ReimbursementStatus, string> = {
	pending: 'bg-amber-100 text-amber-700',
	approved: 'bg-sky-100 text-sky-800',
	rejected: 'bg-rose-100 text-rose-700',
	paid: 'bg-emerald-100 text-emerald-800',
};

export function ReimbursementManager({ company }: ReimbursementManagerProps) {
	const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState<string | null>(null);
	const [processingTx, setProcessingTx] = useState<Transaction | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const filter = pb.filter('company = {:company}', { company: company.id });
			const [list, accs] = await Promise.all([
				pb.collection('reimbursements').getFullList<Reimbursement>({
					filter,
					sort: '-date,-created',
					expand: 'employee,processed_by',
					requestKey: `reimb-list-${company.id}`,
				}),
				pb.collection('accounts').getFullList<Account>({
					filter,
					sort: 'code',
					requestKey: `reimb-accounts-${company.id}`,
				}),
			]);
			setReimbursements(list);
			setAccounts(accs);
		} catch {
			setReimbursements([]);
			setAccounts([]);
		} finally {
			setLoading(false);
		}
	}, [company.id]);

	useEffect(() => {
		refresh().catch(() => toast.error('Gagal memuat data reimbursement.'));
	}, [refresh, reloadKey]);

	const totals = useMemo(() => {
		const pending = reimbursements.filter(r => r.status === 'pending').length;
		const approved = reimbursements.filter(r => r.status === 'approved').length;
		const paid = reimbursements.filter(r => r.status === 'paid');
		const paidAmount = paid.reduce((s, r) => s + (r.amount || 0), 0);
		return { pending, approved, paidCount: paid.length, paidAmount };
	}, [reimbursements]);

	const approve = async (rec: Reimbursement) => {
		setBusy(rec.id);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			// Pastikan transaksi Biaya tertaut ada (idempoten) agar akuntan dapat
			// memprosesnya. Tidak menerbitkan jurnal otomatis.
			const empName = rec.expand?.employee?.name || 'Karyawan';
			try {
				await ensureReimbursementTransaction(company, { ...rec, status: 'approved' }, empName);
			} catch {
				// Transaksi gagal dibuat — akan dipulihkan saat halaman Biaya dibuka.
			}
			await pb.collection('reimbursements').update(rec.id, {
				status: 'approved',
				processed_by: ownerId,
				processed_date: todayIso(),
				status_history: appendStatusHistory(rec.status_history, {
					status: 'approved',
					at: new Date().toISOString(),
					by: ownerId,
					note: 'Pengajuan disetujui',
				}),
			});
			toast.success('Reimbursement disetujui. Siap diproses pembayarannya.');
			await refresh();
		} catch {
			toast.error('Gagal menyetujui reimbursement.');
		} finally {
			setBusy(null);
		}
	};

	const reject = async (rec: Reimbursement) => {
		const reason = window.prompt('Alasan penolakan (opsional):') ?? '';
		if (reason === null) return;
		setBusy(rec.id);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			await pb.collection('reimbursements').update(rec.id, {
				status: 'rejected',
				rejection_reason: reason,
				processed_by: ownerId,
				processed_date: todayIso(),
				status_history: appendStatusHistory(rec.status_history, {
					status: 'rejected',
					at: new Date().toISOString(),
					by: ownerId,
					note: reason || 'Pengajuan ditolak',
				}),
			});
			// Hapus transaksi Biaya tertaut yang belum dibukukan (jika ada).
			try {
				const linked = await pb.collection('transactions').getFullList({
					filter: pb.filter('company = {:company} && reimbursement = {:r}', {
						company: company.id,
						r: rec.id,
					}),
					fields: 'id,expense_detail',
					requestKey: `reimb-reject-tx-${rec.id}`,
				});
				for (const tx of linked) {
					const booked = (tx as { expense_detail?: { booked?: boolean } }).expense_detail
						?.booked;
					if (!booked) await pb.collection('transactions').delete(tx.id);
				}
			} catch {
				// biarkan — transaksi mungkin tidak ada
			}
			toast.success('Reimbursement ditolak.');
			await refresh();
		} catch {
			toast.error('Gagal menolak reimbursement.');
		} finally {
			setBusy(null);
		}
	};

	const openProcess = async (rec: Reimbursement) => {
		setBusy(rec.id);
		try {
			// Pastikan transaksi Biaya tertaut ada sebelum diproses.
			const empName = rec.expand?.employee?.name || 'Karyawan';
			try {
				await ensureReimbursementTransaction(company, rec, empName);
			} catch {
				// abaikan — coba ambil transaksi yang ada
			}
			const linked = await pb.collection('transactions').getFullList<Transaction>({
				filter: pb.filter('company = {:company} && reimbursement = {:r}', {
					company: company.id,
					r: rec.id,
				}),
				requestKey: `reimb-open-tx-${rec.id}`,
			});
			if (linked.length === 0) {
				toast.error('Transaksi reimbursement belum tersedia. Coba lagi.');
				return;
			}
			setProcessingTx(linked[0]);
		} catch {
			toast.error('Gagal memuat transaksi reimbursement.');
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-xl font-bold tracking-tight text-slate-900">Reimbursement Karyawan</h2>
				<p className="text-sm text-muted-foreground">
					Tinjau pengajuan penggantian biaya karyawan. Setujui, lalu proses pembayaran dan
					catat jurnalnya. Status hanya menjadi Dibayar setelah jurnal berhasil dicatat.
				</p>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard label="Menunggu" value={String(totals.pending)} tone="amber" />
				<StatCard label="Disetujui" value={String(totals.approved)} tone="sky" />
				<StatCard label="Dibayar" value={String(totals.paidCount)} tone="emerald" />
				<StatCard label="Total Dibayar" value={formatRupiah(totals.paidAmount)} tone="emerald" />
			</div>

			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				{loading ? (
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">Memuat…</p>
				) : reimbursements.length === 0 ? (
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">
						Belum ada pengajuan reimbursement.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[860px] text-left text-sm">
							<thead>
								<tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
									<th className="px-4 py-3 font-semibold">Karyawan</th>
									<th className="px-4 py-3 font-semibold">Tanggal</th>
									<th className="px-4 py-3 font-semibold">Keterangan</th>
									<th className="px-4 py-3 font-semibold">Bukti</th>
									<th className="px-4 py-3 text-right font-semibold">Nominal</th>
									<th className="px-4 py-3 font-semibold">Status</th>
									<th className="px-4 py-3 text-right font-semibold">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{reimbursements.map(rec => {
									const emp = rec.expand?.employee;
									const proof = proofUrl(rec);
									return (
										<tr key={rec.id} className="hover:bg-muted/30">
											<td className="px-4 py-3 font-medium">
												{emp?.name ?? '—'}
												{emp?.position ? (
													<span className="block text-xs text-muted-foreground">{emp.position}</span>
												) : null}
											</td>
											<td className="px-4 py-3 text-muted-foreground">{formatDate(rec.date)}</td>
											<td className="px-4 py-3 text-muted-foreground">
												{rec.description || '—'}
												{rec.rejection_reason ? (
													<span className="block text-xs text-rose-600">
														Alasan tolak: {rec.rejection_reason}
													</span>
												) : null}
											</td>
											<td className="px-4 py-3">
												{proof ? (
													<a
														href={proof}
														target="_blank"
														rel="noreferrer"
														className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
													>
														<ReceiptText className="size-3.5" /> Lihat
													</a>
												) : (
													<span className="text-xs text-muted-foreground">—</span>
												)}
											</td>
											<td className="px-4 py-3 text-right font-semibold">
												{formatRupiah(rec.amount || 0)}
											</td>
											<td className="px-4 py-3">
												<span
													className={cn(
														'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
														STATUS_BADGE[rec.status],
													)}
												>
													{REIMBURSEMENT_STATUS_LABELS[rec.status] ?? rec.status}
												</span>
											</td>
											<td className="px-4 py-3 text-right">
												{rec.status === 'pending' ? (
													<div className="flex justify-end gap-1">
														<button
															type="button"
															disabled={busy === rec.id}
															onClick={() => approve(rec)}
															className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
														>
															<CheckCircle2 className="size-3.5" /> Setujui
														</button>
														<button
															type="button"
															disabled={busy === rec.id}
															onClick={() => reject(rec)}
															className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
														>
															<XCircle className="size-3.5" /> Tolak
														</button>
													</div>
												) : rec.status === 'approved' ? (
													<button
														type="button"
														disabled={busy === rec.id}
														onClick={() => openProcess(rec)}
														className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
													>
														<HandCoins className="size-3.5" /> Proses Bayar
													</button>
												) : (
													<span className="text-xs text-muted-foreground">—</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<ReimbursementProcessDialog
				transaction={processingTx}
				company={company}
				accounts={accounts}
				onOpenChange={open => {
					if (!open) setProcessingTx(null);
				}}
				onDone={() => {
					setProcessingTx(null);
					setReloadKey(k => k + 1);
				}}
			/>
		</div>
	);
}

function StatCard({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone: 'amber' | 'sky' | 'emerald';
}) {
	const toneClass = {
		amber: 'border-amber-200 bg-amber-50/60 text-amber-900',
		sky: 'border-sky-200 bg-sky-50/60 text-sky-900',
		emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
	}[tone];
	return (
		<div className={cn('rounded-2xl border p-4', toneClass)}>
			<p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
			<p className="mt-1 text-lg font-extrabold tracking-tight">{value}</p>
		</div>
	);
}
