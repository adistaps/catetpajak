import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ArrowRightLeft,
	BadgeDollarSign,
	Building2,
	CalendarRange,
	Loader2,
	RefreshCw,
	Search,
	ShoppingBag,
	ShieldOff,
} from 'lucide-react';
import { Link } from 'react-router';
import { formatDate, formatRupiah } from '@/lib/accounting';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	fetchCentralAdminTransactions,
	type CentralAdminTransaction,
	type CentralAdminTransactionSummary,
} from '@/lib/central-admin';

const CATEGORY_OPTIONS = [
	{ value: 'all', label: 'Semua kategori' },
	{ value: 'penjualan', label: 'Penjualan' },
	{ value: 'pembelian', label: 'Pembelian' },
	{ value: 'kas_bank', label: 'Kas & Bank' },
	{ value: 'aset', label: 'Aset' },
	{ value: 'biaya', label: 'Biaya' },
];

const CATEGORY_BADGE: Record<string, string> = {
	penjualan: 'bg-emerald-50 text-emerald-700',
	pembelian: 'bg-sky-50 text-sky-700',
	kas_bank: 'bg-amber-50 text-amber-700',
	aset: 'bg-violet-50 text-violet-700',
	biaya: 'bg-rose-50 text-rose-700',
};

const CATEGORY_LABEL: Record<string, string> = {
	penjualan: 'Penjualan',
	pembelian: 'Pembelian',
	kas_bank: 'Kas & Bank',
	aset: 'Aset',
	biaya: 'Biaya',
};

function categoryLabel(category: string): string {
	return CATEGORY_LABEL[category] ?? category;
}

