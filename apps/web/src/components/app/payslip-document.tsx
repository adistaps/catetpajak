import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { formatDate, formatRupiah } from '@/lib/accounting';
import type { Employee, PayrollRun, Payslip } from '@/lib/payroll';
import { TAX_METHOD_LABELS, FREELANCE_TAX_LABEL, type TaxMethod } from '@/lib/payroll-calc';

type RunDetails = Pick<PayrollRun, 'period' | 'pay_date' | 'cutoff_start' | 'cutoff_end'>;

type PayslipDocumentProps = {
	slip: Payslip;
	companyName: string;
	/** URL logo perusahaan; bila tidak tersedia dipakai logo Catet Pajak. */
	companyLogo?: string;
	employee?: Employee | null;
	run?: RunDetails | null;
};

export function payslipRunDetails(slip: Payslip): RunDetails | undefined {
	return slip.expand?.run ?? slip.payroll_period_info;
}

export function payslipPeriodLabel(slip: Payslip, run?: RunDetails | null): string {
	const period = (run ?? payslipRunDetails(slip))?.period;
	if (!period) return 'Periode tidak tersedia';
	const match = /^(\d{4})-(\d{2})$/.exec(period);
	if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return period;
	return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
		.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

const documentStyles = `
.payslip-container { container-type: inline-size; width: 100%; color: #111; }
.payslip-paper, .payslip-paper * { box-sizing: border-box; }
.payslip-paper { display: flex; flex-direction: column; width: 100%; min-height: 720px; padding: 24px 20px; background: #fff; color: #111; font: 13px/1.45 Arial, Helvetica, sans-serif; overflow-wrap: anywhere; }
.payslip-paper p, .payslip-paper h2, .payslip-paper h3 { margin: 0; }
.payslip-top, .payslip-heading, .payslip-total-pay, .payslip-footer-brand { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.payslip-logo { display: flex; align-items: center; gap: 7px; color: #147b55; font-size: 11px; font-weight: 700; }
.payslip-logo img { width: 35px; height: 35px; object-fit: contain; }
.payslip-confidential { color: #e3362e; font-size: 12px; font-weight: 700; text-transform: uppercase; }
.payslip-heading { margin-top: 42px; align-items: baseline; }
.payslip-heading h2, .payslip-heading strong { font-size: 16px; font-weight: 700; }
.payslip-heading strong { white-space: nowrap; }
.payslip-identities { display: grid; gap: 0; margin: 20px 0 24px; }
.payslip-meta { min-width: 0; }
.payslip-meta-row { display: grid; grid-template-columns: minmax(100px, 38%) 10px minmax(0, 1fr); gap: 3px; margin: 2px 0; }
.payslip-meta-row dt, .payslip-meta-row dd { margin: 0; }
.payslip-columns { display: grid; border: 1px solid #dedede; }
.payslip-column { min-width: 0; display: flex; flex-direction: column; }
.payslip-column + .payslip-column { border-top: 1px solid #dedede; }
.payslip-column h3 { background: #e5e5e5; padding: 8px 10px; font-size: 13px; font-weight: 700; }
.payslip-lines { flex: 1; padding: 9px 10px; }
.payslip-line, .payslip-column-total { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.payslip-line span:last-child, .payslip-column-total span:last-child { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.payslip-column-total { border-top: 1px solid #dedede; padding: 9px 10px; font-weight: 700; }
.payslip-total-pay { margin-top: 10px; font-size: 18px; font-weight: 700; }
.payslip-total-pay span:last-child { white-space: nowrap; }
.payslip-benefits { margin-top: 48px; max-width: 50%; }
.payslip-benefits h3 { font-size: 13px; font-weight: 700; border-bottom: 1px solid #ddd; padding-bottom: 9px; margin-bottom: 10px; }
.payslip-benefits p { color: #555; }
.payslip-notes { margin-top: auto; padding-top: 80px; font-size: 10px; line-height: 1.4; }
.payslip-notes p + p { margin-top: 14px; }
.payslip-footer-brand { margin-top: 18px; font-size: 11px; font-weight: 700; }
@container (min-width: 570px) {
 .payslip-paper { min-height: 950px; padding: 28px 24px; font-size: 14px; }
 .payslip-identities, .payslip-columns { grid-template-columns: 1fr 1fr; }
 .payslip-meta + .payslip-meta { padding-left: 18px; }
 .payslip-column + .payslip-column { border-top: 0; border-left: 1px solid #dedede; }
 .payslip-total-pay { width: 50%; margin-left: auto; padding-left: 10px; }
 .payslip-heading { margin-top: 56px; }
}
@container (max-width: 569px) { .payslip-benefits { max-width: none; } }
@media print {
 @page { size: A4; margin: 12mm; }
 html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
 .payslip-paper { min-height: 270mm; padding: 0; font-size: 11pt; }
 .payslip-identities, .payslip-columns { grid-template-columns: 1fr 1fr; }
 .payslip-column + .payslip-column { border-top: 0; border-left: 1px solid #dedede; }
 .payslip-total-pay { width: 50%; margin-left: auto; padding-left: 10px; }
 .payslip-notes { break-inside: avoid; }
}
`;

function MetadataRow({ label, value }: { label: string; value?: string | null }) {
	return <div className="payslip-meta-row"><dt>{label}</dt><span aria-hidden="true">:</span><dd>{value || '—'}</dd></div>;
}

/**
 * Logo pada payslip: pakai logo perusahaan bila tersedia, dan kembali ke logo
 * Catet Pajak jika gagal dimuat (mis. karyawan tidak berhak mengakses file).
 */
function PayslipLogo({ src }: { src?: string }) {
	const handleError = (event: React.SyntheticEvent<HTMLImageElement>) => {
		const img = event.currentTarget;
		if (img.src.endsWith('/catet-logo.png')) return;
		img.src = '/catet-logo.png';
	};
	return <img src={src || '/catet-logo.png'} alt="Logo perusahaan" onError={handleError} />;
}

function MoneyLine({ label, amount }: { label: string; amount: number }) {
	return <div className="payslip-line"><span>{label}</span><span>{formatRupiah(amount || 0)}</span></div>;
}

export function PayslipDocument({ slip, companyName, companyLogo, employee, run }: PayslipDocumentProps) {
	const details = run ?? payslipRunDetails(slip);
	const person = employee ?? slip.expand?.employee;
	const period = details?.cutoff_start && details.cutoff_end
		? `${formatDate(details.cutoff_start)} – ${formatDate(details.cutoff_end)}`
		: payslipPeriodLabel(slip, details);
	return (
		<div className="payslip-container">
			<style>{documentStyles}</style>
			<article className="payslip-paper" aria-label="Slip gaji">
				<div className="payslip-top">
					<div className="payslip-logo"><PayslipLogo src={companyLogo} /><span>Catet Pajak</span></div>
					<span className="payslip-confidential">*Rahasia</span>
				</div>
				<div className="payslip-heading"><h2>{companyName}</h2><strong>SLIP GAJI</strong></div>
				<div className="payslip-identities">
					<dl className="payslip-meta">
						<MetadataRow label="Periode payroll" value={period} />
						<MetadataRow label="ID / Nama" value={`${person?.employee_code || '—'} / ${person?.name || '—'}`} />
						<MetadataRow label="Jabatan" value={person?.position} />
						<MetadataRow label="Tanggal bayar" value={details?.pay_date ? formatDate(details.pay_date) : undefined} />
					</dl>
					<dl className="payslip-meta">
						<MetadataRow label="Level" value={person?.level} />
						<MetadataRow label="PTKP" value={person?.ptkp_status ? person.ptkp_status.replace(/^(TK|K)(\d)$/, '$1/$2') : undefined} />
						<MetadataRow label="NPWP" value={person?.npwp} />
						<MetadataRow label="Skema pajak" value={person?.employee_type === 'freelance' ? FREELANCE_TAX_LABEL : TAX_METHOD_LABELS[(slip.tax_method ?? person?.tax_method ?? 'gross') as TaxMethod]} />
					</dl>
				</div>
				<div className="payslip-columns">
					<section className="payslip-column" aria-label="Penghasilan">
						<h3>Penghasilan</h3><div className="payslip-lines">
							<MoneyLine label="Gaji pokok" amount={slip.basic_salary} />
							<MoneyLine label="Tunjangan makan" amount={slip.meal_allowance} />
							<MoneyLine label="Tunjangan transport" amount={slip.transport_allowance} />
							<MoneyLine label="Tunjangan lain" amount={slip.other_allowance} />
							{slip.component_allowance > 0 ? <MoneyLine label="Komponen tunjangan dan lembur" amount={slip.component_allowance} /> : null}
						{(slip.tax_allowance || 0) > 0 ? <MoneyLine label="Tunjangan pajak" amount={slip.tax_allowance || 0} /> : null}
						</div><div className="payslip-column-total"><span>Total penghasilan</span><span>{formatRupiah(slip.gross || 0)}</span></div>
					</section>
					<section className="payslip-column" aria-label="Potongan">
						<h3>Potongan</h3><div className="payslip-lines">
							<MoneyLine label="BPJS Ketenagakerjaan" amount={slip.bpjs_tk} />
							<MoneyLine label="BPJS Kesehatan" amount={slip.bpjs_kes} />
							<MoneyLine label="PPh 21" amount={slip.pph21} />
							{slip.loan_deduction > 0 ? <MoneyLine label={(slip.loan_interest || 0) > 0 ? 'Pokok pinjaman' : 'Pinjaman'} amount={slip.loan_deduction - (slip.loan_interest || 0)} /> : null}
							{(slip.loan_interest || 0) > 0 ? <MoneyLine label="Bunga pinjaman" amount={slip.loan_interest || 0} /> : null}
							{slip.component_deduction > 0 ? <MoneyLine label="Komponen potongan lain" amount={slip.component_deduction} /> : null}
						</div><div className="payslip-column-total"><span>Total potongan</span><span>{formatRupiah(slip.total_deductions || 0)}</span></div>
					</section>
				</div>
				<div className="payslip-total-pay"><span>Take Home Pay</span><span>{formatRupiah(slip.net_pay || 0)}</span></div>
				<section className="payslip-benefits"><h3>Manfaat perusahaan*</h3><p>Data manfaat perusahaan tidak tersedia pada slip ini.</p></section>
				<footer className="payslip-notes">
					<p>*Manfaat perusahaan, bila ada, tidak termasuk dalam take-home pay.</p>
					<p>SLIP INI DIBUAT SECARA ELEKTRONIK DAN TIDAK MEMERLUKAN TANDA TANGAN.</p>
					<p>ISI PERNYATAAN INI BERSIFAT RAHASIA. JANGAN MENGUNGKAPKANNYA KECUALI UNTUK KEPERLUAN YANG DIWAJIBKAN OLEH HUKUM ATAU DIIZINKAN PERUSAHAAN.</p>
					<div className="payslip-footer-brand"><span>Slip gaji dibuat melalui Catet Pajak</span></div>
				</footer>
			</article>
		</div>
	);
}

/** Render the same document in a separate print window without interpolating user data into HTML. */
export function printPayslipDocument(props: PayslipDocumentProps): boolean {
	const win = window.open('', '_blank', 'width=900,height=900');
	if (!win) return false;
	const doc = win.document;
	doc.title = `Slip Gaji — ${props.employee?.name || props.slip.expand?.employee?.name || 'Karyawan'}`;
	const base = doc.createElement('base');
	base.href = `${window.location.origin}/`;
	doc.head.appendChild(base);
	doc.documentElement.lang = 'id';
	doc.body.style.margin = '0';
	const target = doc.createElement('div');
	doc.body.appendChild(target);
	const root = createRoot(target);
	flushSync(() => root.render(<PayslipDocument {...props} />));
	const image = target.querySelector('img');
	let printed = false;
	const print = () => {
		if (printed) return;
		printed = true;
		win.focus();
		win.setTimeout(() => win.print(), 100);
	};
	if (!image || image.complete) print();
	else {
		image.addEventListener('load', print, { once: true });
		image.addEventListener('error', print, { once: true });
		win.setTimeout(print, 2000);
	}
	return true;
}
