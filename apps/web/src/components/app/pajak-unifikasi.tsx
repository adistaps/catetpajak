import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ArrowRightLeft,
	CheckCircle2,
	Download,
	Layers,
	RefreshCw,
	Receipt,
	TrendingDown,
	TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, type Company } from '@/lib/accounting';
import { grossSalary, type Employee } from '@/lib/payroll';
import {
	calcBpjsTk,
	calcPph21,
	calcPph21Ter,
	terCategoryForPtkp,
	terRateFor,
	type Pph21Method,
	type PtkpStatus,
} from '@/lib/payroll-calc';
import {
	BUPOT_TYPE_LABELS,
	getTaxUnification,
	loadPayslipPph21Map,
	TAX_UNIFICATION_STATUS_LABELS,
	type BupotRecord,
	type BupotType,
	type PayslipPph21Entry,
	type TaxUnification,
} from '@/lib/tax';
import type { Transaction } from '@/lib/transactions';
import { cn } from '@/lib/utils';
import { PajakTabs } from './pajak-tabs';
import { pad2, todayIsoDate } from './pajak-shared';

interface PajakUnifikasiProps {
	company: Company;
	ownerId: string;
}

/** Satu baris komponen pajak pada tabel unifikasi. */
interface UnifiedTaxRow {
	jenis: string;
	kategori: 'ppn' | 'pph';
	dpp: number;
	pajak: number;
	keterangan: string;
	sumber: string;
}

const KODE_OBJEK_GAJI = '21-100-01';

