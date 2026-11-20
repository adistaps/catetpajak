import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
	Calculator,
	FileText,
	Info,
	Percent,
	RefreshCw,
	Scale,
	UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, type Company } from '@/lib/accounting';
import { grossSalary, type Employee } from '@/lib/payroll';
import {
	calcBpjsKes,
	calcBpjsTk,
	calcDeductions,
	calcPph21,
	calcPph21Ter,
	PPH21_METHOD_LABELS,
	PPH21_METHOD_OPTIONS,
	PTKP_LABELS,
	PTKP_OPTIONS,
	TAX_METHOD_LABELS,
	TAX_METHOD_OPTIONS,
	terCategoryForPtkp,
	terRateFor,
	type Pph21Method,
	type PtkpStatus,
	type TaxMethod,
} from '@/lib/payroll-calc';
import { cn } from '@/lib/utils';
import { PajakTabs } from './pajak-tabs';
import {
	EMPTY_INPUT,
	Field,
	formatInput,
	MethodCard,
	parseNumber,
	PRESETS,
	Row,
	SummaryCell,
	type InputState,
} from './pajak-shared';

interface PajakSimulatorProps {
	company: Company;
}

export function PajakSimulator({ company }: PajakSimulatorProps) {
	const [searchParams] = useSearchParams();
	const presetEmployeeId = searchParams.get('employee') ?? '';

	const [employees, setEmployees] = useState<Employee[]>([]);
	const [selectedEmpId, setSelectedEmpId] = useState('');
	const [input, setInput] = useState<InputState>({
		...EMPTY_INPUT,
		bruto: '10000000',
		bpjsBase: '10000000',
	});
	const [ptkp, setPtkp] = useState<PtkpStatus>('TK0');
	const [hasNpwp, setHasNpwp] = useState(true);
	const [method, setMethod] = useState<Pph21Method>('ter');
	const [taxMethod, setTaxMethod] = useState<TaxMethod>('gross');

	useEffect(() => {
		const filter = pb.filter('company = {:company}', { company: company.id });
		pb.collection('employees')
			.getFullList<Employee>({ filter, sort: 'name' })
			.then(list => {
				setEmployees(list);
				if (presetEmployeeId) {
					const emp = list.find(e => e.id === presetEmployeeId);
					if (emp) applyEmployee(emp);
				}
			})
			.catch(() => toast.error('Gagal memuat data karyawan.'));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [company.id]);

	const selectedEmployee = employees.find(e => e.id === selectedEmpId) ?? null;

	const applyEmployee = (emp: Employee) => {
		setSelectedEmpId(emp.id);
		setInput(prev => ({
			...prev,
			bruto: String(grossSalary(emp) || 0),
			bpjsBase: String(emp.basic_salary || 0),
			tunjanganJabatan: '',
			honorarium: '',
		}));
		setPtkp((emp.ptkp_status ?? 'TK0') as PtkpStatus);
		setHasNpwp(Boolean((emp.npwp ?? '').trim()));
		setMethod((emp.pph21_method ?? 'ter') as Pph21Method);
		setTaxMethod((emp.tax_method ?? 'gross') as TaxMethod);
	};

	const monthlyBruto = parseNumber(input.bruto);
	const bpjsBase = parseNumber(input.bpjsBase);
	const tunjanganJabatan = parseNumber(input.tunjanganJabatan);
	const honorarium = parseNumber(input.honorarium);
	const brutoForTax = monthlyBruto + tunjanganJabatan + honorarium;

	const result = useMemo(() => {
		const bpjsTk = calcBpjsTk(bpjsBase);
		const bpjsKes = calcBpjsKes(bpjsBase);
		const annual = calcPph21({
			monthlyBruto: brutoForTax,
			ptkpStatus: ptkp,
			hasNpwp,
			annualPensionContribution: bpjsTk.employeeTotal * 12,
		});
		const ter = calcPph21Ter({
			monthlyBruto: brutoForTax,
			ptkpStatus: ptkp,
			hasNpwp,
			pensionContribution: bpjsTk.employeeTotal,
		});
		const deductions = calcDeductions({
			bpjsBase,
			monthlyBruto: brutoForTax,
			ptkpStatus: ptkp,
			hasNpwp,
			pph21Method: method,
			taxMethod,
		});
		return { bpjsTk, bpjsKes, annual, ter, deductions };
	}, [bpjsBase, brutoForTax, ptkp, hasNpwp, method, taxMethod]);

	const activePph21 = result.deductions.pph21.monthlyTax;
	const taxAllowance = result.deductions.taxAllowance;
	const totalDeduction = result.bpjsTk.employeeTotal + result.bpjsKes.employee + activePph21;
	const takeHome = Math.max(0, monthlyBruto + taxAllowance - totalDeduction);
	const terCategory = terCategoryForPtkp(ptkp);
	const terRate = terRateFor(Math.max(0, brutoForTax - result.bpjsTk.employeeTotal), terCategory, hasNpwp);
	const effectiveRate = brutoForTax > 0 ? (activePph21 / brutoForTax) * 100 : 0;

	const applyPreset = (preset: (typeof PRESETS)[number]) => {
		setSelectedEmpId('');
		setInput(prev => ({
			...prev,
			bruto: String(preset.bruto),
			bpjsBase: String(preset.bpjs),
			tunjanganJabatan: '',
			honorarium: '',
		}));
	};

	const reset = () => {
		setSelectedEmpId('');
		setInput({ ...EMPTY_INPUT });
		setPtkp('TK0');
		setHasNpwp(true);
		setMethod('ter');
		setTaxMethod('gross');
	};

	return (
		<div className="pajak-clean mx-auto flex max-w-[1400px] flex-col gap-6 lg:flex-row lg:items-start">
			<PajakTabs />
			<div className="min-w-0 flex-1 space-y-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
						<Calculator className="size-7 text-primary" strokeWidth={2} />
						Simulasi PPh 21
					</h1>
					<p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
						Simulasi perhitungan PPh 21 karyawan: potongan BPJS Ketenagakerjaan, BPJS Kesehatan,
						dan PPh 21 metode TER (PMK 168/2023) maupun Tahunan (Pasal 17).
					</p>
				</div>
				<button
					type="button"
					onClick={reset}
					className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
				>
					<RefreshCw className="size-3.5" /> Reset Simulasi
				</button>
			</header>

			<div className="grid gap-6 lg:grid-cols-[420px_1fr]">
				<section className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
					<h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
						<FileText className="size-4 text-primary" /> Data Karyawan
					</h3>

					<div className="mb-4 space-y-2">
						<label className="block">
							<span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
								<UserRound className="size-3.5" /> Ambil dari Data Payroll
							</span>
							<select
								value={selectedEmpId}
								onChange={e => {
									const emp = employees.find(x => x.id === e.target.value);
									if (emp) applyEmployee(emp);
									else setSelectedEmpId('');
								}}
								className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
							>
								<option value="">— Simulasi manual —</option>
								{employees
									.filter(e => e.status === 'aktif')
									.map(emp => (
										<option key={emp.id} value={emp.id}>
											{emp.name}
											{emp.position ? ` · ${emp.position}` : ''}
										</option>
									))}
							</select>
						</label>
						{selectedEmployee ? (
							<div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
								<p>
									<span className="font-semibold text-foreground">{selectedEmployee.name}</span>
									{selectedEmployee.position ? ` · ${selectedEmployee.position}` : ''}
								</p>
								<p>
									Gaji pokok {formatRupiah(selectedEmployee.basic_salary || 0)} · Bruto{' '}
									{formatRupiah(grossSalary(selectedEmployee))}
								</p>
								<p>
									PTKP {selectedEmployee.ptkp_status ?? 'TK0'} ·{' '}
									{selectedEmployee.npwp ? 'Ber-NPWP' : 'Non-NPWP'} ·{' '}
									{(selectedEmployee.pph21_method ?? 'ter').toUpperCase()}
								</p>
							</div>
						) : null}
					</div>

					<div className="mb-4 flex flex-wrap gap-2">
						{PRESETS.map(preset => (
							<button
								key={preset.label}
								type="button"
								onClick={() => applyPreset(preset)}
								className="rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
							>
								{preset.label}
							</button>
						))}
					</div>

					<div className="space-y-4">
						<Field label="Gaji Pokok / Bruto per Bulan">
							<div className="relative">
								<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
									Rp
								</span>
								<input
									type="text"
									inputMode="numeric"
									value={formatInput(monthlyBruto)}
									onChange={e => setInput(prev => ({ ...prev, bruto: e.target.value }))}
									placeholder="0"
									className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm font-semibold text-foreground outline-none ring-primary/20 focus:ring-2"
								/>
							</div>
						</Field>

						<Field label="Tunjangan Jabatan per Bulan">
							<div className="relative">
								<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
									Rp
								</span>
								<input
									type="text"
									inputMode="numeric"
									value={formatInput(tunjanganJabatan)}
									onChange={e => setInput(prev => ({ ...prev, tunjanganJabatan: e.target.value }))}
									placeholder="0"
									className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm font-semibold text-foreground outline-none ring-primary/20 focus:ring-2"
								/>
							</div>
						</Field>

						<Field label="Honorarium / Imbalan Lain per Bulan">
							<div className="relative">
								<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
									Rp
								</span>
								<input
									type="text"
									inputMode="numeric"
									value={formatInput(honorarium)}
									onChange={e => setInput(prev => ({ ...prev, honorarium: e.target.value }))}
									placeholder="0"
									className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm font-semibold text-foreground outline-none ring-primary/20 focus:ring-2"
								/>
							</div>
						</Field>

						<Field label="Upah Dasar BPJS (untuk iuran)">
							<div className="relative">
								<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
									Rp
								</span>
								<input
									type="text"
									inputMode="numeric"
									value={formatInput(bpjsBase)}
									onChange={e => setInput(prev => ({ ...prev, bpjsBase: e.target.value }))}
									placeholder="0"
									className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm font-semibold text-foreground outline-none ring-primary/20 focus:ring-2"
								/>
							</div>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Basis iuran BPJS TK & Kesehatan. Cap JP: Rp 10.547.400, Cap Kesehatan: Rp 12.000.000.
							</p>
						</Field>

						<Field label="Status PTKP">
							<select
								value={ptkp}
								onChange={e => setPtkp(e.target.value as PtkpStatus)}
								className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
							>
								{PTKP_OPTIONS.map(opt => (
									<option key={opt} value={opt}>
										{PTKP_LABELS[opt]}
									</option>
								))}
							</select>
						</Field>

						<div className="grid grid-cols-2 gap-3">
							<Field label="NPWP">
								<div className="flex rounded-xl border border-input bg-background p-1">
									<button
										type="button"
										onClick={() => setHasNpwp(true)}
										className={cn(
											'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
											hasNpwp
												? 'bg-primary text-primary-foreground'
												: 'text-muted-foreground hover:text-foreground',
										)}
									>
										Punya
									</button>
									<button
										type="button"
										onClick={() => setHasNpwp(false)}
										className={cn(
											'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
											!hasNpwp
												? 'bg-primary text-primary-foreground'
												: 'text-muted-foreground hover:text-foreground',
										)}
									>
										Tidak
									</button>
								</div>
							</Field>

							<Field label="Metode PPh 21">
								<select
									value={method}
									onChange={e => setMethod(e.target.value as Pph21Method)}
									className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
								>
									{PPH21_METHOD_OPTIONS.map(opt => (
										<option key={opt} value={opt}>
											{PPH21_METHOD_LABELS[opt]}
										</option>
									))}
								</select>
							</Field>

							<Field label="Skema Pajak">
								<select
									value={taxMethod}
									onChange={e => setTaxMethod(e.target.value as TaxMethod)}
									className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
								>
									{TAX_METHOD_OPTIONS.map(opt => (
										<option key={opt} value={opt}>
											{TAX_METHOD_LABELS[opt]}
										</option>
									))}
								</select>
							</Field>
						</div>
					</div>
				</section>

				<div className="space-y-6">
					<section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-soft">
						<div className="grid gap-px bg-primary/15 sm:grid-cols-3">
							<SummaryCell label="Bruto per Bulan" value={formatRupiah(brutoForTax)} />
							<SummaryCell label="Total Potongan" value={formatRupiah(totalDeduction)} tone="warn" />
							<SummaryCell label="Gaji Diterima (Take Home)" value={formatRupiah(takeHome)} tone="primary" />
						</div>
					</section>

					<section className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
						<h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
							<Scale className="size-4 text-primary" /> Rincian Potongan
						</h3>
						<div className="divide-y divide-border">
							<Row label="BPJS Ketenagakerjaan (JHT 2% + JP 1%)" value={result.bpjsTk.employeeTotal} />
							<Row label="BPJS Kesehatan (1%)" value={result.bpjsKes.employee} />
							<Row
								label={
									<span className="flex flex-col">
										<span>PPh 21 — {PPH21_METHOD_LABELS[method]} · {TAX_METHOD_LABELS[taxMethod]}</span>
										{method === 'ter' ? (
											<span className="text-[11px] font-normal text-muted-foreground">
												Kategori {terCategory} · Tarif efektif {(terRate * 100).toFixed(2)}%
											</span>
										) : (
											<span className="text-[11px] font-normal text-muted-foreground">
												Tarif efektif bulanan {effectiveRate.toFixed(2)}%
											</span>
										)}
									</span>
								}
								value={activePph21}
								strong
							/>
							<Row label="Total Potongan Karyawan" value={totalDeduction} strong total />
						</div>
						{taxAllowance > 0 ? (
							<p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
								Skema {TAX_METHOD_LABELS[taxMethod]}: perusahaan menambah tunjangan pajak {formatRupiah(taxAllowance)} yang mengimbangi PPh 21, sehingga pajak tidak mengurangi take-home pay karyawan.
							</p>
						) : null}
					</section>

					<section className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
						<h3 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
							<Percent className="size-4 text-primary" /> Perbandingan Metode
						</h3>
						<p className="mb-4 text-[11px] text-muted-foreground">
							Bandingkan PPh 21 bulanan antara metode TER dan Tahunan untuk estimasi terbaik.
						</p>
						<div className="grid gap-4 sm:grid-cols-2">
							<MethodCard
								title="TER (PMK 168/2023)"
								category={`Kategori ${terCategory}`}
								tax={result.ter.monthlyTax}
								rate={terRate}
								active={method === 'ter'}
								onSelect={() => setMethod('ter')}
							/>
							<MethodCard
								title="Tahunan (Pasal 17)"
								category="Progresif 5–35%"
								tax={result.annual.monthlyTax}
								rate={brutoForTax > 0 ? result.annual.monthlyTax / brutoForTax : 0}
								active={method === 'annual'}
								onSelect={() => setMethod('annual')}
							/>
						</div>
					</section>

					<section className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
						<h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
							<Info className="size-4 text-primary" /> Rincian Metode Tahunan
						</h3>
						<div className="divide-y divide-border">
							<Row label="Bruto Setahun" value={result.annual.annualBruto} />
							<Row label="Biaya Jabatan (5%, maks Rp 6jt/thn)" value={result.annual.biayaJabatan} />
							<Row label="Iuran Pensiun Karyawan Setahun" value={result.annual.pensionContribution} />
							<Row label="Neto Setahun" value={result.annual.annualNetto} />
							<Row label={`PTKP (${ptkp})`} value={result.annual.ptkp} />
							<Row label="PKP Setahun" value={result.annual.annualPkp} />
							<Row label="PPh 21 Setahun" value={result.annual.annualTax} strong />
							<Row label="PPh 21 per Bulan" value={result.annual.monthlyTax} strong total />
						</div>
					</section>

					<section className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm">
						<h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
							<Calculator className="size-4 text-primary" /> Beban Perusahaan (Employer)
						</h3>
						<div className="divide-y divide-border">
							<Row label="BPJS TK — JHT 3,7%" value={result.bpjsTk.jhtEmployer} />
							<Row label="BPJS TK — JP 2%" value={result.bpjsTk.jpEmployer} />
							<Row label="BPJS TK — JK 0,3%" value={result.bpjsTk.jkEmployer} />
							<Row label="BPJS TK — JKK 0,24%" value={result.bpjsTk.jkkEmployer} />
							<Row label="BPJS Kesehatan — 4%" value={result.bpjsKes.employer} />
							<Row
								label="Total Beban Perusahaan"
								value={result.bpjsTk.employerTotal + result.bpjsKes.employer}
								strong
								total
							/>
						</div>
						<p className="mt-3 text-[11px] text-muted-foreground">
							Perhitungan simulasi untuk <span className="font-medium text-foreground">{company.name}</span>.
							Tarif mengacu UU SJSN, UU BPJS, UU PPh, dan PMK 168/2023. Hasil bersifat estimasi.
						</p>
					</section>
				</div>
			</div>
			</div>
		</div>
	);
}
