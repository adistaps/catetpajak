import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookCheck, CalendarDays, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import pb from '@/lib/pocketbase-client';
import {
	accountBalance,
	formatRupiah,
	todayIso,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';
import { cn } from '@/lib/utils';

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	companyId: string;
	conversionDate?: string;
}

interface ClosingLine {
	account: Account;
	balance: number;
}

interface ClosingSummary {
	revenueLines: ClosingLine[];
	expenseLines: ClosingLine[];
	totalRevenue: number;
	totalExpense: number;
	netIncome: number;
	retainedEarnings: Account | null;
}

/**
 * Tutup buku: menutup akun pendapatan & beban sementara ke akun Laba Ditahan
 * (ekuitas) pada akhir periode. Saldo dihitung sampai tanggal tutup buku,
 * menghormati tanggal konversi, lalu tiap akun dinolkan dengan pasangan jurnal
 * yang seimbang. Setiap periode hanya boleh ditutup sekali (dijaga unik di DB).
 */
export function TutupBukuDialog({ open, onOpenChange, companyId, conversionDate }: Props) {
	const [closingDate, setClosingDate] = useState(todayIso());
	const [loading, setLoading] = useState(false);
	const [processing, setProcessing] = useState(false);
	const [summary, setSummary] = useState<ClosingSummary | null>(null);
	const [alreadyClosed, setAlreadyClosed] = useState(false);
	const [error, setError] = useState('');

	const compute = useCallback(async () => {
		if (!companyId || !closingDate) {
			setSummary(null);
			return;
		}
		setLoading(true);
		setError('');
		try {
			if (
				conversionDate &&
				closingDate.slice(0, 10) < conversionDate.slice(0, 10)
			) {
				setError('Tanggal tutup buku tidak boleh sebelum tanggal konversi.');
				setSummary(null);
				return;
			}

			// Cek apakah periode ini sudah pernah ditutup.
			let existing = false;
			try {
				await pb.collection('book_closings').getFirstListItem(
					pb.filter('company = {:company} && closing_date = {:date}', {
						company: companyId,
						date: closingDate,
					}),
				);
				existing = true;
			} catch {
				existing = false;
			}
			setAlreadyClosed(existing);

			const accounts = await pb.collection('accounts').getFullList<Account>({
				filter: pb.filter('company = {:company}', { company: companyId }),
			});
			const entries = await pb.collection('entries').getFullList<JournalEntry>({
				filter: pb.filter('company = {:company} && date <= {:date}', {
					company: companyId,
					date: closingDate,
				}),
			});

			const cut = conversionDate ? conversionDate.slice(0, 10) : null;
			const relevant = cut
				? entries.filter(entry => (entry.date || '').slice(0, 10) >= cut)
				: entries;

			const totals = new Map<string, { debit: number; credit: number }>();
			for (const entry of relevant) {
				const current = totals.get(entry.account) ?? { debit: 0, credit: 0 };
				current.debit += entry.debit || 0;
				current.credit += entry.credit || 0;
				totals.set(entry.account, current);
			}

			const balanceOf = (account: Account): number => {
				const current = totals.get(account.id) ?? { debit: 0, credit: 0 };
				const opening = account.opening_balance || 0;
				return opening + accountBalance(account.type, current.debit, current.credit);
			};

			const revenueLines = accounts
				.filter(account => account.type === 'pendapatan')
				.map(account => ({ account, balance: balanceOf(account) }))
				.filter(line => Math.abs(line.balance) > 0.005);

			const expenseLines = accounts
				.filter(account => account.type === 'beban')
				.map(account => ({ account, balance: balanceOf(account) }))
				.filter(line => Math.abs(line.balance) > 0.005);

			const totalRevenue = revenueLines.reduce((sum, line) => sum + line.balance, 0);
			const totalExpense = expenseLines.reduce((sum, line) => sum + line.balance, 0);
			const netIncome = totalRevenue - totalExpense;

			const retainedEarnings =
				accounts.find(
					account => account.type === 'ekuitas' && /laba\s*ditahan/i.test(account.name),
				) ?? null;

			setSummary({
				revenueLines,
				expenseLines,
				totalRevenue,
				totalExpense,
				netIncome,
				retainedEarnings,
			});
		} catch {
			setError('Gagal memuat data untuk tutup buku.');
			setSummary(null);
		} finally {
			setLoading(false);
		}
	}, [companyId, closingDate, conversionDate]);

	useEffect(() => {
		if (open) {
			void compute();
		} else {
			setSummary(null);
			setError('');
			setAlreadyClosed(false);
		}
	}, [open, compute]);

	const hasClosable =
		(summary?.revenueLines.length ?? 0) + (summary?.expenseLines.length ?? 0) > 0;
	const canConfirm =
		!processing &&
		!loading &&
		!alreadyClosed &&
		Boolean(summary?.retainedEarnings) &&
		hasClosable &&
		!error;

	const handleConfirm = async () => {
		if (!summary || !summary.retainedEarnings) return;
		setProcessing(true);
		setError('');
		const ownerId = pb.authStore.record?.id ?? '';
		const retainedEarnings = summary.retainedEarnings;
		const descriptionFor = (name: string) => `Tutup buku per ${closingDate} — ${name}`;

		interface DraftLine {
			account: string;
			debit: number;
			credit: number;
			description: string;
		}
		const lines: DraftLine[] = [];

		// Pendapatan: saldo normal di kredit. Debit akun pendapatan, kredit Laba Ditahan.
		for (const line of summary.revenueLines) {
			const amount = Math.abs(line.balance);
			if (line.balance > 0) {
				lines.push({
					account: line.account.id,
					debit: amount,
					credit: 0,
					description: descriptionFor(line.account.name),
				});
				lines.push({
					account: retainedEarnings.id,
					debit: 0,
					credit: amount,
					description: descriptionFor(line.account.name),
				});
			} else {
				lines.push({
					account: line.account.id,
					debit: 0,
					credit: amount,
					description: descriptionFor(line.account.name),
				});
				lines.push({
					account: retainedEarnings.id,
					debit: amount,
					credit: 0,
					description: descriptionFor(line.account.name),
				});
			}
		}

		// Beban: saldo normal di debit. Kredit akun beban, debit Laba Ditahan.
		for (const line of summary.expenseLines) {
			const amount = Math.abs(line.balance);
			if (line.balance > 0) {
				lines.push({
					account: line.account.id,
					debit: 0,
					credit: amount,
					description: descriptionFor(line.account.name),
				});
				lines.push({
					account: retainedEarnings.id,
					debit: amount,
					credit: 0,
					description: descriptionFor(line.account.name),
				});
			} else {
				lines.push({
					account: line.account.id,
					debit: amount,
					credit: 0,
					description: descriptionFor(line.account.name),
				});
				lines.push({
					account: retainedEarnings.id,
					debit: 0,
					credit: amount,
					description: descriptionFor(line.account.name),
				});
			}
		}

		try {
			await Promise.all(
				lines.map((line, index) =>
					pb.collection('entries').create(
						{
							company: companyId,
							account: line.account,
							date: closingDate,
							description: line.description,
							debit: line.debit,
							credit: line.credit,
							owner: ownerId,
						},
						{ requestKey: `tutup-buku-${index}-${line.account}` },
					),
				),
			);
			await pb.collection('book_closings').create({
				company: companyId,
				closing_date: closingDate,
				total_revenue: summary.totalRevenue,
				total_expense: summary.totalExpense,
				net_income: summary.netIncome,
				entries_created: lines.length,
				owner: ownerId,
			});
			toast.success(
				'Tutup buku berhasil. Akun pendapatan & beban dinolkan ke Laba Ditahan.',
			);
			onOpenChange(false);
		} catch {
			setError('Gagal memproses tutup buku. Coba lagi.');
		} finally {
			setProcessing(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[min(90dvh,44rem)] max-w-2xl overflow-y-auto rounded-2xl border-border bg-card p-6 shadow-soft sm:rounded-2xl">
				<DialogTitle className="flex items-center gap-2 pr-8 text-lg font-bold">
					<BookCheck className="size-5 text-primary" />
					Tutup buku
				</DialogTitle>

				<div className="mt-3 flex flex-col gap-2">
					<label
						htmlFor="closing-date"
						className="flex items-center gap-1.5 text-sm font-semibold"
					>
						<CalendarDays className="size-4 text-muted-foreground" />
						Tanggal tutup buku
					</label>
					<input
						id="closing-date"
						type="date"
						value={closingDate}
						disabled={processing}
						onChange={event => setClosingDate(event.target.value)}
						className="w-full max-w-xs rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2 disabled:opacity-60"
					/>
					<p className="text-xs text-muted-foreground">
						Saldo akun pendapatan &amp; beban dihitung sampai tanggal ini, lalu
						dinolkan ke akun Laba Ditahan. Setiap tanggal hanya bisa ditutup sekali.
					</p>
				</div>

				{loading ? (
					<div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Menghitung saldo…
					</div>
				) : error ? (
					<div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
						<AlertTriangle className="mt-0.5 size-4 shrink-0" />
						<span>{error}</span>
					</div>
				) : summary ? (
					<div className="mt-4 flex flex-col gap-4">
						{alreadyClosed ? (
							<div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<span>
									Periode tanggal ini sudah ditutup. Pilih tanggal lain untuk
									melanjutkan.
								</span>
							</div>
						) : null}

						{!summary.retainedEarnings ? (
							<div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<span>
									Akun <strong>Laba Ditahan</strong> (ekuitas) tidak ditemukan.
									Buat akun ekuitas bernama &ldquo;Laba Ditahan&rdquo; sebelum
									melakukan tutup buku.
								</span>
							</div>
						) : null}

						{!hasClosable ? (
							<p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
								Tidak ada saldo pendapatan atau beban untuk ditutup pada tanggal ini.
							</p>
						) : (
							<>
								<div className="overflow-hidden rounded-xl border border-border">
									<div className="border-b border-border bg-secondary/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
										Pendapatan — dinolkan ke Laba Ditahan
									</div>
									<ul className="divide-y divide-border">
										{summary.revenueLines.map(line => (
											<li
												key={line.account.id}
												className="flex items-center justify-between px-4 py-2 text-sm"
											>
												<span className="min-w-0 truncate">
													<span className="mr-2 font-semibold text-muted-foreground">
														{line.account.code}
													</span>
													{line.account.name}
												</span>
												<span className="ml-2 shrink-0 font-medium tabular-nums">
													{formatRupiah(line.balance)}
												</span>
											</li>
										))}
										{summary.revenueLines.length === 0 ? (
											<li className="px-4 py-2 text-sm text-muted-foreground">
												Tidak ada saldo.
											</li>
										) : null}
									</ul>
									<div className="flex items-center justify-between border-t border-border bg-secondary/40 px-4 py-2 text-sm font-bold">
										<span>Total pendapatan</span>
										<span className="tabular-nums">
											{formatRupiah(summary.totalRevenue)}
										</span>
									</div>
								</div>

								<div className="overflow-hidden rounded-xl border border-border">
									<div className="border-b border-border bg-secondary/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
										Beban — dinolkan ke Laba Ditahan
									</div>
									<ul className="divide-y divide-border">
										{summary.expenseLines.map(line => (
											<li
												key={line.account.id}
												className="flex items-center justify-between px-4 py-2 text-sm"
											>
												<span className="min-w-0 truncate">
													<span className="mr-2 font-semibold text-muted-foreground">
														{line.account.code}
													</span>
													{line.account.name}
												</span>
												<span className="ml-2 shrink-0 font-medium tabular-nums">
													{formatRupiah(line.balance)}
												</span>
											</li>
										))}
										{summary.expenseLines.length === 0 ? (
											<li className="px-4 py-2 text-sm text-muted-foreground">
												Tidak ada saldo.
											</li>
										) : null}
									</ul>
									<div className="flex items-center justify-between border-t border-border bg-secondary/40 px-4 py-2 text-sm font-bold">
										<span>Total beban</span>
										<span className="tabular-nums">
											{formatRupiah(summary.totalExpense)}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3">
									<span className="text-sm font-bold">
										Laba rugi periode ini (ke Laba Ditahan)
									</span>
									<span
										className={cn(
											'text-base font-extrabold tabular-nums',
											summary.netIncome >= 0 ? 'text-primary' : 'text-destructive',
										)}
									>
										{formatRupiah(summary.netIncome)}
									</span>
								</div>
							</>
						)}
					</div>
				) : null}

				<div className="mt-5 flex items-center justify-end gap-2">
					<DialogClose className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
						Batal
					</DialogClose>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={!canConfirm}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-60"
					>
						{processing ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<BookCheck className="size-4" />
						)}
						{processing ? 'Memproses…' : 'Proses tutup buku'}
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
