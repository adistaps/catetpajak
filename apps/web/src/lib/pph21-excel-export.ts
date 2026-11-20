/**
 * Ekspor daftar pemotongan PPh 21 ke berkas Excel (.xlsx) mengikuti format
 * lampiran e-Bupot: tiga lembar kerja — DATA (data pemotongan), BPMP (panduan
 * kolom & validasi), dan REF (referensi status, PTKP, sertifikat, kode objek
 * pajak). Lembar DATA hanya diisi data pajak & payroll yang benar-benar
 * tersedia untuk perusahaan dan periode yang dipilih.
 */
import * as XLSX from 'xlsx';
import { terRateFor, type PtkpStatus } from '@/lib/payroll-calc';
import type { WithholdingRow } from '@/components/app/pajak-shared';

/** Format status PTKP tersimpan ("TK0") ke notasi lampiran ("TK/0"). */
function formatPtkp(status: string): string {
	const trimmed = (status || '').trim();
	if (!trimmed) return '';
	return trimmed.replace(/([A-Za-z]+)(\d+)/, '$1/$2');
}

/** Tarif efektif aktual dari slip: PPh 21 / bruto, dalam persen. */
function effectiveRate(gross: number, pph21: number): number {
	if (!gross || gross <= 0) return 0;
	return Number(((pph21 / gross) * 100).toFixed(2));
}

/** Tarif TER (dalam persen) untuk kategori & dasar tertentu. */
function terPercent(dasar: number, category: 'A' | 'B' | 'C', hasNpwp: boolean): number {
	return Number((terRateFor(dasar, category, hasNpwp) * 100).toFixed(2));
}

interface ExportOptions {
	/** NPWP pemotong (perusahaan) dari pengaturan pajak. */
	npwpPemotong?: string;
	/** Periode payroll YYYY-MM, dipakai untuk nama berkas. */
	period?: string;
	/** Label periode untuk catatan (opsional). */
	periodLabel?: string;
	/** Bulan / tahun masa pajak (opsional). */
	month?: number;
	year?: number;
	/** Nama perusahaan (opsional). */
	companyName?: string;
	/** Nama berkas tanpa ekstensi (opsional). */
	fileName?: string;
}

/** Panduan kolom BPMP (reproduksi statis dari lampiran referensi). */
const BPMP_ROWS: (string | number)[][] = [
	['Kolom pada excel', 'Kolom pada xml', 'Petunjuk pengisian', 'Contoh pengisian', 'Validasi', 'Keterangan tambahan'],
	['NPWP Pemotong', 'TIN', 'Diisi dengan NPWP pemotong', '1234567890123456', 'NPWP Pemotong harus sama dengan NPWP login', ''],
	['Masa Pajak', 'TaxPeriodMonth', 'Diisi dengan masa pajak pemotongan', '1', '', ''],
	['Tahun Pajak', 'TaxPeriodYear', 'Diisi dengan masa pajak pemotongan', '2025', '', ''],
	['Status Pegawai', 'CounterpartOpt', 'Diisi dengan status kewarganegaraan pegawai (karyawan asing atau tidak)', 'Resident', '', ''],
	['NPWP/NIK/TIN', 'CounterpartTin', 'Diisi dengan NIK pegawai tetap', '0987654321098765', '', 'NPWP/NIK wajib valid'],
	['Nomor Passport', 'CounterpartPassport', 'Diisi dengan nomor paspor pegawai tetap (jika karyawan asing)', '', '', ''],
	['Status', 'StatusTaxExemption', 'Diisi dengan status PTKP penerima penghasilan', 'TK/3', '', ''],
	['Posisi', 'Position', 'Diisi dengan posisi pegawai tetap', 'Staff', '', ''],
	['Sertifikat/Fasilitas', 'TaxCertificate', 'Diisi dengan fasilitas perpajakan yang digunakan', 'N/A', '', ''],
	['Kode Objek Pajak', 'TaxObjectCode', 'Diisi dengan kode objek pajak', '21-100-01', '', ''],
	['Penghasilan Kotor', 'Gross', 'Diisi dengan penghasilan bruto', '10000000', '', ''],
	['Tarif', 'Rate', 'Diisi dengan tarif yang sesuai dengan referensi kode objek pajak', '2', 'Jika menggunakan fasilitas perpajakan lainnya, tarif dapat diisi tidak sesuai dengan referensi kode objek pajak', 'Jika tarif menggunakan koma, di export ke xml, excel secara otomatis akan merubah menjadi format desimal menggunakan titik'],
	['ID TKU', 'IDPlaceOfBusinessActivity', 'Diisi dengan ID TKU pemotong', '1234567890123456789012', '', ''],
	['Tgl Pemotongan', 'WithholdingDate', 'Diisi dengan tanggal pemotongan', '2025-01-16', 'Tanggal pemotongan tidak boleh lebih rendah dari masa/tahun pajak bukti potong', 'Saat di export ke xml, excel secara otomatis akan merubah menjadi format YYYY-MM-DD'],
];

