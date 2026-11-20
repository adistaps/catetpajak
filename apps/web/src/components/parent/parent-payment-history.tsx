import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Clock, LogOut, Receipt } from 'lucide-react';
import {
	currentParent,
	fetchMyInvoicePayments,
	fetchMyInvoices,
	fetchMyStudents,
	logoutParent,
	type ParentInvoicePayment,
	type ParentStudent,
} from '@/lib/parents';
import { formatDate, formatRupiah } from '@/lib/accounting';

const PAYMENT_STATUS_LABELS: Record<string, string> = {
	menunggu_verifikasi: 'Menunggu verifikasi',
	aktif: 'Terverifikasi',
	ditolak: 'Ditolak',
};

function paymentStatusClass(status: string): string {
	if (status === 'menunggu_verifikasi') return 'bg-amber-100 text-amber-700';
	if (status === 'aktif') return 'bg-emerald-100 text-emerald-700';
	if (status === 'ditolak') return 'bg-red-100 text-red-700';
	return 'bg-slate-100 text-slate-600';
}

export function ParentPaymentHistory() {
	const [students, setStudents] = useState<ParentStudent[]>([]);
	const [invoices, setInvoices] = useState<{ id: string; number: string; student: string }[]>([]);
	const [payments, setPayments] = useState<ParentInvoicePayment[]>([]);
	const [loading, setLoading] = useState(true);

	const parent = currentParent();
	const parentName = parent?.name || parent?.email || 'Parent';

	const loadAll = useCallback(async () => {
		setLoading(true);
		try {
			const [studentList, invoiceList, paymentList] = await Promise.all([
				fetchMyStudents(),
				fetchMyInvoices(),
				fetchMyInvoicePayments(),
			]);
			setStudents(studentList);
			setInvoices(
				invoiceList.map((inv) => ({
					id: inv.id,
					number: inv.number || '',
					student: inv.student || '',
				})),
			);
			setPayments(paymentList);
		} catch {
			setPayments([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadAll();
	}, [loadAll]);

	const studentName = useCallback(
		(id: string | undefined) =>
			students.find((s) => s.id === id)?.student_name || '—',
		[students],
	);

	const invoiceNumber = useCallback(
		(id: string | undefined) => invoices.find((i) => i.id === id)?.number || '—',
		[invoices],
	);

	const summary = useMemo(() => {
		const verified = payments.filter((p) => p.status === 'aktif');
		const pending = payments.filter((p) => p.status === 'menunggu_verifikasi');
		return {
			total: payments.length,
			verifiedCount: verified.length,
			pendingCount: pending.length,
			verifiedAmount: verified.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
		};
	}, [payments]);

	const handleLogout = () => {
		logoutParent();
		window.location.href = '/app/parent';
	};

	return (
		<div className="min-h-dvh bg-gradient-to-br from-emerald-50/60 via-background to-background">
			<header className="border-b border-border bg-card/80 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							Portal Parent
						</p>
						<h1 className="text-lg font-extrabold tracking-tight">{parentName}</h1>
					</div>
					<button
						type="button"
						onClick={handleLogout}
						className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
					>
						<LogOut className="size-3.5" /> Keluar
					</button>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-5 py-8">
				<Link
					to="/app/parent/dashboard"
					className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Kembali ke Dasbor
				</Link>
				<h2 className="mt-4 text-xl font-extrabold tracking-tight">Riwayat Pembayaran</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Daftar pembayaran yang telah Anda kirim beserta status verifikasinya.
				</p>

				<div className="mt-5 grid gap-3 sm:grid-cols-3">
					<div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft-sm">
						<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<Receipt className="size-3.5" /> Total Pembayaran
						</div>
						<p className="mt-1 text-2xl font-extrabold">{summary.total}</p>
					</div>
					<div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft-sm">
						<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<Clock className="size-3.5" /> Menunggu Verifikasi
						</div>
						<p className="mt-1 text-2xl font-extrabold text-amber-600">{summary.pendingCount}</p>
					</div>
					<div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft-sm">
						<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<Receipt className="size-3.5" /> Total Terverifikasi
						</div>
						<p className="mt-1 text-2xl font-extrabold text-primary">
							{formatRupiah(summary.verifiedAmount)}
						</p>
					</div>
				</div>

				<section className="mt-6">
					{loading ? (
						<p className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
							Memuat riwayat pembayaran…
						</p>
					) : payments.length === 0 ? (
						<p className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
							Belum ada pembayaran tercatat.
						</p>
					) : (
						<div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft-sm">
							<table className="w-full min-w-[720px] text-sm">
								<thead>
									<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										<th className="px-4 py-3">Siswa</th>
										<th className="px-4 py-3">No. Invoice</th>
										<th className="px-4 py-3">Tgl. Bayar</th>
										<th className="px-4 py-3 text-right">Jumlah</th>
										<th className="px-4 py-3">Status</th>
									</tr>
								</thead>
								<tbody>
									{payments.map((pay) => (
										<tr key={pay.id} className="border-b border-border/70 last:border-0">
											<td className="px-4 py-3 text-muted-foreground">
												{studentName(pay.student)}
											</td>
											<td className="px-4 py-3 font-semibold">{invoiceNumber(pay.invoice)}</td>
											<td className="px-4 py-3 text-muted-foreground">
												{formatDate(pay.payment_date)}
											</td>
											<td className="px-4 py-3 text-right font-bold text-emerald-600">
												{formatRupiah(Number(pay.amount) || 0)}
											</td>
											<td className="px-4 py-3">
												<span
													className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${paymentStatusClass(pay.status)}`}
												>
													{PAYMENT_STATUS_LABELS[pay.status] ?? pay.status}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
