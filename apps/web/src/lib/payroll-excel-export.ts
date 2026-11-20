/**
 * Ekspor data payroll satu periode ke berkas Excel (.xlsx). Berisi dua lembar
 * kerja: Ringkasan (informasi periode dan total) dan Payslip (rincian per
 * karyawan dari slip gaji yang tersimpan). Hanya memakai data yang benar-benar
 * tersedia; tidak mengubah maupun menerbitkan payroll.
 */
import * as XLSX from 'xlsx';
import {
	DISBURSEMENT_STATUS_LABELS,
	RUN_STATUS_LABELS,
	type PayrollRun,
	type Payslip,
} from '@/lib/payroll';
import type { TaxMethod } from '@/lib/payroll-calc';

const TAX_METHOD_LABELS: Record<TaxMethod, string> = {
	gross: 'Gross',
	gross_up: 'Gross Up',
	netto: 'Netto',
};

interface ExportOptions {
	/** Nama perusahaan untuk catatan ringkasan (opsional). */
	companyName?: string;
	/** Nama berkas tanpa ekstensi (opsional). */
	fileName?: string;
}

/** Label bulan periode YYYY-MM, mis. "November 2026". */
function periodLabel(period: string): string {
	const months = [
		'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
		'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
	];
	const [year, month] = period.split('-');
	const idx = Number(month) - 1;
	return months[idx] ? `${months[idx]} ${year}` : period;
}

/** Tanggal ISO/datetime ke format YYYY-MM-DD untuk sel tanggal. */
function isoDate(value?: string): string {
	return value ? value.slice(0, 10) : '';
}

/**
 * Bangun berkas Excel payroll untuk satu periode dan picu unduhan di browser.
 * `payslips` harus berisi slip periode terkait (dengan expand employee bila ada).
 */
export function exportPayrollRunExcel(run: PayrollRun, payslips: Payslip[], options: ExportOptions = {}): void {
	const slips = [...payslips].sort((a, b) =>
		(a.expand?.employee?.name || '').localeCompare(b.expand?.employee?.name || ''),
	);

	const totalGross = slips.reduce((sum, slip) => sum + (slip.gross || 0), 0);
	const totalNet = slips.reduce((sum, slip) => sum + (slip.net_pay || 0), 0);
	const totalPph21 = slips.reduce((sum, slip) => sum + (slip.pph21 || 0), 0);
	const totalBpjs = slips.reduce((sum, slip) => sum + (slip.bpjs_tk || 0) + (slip.bpjs_kes || 0), 0);
	const totalLoan = slips.reduce((sum, slip) => sum + (slip.loan_deduction || 0), 0);
	const totalDeductions = slips.reduce((sum, slip) => sum + (slip.total_deductions || 0), 0);

	// --- Lembar Ringkasan ---
	const summaryAoa: (string | number)[][] = [
		['Ringkasan Payroll'],
		['Periode', periodLabel(run.period)],
		['Perusahaan', options.companyName || ''],
		['Tanggal bayar', isoDate(run.pay_date)],
		['Cut-off', run.cutoff_start && run.cutoff_end ? `${isoDate(run.cutoff_start)} s.d. ${isoDate(run.cutoff_end)}` : ''],
		['Keterangan', run.description || ''],
		['Status jurnal', RUN_STATUS_LABELS[run.status] || run.status],
		['Jumlah karyawan', slips.length],
		['Payslip diterbitkan', slips.filter(slip => slip.published).length],
		[],
		['Total bruto', totalGross],
		['Total potongan', totalDeductions],
		['Total gaji bersih', totalNet],
		['Total PPh 21', totalPph21],
		['Total BPJS (TK + Kesehatan)', totalBpjs],
		['Total potongan pinjaman', totalLoan],
	];
	const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
	summarySheet['!cols'] = [{ wch: 28 }, { wch: 36 }];

	// --- Lembar Payslip ---
	const detailHeader = [
		'No',
		'Nama Karyawan',
		'Jabatan',
		'Gaji Pokok',
		'Tunjangan Makan',
		'Tunjangan Transport',
		'Tunjangan Lain',
		'Tunjangan Komponen',
		'Tunjangan Pajak',
		'Bruto',
		'BPJS TK',
		'BPJS Kesehatan',
		'PPh 21',
		'Potongan Pinjaman',
		'Potongan Komponen',
		'Total Potongan',
		'Gaji Bersih',
		'Metode Pajak',
		'Status Slip',
		'Status Pencairan',
	];
	const detailAoa: (string | number)[][] = [detailHeader];
	slips.forEach((slip, index) => {
		detailAoa.push([
			index + 1,
			slip.expand?.employee?.name || '',
			slip.expand?.employee?.position || '',
			slip.basic_salary || 0,
			slip.meal_allowance || 0,
			slip.transport_allowance || 0,
			slip.other_allowance || 0,
			slip.component_allowance || 0,
			slip.tax_allowance || 0,
			slip.gross || 0,
			slip.bpjs_tk || 0,
			slip.bpjs_kes || 0,
			slip.pph21 || 0,
			slip.loan_deduction || 0,
			slip.component_deduction || 0,
			slip.total_deductions || 0,
			slip.net_pay || 0,
			slip.tax_method ? (TAX_METHOD_LABELS[slip.tax_method] || slip.tax_method) : '',
			slip.published ? 'Diterbitkan' : 'Belum diterbitkan',
			slip.disbursement_status ? (DISBURSEMENT_STATUS_LABELS[slip.disbursement_status] || slip.disbursement_status) : '',
		]);
	});
	// Baris total di akhir lembar Payslip.
	detailAoa.push([
		'',
		'TOTAL',
		'',
		slips.reduce((sum, slip) => sum + (slip.basic_salary || 0), 0),
		slips.reduce((sum, slip) => sum + (slip.meal_allowance || 0), 0),
		slips.reduce((sum, slip) => sum + (slip.transport_allowance || 0), 0),
		slips.reduce((sum, slip) => sum + (slip.other_allowance || 0), 0),
		slips.reduce((sum, slip) => sum + (slip.component_allowance || 0), 0),
		slips.reduce((sum, slip) => sum + (slip.tax_allowance || 0), 0),
		totalGross,
		slips.reduce((sum, slip) => sum + (slip.bpjs_tk || 0), 0),
		slips.reduce((sum, slip) => sum + (slip.bpjs_kes || 0), 0),
		totalPph21,
		totalLoan,
		slips.reduce((sum, slip) => sum + (slip.component_deduction || 0), 0),
		totalDeductions,
		totalNet,
		'',
		'',
		'',
	]);

	const detailSheet = XLSX.utils.aoa_to_sheet(detailAoa);
	detailSheet['!cols'] = [
		{ wch: 5 },
		{ wch: 28 },
		{ wch: 20 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 12 },
		{ wch: 14 },
		{ wch: 12 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 14 },
		{ wch: 12 },
		{ wch: 16 },
		{ wch: 16 },
	];

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan');
	XLSX.utils.book_append_sheet(wb, detailSheet, 'Payslip');

	// Hasilkan berkas .xlsx sebagai ArrayBuffer, bungkus menjadi Blob, lalu
	// picu unduhan melalui URL.createObjectURL + anchor.
	const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
	const blob = new Blob([out], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	});
	const url = URL.createObjectURL(blob);
	const baseName = options.fileName
		? (options.fileName.endsWith('.xlsx') ? options.fileName : `${options.fileName}.xlsx`)
		: `payroll-${run.period}.xlsx`;
	const a = document.createElement('a');
	a.href = url;
	a.download = baseName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
