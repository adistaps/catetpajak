import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
	ArrowLeft,
	Banknote,
	CheckCircle2,
	Clock,
	FileText,
	Receipt,
	Users,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, formatDate, type Account, type Company } from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import type { Student } from '@/lib/students';
import { type BusinessDocument } from '@/lib/documents';
import { NoCompany } from '@/components/app/no-company';
import { PosInvoicePaymentDialog } from '@/components/app/pos-invoice-payment-dialog';

interface PosInvoiceHistoryProps {
	activeCompany: Company | null;
}

/**
 * Halaman riwayat invoice pelanggan/siswa terpisah dari kasir POS.
 *
 * Membaca pelanggan/siswa terpilih dari parameter `customer` pada URL
 * (`<contactId>` atau `student:<id>`), memuat daftar invoice penjualan manual
 * untuk perusahaan aktif, dan memungkinkan pencatatan pembayaran penuh/sebagian
 * atas invoice yang belum lunas — tanpa membuat penjualan atau mengurangi stok.
 */
export function PosInvoiceHistory({ activeCompany }: PosInvoiceHistoryProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const customerId = searchParams.get('customer') ?? '';

	const [customers, setCustomers] = useState<Contact[]>([]);
	const [students, setStudents] = useState<Student[]>([]);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [invoiceHistory, setInvoiceHistory] = useState<BusinessDocument[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingHistory, setIsLoadingHistory] = useState(false);
	const [historyReloadKey, setHistoryReloadKey] = useState(0);
	const [payingInvoice, setPayingInvoice] = useState<BusinessDocument | null>(null);
	const [paymentDocCount, setPaymentDocCount] = useState(0);

	// Muat pelanggan, siswa, dan akun untuk perusahaan aktif.
	useEffect(() => {
		if (!activeCompany) {
			setCustomers([]);
			setStudents([]);
			setAccounts([]);
			setIsLoading(false);
			return;
		}
		let cancelled = false;
		setIsLoading(true);
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		const customerFilter = pb.filter('company = {:company} && type = "customer"', {
			company: activeCompany.id,
		});
		Promise.allSettled([
			pb.collection('contacts').getFullList<Contact>({ filter: customerFilter, sort: 'name' }),
			pb.collection('students').getFullList<Student>({
				filter: companyFilter,
				sort: 'student_name',
				requestKey: 'pos-history-students',
			}),
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code' }),
		])
			.then(results => {
				if (cancelled) return;
				setCustomers(results[0].status === 'fulfilled' ? results[0].value : []);
				setStudents(results[1].status === 'fulfilled' ? results[1].value : []);
				setAccounts(results[2].status === 'fulfilled' ? results[2].value : []);
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	const selectedCustomerLabel = useMemo(() => {
		if (!customerId) return '';
		if (customerId.startsWith('student:')) {
			const id = customerId.slice('student:'.length);
			const s = students.find(st => st.id === id);
			return s?.student_name ?? '';
		}
		const c = customers.find(ct => ct.id === customerId);
		return c?.name ?? '';
	}, [customerId, customers, students]);

	// Muat riwayat invoice untuk pelanggan/siswa terpilih.
	useEffect(() => {
		if (!activeCompany || !customerId) {
			setInvoiceHistory([]);
			return;
		}
		let cancelled = false;
		setIsLoadingHistory(true);
		const isStudent = customerId.startsWith('student:');
		const refId = isStudent ? customerId.slice('student:'.length) : customerId;
		const field = isStudent ? 'student' : 'contact';
		const filter = pb.filter(
			`company = {:company} && direction = "penjualan" && stage = "invoice" && ${field} = {:refId}`,
			{ company: activeCompany.id, refId },
		);
		pb.collection('documents')
			.getFullList<BusinessDocument>({
				filter,
				sort: '-date,-created',
				expand: 'contact,student',
				requestKey: 'pos-history-invoices',
			})
			.then(list => {
				if (!cancelled) setInvoiceHistory(list);
			})
			.catch(() => {
				if (!cancelled) setInvoiceHistory([]);
			})
			.finally(() => {
				if (!cancelled) setIsLoadingHistory(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, customerId, historyReloadKey]);

	const cashAccounts = useMemo(
		() => accounts.filter(a => a.type === 'aset' && /kas|bank/i.test(a.name)),
		[accounts],
	);
	const paymentOptions = cashAccounts.length > 0 ? cashAccounts : accounts.filter(a => a.type === 'aset');

	const openPaymentDialog = async (doc: BusinessDocument) => {
		setPayingInvoice(doc);
		setPaymentDocCount(0);
		if (!activeCompany) return;
		try {
			const countFilter = pb.filter(
				'company = {:company} && direction = "penjualan" && stage = "pembayaran"',
				{ company: activeCompany.id },
			);
			const countResult = await pb.collection('documents').getList(1, 1, {
				filter: countFilter,
				requestKey: null,
			});
			setPaymentDocCount(countResult.totalItems ?? 0);
		} catch {
			/* nomor urut akan dimulai dari 0 — tidak menghalangi penyimpanan */
		}
	};

	const selectCustomer = (next: string) => {
		const params = new URLSearchParams(searchParams);
		if (next) {
			params.set('customer', next);
		} else {
			params.delete('customer');
		}
		setSearchParams(params, { preventScrollReset: true });
	};

	if (!activeCompany) {
		return <NoCompany />;
	}

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<Link
						to="/app/pos"
						className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
					>
						<ArrowLeft className="size-4" /> Kembali ke Kasir
					</Link>
					<h1 className="mt-2 flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<Receipt className="size-7 text-primary" strokeWidth={2} /> Riwayat Invoice
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Lihat invoice pelanggan/siswa dan catat pembayaran belum lunas.
					</p>
				</div>
			</header>

			{/* Pemilih pelanggan/siswa */}
			<div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft-sm">
				<label
					htmlFor="history-customer"
					className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
				>
					<Users className="size-3" /> Pilih Pelanggan / Siswa
				</label>
				<select
					id="history-customer"
					value={customerId}
					onChange={e => selectCustomer(e.target.value)}
					className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
				>
					<option value="">— Pilih pelanggan / siswa —</option>
					{customers.length > 0 ? (
						<optgroup label="Pelanggan">
							{customers.map(c => (
								<option key={c.id} value={c.id}>{c.name}</option>
							))}
						</optgroup>
					) : null}
					{students.length > 0 ? (
						<optgroup label="Siswa">
							{students.map(s => (
								<option key={s.id} value={`student:${s.id}`}>
									{s.student_name}{s.student_id_number ? ` (${s.student_id_number})` : ''}
								</option>
							))}
						</optgroup>
					) : null}
				</select>
			</div>

			{!customerId ? (
				<div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
					<p className="text-sm font-semibold text-muted-foreground">
						Pilih pelanggan atau siswa untuk melihat riwayat invoice.
					</p>
				</div>
			) : isLoading ? (
				<p className="px-2 py-8 text-sm font-semibold text-muted-foreground">Memuat data…</p>
			) : (
				<section className="rounded-2xl border border-border bg-card shadow-soft">
					<div className="flex items-center justify-between border-b border-border px-5 py-3">
						<h2 className="flex items-center gap-2 text-sm font-bold">
							<FileText className="size-4 text-primary" /> Daftar Invoice
							<span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
								{invoiceHistory.length}
							</span>
						</h2>
						<p className="text-xs font-semibold text-muted-foreground">
							{selectedCustomerLabel || '—'}
						</p>
					</div>
					{isLoadingHistory ? (
						<p className="px-5 py-6 text-sm font-semibold text-muted-foreground">
							Memuat riwayat invoice…
						</p>
					) : invoiceHistory.length === 0 ? (
						<p className="px-5 py-6 text-sm text-muted-foreground">
							Belum ada invoice untuk pelanggan/siswa ini.
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full min-w-[640px] text-sm">
								<thead>
									<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide">
										<th className="px-5 py-2.5">Nomor</th>
										<th className="px-5 py-2.5">Tanggal</th>
										<th className="px-5 py-2.5">Keterangan</th>
										<th className="px-5 py-2.5">Status Bayar</th>
										<th className="px-5 py-2.5 text-right">Nominal</th>
										<th className="px-5 py-2.5" aria-label="Aksi" />
									</tr>
								</thead>
								<tbody>
									{invoiceHistory.map(doc => {
										const total = Number(doc.total) || 0;
										const paid = Number(doc.paid_amount) || 0;
										const isPaid = paid >= total && total > 0;
										const remaining = Math.max(0, total - paid);
										return (
											<tr key={doc.id} className="border-b border-foreground/15 last:border-0">
												<td className="px-5 py-2.5 font-semibold whitespace-nowrap">{doc.number || '—'}</td>
												<td className="px-5 py-2.5 whitespace-nowrap">{formatDate(doc.date)}</td>
												<td className="px-5 py-2.5 text-muted-foreground">{doc.description || '—'}</td>
												<td className="px-5 py-2.5">
													{isPaid ? (
														<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
															<CheckCircle2 className="size-3" /> Lunas
														</span>
													) : (
														<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">
															<Clock className="size-3" /> Belum Lunas
														</span>
													)}
													{!isPaid && remaining > 0 ? (
														<span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">
															Sisa {formatRupiah(remaining)}
														</span>
													) : null}
												</td>
												<td className="px-5 py-2.5 text-right font-semibold whitespace-nowrap">{formatRupiah(total)}</td>
												<td className="px-5 py-2.5">
													{!isPaid && remaining > 0 ? (
														<button
															type="button"
															onClick={() => openPaymentDialog(doc)}
															className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[10px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
														>
															<Banknote className="size-3" /> Bayar
														</button>
													) : null}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</section>
			)}

			<PosInvoicePaymentDialog
				open={payingInvoice !== null}
				onOpenChange={next => {
					if (!next) setPayingInvoice(null);
				}}
				invoice={payingInvoice}
				company={activeCompany}
				paymentAccounts={paymentOptions}
				existingPaymentCount={paymentDocCount}
				onPaid={() => setHistoryReloadKey(k => k + 1)}
			/>
		</div>
	);
}
