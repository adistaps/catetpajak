import { useEffect, useMemo, useState } from 'react';
import {
	ArrowRightLeft,
	Building,
	Plus,
	Receipt,
	RefreshCw,
	Settings,
	Trash2,
	TrendingDown,
	TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, type Account, type Company } from '@/lib/accounting';
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
	BUPOT_STATUS_LABELS,
	BUPOT_TYPE_LABELS,
	BUPOT_TYPE_OPTIONS,
	TAX_TYPE_KIND_LABELS,
	getOrCreateTaxSettings,
	loadPayslipPph21Map,
	loadTaxTypes,
	type BupotRecord,
	type BupotStatus,
	type BupotType,
	type PayslipPph21Entry,
	type TaxSettings,
	type TaxType,
	type TaxTypeKind,
} from '@/lib/tax';
import type { Transaction } from '@/lib/transactions';
import { cn } from '@/lib/utils';
import { PajakTabs } from './pajak-tabs';
import { pad2, todayIsoDate } from './pajak-shared';

interface PajakSettingsProps {
	company: Company;
	ownerId: string;
}

type BupotTab = 'keluaran' | 'masukan' | 'bupot';

const KODE_OBJEK_GAJI = '21-100-01';

export function PajakSettings({ company, ownerId }: PajakSettingsProps) {
	const now = new Date();
	const [tab, setTab] = useState<BupotTab>('keluaran');
	const [settings, setSettings] = useState<TaxSettings | null>(null);
	const [taxTypes, setTaxTypes] = useState<TaxType[]>([]);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [transactions, setTransactions] = useState<Transaction[]>([]);
	const [bupotRecords, setBupotRecords] = useState<BupotRecord[]>([]);
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [payslipMap, setPayslipMap] = useState<Map<string, PayslipPph21Entry>>(new Map());
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	// Filter periode
	const [masaPajak, setMasaPajak] = useState(pad2(now.getMonth() + 1));
	const [tahunPajak, setTahunPajak] = useState(String(now.getFullYear()));

	// Form pengaturan
	const [form, setForm] = useState({
		ppn_rate: 11,
		npwp: '',
		pkp_status: 'pkp' as 'pkp' | 'non_pkp',
		tax_office: '',
		ppn_keluaran_account: '',
		ppn_masukan_account: '',
		bupot_account: '',
	});

	const loadAll = async () => {
		setLoading(true);
		try {
			const ts = await getOrCreateTaxSettings(company.id, ownerId);
			setSettings(ts);
			setForm({
				ppn_rate: ts.ppn_rate ?? 11,
				npwp: ts.npwp ?? '',
				pkp_status: (ts.pkp_status ?? 'pkp') as 'pkp' | 'non_pkp',
				tax_office: ts.tax_office ?? '',
				ppn_keluaran_account: ts.ppn_keluaran_account ?? '',
				ppn_masukan_account: ts.ppn_masukan_account ?? '',
				bupot_account: ts.bupot_account ?? '',
			});

			const compFilter = pb.filter('company = {:c}', { c: company.id });
			const [acctList, txnList, bupotList, empList, typeList] = await Promise.all([
				pb.collection('accounts').getFullList<Account>({ filter: compFilter, sort: 'code' }),
				pb.collection('transactions').getFullList<Transaction>({ filter: compFilter, sort: '-date' }),
				pb.collection('bupot_records').getFullList<BupotRecord>({ filter: compFilter, sort: '-date' }),
				pb.collection('employees').getFullList<Employee>({ filter: compFilter, sort: 'name' }),
				loadTaxTypes(company.id, ownerId),
			]);
			setAccounts(acctList);
			setTransactions(txnList);
			setBupotRecords(bupotList);
			setEmployees(empList);
			setTaxTypes(typeList);
		} catch (err) {
			console.error(err);
			toast.error('Gagal memuat pengaturan pajak.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadAll();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [company.id]);

	// Muat PPh 21 aktual dari slip gaji menu Penggajian untuk masa pajak terpilih.
	useEffect(() => {
		let active = true;
		const period = `${tahunPajak}-${masaPajak}`;
		loadPayslipPph21Map(company.id, period).then(map => {
			if (active) setPayslipMap(map);
		});
		return () => {
			active = false;
		};
	}, [company.id, masaPajak, tahunPajak]);

	// PPN Keluaran: transaksi penjualan dengan tax_amount > 0
	const ppnKeluaran = useMemo(() => {
		const year = tahunPajak;
		const month = masaPajak;
		return transactions
			.filter(
				t =>
					t.category === 'penjualan' &&
					(t.tax_amount || 0) > 0 &&
					(t.date || '').startsWith(`${year}-${month}`),
			)
			.sort((a, b) => (a.date < b.date ? 1 : -1));
	}, [transactions, masaPajak, tahunPajak]);

	const ppnMasukan = useMemo(() => {
		const year = tahunPajak;
		const month = masaPajak;
		return transactions
			.filter(
				t =>
					t.category === 'pembelian' &&
					(t.tax_amount || 0) > 0 &&
					(t.date || '').startsWith(`${year}-${month}`),
			)
			.sort((a, b) => (a.date < b.date ? 1 : -1));
	}, [transactions, masaPajak, tahunPajak]);

	const totalKeluaran = ppnKeluaran.reduce((s, t) => s + (t.tax_amount || 0), 0);
	const totalMasukan = ppnMasukan.reduce((s, t) => s + (t.tax_amount || 0), 0);
	const dppKeluaran = ppnKeluaran.reduce((s, t) => s + (t.amount || 0) - (t.tax_amount || 0), 0);
	const dppMasukan = ppnMasukan.reduce((s, t) => s + (t.amount || 0) - (t.tax_amount || 0), 0);
	const ppnTerutang = Math.max(0, totalKeluaran - totalMasukan);

	// Bupot PPh 21: pakai slip gaji aktual dari menu Penggajian bila ada untuk
	// masa pajak terpilih; jika belum dijalankan, jatuh ke estimasi data karyawan.
	const bupotPph21Rows = useMemo(() => {
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
				let rate = 0;
				let source: 'aktual' | 'draf' | 'estimasi' = 'estimasi';

				if (slip) {
					tax = slip.pph21;
					rate = bruto > 0 ? tax / bruto : 0;
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
						const cat = terCategoryForPtkp(empPtkp);
						rate = terRateFor(Math.max(0, bruto - bpjsTk.employeeTotal), cat, empHasNpwp);
					} else {
						const annual = calcPph21({
							monthlyBruto: bruto,
							ptkpStatus: empPtkp,
							hasNpwp: empHasNpwp,
							annualPensionContribution: bpjsTk.employeeTotal * 12,
						});
						tax = annual.monthlyTax;
						rate = bruto > 0 ? tax / bruto : 0;
					}
				} else {
					tax = emp.pph21 || 0;
					rate = bruto > 0 ? tax / bruto : 0;
				}
				return {
					emp,
					bruto,
					rate,
					tax,
					npwp: (emp.npwp ?? '').trim(),
					source,
				};
			})
			.filter(r => r.tax > 0);
	}, [employees, payslipMap]);

	const totalBupotPph21 = bupotPph21Rows.reduce((s, r) => s + r.tax, 0);

	// Bupot manual (PPh 22/23/dll) untuk periode terpilih
	const bupotManualRows = useMemo(() => {
		return bupotRecords
			.filter(r => (r.date || '').startsWith(`${tahunPajak}-${masaPajak}`))
			.sort((a, b) => (a.date < b.date ? 1 : -1));
	}, [bupotRecords, masaPajak, tahunPajak]);

	const totalBupotManual = bupotManualRows.reduce((s, r) => s + (r.amount || 0), 0);
	const totalBupotAll = totalBupotPph21 + totalBupotManual;

	const saveSettings = async () => {
		if (!settings) return;
		setSaving(true);
		try {
			const updated = await pb.collection('tax_settings').update<TaxSettings>(settings.id, {
				ppn_rate: Number(form.ppn_rate) || 0,
				npwp: form.npwp.trim(),
				pkp_status: form.pkp_status,
				tax_office: form.tax_office.trim(),
				ppn_keluaran_account: form.ppn_keluaran_account || null,
				ppn_masukan_account: form.ppn_masukan_account || null,
				bupot_account: form.bupot_account || null,
			});
			setSettings(updated);
			toast.success('Pengaturan pajak disimpan.');
		} catch (err) {
			console.error(err);
			toast.error('Gagal menyimpan pengaturan pajak.');
		} finally {
			setSaving(false);
		}
	};

	const exportPpnCsv = () => {
		const rows: string[] = [];
		rows.push('Jenis,Tanggal,Deskripsi,Mitra,DPP,PPN');
		for (const t of ppnKeluaran) {
			const dpp = (t.amount || 0) - (t.tax_amount || 0);
			rows.push(`Keluaran,${t.date},${csv(t.description)},${csv(t.partner)},${dpp},${t.tax_amount || 0}`);
		}
		for (const t of ppnMasukan) {
			const dpp = (t.amount || 0) - (t.tax_amount || 0);
			rows.push(`Masukan,${t.date},${csv(t.description)},${csv(t.partner)},${dpp},${t.tax_amount || 0}`);
		}
		downloadCsv(rows.join('\n'), `ppn-${tahunPajak}-${masaPajak}.csv`);
		toast.success('CSV PPN diunduh.');
	};

	const exportBupotCsv = () => {
		const rows: string[] = [];
		rows.push('Jenis PPh,Tanggal,Mitra/Nama,NPWP,DPP,Tarif,Amount,Status');
		for (const r of bupotPph21Rows) {
			rows.push(
				`PPh 21,${tahunPajak}-${masaPajak}-10,${csv(r.emp.name)},${csv(r.npwp) || '—'},${r.bruto},${(r.rate * 100).toFixed(2)}%,${r.tax},${r.source === 'aktual' ? 'Aktual' : r.source === 'draf' ? 'Draf' : 'Estimasi'}`,
			);
		}
		for (const r of bupotManualRows) {
			rows.push(
				`${BUPOT_TYPE_LABELS[r.type].split(' — ')[0]},${r.date},${csv(r.partner)},${csv(r.npwp) || '—'},${r.dpp || 0},${r.rate || 0}%,${r.amount || 0},${BUPOT_STATUS_LABELS[r.status]}`,
			);
		}
		downloadCsv(rows.join('\n'), `bupot-${tahunPajak}-${masaPajak}.csv`);
		toast.success('CSV bukti potong diunduh.');
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
						<Settings className="size-7 text-primary" strokeWidth={2} />
						Pengaturan Pajak
					</h1>
					<p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
						Kelola PPN keluaran & masukan, bukti potong (bupot) PPh, serta konfigurasi tarif dan
						akun pajak perusahaan.
					</p>
				</div>
				<button
					type="button"
					onClick={() => void loadAll()}
					className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
				>
					<RefreshCw className="size-3.5" /> Muat Ulang
				</button>
			</header>

			{/* Jenis pajak — dipakai di form transaksi & dokumen */}
			<TaxTypesManager
				companyId={company.id}
				ownerId={ownerId}
				accounts={accounts}
				taxTypes={taxTypes}
				onChanged={async () => {
					const list = await loadTaxTypes(company.id, ownerId);
					setTaxTypes(list);
				}}
			/>

			{/* Pengaturan umum */}
			<section className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
				<h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
					<Building className="size-4 text-primary" /> Identitas & Akun Pajak
				</h2>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<label className="block">
						<span className="mb-1.5 block text-xs font-semibold text-muted-foreground">NPWP Perusahaan</span>
						<input
							type="text"
							value={form.npwp}
							onChange={e => setForm(prev => ({ ...prev, npwp: e.target.value }))}
							placeholder="00.000.000.0-000.000"
							className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
						/>
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Tarif PPN default (%)</span>
						<input
							type="number"
							min={0}
							step="0.01"
							value={form.ppn_rate}
							onChange={e => setForm(prev => ({ ...prev, ppn_rate: Number(e.target.value) }))}
							className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
						/>
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Status PKP</span>
						<select
							value={form.pkp_status}
							onChange={e => setForm(prev => ({ ...prev, pkp_status: e.target.value as 'pkp' | 'non_pkp' }))}
							className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
						>
							<option value="pkp">PKP (Pengusaha Kena Pajak)</option>
							<option value="non_pkp">Non-PKP</option>
						</select>
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-semibold text-muted-foreground">KPP / Kantor Pajak</span>
						<input
							type="text"
							value={form.tax_office}
							onChange={e => setForm(prev => ({ ...prev, tax_office: e.target.value }))}
							placeholder="KPP Pratama ..."
							className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
						/>
					</label>
					<AccountSelect
						label="Akun PPN Keluaran"
						accounts={accounts}
						value={form.ppn_keluaran_account}
						onChange={v => setForm(prev => ({ ...prev, ppn_keluaran_account: v }))}
					/>
					<AccountSelect
						label="Akun PPN Masukan"
						accounts={accounts}
						value={form.ppn_masukan_account}
						onChange={v => setForm(prev => ({ ...prev, ppn_masukan_account: v }))}
					/>
					<AccountSelect
						label="Akun Utang PPh (Bupot)"
						accounts={accounts}
						value={form.bupot_account}
						onChange={v => setForm(prev => ({ ...prev, bupot_account: v }))}
					/>
					<div className="flex items-end">
						<button
							type="button"
							onClick={saveSettings}
							disabled={saving}
							className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						>
							{saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
						</button>
					</div>
				</div>
			</section>

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
					<div className="flex items-end gap-2">
						<button
							type="button"
							onClick={exportPpnCsv}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
						>
							Export PPN
						</button>
						<button
							type="button"
							onClick={exportBupotCsv}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
						>
							Export Bupot
						</button>
					</div>
				</div>
			</section>

			{/* Ringkasan PPN */}
			<section className="grid gap-4 sm:grid-cols-3">
				<SummaryCard
					icon={TrendingUp}
					label="PPN Keluaran"
					value={totalKeluaran}
					subtitle={`${ppnKeluaran.length} transaksi · DPP ${formatRupiah(dppKeluaran)}`}
					tone="primary"
				/>
				<SummaryCard
					icon={TrendingDown}
					label="PPN Masukan"
					value={totalMasukan}
					subtitle={`${ppnMasukan.length} transaksi · DPP ${formatRupiah(dppMasukan)}`}
					tone="info"
				/>
				<SummaryCard
					icon={ArrowRightLeft}
					label="PPN Terutang"
					value={ppnTerutang}
					subtitle={ppnTerutang > 0 ? 'Kurang bayar' : 'Lebih bayar / nihil'}
					tone={ppnTerutang > 0 ? 'warn' : 'muted'}
				/>
			</section>

			{/* Tab PPN / Bupot */}
			<div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-soft-sm">
				{(
					[
						{ key: 'keluaran', label: 'Pajak Keluaran' },
						{ key: 'masukan', label: 'Pajak Masukan' },
						{ key: 'bupot', label: 'Bukti Potong (Bupot)' },
					] as const
				).map(t => (
					<button
						key={t.key}
						type="button"
						onClick={() => setTab(t.key)}
						className={cn(
							'flex-1 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors',
							tab === t.key
								? 'bg-primary text-primary-foreground shadow-soft-sm'
								: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
						)}
					>
						{t.label}
					</button>
				))}
			</div>

			{tab === 'keluaran' ? (
				<PpnTable
					title="Pajak Keluaran (PPN Keluaran)"
					description="PPN dipungut dari penjualan kena pajak pada masa pajak ini."
					rows={ppnKeluaran}
					emptyText="Belum ada transaksi penjualan dengan PPN pada masa pajak ini."
				/>
			) : null}

			{tab === 'masukan' ? (
				<PpnTable
					title="Pajak Masukan (PPN Masukan)"
					description="PPN dibayar pada pembelian kena pajak yang dapat dikreditkan."
					rows={ppnMasukan}
					emptyText="Belum ada transaksi pembelian dengan PPN pada masa pajak ini."
				/>
			) : null}

			{tab === 'bupot' ? (
				<BupotSection
					companyId={company.id}
					ownerId={ownerId}
					masaPajak={masaPajak}
					tahunPajak={tahunPajak}
					bupotPph21Rows={bupotPph21Rows}
					totalBupotPph21={totalBupotPph21}
					bupotManualRows={bupotManualRows}
					totalBupotManual={totalBupotManual}
					totalBupotAll={totalBupotAll}
					onChanged={loadAll}
				/>
			) : null}
			</div>
		</div>
	);
}

function AccountSelect({
	label,
	accounts,
	value,
	onChange,
}: {
	label: string;
	accounts: Account[];
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<label className="block">
			<span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
			<select
				value={value}
				onChange={e => onChange(e.target.value)}
				className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
			>
				<option value="">— Pilih akun —</option>
				{accounts.map(a => (
					<option key={a.id} value={a.id}>
						{a.code} · {a.name}
					</option>
				))}
			</select>
		</label>
	);
}

function TaxTypesManager({
	companyId,
	ownerId,
	accounts,
	taxTypes,
	onChanged,
}: {
	companyId: string;
	ownerId: string;
	accounts: Account[];
	taxTypes: TaxType[];
	onChanged: () => void | Promise<void>;
}) {
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		name: '',
		code: '',
		rate: '11',
		kind: 'ppn' as TaxTypeKind,
		account: '',
		is_active: true,
	});

	const resetForm = () => {
		setForm({ name: '', code: '', rate: '11', kind: 'ppn', account: '', is_active: true });
		setEditingId(null);
		setShowForm(false);
	};

	const startEdit = (t: TaxType) => {
		setEditingId(t.id);
		setForm({
			name: t.name,
			code: t.code || '',
			rate: String(t.rate ?? 0),
			kind: (t.kind || 'ppn') as TaxTypeKind,
			account: t.account || '',
			is_active: t.is_active !== false,
		});
		setShowForm(true);
	};

	const submit = async () => {
		const name = form.name.trim();
		if (!name) {
			toast.error('Nama jenis pajak wajib diisi.');
			return;
		}
		const rate = Number(form.rate);
		if (Number.isNaN(rate) || rate < 0) {
			toast.error('Tarif tidak valid.');
			return;
		}
		setSaving(true);
		try {
			const payload = {
				name,
				code: form.code.trim(),
				rate,
				kind: form.kind,
				account: form.account || null,
				is_active: form.is_active,
			};
			if (editingId) {
				await pb.collection('tax_types').update(editingId, payload);
				toast.success('Jenis pajak diperbarui.');
			} else {
				await pb.collection('tax_types').create({
					...payload,
					company: companyId,
					owner: ownerId,
					sort_order: taxTypes.length,
				});
				toast.success('Jenis pajak ditambahkan. Akan muncul di kolom Pajak transaksi.');
			}
			resetForm();
			await onChanged();
		} catch (err: unknown) {
			console.error(err);
			const msg =
				err && typeof err === 'object' && 'response' in err
					? // eslint-disable-next-line @typescript-eslint/no-explicit-any
						(err as any).response?.data?.name?.message
					: null;
			toast.error(msg === 'Value must be unique.' ? 'Nama jenis pajak sudah ada.' : 'Gagal menyimpan jenis pajak.');
		} finally {
			setSaving(false);
		}
	};

	const remove = async (id: string) => {
		if (!confirm('Hapus jenis pajak ini? Transaksi lama tetap menyimpan tarifnya.')) return;
		try {
			await pb.collection('tax_types').delete(id);
			toast.success('Jenis pajak dihapus.');
			await onChanged();
		} catch (err) {
			console.error(err);
			toast.error('Gagal menghapus jenis pajak.');
		}
	};

	const toggleActive = async (t: TaxType) => {
		try {
			await pb.collection('tax_types').update(t.id, { is_active: t.is_active === false });
			await onChanged();
		} catch (err) {
			console.error(err);
			toast.error('Gagal mengubah status.');
		}
	};

	return (
		<section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
				<div>
					<h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
						<Receipt className="size-4 text-primary" /> Jenis Pajak
					</h2>
					<p className="mt-1 text-[11px] text-muted-foreground">
						Buat jenis pajak di sini. Saat membuat transaksi atau dokumen, kolom Pajak menampilkan daftar ini.
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						if (showForm && !editingId) resetForm();
						else {
							setEditingId(null);
							setForm({ name: '', code: '', rate: '11', kind: 'ppn', account: '', is_active: true });
							setShowForm(true);
						}
					}}
					className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
				>
					<Plus className="size-3.5" /> Tambah Jenis Pajak
				</button>
			</div>

			{showForm ? (
				<div className="border-b border-border bg-secondary/30 p-5">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<label className="block">
							<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								Nama *
							</span>
							<input
								type="text"
								value={form.name}
								onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
								placeholder="mis. PPN 11%"
								className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
							/>
						</label>
						<label className="block">
							<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								Kode
							</span>
							<input
								type="text"
								value={form.code}
								onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
								placeholder="PPN11"
								className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
							/>
						</label>
						<label className="block">
							<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								Tarif (%)
							</span>
							<input
								type="number"
								min={0}
								step="0.01"
								value={form.rate}
								onChange={e => setForm(prev => ({ ...prev, rate: e.target.value }))}
								className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
							/>
						</label>
						<label className="block">
							<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								Kategori
							</span>
							<select
								value={form.kind}
								onChange={e => setForm(prev => ({ ...prev, kind: e.target.value as TaxTypeKind }))}
								className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
							>
								{(Object.keys(TAX_TYPE_KIND_LABELS) as TaxTypeKind[]).map(k => (
									<option key={k} value={k}>
										{TAX_TYPE_KIND_LABELS[k]}
									</option>
								))}
							</select>
						</label>
						<label className="block">
							<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								Akun (opsional)
							</span>
							<select
								value={form.account}
								onChange={e => setForm(prev => ({ ...prev, account: e.target.value }))}
								className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
							>
								<option value="">— Tidak dihubungkan —</option>
								{accounts.map(a => (
									<option key={a.id} value={a.id}>
										{a.code} · {a.name}
									</option>
								))}
							</select>
						</label>
						<label className="flex items-end gap-2 pb-2">
							<input
								type="checkbox"
								checked={form.is_active}
								onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
								className="size-4 rounded border-input text-primary"
							/>
							<span className="text-sm font-medium text-foreground">Aktif (tampil di transaksi)</span>
						</label>
					</div>
					<div className="mt-4 flex justify-end gap-2">
						<button
							type="button"
							onClick={resetForm}
							className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary"
						>
							Batal
						</button>
						<button
							type="button"
							onClick={() => void submit()}
							disabled={saving}
							className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						>
							{saving ? 'Menyimpan…' : editingId ? 'Simpan Perubahan' : 'Simpan Jenis Pajak'}
						</button>
					</div>
				</div>
			) : null}

			<div className="overflow-x-auto">
				<table className="w-full min-w-[640px] border-collapse text-left text-xs">
					<thead>
						<tr className="bg-muted/80">
							<th className="border-b border-border px-4 py-2.5 font-semibold text-muted-foreground">Nama</th>
							<th className="border-b border-border px-4 py-2.5 font-semibold text-muted-foreground">Kode</th>
							<th className="border-b border-border px-4 py-2.5 font-semibold text-muted-foreground">Kategori</th>
							<th className="border-b border-border px-4 py-2.5 text-right font-semibold text-muted-foreground">Tarif</th>
							<th className="border-b border-border px-4 py-2.5 font-semibold text-muted-foreground">Status</th>
							<th className="border-b border-border px-4 py-2.5" />
						</tr>
					</thead>
					<tbody>
						{taxTypes.length === 0 ? (
							<tr>
								<td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
									Belum ada jenis pajak. Tambahkan agar muncul di form transaksi.
								</td>
							</tr>
						) : (
							taxTypes.map(t => (
								<tr key={t.id} className="border-b border-border/70 hover:bg-primary/5">
									<td className="px-4 py-2.5 font-semibold text-foreground">{t.name}</td>
									<td className="px-4 py-2.5 font-mono text-muted-foreground">{t.code || '—'}</td>
									<td className="px-4 py-2.5 text-muted-foreground">
										{TAX_TYPE_KIND_LABELS[t.kind] || t.kind || '—'}
									</td>
									<td className="px-4 py-2.5 text-right font-semibold tabular-nums text-primary">
										{Number(t.rate || 0)}%
									</td>
									<td className="px-4 py-2.5">
										<button
											type="button"
											onClick={() => void toggleActive(t)}
											className={cn(
												'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
												t.is_active !== false
													? 'bg-primary/10 text-primary hover:bg-primary/20'
													: 'bg-muted text-muted-foreground hover:bg-secondary',
											)}
										>
											{t.is_active !== false ? 'Aktif' : 'Nonaktif'}
										</button>
									</td>
									<td className="px-4 py-2.5 text-right">
										<div className="flex items-center justify-end gap-2">
											<button
												type="button"
												onClick={() => startEdit(t)}
												className="text-xs font-semibold text-primary hover:underline"
											>
												Ubah
											</button>
											<button
												type="button"
												onClick={() => void remove(t.id)}
												className="text-muted-foreground transition-colors hover:text-destructive"
												aria-label="Hapus"
											>
												<Trash2 className="size-4" />
											</button>
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</section>
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

function PpnTable({
	title,
	description,
	rows,
	emptyText,
}: {
	title: string;
	description: string;
	rows: Transaction[];
	emptyText: string;
}) {
	const totalDpp = rows.reduce((s, t) => s + (t.amount || 0) - (t.tax_amount || 0), 0);
	const totalPpn = rows.reduce((s, t) => s + (t.tax_amount || 0), 0);
	return (
		<section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
			<div className="border-b border-border px-4 py-3">
				<h2 className="text-sm font-bold text-foreground">{title}</h2>
				<p className="text-[11px] text-muted-foreground">{description}</p>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[640px] border-collapse text-left text-xs">
					<thead>
						<tr className="bg-muted/80">
							<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Tanggal</th>
							<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Deskripsi</th>
							<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Mitra</th>
							<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">DPP</th>
							<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">Tarif</th>
							<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">PPN</th>
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 ? (
							<tr>
								<td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
									{emptyText}
								</td>
							</tr>
						) : (
							rows.map(t => {
								const dpp = (t.amount || 0) - (t.tax_amount || 0);
								const rate = dpp > 0 ? ((t.tax_amount || 0) / dpp) * 100 : 0;
								return (
									<tr key={t.id} className="border-b border-border/70 hover:bg-primary/5">
										<td className="whitespace-nowrap px-3 py-2.5 text-foreground">{t.date}</td>
										<td className="max-w-[260px] truncate px-3 py-2.5 text-foreground" title={t.description}>
											{t.description || '—'}
										</td>
										<td className="px-3 py-2.5 text-muted-foreground">{t.partner || '—'}</td>
										<td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatRupiah(dpp)}</td>
										<td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
											{rate.toFixed(2)}%
										</td>
										<td className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
											{formatRupiah(t.tax_amount || 0)}
										</td>
									</tr>
								);
							})
						)}
					</tbody>
					{rows.length > 0 ? (
						<tfoot>
							<tr className="bg-muted/50 font-semibold">
								<td colSpan={3} className="border-t border-border px-3 py-2.5">
									Total
								</td>
								<td className="border-t border-border px-3 py-2.5 text-right tabular-nums">{formatRupiah(totalDpp)}</td>
								<td className="border-t border-border px-3 py-2.5" />
								<td className="border-t border-border px-3 py-2.5 text-right tabular-nums text-primary">
									{formatRupiah(totalPpn)}
								</td>
							</tr>
						</tfoot>
					) : null}
				</table>
			</div>
		</section>
	);
}

interface BupotSectionProps {
	companyId: string;
	ownerId: string;
	masaPajak: string;
	tahunPajak: string;
	bupotPph21Rows: Array<{ emp: Employee; bruto: number; rate: number; tax: number; npwp: string; source: 'aktual' | 'draf' | 'estimasi' }>;
	totalBupotPph21: number;
	bupotManualRows: BupotRecord[];
	totalBupotManual: number;
	totalBupotAll: number;
	onChanged: () => void;
}

function BupotSection({
	companyId,
	ownerId,
	masaPajak,
	tahunPajak,
	bupotPph21Rows,
	totalBupotPph21,
	bupotManualRows,
	totalBupotManual,
	totalBupotAll,
	onChanged,
}: BupotSectionProps) {
	const [showForm, setShowForm] = useState(false);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		type: 'pph23' as BupotType,
		date: todayIsoDate(),
		partner: '',
		npwp: '',
		description: '',
		dpp: '',
		rate: '2',
	});

	const dppNum = Number((form.dpp || '').replace(/[^\d]/g, '')) || 0;
	const rateNum = Number(form.rate) || 0;
	const estimatedAmount = Math.round((dppNum * rateNum) / 100);

	const submit = async () => {
		if (!form.partner.trim() && !form.description.trim()) {
			toast.error('Isi nama mitra atau deskripsi.');
			return;
		}
		if (dppNum <= 0) {
			toast.error('DPP harus lebih dari 0.');
			return;
		}
		setSaving(true);
		try {
			await pb.collection('bupot_records').create({
				company: companyId,
				type: form.type,
				masa_pajak: masaPajak,
				tahun_pajak: tahunPajak,
				date: form.date,
				partner: form.partner.trim(),
				npwp: form.npwp.trim(),
				description: form.description.trim(),
				dpp: dppNum,
				rate: rateNum,
				amount: estimatedAmount,
				status: 'draft',
				owner: ownerId,
			});
			toast.success('Bukti potong ditambahkan.');
			setForm({ type: 'pph23', date: todayIsoDate(), partner: '', npwp: '', description: '', dpp: '', rate: '2' });
			setShowForm(false);
			onChanged();
		} catch (err) {
			console.error(err);
			toast.error('Gagal menambah bukti potong.');
		} finally {
			setSaving(false);
		}
	};

	const removeBupot = async (id: string) => {
		if (!confirm('Hapus bukti potong ini?')) return;
		try {
			await pb.collection('bupot_records').delete(id);
			toast.success('Bukti potong dihapus.');
			onChanged();
		} catch (err) {
			console.error(err);
			toast.error('Gagal menghapus bukti potong.');
		}
	};

	const toggleStatus = async (rec: BupotRecord) => {
		const next: BupotStatus = rec.status === 'draft' ? 'reported' : 'draft';
		try {
			await pb.collection('bupot_records').update(rec.id, { status: next });
			onChanged();
		} catch (err) {
			console.error(err);
			toast.error('Gagal memperbarui status.');
		}
	};

	return (
		<div className="space-y-6">
			{/* Ringkasan bupot */}
			<section className="grid gap-4 sm:grid-cols-3">
				<SummaryCard
					icon={Receipt}
					label="Bupot PPh 21 (Otomatis)"
					value={totalBupotPph21}
					subtitle={`${bupotPph21Rows.length} karyawan · dari Penggajian`}
					tone="primary"
				/>
				<SummaryCard
					icon={Receipt}
					label="Bupot PPh Lain (Manual)"
					value={totalBupotManual}
					subtitle={`${bupotManualRows.length} catatan · PPh 22/23/dll`}
					tone="info"
				/>
				<SummaryCard
					icon={ArrowRightLeft}
					label="Total Bupot"
					value={totalBupotAll}
					subtitle={`Masa ${masaPajak}/${tahunPajak}`}
					tone="warn"
				/>
			</section>

			{/* Bupot PPh 21 otomatis */}
			<section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div>
						<h2 className="text-sm font-bold text-foreground">Bukti Potong PPh 21 — dari Penggajian</h2>
						<p className="text-[11px] text-muted-foreground">
							Pakai slip gaji aktual pada masa pajak ini · jika belum dijalankan, memakai estimasi data karyawan · Kode objek {KODE_OBJEK_GAJI}
						</p>
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full min-w-[720px] border-collapse text-left text-xs">
						<thead>
							<tr className="bg-muted/80">
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Nama</th>
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Posisi</th>
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">NPWP/NIK</th>
								<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">Penghasilan Kotor</th>
								<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">Tarif</th>
								<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">PPh 21</th>
							</tr>
						</thead>
						<tbody>
							{bupotPph21Rows.length === 0 ? (
								<tr>
									<td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
										Belum ada karyawan aktif dengan PPh 21 terutang.
									</td>
								</tr>
							) : (
								bupotPph21Rows.map(r => (
									<tr key={r.emp.id} className="border-b border-border/70 hover:bg-primary/5">
										<td className="px-3 py-2.5 font-semibold text-foreground">
										{r.emp.name}
										<span
											className={cn(
												'ml-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold align-middle',
												r.source === 'aktual'
													? 'bg-primary/10 text-primary'
													: r.source === 'draf'
														? 'bg-sky-100 text-sky-700'
														: 'bg-muted text-muted-foreground',
											)}
										>
											{r.source === 'aktual' ? 'Aktual' : r.source === 'draf' ? 'Draf' : 'Estimasi'}
										</span>
									</td>
										<td className="px-3 py-2.5 text-muted-foreground">{r.emp.position || '—'}</td>
										<td className="px-3 py-2.5 font-mono text-foreground">{r.npwp || '—'}</td>
										<td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatRupiah(r.bruto)}</td>
										<td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
											{(r.rate * 100).toFixed(2)}%
										</td>
										<td className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
											{formatRupiah(r.tax)}
										</td>
									</tr>
								))
							)}
						</tbody>
						{bupotPph21Rows.length > 0 ? (
							<tfoot>
								<tr className="bg-muted/50 font-semibold">
									<td colSpan={5} className="border-t border-border px-3 py-2.5">
										Total PPh 21
									</td>
									<td className="border-t border-border px-3 py-2.5 text-right tabular-nums text-primary">
										{formatRupiah(totalBupotPph21)}
									</td>
								</tr>
							</tfoot>
						) : null}
					</table>
				</div>
			</section>

			{/* Bupot manual */}
			<section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div>
						<h2 className="text-sm font-bold text-foreground">Bukti Potong PPh Lain — Manual</h2>
						<p className="text-[11px] text-muted-foreground">
							PPh 22, PPh 23, PPh 4(2), PPh 15, PPh 26 yang dipotong dari pihak lain.
						</p>
					</div>
					<button
						type="button"
						onClick={() => setShowForm(v => !v)}
						className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
					>
						<Plus className="size-3.5" /> Tambah Bupot
					</button>
				</div>

				{showForm ? (
					<div className="border-b border-border bg-secondary/30 p-4">
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<label className="block">
								<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Jenis PPh
								</span>
								<select
									value={form.type}
									onChange={e => {
										const type = e.target.value as BupotType;
										const defaultRate = type === 'pph23' ? '2' : type === 'pph22' ? '1.5' : type === 'pph4_2' ? '2.5' : '0';
										setForm(prev => ({ ...prev, type, rate: defaultRate }));
									}}
									className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
								>
									{BUPOT_TYPE_OPTIONS.map(opt => (
										<option key={opt} value={opt}>
											{BUPOT_TYPE_LABELS[opt]}
										</option>
									))}
								</select>
							</label>
							<label className="block">
								<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Tanggal
								</span>
								<input
									type="date"
									value={form.date}
									onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
									className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
								/>
							</label>
							<label className="block">
								<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Mitra / Wajib Pajak
								</span>
								<input
									type="text"
									value={form.partner}
									onChange={e => setForm(prev => ({ ...prev, partner: e.target.value }))}
									placeholder="Nama pihak dipotong"
									className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
								/>
							</label>
							<label className="block">
								<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									NPWP Mitra
								</span>
								<input
									type="text"
									value={form.npwp}
									onChange={e => setForm(prev => ({ ...prev, npwp: e.target.value }))}
									placeholder="Opsional"
									className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
								/>
							</label>
							<label className="block lg:col-span-2">
								<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Deskripsi
								</span>
								<input
									type="text"
									value={form.description}
									onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
									placeholder="Jasa / sewa / pembelian dll."
									className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
								/>
							</label>
							<label className="block">
								<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									DPP (Dasar Pengenaan)
								</span>
								<input
									type="text"
									inputMode="numeric"
									value={form.dpp ? Number(form.dpp.replace(/[^\d]/g, '')).toLocaleString('id-ID') : ''}
									onChange={e => setForm(prev => ({ ...prev, dpp: e.target.value }))}
									placeholder="0"
									className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
								/>
							</label>
							<label className="block">
								<span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Tarif (%)
								</span>
								<input
									type="number"
									step="0.01"
									value={form.rate}
									onChange={e => setForm(prev => ({ ...prev, rate: e.target.value }))}
									className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-2"
								/>
							</label>
						</div>
						<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
							<p className="text-sm text-muted-foreground">
								Potongan dihitung:{' '}
								<span className="font-bold text-primary">{formatRupiah(estimatedAmount)}</span>
							</p>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => setShowForm(false)}
									className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary"
								>
									Batal
								</button>
								<button
									type="button"
									onClick={submit}
									disabled={saving}
									className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
								>
									{saving ? 'Menyimpan…' : 'Simpan Bupot'}
								</button>
							</div>
						</div>
					</div>
				) : null}

				<div className="overflow-x-auto">
					<table className="w-full min-w-[760px] border-collapse text-left text-xs">
						<thead>
							<tr className="bg-muted/80">
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Tanggal</th>
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Jenis</th>
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Mitra</th>
								<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">DPP</th>
								<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">Tarif</th>
								<th className="border-b border-border px-3 py-2.5 text-right font-semibold text-muted-foreground">Potongan</th>
								<th className="border-b border-border px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
								<th className="border-b border-border px-3 py-2.5" />
							</tr>
						</thead>
						<tbody>
							{bupotManualRows.length === 0 ? (
								<tr>
									<td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
										Belum ada bukti potong manual pada masa pajak ini.
									</td>
								</tr>
							) : (
								bupotManualRows.map(r => (
									<tr key={r.id} className="border-b border-border/70 hover:bg-primary/5">
										<td className="whitespace-nowrap px-3 py-2.5 text-foreground">{r.date}</td>
										<td className="px-3 py-2.5 text-foreground">{BUPOT_TYPE_LABELS[r.type]}</td>
										<td className="px-3 py-2.5 text-foreground">
											{r.partner || '—'}
											{r.description ? (
												<span className="block text-[10px] text-muted-foreground">{r.description}</span>
											) : null}
										</td>
										<td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatRupiah(r.dpp || 0)}</td>
										<td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.rate || 0}%</td>
										<td className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
											{formatRupiah(r.amount || 0)}
										</td>
										<td className="px-3 py-2.5">
											<button
												type="button"
												onClick={() => toggleStatus(r)}
												className={cn(
													'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
													r.status === 'reported'
														? 'bg-primary/10 text-primary hover:bg-primary/20'
														: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
												)}
											>
												{BUPOT_STATUS_LABELS[r.status]}
											</button>
										</td>
										<td className="px-3 py-2.5 text-right">
											<button
												type="button"
												onClick={() => removeBupot(r.id)}
												className="text-muted-foreground transition-colors hover:text-destructive"
												aria-label="Hapus"
											>
												<Trash2 className="size-4" />
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
						{bupotManualRows.length > 0 ? (
							<tfoot>
								<tr className="bg-muted/50 font-semibold">
									<td colSpan={5} className="border-t border-border px-3 py-2.5">
										Total
									</td>
									<td className="border-t border-border px-3 py-2.5 text-right tabular-nums text-primary">
										{formatRupiah(totalBupotManual)}
									</td>
									<td colSpan={2} className="border-t border-border px-3 py-2.5" />
								</tr>
							</tfoot>
						) : null}
					</table>
				</div>
			</section>
		</div>
	);
}

function csv(v: string | number | undefined | null): string {
	const s = String(v ?? '');
	if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

function downloadCsv(content: string, filename: string) {
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