export function PajakUnifikasi({ company, ownerId }: PajakUnifikasiProps) {
	const now = new Date();
	const [masaPajak, setMasaPajak] = useState(pad2(now.getMonth() + 1));
	const [tahunPajak, setTahunPajak] = useState(String(now.getFullYear()));
	const [transactions, setTransactions] = useState<Transaction[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [bupotRecords, setBupotRecords] = useState<BupotRecord[]>([]);
	const [payslipMap, setPayslipMap] = useState<Map<string, PayslipPph21Entry>>(new Map());
	const [unification, setUnification] = useState<TaxUnification | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [notes, setNotes] = useState('');

	const period = `${tahunPajak}-${masaPajak}`;

	const loadAll = useCallback(async () => {
		setLoading(true);
		try {
			const compFilter = pb.filter('company = {:c}', { c: company.id });
			const [txnList, empList, bupotList, slipMap, uni] = await Promise.all([
				pb.collection('transactions').getFullList<Transaction>({
					filter: compFilter,
					sort: '-date',
					requestKey: null,
				}),
				pb.collection('employees').getFullList<Employee>({
					filter: compFilter,
					sort: 'name',
					requestKey: null,
				}),
				pb.collection('bupot_records').getFullList<BupotRecord>({
					filter: compFilter,
					sort: '-date',
					requestKey: null,
				}),
				loadPayslipPph21Map(company.id, period),
				getTaxUnification(company.id, masaPajak, tahunPajak),
			]);
			setTransactions(txnList);
			setEmployees(empList);
			setBupotRecords(bupotList);
			setPayslipMap(slipMap);
			setUnification(uni);
			setNotes(uni?.notes ?? '');
		} catch (err) {
			console.error(err);
			toast.error('Gagal memuat data unifikasi pajak.');
		} finally {
			setLoading(false);
		}
	}, [company.id, masaPajak, tahunPajak, period]);

	useEffect(() => {
		void loadAll();
	}, [loadAll]);

	// PPN Keluaran: transaksi penjualan dengan tax_amount > 0 pada masa pajak.
	const ppnKeluaran = useMemo(() => {
		return transactions.filter(
			t =>
				t.category === 'penjualan' &&
				(t.tax_amount || 0) > 0 &&
				(t.date || '').startsWith(period),
		);
	}, [transactions, period]);

	const ppnMasukan = useMemo(() => {
		return transactions.filter(
			t =>
				t.category === 'pembelian' &&
				(t.tax_amount || 0) > 0 &&
				(t.date || '').startsWith(period),
		);
	}, [transactions, period]);

	const totalKeluaran = ppnKeluaran.reduce((s, t) => s + (t.tax_amount || 0), 0);
	const totalMasukan = ppnMasukan.reduce((s, t) => s + (t.tax_amount || 0), 0);
	const dppKeluaran = ppnKeluaran.reduce((s, t) => s + (t.amount || 0) - (t.tax_amount || 0), 0);
	const dppMasukan = ppnMasukan.reduce((s, t) => s + (t.amount || 0) - (t.tax_amount || 0), 0);
	const ppnTerutang = Math.max(0, totalKeluaran - totalMasukan);
	const ppnLebihBayar = totalMasukan > totalKeluaran ? totalMasukan - totalKeluaran : 0;

	// PPh 21 dari slip gaji aktual / estimasi data karyawan.
	const pph21Rows = useMemo(() => {
		return employees
			.filter(e => e.status === 'aktif')
			.map(emp => {
				const slip = payslipMap.get(emp.id);
				const bruto = slip ? slip.gross : grossSalary(emp);
				const base = emp.basic_salary || 0;
				const empPtkp = (emp.ptkp_status ?? 'TK0') as PtkpStatus;
				const empHasNpwp = Boolean((emp.npwp ?? '').trim());
				const empMethod = (emp.pph21_method ?? 'ter') as Pph21Method;
				const bpjsTk = calcBpjsTk(base);
				let tax = 0;
				let source: 'aktual' | 'draf' | 'estimasi' = 'estimasi';

				if (slip) {
					tax = slip.pph21;
					source = slip.posted ? 'aktual' : 'draf';
				} else if (emp.auto_calc) {
					if (empMethod === 'ter') {
						const ter = calcPph21Ter({
							monthlyBruto: bruto,
							ptkpStatus: empPtkp,
							hasNpwp: empHasNpwp,
							pensionContribution: bpjsTk.employeeTotal,
						});
						tax = ter.monthlyTax;
					} else {
						const annual = calcPph21({
							monthlyBruto: bruto,
							ptkpStatus: empPtkp,
							hasNpwp: empHasNpwp,
							annualPensionContribution: bpjsTk.employeeTotal * 12,
						});
						tax = annual.monthlyTax;
					}
				} else {
					tax = emp.pph21 || 0;
				}
				return { emp, bruto, tax, source };
			})
			.filter(r => r.tax > 0);
	}, [employees, payslipMap]);

	const totalPph21 = pph21Rows.reduce((s, r) => s + r.tax, 0);
	const dppPph21 = pph21Rows.reduce((s, r) => s + r.bruto, 0);

	// Bupot manual (PPh 22/23/4(2)/15/26) untuk periode terpilih.
	const bupotManualRows = useMemo(() => {
		return bupotRecords
			.filter(r => (r.date || '').startsWith(period))
			.sort((a, b) => (a.date < b.date ? 1 : -1));
	}, [bupotRecords, period]);

	const totalBupotManual = bupotManualRows.reduce((s, r) => s + (r.amount || 0), 0);
	const dppBupotManual = bupotManualRows.reduce((s, r) => s + (r.dpp || 0), 0);

	// Gabungan semua baris pajak untuk tabel unifikasi.
	const unifiedRows = useMemo((): UnifiedTaxRow[] => {
		const rows: UnifiedTaxRow[] = [];

		// PPN Keluaran (per transaksi)
		for (const t of ppnKeluaran) {
			const dpp = (t.amount || 0) - (t.tax_amount || 0);
			rows.push({
				jenis: 'PPN Keluaran',
				kategori: 'ppn',
				dpp,
				pajak: t.tax_amount || 0,
				keterangan: t.description || t.partner || 'Penjualan kena pajak',
				sumber: 'Penjualan',
			});
		}
		// PPN Masukan (per transaksi)
		for (const t of ppnMasukan) {
			const dpp = (t.amount || 0) - (t.tax_amount || 0);
			rows.push({
				jenis: 'PPN Masukan',
				kategori: 'ppn',
				dpp,
				pajak: t.tax_amount || 0,
				keterangan: t.description || t.partner || 'Pembelian kena pajak',
				sumber: 'Pembelian',
			});
		}
		// PPh 21 (per karyawan)
		for (const r of pph21Rows) {
			rows.push({
				jenis: 'PPh 21',
				kategori: 'pph',
				dpp: r.bruto,
				pajak: r.tax,
				keterangan: `${r.emp.name}${r.emp.position ? ` · ${r.emp.position}` : ''}`,
				sumber: r.source === 'aktual' ? 'Slip gaji' : r.source === 'draf' ? 'Slip draf' : 'Estimasi',
			});
		}
		// Bupot manual (PPh 22/23/dll)
		for (const r of bupotManualRows) {
			rows.push({
				jenis: BUPOT_TYPE_LABELS[r.type as BupotType].split(' — ')[0],
				kategori: 'pph',
				dpp: r.dpp || 0,
				pajak: r.amount || 0,
				keterangan: r.partner || r.description || '—',
				sumber: 'Bupot manual',
			});
		}
		return rows;
	}, [ppnKeluaran, ppnMasukan, pph21Rows, bupotManualRows]);

	const totalDppAll = unifiedRows.reduce((s, r) => s + r.dpp, 0);
	const totalPajakAll = unifiedRows.reduce((s, r) => s + r.pajak, 0);
	// Total pajak terutang = PPN terutang + seluruh PPh (21 + bupot manual).
	// PPN masukan sudah mengurangi PPN keluaran, jadi tidak dihitung ganda.
	const totalPajakTerutang = ppnTerutang + totalPph21 + totalBupotManual;

	const isReconciled = unification?.status === 'reconciled';

	const toggleReconcile = async () => {
		setSaving(true);
		try {
			if (unification) {
				const nextStatus = isReconciled ? 'draft' : 'reconciled';
				const updated = await pb.collection('tax_unifications').update<TaxUnification>(
					unification.id,
					{
						status: nextStatus,
						notes: notes.trim(),
						reconciled_at: nextStatus === 'reconciled' ? todayIsoDate() : '',
					},
				);
				setUnification(updated);
				toast.success(
					nextStatus === 'reconciled'
						? `Masa pajak ${masaPajak}/${tahunPajak} ditandai sudah direkonsiliasi.`
						: `Status rekonsiliasi masa pajak ${masaPajak}/${tahunPajak} dibatalkan.`,
				);
			} else {
				const created = await pb.collection('tax_unifications').create<TaxUnification>({
					company: company.id,
					masa_pajak: masaPajak,
					tahun_pajak: tahunPajak,
					status: 'reconciled',
					notes: notes.trim(),
					reconciled_at: todayIsoDate(),
					owner: ownerId,
				});
				setUnification(created);
				toast.success(`Masa pajak ${masaPajak}/${tahunPajak} ditandai sudah direkonsiliasi.`);
			}
		} catch (err) {
			console.error(err);
			toast.error('Gagal menyimpan status rekonsiliasi.');
		} finally {
			setSaving(false);
		}
	};

	const saveNotes = async () => {
		if (!unification) return;
		setSaving(true);
		try {
			const updated = await pb.collection('tax_unifications').update<TaxUnification>(
				unification.id,
				{ notes: notes.trim() },
			);
			setUnification(updated);
			toast.success('Catatan unifikasi disimpan.');
		} catch (err) {
			console.error(err);
			toast.error('Gagal menyimpan catatan.');
		} finally {
			setSaving(false);
		}
	};

	const exportCsv = () => {
		const escape = (v: string | number) => {
			const s = String(v ?? '');
			if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
			return s;
		};
		const lines: string[] = [];
		lines.push(
			['Jenis Pajak', 'Kategori', 'DPP', 'Pajak', 'Keterangan', 'Sumber']
				.map(escape)
				.join(','),
		);
		for (const r of unifiedRows) {
			lines.push(
				[r.jenis, r.kategori === 'ppn' ? 'PPN' : 'PPh', r.dpp, r.pajak, r.keterangan, r.sumber]
					.map(escape)
					.join(','),
			);
		}
		lines.push('');
		lines.push(`Total DPP,${escape(formatRupiah(totalDppAll))}`);
		lines.push(`Total Pajak,${escape(formatRupiah(totalPajakAll))}`);
		lines.push(`PPN Terutang,${escape(formatRupiah(ppnTerutang))}`);
		lines.push(`PPh 21,${escape(formatRupiah(totalPph21))}`);
		lines.push(`PPh Lain (Bupot),${escape(formatRupiah(totalBupotManual))}`);
		lines.push(`Total Pajak Terutang,${escape(formatRupiah(totalPajakTerutang))}`);
		lines.push(`Status,${escape(TAX_UNIFICATION_STATUS_LABELS[unification?.status ?? 'draft'])}`);

		const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `pajak-unifikasi-${tahunPajak}-${masaPajak}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success('CSV unifikasi pajak diunduh.');
	};

	if (loading) {
		return (
			<div className="mx-auto max-w-[1400px] space-y-6">
				<div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
				<div className="h-10 animate-pulse rounded-2xl bg-muted" />
				<div className="h-64 animate-pulse rounded-2xl bg-muted" />
			</div>
		);
	}

	return (
		<div className="pajak-clean mx-auto flex max-w-[1400px] flex-col gap-6 lg:flex-row lg:items-start">
			<PajakTabs />
			<div className="min-w-0 flex-1 space-y-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
						<Layers className="size-7 text-primary" strokeWidth={2} />
						Pajak Unifikasi
					</h1>
					<p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
						Konsolidasi seluruh kewajiban pajak per masa pajak: PPN (keluaran &amp; masukan),
						PPh 21 dari penggajian, dan bukti potong PPh lain. Tandai masa pajak yang sudah
						direkonsiliasi untuk memantau kesiapan pelaporan SPT.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={exportCsv}
						disabled={unifiedRows.length === 0}
						className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
					>
						<Download className="size-3.5" /> Export CSV
					</button>
					<button
						type="button"
						onClick={() => void loadAll()}
						className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					>
						<RefreshCw className="size-3.5" /> Muat Ulang
					</button>
				</div>
			</header>

			{/* Periode filter */}
			<section className="rounded-2xl border border-border bg-card p-4 shadow-soft-sm">
				<div className="grid gap-3 sm:grid-cols-3">
					<label className="block">
						<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							Masa Pajak
						</span>
						<select
							value={masaPajak}
							onChange={e => setMasaPajak(e.target.value)}
							className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
						>
							{Array.from({ length: 12 }, (_, i) => {
								const m = pad2(i + 1);
								return (
									<option key={m} value={m}>
										{m} — {new Date(2000, i, 1).toLocaleString('id-ID', { month: 'long' })}
									</option>
								);
							})}
						</select>
					</label>
					<label className="block">
						<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							Tahun Pajak
						</span>
						<select
							value={tahunPajak}
							onChange={e => setTahunPajak(e.target.value)}
							className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
						>
							{[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => (
								<option key={y} value={String(y)}>
									{y}
								</option>
							))}
						</select>
					</label>
					<div className="flex items-end">
						<div
							className={cn(
								'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold',
								isReconciled
									? 'border-primary/30 bg-primary/5 text-primary'
									: 'border-amber-200 bg-amber-50 text-amber-700',
							)}
						>
							{isReconciled ? (
								<CheckCircle2 className="size-4 shrink-0" />
							) : (
								<Receipt className="size-4 shrink-0" />
							)}
							<span className="truncate">
								{TAX_UNIFICATION_STATUS_LABELS[unification?.status ?? 'draft']}
								{unification?.reconciled_at
									? ` · ${unification.reconciled_at}`
									: ''}
							</span>
						</div>
					</div>
				</div>
			</section>

			{/* Ringkasan kartu */}
			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<SummaryCard
					icon={TrendingUp}
					label="PPN Terutang"
					value={ppnTerutang}
					subtitle={`Keluaran ${formatRupiah(totalKeluaran)} − Masukan ${formatRupiah(totalMasukan)}${ppnLebihBayar > 0 ? ` · lebih bayar ${formatRupiah(ppnLebihBayar)}` : ''}`}
					tone={ppnTerutang > 0 ? 'warn' : 'muted'}
				/>
				<SummaryCard
					icon={Receipt}
					label="PPh 21"
					value={totalPph21}
					subtitle={`${pph21Rows.length} karyawan · DPP ${formatRupiah(dppPph21)}`}
					tone="primary"
				/>
				<SummaryCard
					icon={TrendingDown}
					label="PPh Lain (Bupot)"
					value={totalBupotManual}
					subtitle={`${bupotManualRows.length} catatan · DPP ${formatRupiah(dppBupotManual)}`}
					tone="info"
				/>
				<SummaryCard
					icon={ArrowRightLeft}
					label="Total Pajak Terutang"
					value={totalPajakTerutang}
					subtitle={`Masa ${masaPajak}/${tahunPajak}`}
					tone="primary"
				/>
			</section>

			{/* Tabel unifikasi */}
			<section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
					<div>
						<h2 className="text-sm font-bold text-foreground">Tabel Unifikasi Pajak</h2>
						<p className="text-[11px] text-muted-foreground">
							{unifiedRows.length} baris · Masa {masaPajak}/{tahunPajak} · gabungan PPN &amp; PPh
						</p>
					</div>
					<div className="flex flex-wrap gap-4 text-right text-[11px]">
						<div>
							<p className="font-semibold uppercase tracking-wide text-muted-foreground">Total DPP</p>
							<p className="text-sm font-bold text-foreground">{formatRupiah(totalDppAll)}</p>
						</div>
						<div>
							<p className="font-semibold uppercase tracking-wide text-muted-foreground">Total Pajak</p>
							<p className="text-sm font-bold text-primary">{formatRupiah(totalPajakAll)}</p>
						</div>
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full min-w-[760px] border-collapse text-left text-xs">
						<thead>
							<tr className="bg-muted/80">
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Jenis Pajak</th>
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Kategori</th>
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Keterangan</th>
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Sumber</th>
								<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">DPP</th>
								<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">Pajak</th>
							</tr>
						</thead>
						<tbody>
							{unifiedRows.length === 0 ? (
								<tr>
									<td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
										Belum ada transaksi pajak pada masa pajak {masaPajak}/{tahunPajak}.
										Buat transaksi penjualan/pembelian dengan PPN atau jalankan penggajian untuk
										mengisi data unifikasi.
									</td>
								</tr>
							) : (
								unifiedRows.map((row, idx) => (
									<tr key={idx} className="border-b border-border/70 hover:bg-primary/5">
										<td className="whitespace-nowrap px-3 py-2.5 font-semibold text-foreground">
											{row.jenis}
										</td>
										<td className="whitespace-nowrap px-3 py-2.5">
											<span
												className={cn(
													'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
													row.kategori === 'ppn'
														? 'bg-sky-100 text-sky-700'
														: 'bg-primary/10 text-primary',
												)}
											>
												{row.kategori === 'ppn' ? 'PPN' : 'PPh'}
											</span>
										</td>
										<td className="max-w-[260px] truncate px-3 py-2.5 text-foreground" title={row.keterangan}>
											{row.keterangan}
										</td>
										<td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{row.sumber}</td>
										<td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-foreground">
											{formatRupiah(row.dpp)}
										</td>
										<td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
											{formatRupiah(row.pajak)}
										</td>
									</tr>
								))
							)}
						</tbody>
						{unifiedRows.length > 0 ? (
							<tfoot>
								<tr className="bg-muted/50 font-semibold">
									<td colSpan={4} className="border-t border-border px-3 py-2.5">
										Total
									</td>
									<td className="border-t border-border px-3 py-2.5 text-right tabular-nums">
										{formatRupiah(totalDppAll)}
									</td>
									<td className="border-t border-border px-3 py-2.5 text-right tabular-nums text-primary">
										{formatRupiah(totalPajakAll)}
									</td>
								</tr>
							</tfoot>
						) : null}
					</table>
				</div>
			</section>

			{/* Rincian per komponen */}
			<section className="grid gap-4 lg:grid-cols-2">
				{/* PPN detail */}
				<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
					<div className="border-b border-border px-4 py-3">
						<h2 className="text-sm font-bold text-foreground">Rincian PPN</h2>
						<p className="text-[11px] text-muted-foreground">
							PPN Keluaran dikurangi PPN Masukan pada masa pajak ini.
						</p>
					</div>
					<div className="divide-y divide-border/70 text-xs">
						<DetailRow label="PPN Keluaran" count={ppnKeluaran.length} dpp={dppKeluaran} pajak={totalKeluaran} tone="primary" />
						<DetailRow label="PPN Masukan" count={ppnMasukan.length} dpp={dppMasukan} pajak={totalMasukan} tone="info" />
						<DetailRow label="PPN Terutang / (Lebih Bayar)" dpp={0} pajak={ppnTerutang} tone={ppnTerutang > 0 ? 'warn' : 'muted'} bold />
					</div>
				</div>

				{/* PPh detail */}
				<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
					<div className="border-b border-border px-4 py-3">
						<h2 className="text-sm font-bold text-foreground">Rincian PPh</h2>
						<p className="text-[11px] text-muted-foreground">
							PPh 21 dari penggajian dan bukti potong PPh lain.
						</p>
					</div>
					<div className="divide-y divide-border/70 text-xs">
						<DetailRow label="PPh 21" count={pph21Rows.length} dpp={dppPph21} pajak={totalPph21} tone="primary" />
						<DetailRow label="PPh Lain (Bupot)" count={bupotManualRows.length} dpp={dppBupotManual} pajak={totalBupotManual} tone="info" />
						<DetailRow label="Total PPh" dpp={0} pajak={totalPph21 + totalBupotManual} tone="primary" bold />
					</div>
				</div>
			</section>

			{/* Rekonsiliasi & catatan */}
			<section className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
							<CheckCircle2 className="size-4 text-primary" /> Rekonsiliasi Masa Pajak
						</h2>
						<p className="mt-1 text-[11px] text-muted-foreground">
							Tandai masa pajak {masaPajak}/{tahunPajak} sebagai sudah direkonsiliasi setelah
							memverifikasi seluruh komponen pajak. Ini hanya penanda internal — bukan
							pelaporan resmi ke DJP.
						</p>
					</div>
					<button
						type="button"
						onClick={() => void toggleReconcile()}
						disabled={saving}
						className={cn(
							'flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors disabled:opacity-50',
							isReconciled
								? 'border border-border bg-background text-muted-foreground hover:bg-secondary'
								: 'bg-primary text-primary-foreground hover:bg-primary/90',
						)}
					>
						<CheckCircle2 className="size-3.5" />
						{saving
							? 'Menyimpan…'
							: isReconciled
								? 'Batalkan Rekonsiliasi'
								: 'Tandai Sudah Direkonsiliasi'}
					</button>
				</div>
				<div className="mt-4">
					<label htmlFor="unifikasi-notes" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						Catatan rekonsiliasi
					</label>
					<textarea
						id="unifikasi-notes"
						value={notes}
						onChange={e => setNotes(e.target.value)}
						rows={3}
						placeholder="Catatan verifikasi, referensi SPT, atau hal yang perlu ditindaklanjuti…"
						className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
					/>
					{unification ? (
						<div className="mt-2 flex justify-end">
							<button
								type="button"
								onClick={() => void saveNotes()}
								disabled={saving}
								className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-50"
							>
								Simpan Catatan
							</button>
						</div>
					) : null}
				</div>
				{isReconciled && unification?.reconciled_at ? (
					<p className="mt-3 text-[11px] text-muted-foreground">
						Direkonsiliasi pada {unification.reconciled_at}. Pastikan data PPN, PPh 21, dan bupot
						sudah final sebelum menandai masa pajak berikutnya.
					</p>
				) : null}
			</section>

			<p className="text-center text-[11px] text-muted-foreground">
				Pajak Unifikasi adalah alat bantu konsolidasi internal. Pelaporan resmi SPT Masa tetap
				dilakukan melalui e-Faktur / e-Bupot / DJP Online.
			</p>
			</div>
		</div>
	);
}

function SummaryCard({
	icon: Icon,
	label,
	value,
	subtitle,
	tone,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number;
	subtitle: string;
	tone: 'primary' | 'info' | 'warn' | 'muted';
}) {
	return (
		<div
			className={cn(
				'rounded-2xl border bg-card p-5 shadow-soft-sm',
				tone === 'primary' && 'border-primary/20',
				tone === 'info' && 'border-sky-200',
				tone === 'warn' && 'border-amber-200',
				tone === 'muted' && 'border-border',
			)}
		>
			<div className="flex items-center gap-2">
				<span
					className={cn(
						'flex size-9 items-center justify-center rounded-xl',
						tone === 'primary' && 'bg-primary/10 text-primary',
						tone === 'info' && 'bg-sky-100 text-sky-700',
						tone === 'warn' && 'bg-amber-100 text-amber-700',
						tone === 'muted' && 'bg-secondary text-muted-foreground',
					)}
				>
					<Icon className="size-5" />
				</span>
				<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
			</div>
			<p
				className={cn(
					'mt-3 text-2xl font-bold tracking-tight',
					tone === 'primary' && 'text-primary',
					tone === 'info' && 'text-sky-700',
					tone === 'warn' && 'text-amber-700',
					tone === 'muted' && 'text-foreground',
				)}
			>
				{formatRupiah(value)}
			</p>
			<p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
		</div>
	);
}

function DetailRow({
	label,
	count,
	dpp,
	pajak,
	tone,
	bold,
}: {
	label: string;
	count?: number;
	dpp: number;
	pajak: number;
	tone: 'primary' | 'info' | 'warn' | 'muted';
	bold?: boolean;
}) {
	return (
		<div className="flex items-center justify-between px-4 py-3">
			<div className="min-w-0">
				<p className={cn('text-foreground', bold ? 'font-bold' : 'font-semibold')}>{label}</p>
				{count !== undefined ? (
					<p className="text-[10px] text-muted-foreground">{count} transaksi/catatan</p>
				) : null}
			</div>
			<div className="flex shrink-0 gap-6 text-right">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">DPP</p>
					<p className={cn('tabular-nums', bold ? 'font-bold text-foreground' : 'text-foreground')}>
						{formatRupiah(dpp)}
					</p>
				</div>
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pajak</p>
					<p
						className={cn(
							'tabular-nums',
							bold ? 'font-bold' : 'font-semibold',
							tone === 'primary' && 'text-primary',
							tone === 'info' && 'text-sky-700',
							tone === 'warn' && 'text-amber-700',
							tone === 'muted' && 'text-foreground',
						)}
					>
						{formatRupiah(pajak)}
					</p>
				</div>
			</div>
		</div>
	);
}
