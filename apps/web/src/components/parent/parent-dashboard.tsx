import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	Banknote,
	Bell,
	CheckCircle2,
	Clock,
	History,
	Loader2,
	LogOut,
	MessageCircle,
	Package,
	Receipt,
	Settings,
	Upload,
	Wallet,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
	computeInvoiceStatus,
	currentParent,
	fetchCompanyBankAccount,
	fetchInvoiceExpectedAmount,
	fetchMyInvoices,
	fetchMyInvoicePayments,
	fetchMyStudents,
	logoutParent,
	submitInvoicePayment,
	type CompanyBankAccount,
	type InvoiceWithStatus,
	type ParentInvoicePayment,
	type ParentStudent,
} from '@/lib/parents';
import { fetchActiveBankAccounts, type BankAccount } from '@/lib/bank-accounts';
import { fetchParentAnnouncements } from '@/lib/announcements';
import { formatDate, formatRupiah } from '@/lib/accounting';
import { studentInitials, studentPhotoUrl } from '@/lib/students';
import { computePaymentTerms } from '@/lib/payment-terms';
import {
	computeLatePenalty,
	fetchLatePenaltySettings,
	type LatePenaltySettings,
} from '@/lib/late-penalty-settings';

function StudentAvatar({ name, photo }: { name: string; photo: string }) {
	const [failed, setFailed] = useState(false);
	if (photo && !failed) {
		return (
			<img
				src={photo}
				alt={`Foto ${name}`}
				onError={() => setFailed(true)}
				className="size-12 shrink-0 rounded-full object-cover ring-2 ring-primary/20"
			/>
		);
	}
	return (
		<span
			aria-hidden
			className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary"
		>
			{studentInitials(name)}
		</span>
	);
}

function invoiceStatusBadge(item: InvoiceWithStatus) {
	if (item.isPaid) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
				<CheckCircle2 className="size-3" /> Lunas
			</span>
		);
	}
	if (item.pendingPayment) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
				<Clock className="size-3" /> Menunggu verifikasi
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
			<Clock className="size-3" /> Belum Dibayar
		</span>
	);
}

