export type LaporanCategory =
	| 'sekilas'
	| 'penjualan'
	| 'pembelian'
	| 'produk'
	| 'aset'
	| 'bank'
	| 'pajak'
	| 'produksi';

export type LaporanReportId =
	| 'neraca'
	| 'buku-besar'
	| 'laba-rugi'
	| 'jurnal'
	| 'arus-kas'
	| 'neraca-saldo'
	| 'perubahan-modal'
	| 'ringkasan-bisnis'
	| 'laba-rugi-fiskal'
	| 'rekonsiliasi-pajak'
	| 'posisi-keuangan-yayasan'
	| 'perubahan-aset-neto';

export interface LaporanItem {
	id: LaporanReportId;
	title: string;
	description: string;
	categories: LaporanCategory[];
}

export const LAPORAN_CATEGORIES: { key: LaporanCategory; label: string }[] = [
	{ key: 'sekilas', label: 'Sekilas bisnis' },
	{ key: 'penjualan', label: 'Penjualan' },
	{ key: 'pembelian', label: 'Pembelian' },
	{ key: 'produk', label: 'Produk' },
	{ key: 'aset', label: 'Aset' },
	{ key: 'bank', label: 'Bank' },
	{ key: 'pajak', label: 'Pajak' },
	{ key: 'produksi', label: 'Produksi' },
];

export const LAPORAN_ITEMS: LaporanItem[] = [
	{
		id: 'neraca',
		title: 'Neraca',
		description:
			'Menampilkan apa yang dimiliki (aset), apa saja utangnya (liabilitas), dan apa yang sudah diinvestasikan ke perusahaan ini (ekuitas) pada tanggal tertentu.',
		categories: ['sekilas', 'aset', 'bank'],
	},
	{
		id: 'buku-besar',
		title: 'Buku besar',
		description:
			'Menampilkan semua transaksi berdasarkan akun dalam periode tertentu, termasuk kronologi pergerakan transaksinya selama periode berlangsung.',
		categories: ['sekilas', 'penjualan', 'pembelian', 'bank', 'aset'],
	},
	{
		id: 'laba-rugi',
		title: 'Laba rugi',
		description:
			'Menampilkan semua pendapatan yang diperoleh dan biaya yang dikeluarkan dalam periode tertentu. Template laporan versi terkini bisa Anda custom sesuai kebutuhan.',
		categories: ['sekilas', 'penjualan', 'pembelian', 'produk'],
	},
	{
		id: 'jurnal',
		title: 'Jurnal',
		description:
			'Menampilkan semua journal entry per transaksi dalam periode tertentu. Anda dapat melacak transaksi yang masuk ke masing-masing akun.',
		categories: ['sekilas', 'penjualan', 'pembelian', 'bank'],
	},
	{
		id: 'arus-kas',
		title: 'Arus kas',
		description:
			'Menampilkan pergerakan uang masuk dan keluar dari transaksi dalam periode tertentu. Template laporan ini bisa Anda custom sesuai kebutuhan.',
		categories: ['sekilas', 'bank', 'penjualan', 'pembelian'],
	},
	{
		id: 'neraca-saldo',
		title: 'Neraca saldo',
		description:
			'Menampilkan saldo dari setiap akun, termasuk saldo awal, pergerakan, dan saldo akhir dalam periode tertentu.',
		categories: ['sekilas', 'aset', 'bank'],
	},
	{
		id: 'perubahan-modal',
		title: 'Perubahan modal',
		description:
			'Menampilkan perubahan atau pergerakan ekuitas pemilik dalam periode tertentu.',
		categories: ['sekilas', 'aset'],
	},
	{
		id: 'ringkasan-bisnis',
		title: 'Ringkasan bisnis',
		description:
			'Menampilkan ringkasan laporan keuangan utama dan wawasannya dalam periode tertentu.',
		categories: ['sekilas', 'penjualan', 'pembelian', 'produk', 'produksi'],
	},
	{
		id: 'laba-rugi-fiskal',
		title: 'Laba rugi fiskal',
		description:
			'Menampilkan laba komersial, koreksi fiskal, laba kena pajak, dan estimasi PPh Badan untuk keperluan perpajakan.',
		categories: ['pajak', 'sekilas'],
	},
	{
		id: 'rekonsiliasi-pajak',
		title: 'Rekonsiliasi pajak',
		description:
			'Menampilkan rekonsiliasi antara laba komersial dan laba fiskal beserta pos-pos penyesuaian pajak.',
		categories: ['pajak'],
	},
	{
		id: 'posisi-keuangan-yayasan',
		title: 'Posisi keuangan (yayasan)',
		description:
			'Laporan posisi keuangan entitas nirlaba sesuai ISAK 35, dengan aset neto tanpa dan dengan pembatasan.',
		categories: ['sekilas'],
	},
	{
		id: 'perubahan-aset-neto',
		title: 'Perubahan aset neto',
		description:
			'Laporan perubahan aset neto yayasan sesuai ISAK 35 untuk tahun yang berakhir pada tanggal pelaporan.',
		categories: ['sekilas'],
	},
];