export function TransactionsPanel() {
	const [transactions, setTransactions] = useState<CentralAdminTransaction[] | null>(null);
	const [summary, setSummary] = useState<CentralAdminTransactionSummary | null>(null);
	const [companies, setCompanies] = useState<{ id: string; name: string; code: string }[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [isDenied, setIsDenied] = useState(false);

	const [search, setSearch] = useState('');
	const [companyId, setCompanyId] = useState('all');
	const [category, setCategory] = useState('all');
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo, setDateTo] = useState('');
	const [produkOnly, setProdukOnly] = useState(false);

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		setIsDenied(false);
		try {
			const data = await fetchCentralAdminTransactions({
				companyId: companyId === 'all' ? undefined : companyId,
				category: category === 'all' ? undefined : category,
				dateFrom: dateFrom || undefined,
				dateTo: dateTo || undefined,
				search: search.trim() || undefined,
				produkOnly: produkOnly || undefined,
				perPage: 500,
			});
			setTransactions(data.transactions);
			setSummary(data.summary);
			setCompanies(data.companies);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				if (err.status === 403) {
					setIsDenied(true);
					setTransactions([]);
					return;
				}
				setError(err.message);
			} else {
				setError('Gagal memuat data transaksi. Periksa koneksi lalu coba lagi.');
			}
			setTransactions([]);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, [companyId, category, dateFrom, dateTo, search, produkOnly]);

	useEffect(() => {
		void load();
	}, [load]);

	const topCategory = useMemo(() => {
		if (!summary || summary.byCategory.length === 0) return null;
		return summary.byCategory[0];
	}, [summary]);

	const topCompany = useMemo(() => {
		if (!summary || summary.byCompany.length === 0) return null;
		return summary.byCompany[0];
	}, [summary]);

	if (isDenied) {
		return (
			<section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-16 text-center shadow-soft">
				<span className="flex size-14 items-center justify-center rounded-full bg-red-50">
					<ShieldOff className="size-7 text-red-600" strokeWidth={2} />
				</span>
				<h1 className="text-2xl font-extrabold tracking-tight">Akses tidak diizinkan</h1>
				<p className="max-w-md text-sm text-muted-foreground">
					Panel Admin Pusat hanya dapat diakses oleh admin pusat Catet Pajak.
				</p>
				<Link
					to="/app"
					className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
				>
					Kembali ke aplikasi
				</Link>
			</section>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<ArrowRightLeft className="size-7 text-primary" strokeWidth={2} />
						Monitoring Transaksi
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Pantau seluruh transaksi keuangan lintas perusahaan: penjualan, pembelian, aset,
						produk, biaya, serta kas & bank.
					</p>
				</div>
				<button
					type="button"
					onClick={() => void load(true)}
					disabled={isRefreshing}
					className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
				>
					{isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
					Muat ulang
				</button>
			</header>

			{/* Ringkasan */}
			<section className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<SummaryCard
					icon={<ArrowRightLeft className="size-5 text-primary" />}
					label="Total transaksi"
					value={summary ? String(summary.total) : '—'}
				/>
				<SummaryCard
					icon={<BadgeDollarSign className="size-5 text-emerald-600" />}
					label="Nilai transaksi"
					value={summary ? formatRupiah(summary.totalAmount) : '—'}
				/>
				<SummaryCard
					icon={<ShoppingBag className="size-5 text-sky-600" />}
					label="Kategori tertinggi"
					value={topCategory ? `${topCategory.label} (${topCategory.count})` : '—'}
				/>
				<SummaryCard
					icon={<Building2 className="size-5 text-violet-600" />}
					label="Perusahaan teratas"
					value={topCompany ? `${topCompany.name} (${topCompany.count})` : '—'}
				/>
			</section>

			{/* Filter */}
			<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
					<div className="relative flex-1 lg:min-w-[16rem]">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<input
							type="search"
							value={search}
							onChange={event => setSearch(event.target.value)}
							placeholder="Cari keterangan atau mitra…"
							className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-primary/20 focus:ring-2"
						/>
					</div>
					<select
						value={companyId}
						onChange={event => setCompanyId(event.target.value)}
						aria-label="Filter perusahaan"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
					>
						<option value="all">Semua perusahaan</option>
						{companies.map(company => (
							<option key={company.id} value={company.id}>
								{company.name}
							</option>
						))}
					</select>
					<select
						value={category}
						onChange={event => setCategory(event.target.value)}
						aria-label="Filter kategori"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
					>
						{CATEGORY_OPTIONS.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium">
						<CalendarRange className="size-4 text-muted-foreground" />
						<input
							type="date"
							value={dateFrom}
							onChange={event => setDateFrom(event.target.value)}
							aria-label="Dari tanggal"
							className="bg-transparent text-sm outline-none"
						/>
						<span className="text-muted-foreground">→</span>
						<input
							type="date"
							value={dateTo}
							onChange={event => setDateTo(event.target.value)}
							aria-label="Sampai tanggal"
							className="bg-transparent text-sm outline-none"
						/>
					</label>
					<label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium">
						<input
							type="checkbox"
							checked={produkOnly}
							onChange={event => setProdukOnly(event.target.checked)}
							className="size-4 accent-primary"
						/>
						Hanya transaksi produk
					</label>
				</div>

				{error ? (
					<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
						{error}
					</p>
				) : null}

				{/* Tabel */}
				{isLoading ? (
					<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" /> Memuat data transaksi…
					</div>
				) : !transactions || transactions.length === 0 ? (
					<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
						Tidak ada transaksi yang cocok dengan filter.
					</p>
				) : (
					<div className="overflow-x-auto rounded-xl border border-border">
						<table className="w-full min-w-[60rem] text-left text-sm">
							<thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3 font-semibold">Tanggal</th>
									<th className="px-4 py-3 font-semibold">Perusahaan</th>
									<th className="px-4 py-3 font-semibold">Kategori</th>
									<th className="px-4 py-3 font-semibold">Keterangan</th>
									<th className="px-4 py-3 font-semibold">Mitra</th>
									<th className="px-4 py-3 font-semibold">Produk</th>
									<th className="px-4 py-3 text-right font-semibold">Nilai</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border bg-background">
								{transactions.map(transaction => (
									<tr key={transaction.id} className="transition-colors hover:bg-secondary/30">
										<td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
											{formatDate(transaction.date)}
										</td>
										<td className="px-4 py-3">
											<span className="font-semibold">{transaction.company.name}</span>
											{transaction.company.code ? (
												<span className="block text-xs text-muted-foreground">
													{transaction.company.code}
												</span>
											) : null}
										</td>
										<td className="px-4 py-3">
											<span
												className={cn(
													'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
													CATEGORY_BADGE[transaction.category] ?? 'bg-secondary text-muted-foreground',
												)}
											>
												{categoryLabel(transaction.category)}
											</span>
										</td>
										<td className="px-4 py-3">
											<span className="text-sm">{transaction.description || '—'}</span>
											{transaction.debit_account || transaction.credit_account ? (
												<span className="block text-[11px] text-muted-foreground">
													{transaction.debit_account}
													{transaction.debit_account && transaction.credit_account ? ' → ' : ''}
													{transaction.credit_account}
												</span>
											) : null}
										</td>
										<td className="px-4 py-3 text-xs">{transaction.partner || '—'}</td>
										<td className="px-4 py-3 text-xs">
											{transaction.product ? (
												<span>
													{transaction.product}
													{transaction.quantity ? (
														<span className="text-muted-foreground"> × {transaction.quantity}</span>
													) : null}
												</span>
											) : (
												'—'
											)}
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
											{formatRupiah(transaction.amount)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{/* Rincian per kategori */}
				{summary && summary.byCategory.length > 0 ? (
					<div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-5">
						{summary.byCategory.map(item => (
							<div
								key={item.category}
								className="flex flex-col gap-1 rounded-xl border border-border bg-background p-3"
							>
								<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									{item.label}
								</span>
								<span className="text-sm font-bold tabular-nums">{formatRupiah(item.amount)}</span>
								<span className="text-[11px] text-muted-foreground">{item.count} transaksi</span>
							</div>
						))}
					</div>
				) : null}
			</section>
		</div>
	);
}

function SummaryCard({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-soft-sm">
			<span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				{icon}
				{label}
			</span>
			<span className="text-lg font-extrabold tracking-tight">{value}</span>
		</div>
	);
}