export function ParentDashboard() {
	const [students, setStudents] = useState<ParentStudent[]>([]);
	const [invoices, setInvoices] = useState<InvoiceWithStatus[]>([]);
	const [payments, setPayments] = useState<ParentInvoicePayment[]>([]);
	const [penaltyByCompany, setPenaltyByCompany] = useState<Map<string, LatePenaltySettings | null>>(new Map());
	const [announcementCount, setAnnouncementCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<InvoiceWithStatus | null>(null);
	const [activeStudent, setActiveStudent] = useState<string>('');

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
			setInvoices(computeInvoiceStatus(invoiceList, paymentList));
			setPayments(paymentList);
			try {
				const announcements = await fetchParentAnnouncements();
				setAnnouncementCount(announcements.length);
			} catch {
				setAnnouncementCount(0);
			}
			setActiveStudent((current) => {
				if (current && studentList.some((s) => s.id === current)) return current;
				return studentList[0]?.id ?? '';
			});
			// Muat pengaturan denda per company (parent dapat membaca via relasi siswa).
			const companyIds = Array.from(new Set(invoiceList.map((i) => i.company).filter(Boolean)));
			const settingsEntries = await Promise.all(
				companyIds.map(async (cid) => {
					try {
						const settings = await fetchLatePenaltySettings(cid);
						return [cid, settings] as const;
					} catch {
						return [cid, null] as const;
					}
				}),
			);
			setPenaltyByCompany(new Map(settingsEntries));
		} catch {
			toast.error('Gagal memuat data tagihan.');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadAll();
	}, [loadAll]);

	const filteredInvoices = useMemo(() => {
		if (!activeStudent || activeStudent === 'all') return invoices;
		return invoices.filter((item) => item.invoice.student === activeStudent);
	}, [invoices, activeStudent]);

	/**
	 * Kelompokkan invoice berdasarkan nama produk yang tercantum pada item invoice.
	 * Satu invoice yang berisi beberapa produk akan muncul di setiap kelompok produk
	 * terkait, tetapi total invoice dan tindakan pembayaran tidak berubah/digandakan.
	 */
	const groupedByProduct = useMemo(() => {
		const groups = new Map<string, InvoiceWithStatus[]>();
		for (const item of filteredInvoices) {
			const products = item.invoice.items ?? [];
			const names = new Set<string>();
			if (products.length === 0) {
				names.add('Tanpa Produk');
			} else {
				for (const p of products) {
					const name = (p.name || '').trim();
					names.add(name ? name : 'Tanpa Nama Produk');
				}
			}
			for (const name of names) {
				const arr = groups.get(name);
				if (arr) {
					if (!arr.some((x) => x.invoice.id === item.invoice.id)) arr.push(item);
				} else {
					groups.set(name, [item]);
				}
			}
		}
		return Array.from(groups.entries()).sort((a, b) =>
			a[0].localeCompare(b[0], 'id'),
		);
	}, [filteredInvoices]);

	const summary = useMemo(() => {
		const unpaid = filteredInvoices.filter((i) => !i.isPaid);
		return {
			totalInvoices: filteredInvoices.length,
			unpaidCount: unpaid.length,
			// Nominal invoice (jumlah tagihan) dari invoice yang belum lunas,
			// bukan sisa tagihan. Tetap menampilkan status pembayaran terpisah.
			unpaidInvoiceAmount: unpaid.reduce(
				(sum, i) => sum + (Number(i.invoice.total) || 0),
				0,
			),
			totalDue: unpaid.reduce((sum, i) => sum + i.remaining, 0),
			totalPaid: filteredInvoices.reduce((sum, i) => sum + i.paid, 0),
		};
	}, [filteredInvoices]);

	const openPay = (item: InvoiceWithStatus) => {
		setSelected(item);
	};

	const handleLogout = () => {
		logoutParent();
		window.location.href = '/app/parent';
	};

	const studentName = (id: string | undefined) =>
		students.find((s) => s.id === id)?.student_name || '—';

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
					<div className="flex items-center gap-2">
						<Link
							to="/app/parent/chat"
							className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
						>
							<MessageCircle className="size-3.5" /> Chat
						</Link>
						<Link
							to="/app/parent/pengumuman"
							className="relative inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
						>
							<Bell className="size-3.5" /> Pengumuman
							{announcementCount > 0 ? (
								<span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
									{announcementCount > 9 ? '9+' : announcementCount}
								</span>
							) : null}
						</Link>
						<Link
							to="/app/parent/riwayat-pembayaran"
							className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
						>
							<History className="size-3.5" /> Riwayat Pembayaran
						</Link>
						<Link
							to="/app/parent/pengaturan"
							className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
						>
							<Settings className="size-3.5" /> Pengaturan Akun
						</Link>
						<button
							type="button"
							onClick={handleLogout}
							className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
						>
							<LogOut className="size-3.5" /> Keluar
						</button>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-5 py-8">
				<section>
					<h2 className="mb-3 text-sm font-bold">Siswa Saya</h2>
					{students.length === 0 ? (
						<p className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
							Belum ada siswa yang terhubung dengan akun Anda. Hubungi admin sekolah.
						</p>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{students.map((s) => {
								const isActive = activeStudent === s.id;
								return (
								<button
									type="button"
									key={s.id}
									onClick={() => setActiveStudent(s.id)}
									aria-pressed={isActive}
									className={`rounded-2xl border px-4 py-3 text-left shadow-soft-sm transition-colors ${
										isActive
											? 'border-primary bg-primary/5 ring-2 ring-primary/30'
											: 'border-border bg-card hover:border-primary/40'
									}`}
								>
									<div className="flex items-center gap-3">
										<StudentAvatar name={s.student_name} photo={studentPhotoUrl(s)} />
										<p className="min-w-0 flex-1 truncate font-bold">{s.student_name}</p>
										{isActive ? (
											<span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
												Dipilih
											</span>
										) : null}
									</div>
									<dl className="mt-2 grid gap-1 text-xs">
										<div className="flex items-center justify-between gap-2">
											<dt className="text-muted-foreground">NIS</dt>
											<dd className="font-semibold">{s.student_id_number || '—'}</dd>
										</div>
										<div className="flex items-center justify-between gap-2">
											<dt className="text-muted-foreground">Kelas</dt>
											<dd className="font-semibold">
												{s.school_grade || s.school_program || '—'}
											</dd>
										</div>
									</dl>
								</button>
								);
							})}
						</div>
					)}
				</section>

				<p className="mt-3 text-xs text-muted-foreground">
					Klik kartu siswa untuk melihat ringkasan dan tagihan siswa tersebut.
				</p>

				<div className="mt-8 grid gap-3 sm:grid-cols-3">
					<div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft-sm">
						<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<Receipt className="size-3.5" /> Total Tagihan
						</div>
						<p className="mt-1 text-2xl font-extrabold">{summary.totalInvoices}</p>
					</div>
					<div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft-sm">
						<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<Clock className="size-3.5" /> Nominal Invoice Belum Dibayar
						</div>
						<p className="mt-1 text-2xl font-extrabold text-amber-600">
							{formatRupiah(summary.unpaidInvoiceAmount)}
						</p>
						<p className="mt-0.5 text-[11px] text-muted-foreground">
							{summary.unpaidCount} invoice belum lunas
						</p>
					</div>
					<div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft-sm">
						<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<Wallet className="size-3.5" /> Total Tunggakan
						</div>
						<p className="mt-1 text-2xl font-extrabold text-primary">{formatRupiah(summary.totalDue)}</p>
					</div>
				</div>

				<section className="mt-8">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="text-sm font-bold">Tagihan Invoice</h2>
						<select
							value={activeStudent || 'all'}
							onChange={(e) => setActiveStudent(e.target.value)}
							className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold outline-none ring-primary/30 focus:ring-2"
						>
							<option value="all">Semua Siswa</option>
							{students.map((s) => (
								<option key={s.id} value={s.id}>
									{s.student_name}
								</option>
							))}
						</select>
					</div>

					{loading ? (
						<p className="mt-4 rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
							Memuat tagihan…
						</p>
					) : filteredInvoices.length === 0 ? (
						<p className="mt-4 rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
							Belum ada tagihan.
						</p>
					) : (
						<div className="mt-4 flex flex-col gap-5">
							{groupedByProduct.map(([productName, items]) => (
								<section
									key={productName}
									className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm"
								>
									<div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-3">
										<Package className="size-4 text-primary" />
										<h3 className="text-sm font-bold">{productName}</h3>
										<span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
											{items.length} invoice
										</span>
									</div>
									<div className="overflow-x-auto">
										<table className="w-full min-w-[720px] text-sm">
											<thead>
												<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
													<th className="px-4 py-3">No. Invoice</th>
													<th className="px-4 py-3">Siswa</th>
													<th className="px-4 py-3">Tanggal</th>
													<th className="px-4 py-3 text-right">Total</th>
													<th className="px-4 py-3 text-right">Sisa</th>
													<th className="px-4 py-3">Status</th>
													<th className="px-4 py-3" aria-label="Aksi" />
												</tr>
											</thead>
											<tbody>
												{items.map((item) => (
													<tr key={item.invoice.id} className="border-b border-border/70 last:border-0">
														<td className="px-4 py-3 font-semibold">
															{item.invoice.number || '—'}{(() => { const c = computePaymentTerms(item.invoice.payment_terms, item.invoice.date, Number(item.invoice.total) || 0); return c ? (<span className="mt-0.5 block text-[10px] font-semibold text-primary">{item.invoice.payment_terms} · tempo {formatDate(c.dueDate)}</span>) : null; })()}{(() => { const pc = computeLatePenalty((penaltyByCompany.get(item.invoice.company) ?? null), { total: Number(item.invoice.total) || 0, payment_terms: item.invoice.payment_terms, date: item.invoice.date, paid_amount: Number(item.invoice.paid_amount) || 0 }); return pc && pc.penalty > 0 ? (<span className="mt-0.5 block text-[10px] font-semibold text-amber-600">Terlambat {pc.daysOverdue} hari · Denda {formatRupiah(pc.penalty)} · Total {formatRupiah(pc.totalWithPenalty)}</span>) : null; })()}
														</td>
														<td className="px-4 py-3 text-muted-foreground">
															{studentName(item.invoice.student)}
														</td>
														<td className="px-4 py-3 text-muted-foreground">
															{formatDate(item.invoice.date)}
														</td>
														<td className="px-4 py-3 text-right font-semibold">
															{formatRupiah(Number(item.invoice.total) || 0)}
														</td>
														<td className="px-4 py-3 text-right font-bold text-primary">
															{formatRupiah(item.remaining)}
														</td>
														<td className="px-4 py-3">{invoiceStatusBadge(item)}</td>
														<td className="px-4 py-3 text-right">
															{item.isPaid || item.pendingPayment ? null : (
																<button
																	type="button"
																	onClick={() => openPay(item)}
																	className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
																>
																	Bayar
																</button>
															)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</section>
							))}
						</div>
					)}
				</section>
			</main>

			{selected ? (
				<ManualPaymentModal
					item={selected}
					studentName={studentName(selected.invoice.student)}
					penaltySettings={penaltyByCompany.get(selected.invoice.company) ?? null}
					onClose={() => setSelected(null)}
					onSubmitted={async () => {
						setSelected(null);
						await loadAll();
					}}
				/>
			) : null}
		</div>
	);
}

function ManualPaymentModal({
	item,
	studentName,
	penaltySettings,
	onClose,
	onSubmitted,
}: {
	item: InvoiceWithStatus;
	studentName: string;
	penaltySettings: LatePenaltySettings | null;
	onClose: () => void;
	onSubmitted: () => void | Promise<void>;
}) {
	const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
	const [banksLoading, setBanksLoading] = useState(true);
	const [bank, setBank] = useState('');
	const [companyBank, setCompanyBank] = useState<CompanyBankAccount | null>(null);
	const [companyBankLoading, setCompanyBankLoading] = useState(true);
	const penaltyCalc = computeLatePenalty(
		penaltySettings,
		{
			total: Number(item.invoice.total) || 0,
			payment_terms: item.invoice.payment_terms,
			date: item.invoice.date,
			paid_amount: Number(item.invoice.paid_amount) || 0,
		},
	);
	const [payAmount, setPayAmount] = useState(() => {
		const c = computePaymentTerms(item.invoice.payment_terms, item.invoice.date, Number(item.invoice.total) || 0);
		if (c?.discountActive) return String(Math.min(item.remaining, c.payableWithDiscount));
		const penalty = penaltyCalc?.penalty ?? 0;
		return String(item.remaining + penalty);
	});
	const [expectedAmount, setExpectedAmount] = useState<number | null>(null);
	const [expectedAmountFormatted, setExpectedAmountFormatted] = useState<string | null>(null);
	const [amountLoading, setAmountLoading] = useState(false);
	const [verifying, setVerifying] = useState(false);
	const [paymentDate, setPaymentDate] = useState('');
	const [payerName, setPayerName] = useState('');
	const [notes, setNotes] = useState('');
	const [file, setFile] = useState<File | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [submitting, setSubmitting] = useState(false);
	const termsCalc = computePaymentTerms(item.invoice.payment_terms, item.invoice.date, Number(item.invoice.total) || 0);

	useEffect(() => {
		const today = new Date();
		const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		setPaymentDate(iso);
		const parent = currentParent();
		setPayerName(parent?.name || '');
	}, []);

	useEffect(() => {
		let cancelled = false;
		setBanksLoading(true);
		fetchActiveBankAccounts()
			.then((items) => {
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

	useEffect(() => {
		let cancelled = false;
		setCompanyBankLoading(true);
		setCompanyBank(null);
		fetchCompanyBankAccount(item.invoice.id)
			.then((account) => {
				if (cancelled) return;
				setCompanyBank(account);
				if (account && account.bank_name) {
					setBank(account.bank_name);
				}
			})
			.catch(() => {
				if (!cancelled) setCompanyBank(null);
			})
			.finally(() => {
				if (!cancelled) setCompanyBankLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [item.invoice.id]);

	// Minta nominal unik (jumlah bayar + tiga digit acak) yang belum dipakai
	// pembayaran aktif/menunggu lain. Nominal ini ditampilkan sebagai jumlah
	// yang harus ditransfer dan dipakai verifikasi otomatis. Diperbarui setiap
	// kali nominal pembayaran berubah.
	useEffect(() => {
		const base = Number(payAmount) || 0;
		if (base <= 0) {
			setExpectedAmount(null);
			setExpectedAmountFormatted(null);
			return;
		}
		let cancelled = false;
		setAmountLoading(true);
		fetchInvoiceExpectedAmount(item.invoice.id, base)
			.then((result) => {
				if (cancelled) return;
				setExpectedAmount(result.expected_amount);
				setExpectedAmountFormatted(result.expected_amount_formatted);
			})
			.catch(() => {
				if (cancelled) return;
				setExpectedAmount(null);
				setExpectedAmountFormatted(null);
			})
			.finally(() => {
				if (!cancelled) setAmountLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [item.invoice.id, payAmount]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextErrors: Record<string, string> = {};
		const amount = Number(payAmount) || 0;
		if (amount <= 0) nextErrors.amount = 'Nominal pembayaran harus lebih dari 0.';
		if (amount > item.remaining + 1) {
			nextErrors.amount = `Nominal melebihi sisa tagihan (Rp${item.remaining.toLocaleString('id-ID')}).`;
		}
		if (!paymentDate) nextErrors.paymentDate = 'Tanggal pembayaran wajib diisi.';
		if (!bank) nextErrors.bank = 'Pilih bank tujuan transfer.';
		if (!file) nextErrors.proof = 'Bukti pembayaran wajib diunggah.';
		if (!expectedAmount) {
			nextErrors.proof = 'Nominal unik transfer belum siap. Muat ulang halaman lalu coba lagi.';
		}
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0 || !expectedAmount) return;

		setSubmitting(true);
		setVerifying(false);
		try {
			setVerifying(true);
			const result = await submitInvoicePayment({
				invoiceId: item.invoice.id,
				amount,
				expectedAmount,
				bank,
				paymentDate,
				payerName: payerName.trim(),
				notes: notes.trim(),
				proof: file!,
			});
			if (result.verified) {
				toast.success('Pembayaran terverifikasi otomatis. Invoice telah dilunasi.');
			} else {
				toast.info(result.reason || 'Bukti terkirim. Menunggu verifikasi admin.');
			}
			await onSubmitted();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal mengirim pembayaran.');
		} finally {
			setSubmitting(false);
			setVerifying(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
			<div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-soft">
				<div className="flex items-center justify-between border-b border-border px-5 py-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							Bayar Invoice
						</p>
						<h2 className="text-lg font-extrabold">{item.invoice.number || 'Invoice'}</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
						aria-label="Tutup"
					>
						<X className="size-4" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5 text-sm" noValidate>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Siswa</p>
							<p className="font-semibold">{studentName}</p>
						</div>
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tanggal</p>
							<p>{formatDate(item.invoice.date)}</p>
						</div>
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total Tagihan</p>
							<p className="font-semibold">{formatRupiah(Number(item.invoice.total) || 0)}</p>
						</div>
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sisa Tagihan</p>
							<p className="font-extrabold text-primary">{formatRupiah(item.remaining)}</p>
						</div>
					</div>

					{item.invoice.description ? (
						<p className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
							{item.invoice.description}
						</p>
					) : null}

					{termsCalc ? (
					<div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
						<p className="font-bold text-primary">Syarat pembayaran: {item.invoice.payment_terms} — diskon {termsCalc.parsed.discountRate}% bila dibayar ≤ {formatDate(termsCalc.discountDeadline)}</p>
						<p className="mt-1 text-muted-foreground">Bayar jika memenuhi syarat: <span className="font-bold text-primary">{formatRupiah(termsCalc.payableWithDiscount)}</span> · Diskon: <span className="font-bold text-emerald-600">{formatRupiah(termsCalc.discountAmount)}</span> · Jatuh tempo: <span className="font-semibold text-foreground">{formatDate(termsCalc.dueDate)}</span></p>
						<p className={`mt-1 text-[11px] font-semibold ${termsCalc.discountActive ? 'text-emerald-600' : 'text-amber-600'}`}>{termsCalc.discountActive ? 'Diskon masih berlaku — bayar sekarang untuk mendapat diskon.' : 'Masa diskon telah lewat — tagihan dibayar penuh.'}</p>
					</div>
				) : null}
				{penaltyCalc && penaltyCalc.penalty > 0 ? (
					<div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs">
						<p className="font-bold text-amber-700">Denda keterlambatan berlaku</p>
						<p className="mt-1 text-amber-800">Terlambat {penaltyCalc.daysOverdue} hari · Denda: <span className="font-bold">{formatRupiah(penaltyCalc.penalty)}</span> · Total + denda: <span className="font-bold">{formatRupiah(penaltyCalc.totalWithPenalty)}</span></p>
						<p className="mt-1 text-[11px] font-semibold text-amber-700">Invoice telah melewati jatuh tempo. Nominal pembayaran sudah termasuk denda satu kali.</p>
					</div>
				) : null}
				<div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
						<p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
							<Banknote className="size-3.5" /> Transfer ke rekening perusahaan
						</p>
						{companyBankLoading ? (
							<p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
								<Loader2 className="size-3.5 animate-spin" /> Memuat rekening perusahaan…
							</p>
						) : companyBank && companyBank.bank_name && companyBank.account_number ? (
							<div className="mt-2 rounded-lg border border-emerald-300 bg-card px-3 py-2.5 text-xs">
								<p className="font-bold text-foreground">{companyBank.bank_name}</p>
								<p className="font-semibold tracking-tight">{companyBank.account_number}</p>
								<p className="text-muted-foreground">a.n. {companyBank.account_holder || '—'}</p>
								{companyBank.company_name ? (
									<p className="mt-1 text-[10px] text-muted-foreground">{companyBank.company_name}</p>
								) : null}
							</div>
						) : (
							<div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs">
								<p className="font-semibold text-amber-700">
									Informasi rekening perusahaan belum tersedia. Hubungi admin sekolah.
								</p>
								{banksLoading ? (
									<p className="mt-2 flex items-center gap-2 text-muted-foreground">
										<Loader2 className="size-3.5 animate-spin" /> Memuat rekening alternatif…
									</p>
								) : bankAccounts.length === 0 ? null : (
									<dl className="mt-2 grid gap-2 sm:grid-cols-2">
										{bankAccounts.map((account) => (
											<div
												key={account.id}
												className="rounded-lg border border-border bg-card px-3 py-2 text-xs"
											>
												<dt className="font-bold text-foreground">{account.bank_name}</dt>
												<dd className="font-semibold tracking-tight">{account.account_number}</dd>
												<dd className="text-muted-foreground">a.n. {account.account_holder}</dd>
											</div>
										))}
									</dl>
								)}
							</div>
						)}
					</div>

				<div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
						Nominal yang harus ditransfer
					</p>
					{amountLoading || !expectedAmountFormatted ? (
						<p className="mt-1 flex items-center gap-2 text-sm font-bold text-foreground">
							<Loader2 className="size-3.5 animate-spin" /> Menyiapkan nominal unik…
						</p>
					) : (
						<p className="mt-1 text-xl font-extrabold tracking-tight text-foreground">
							{expectedAmountFormatted}
						</p>
					)}
					<p className="mt-1 text-[11px] text-muted-foreground">
						Transfer tepat nominal di atas (termasuk kode unik tiga digit) agar
						verifikasi otomatis berhasil. Kode unik membedakan pembayaran Anda.
					</p>
				</div>

					<label className="flex flex-col gap-1.5">
						<span className="text-xs font-semibold">Nominal Pembayaran (Rp)</span>
						<input
							type="number"
							min="1"
							value={payAmount}
							onChange={(e) => setPayAmount(e.target.value)}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
						{errors.amount ? (
							<span className="text-xs font-medium text-red-600">{errors.amount}</span>
						) : null}
					</label>

					{companyBank && companyBank.bank_name && companyBank.account_number ? (
						<input type="hidden" value={bank} />
					) : (
					<label className="flex flex-col gap-1.5">
						<span className="text-xs font-semibold">Bank Tujuan Transfer</span>
						<select
							value={bank}
							onChange={(e) => setBank(e.target.value)}
							disabled={banksLoading || bankAccounts.length === 0}
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						>
							<option value="">{banksLoading ? 'Memuat rekening…' : 'Pilih bank tujuan…'}</option>
							{bankAccounts.map((account) => (
								<option key={account.id} value={account.bank_name}>
									{account.bank_name} — {account.account_number}
								</option>
							))}
						</select>
						{errors.bank ? (
							<span className="text-xs font-medium text-red-600">{errors.bank}</span>
						) : null}
					</label>
					)}

					<div className="grid gap-3 sm:grid-cols-2">
						<label className="flex flex-col gap-1.5">
							<span className="text-xs font-semibold">Tanggal Pembayaran</span>
							<input
								type="date"
								value={paymentDate}
								onChange={(e) => setPaymentDate(e.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
							{errors.paymentDate ? (
								<span className="text-xs font-medium text-red-600">{errors.paymentDate}</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className="text-xs font-semibold">Nama Pengirim</span>
							<input
								value={payerName}
								onChange={(e) => setPayerName(e.target.value)}
								placeholder="Nama pemilik rekening pengirim"
								maxLength={120}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</label>
					</div>

					<label className="flex flex-col gap-1.5">
						<span className="text-xs font-semibold">Catatan (opsional)</span>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={2}
							maxLength={500}
							placeholder="cth. transfer dari Bank BCA atas nama Rina Hartono"
							className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</label>

					<label className="flex flex-col gap-1.5">
						<span className="text-xs font-semibold">Bukti Pembayaran</span>
						{file ? (
							<div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-background px-3 py-2">
								<span className="flex min-w-0 items-center gap-2 text-xs">
									<Upload className="size-3.5 shrink-0 text-emerald-600" />
									<span className="truncate">{file.name}</span>
								</span>
								<button
									type="button"
									onClick={() => setFile(null)}
									className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
									aria-label="Hapus berkas"
								>
									<X className="size-3.5" />
								</button>
							</div>
						) : (
							<input
								type="file"
								accept="image/jpeg,image/png,image/webp,application/pdf"
								onChange={(e) => setFile(e.target.files?.[0] ?? null)}
								className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
							/>
						)}
						{errors.proof ? (
							<span className="text-xs font-medium text-red-600">{errors.proof}</span>
						) : null}
						<span className="text-xs text-muted-foreground">
							Gambar (JPG/PNG/WebP) atau PDF, maksimal 5 MB.
						</span>
					</label>

					<div className="flex justify-end gap-2 border-t border-border pt-4">
						<button
							type="button"
							onClick={onClose}
							disabled={submitting}
							className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={submitting}
							className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
						>
							{submitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
							{verifying ? 'Memverifikasi bukti…' : submitting ? 'Mengirim…' : 'Kirim Bukti Pembayaran'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