/** Referensi REF (reproduksi statis dari lampiran referensi). */
const REF_ROWS: (string | number)[][] = [
	['', '', '', '', '', 'Kode Objek Pajak', 'Nama Objek Pajak'],
	['', 'Resident', 'TK/0', 'N/A', '', '21-100-01', 'Penghasilan yang diterima oleh Pegawai Tetap termasuk Pegawai Negeri Sipil, Anggota Tentara Nasional Indonesia, Anggota Polisi Republik Indonesia atau Pejabat Negara'],
	['', 'Foreign', 'TK/1', 'DTP', '', '21-100-02', 'Penghasilan yang diterima oleh Penerima Pensiun secara teratur'],
	['', '', 'TK/2', 'ETC', '', '21-100-32', 'Penghasilan yang diterima oleh Pegawai tetap yang menerima fasilitas di daerah tertentu'],
	['', '', 'TK/3', '', '', ''],
	['', '', 'K/0', '', '', ''],
	['', '', 'K/1', '', '', ''],
	['', '', 'K/2', '', '', ''],
	['', '', 'K/3', '', '', ''],
	['', '', 'HB/0', '', '', ''],
	['', '', 'HB/1', '', '', ''],
	['', '', 'HB/2', '', '', ''],
	['', '', 'HB/3', '', '', ''],
];

/**
 * Bangun berkas Excel pemotongan PPh 21 dan unduh. Lembar DATA berisi baris
 * pemotongan nyata dari slip gaji periode terpilih; BPMP & REF berisi panduan
 * kolom dan referensi sesuai format lampiran.
 */
export function exportPph21Excel(rows: WithholdingRow[], options: ExportOptions): void {
	const { npwpPemotong } = options;

	// --- Lembar DATA ---
	const dataAoa: (string | number)[][] = [
		['NPWP Pemotong', npwpPemotong || ''],
		[
			'',
			'Masa Pajak',
			'Tahun Pajak',
			'Status Pegawai',
			'NPWP/NIK/TIN',
			'Nomor Passport',
			'Status',
			'Posisi',
			'Sertifikat/Fasilitas',
			'Kode Objek Pajak',
			'Penghasilan Kotor',
			'Tarif',
			'ID TKU',
			'Tgl Pemotongan',
			'',
			'TER A',
			'TER B',
			'TER C',
		],
	];

	for (const row of rows) {
		const gross = row.penghasilanKotor || 0;
		const pph21 = row.pph21 || 0;
		const isFreelance = row.employeeType === 'freelance';
		const hasNpwp = Boolean((row.npwpNikTin ?? '').trim());
		const ptkp = (row.ptkpStatus || 'TK0') as PtkpStatus;
		const tarif = effectiveRate(gross, pph21);
		// Kolom TER A/B/C adalah tarif referensi untuk tiap kategori pada dasar
		// bruto. Karyawan freelance tidak memakai TER (Pasal 17), jadi dibiarkan 0.
		const terA = isFreelance ? 0 : terPercent(gross, 'A', hasNpwp);
		const terB = isFreelance ? 0 : terPercent(gross, 'B', hasNpwp);
		const terC = isFreelance ? 0 : terPercent(gross, 'C', hasNpwp);

		dataAoa.push([
			'',
			Number(row.masaPajak) || '',
			Number(row.tahunPajak) || '',
			'Resident',
			row.npwpNikTin?.trim() || '',
			row.nomorPassport && row.nomorPassport !== '—' ? row.nomorPassport : '',
			formatPtkp(row.ptkpStatus || ''),
			row.posisi && row.posisi !== '—' ? row.posisi : '',
			row.sertifikatFasilitas || 'N/A',
			row.kodeObjekPajak || '21-100-01',
			gross,
			tarif,
			row.idTku && row.idTku !== '—' ? row.idTku : '',
			row.tglPemotongan || '',
			'',
			terA,
			terB,
			terC,
		]);
	}

	const dataSheet = XLSX.utils.aoa_to_sheet(dataAoa);
	// Lebar kolom agar terbaca; sisakan kolom A sempit (label NPWP Pemotong).
	dataSheet['!cols'] = [
		{ wch: 16 },
		{ wch: 10 },
		{ wch: 11 },
		{ wch: 14 },
		{ wch: 20 },
		{ wch: 16 },
		{ wch: 10 },
		{ wch: 16 },
		{ wch: 18 },
		{ wch: 16 },
		{ wch: 16 },
		{ wch: 10 },
		{ wch: 24 },
		{ wch: 14 },
		{ wch: 4 },
		{ wch: 8 },
		{ wch: 8 },
		{ wch: 8 },
	];

	const bpmpSheet = XLSX.utils.aoa_to_sheet(BPMP_ROWS);
	bpmpSheet['!cols'] = [
		{ wch: 20 },
		{ wch: 28 },
		{ wch: 52 },
		{ wch: 22 },
		{ wch: 52 },
		{ wch: 60 },
	];

	const refSheet = XLSX.utils.aoa_to_sheet(REF_ROWS);
	refSheet['!cols'] = [
		{ wch: 4 },
		{ wch: 12 },
		{ wch: 10 },
		{ wch: 12 },
		{ wch: 4 },
		{ wch: 16 },
		{ wch: 80 },
	];

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, dataSheet, 'DATA');
	XLSX.utils.book_append_sheet(wb, bpmpSheet, 'BPMP');
	XLSX.utils.book_append_sheet(wb, refSheet, 'REF');

	// Hasilkan berkas .xlsx sebagai ArrayBuffer, bungkus menjadi Blob, lalu
	// picu unduhan melalui URL.createObjectURL + anchor (kompatibel browser).
	const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
	const blob = new Blob([out], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	});
	const url = URL.createObjectURL(blob);
	const baseName = options.fileName
		? (options.fileName.endsWith('.xlsx') ? options.fileName : `${options.fileName}.xlsx`)
		: `pph21-${options.period || 'all'}.xlsx`;
	const a = document.createElement('a');
	a.href = url;
	a.download = baseName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
