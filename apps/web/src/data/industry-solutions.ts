import {
	Briefcase,
	GraduationCap,
	HeartHandshake,
	TrendingUp,
	type LucideIcon,
} from 'lucide-react';

export type SolutionPoint = {
	title: string;
	text: string;
};

export type IndustrySolution = {
	slug: string;
	title: string;
	group: string;
	tagline: string;
	description: string;
	icon: LucideIcon;
	benefits: SolutionPoint[];
	steps: SolutionPoint[];
};

export const INDUSTRY_SOLUTIONS: IndustrySolution[] = [
	{
		slug: 'dagang',
		title: 'Dagang',
		group: 'Solusi Industri',
		tagline: 'Persediaan, multi-gudang, dan PPN dalam satu alur.',
		description:
			'Kelola pembelian, penjualan, stok, dan pajak dagang tanpa input ulang. Setiap pergerakan barang otomatis tercatat di jurnal, kartu stok, dan laporan — dari toko tunggal sampai multi-gudang.',
		icon: TrendingUp,
		benefits: [
			{
				title: 'Stok multi-gudang selalu akurat',
				text: 'Setiap penjualan, pembelian, transfer, dan opname langsung memperbarui kuantitas per gudang. Tidak ada stok ganda atau selisih yang baru ketahuan akhir bulan.',
			},
			{
				title: 'PPN penjualan dan pembelian otomatis',
				text: 'Faktur keluaran dan masukan terbentuk dari dokumen dagang. Tarif PPN mengikuti pengaturan pajak perusahaan, siap direkap tanpa hitung ulang.',
			},
			{
				title: 'Harga pokok dan laba per produk jelas',
				text: 'Pembelian masuk ke persediaan, penjualan mengurangi stok, dan laba kotor per produk terbaca dari laporan — tanpa spreadsheet terpisah.',
			},
		],
		steps: [
			{
				title: 'Siapkan produk dan gudang',
				text: 'Daftarkan barang, satuan, harga, serta gudang. Stok awal dicatat sekali, lalu kartu stok berjalan sendiri.',
			},
			{
				title: 'Terima pembelian (PO)',
				text: 'Buat pesanan pembelian, terima barang, dan biarkan persediaan serta utang usaha terbarui otomatis.',
			},
			{
				title: 'Jual dan kurangi stok',
				text: 'Penawaran menjadi pesanan lalu invoice. Kuantitas gudang berkurang saat pengiriman, piutang tercatat bersamaan.',
			},
			{
				title: 'Opname dan transfer antar gudang',
				text: 'Hitung fisik, sesuaikan selisih, dan pindahkan stok antar lokasi tanpa jurnal manual.',
			},
			{
				title: 'Laporkan persediaan dan PPN',
				text: 'Nilai persediaan, mutasi stok, dan rekap PPN dagang siap ditinjau dari laporan yang sama.',
			},
		],
	},
	{
		slug: 'jasa',
		title: 'Jasa',
		group: 'Solusi Industri',
		tagline: 'Invoice jasa dan manajemen proyek yang rapi.',
		description:
			'Susun penawaran, tagih pekerjaan per termin, dan pantau proyek jasa sampai lunas. Pendapatan, piutang, dan beban proyek tercatat otomatis — tanpa input ulang dari spreadsheet.',
		icon: Briefcase,
		benefits: [
			{
				title: 'Penawaran jasa jadi invoice sekali klik',
				text: 'Ubah penawaran yang disetujui menjadi pesanan lalu invoice. Deskripsi pekerjaan, kuantitas, dan pajak ikut terbawa.',
			},
			{
				title: 'Termin dan proyek tertata',
				text: 'Pecah tagihan sesuai tahap pekerjaan. Setiap termin punya status sendiri sehingga progres penagihan mudah dipantau.',
			},
			{
				title: 'Piutang jasa terpantau sampai lunas',
				text: 'Umur piutang dan sisa tagihan terlihat sebelum jatuh tempo. Pembayaran masuk langsung memperbarui saldo pelanggan.',
			},
		],
		steps: [
			{
				title: 'Buat penawaran (QT)',
				text: 'Susun ruang lingkup, harga, dan pajak per baris jasa. Kirim PDF ke klien langsung dari aplikasi.',
			},
			{
				title: 'Konversi ke pesanan (SO)',
				text: 'Penawaran yang disetujui menjadi pesanan penjualan. Tidak perlu mengetik ulang rincian pekerjaan.',
			},
			{
				title: 'Terbitkan invoice per termin (INV)',
				text: 'Tagih sesuai tahap proyek, dengan PPN 0%, 10%, 11%, atau 12% sesuai pengaturan pajak.',
			},
			{
				title: 'Kirim dan pantau',
				text: 'Kirim invoice lewat email dan pantau statusnya — terkirim, jatuh tempo, atau lunas.',
			},
			{
				title: 'Catat pembayaran (PAY)',
				text: 'Pembayaran masuk otomatis mengurangi piutang dan memperbarui jurnal kas perusahaan jasa.',
			},
		],
	},
	{
		slug: 'sekolah',
		title: 'Sekolah',
		group: 'Solusi Industri',
		tagline: 'Iuran siswa, penggajian guru, dan dana sekolah dalam satu tempat.',
		description:
			'Catat SPP, uang pangkal, penggajian guru, absensi, dana BOS, dan laporan yayasan pendidikan tanpa berpindah aplikasi. Data siswa dan akun orang tua dikelola di Kontak, lalu wali memantau tagihan, tunggakan, dan pembayaran lewat portal parent. Cocok untuk SD, SMP, SMA, hingga multi-unit dalam satu yayasan.',
		icon: GraduationCap,
		benefits: [
			{
				title: 'Iuran siswa tertata rapi',
				text: 'SPP, uang pangkal, dan tagihan kegiatan tercatat per siswa. Pantau siapa belum bayar, cetak kuitansi, dan kirim pengingat ke orang tua.',
			},
			{
				title: 'Penggajian guru & staf lengkap',
				text: 'Slip gaji, tunjangan, potongan, dan PPh 21 dihitung otomatis. Jurnal beban gaji terbentuk sendiri setiap periode.',
			},
			{
				title: 'Dana BOS terpisah dan transparan',
				text: 'Dana BOS, dana komite, dan dana terbatas punya laporan posisi sendiri sehingga penggunaannya mudah diperiksa.',
			},
			{
				title: 'Data siswa siap dipakai di transaksi',
				text: 'NIS, tahun ajaran, program, kelas, status, dan nomor VA tersimpan di Kontak. Pencarian nama, NIS, orang tua, atau program mempercepat pencatatan iuran.',
			},
			{
				title: 'Portal orang tua untuk tagihan anak',
				text: 'Wali masuk dengan akun sendiri, memilih siswa terkait, lalu melihat total tagihan, invoice belum dibayar, dan tunggakan. Status Lunas atau Belum Dibayar serta riwayat pembayaran ada di halaman yang sama, lengkap dengan chat dan pengumuman sekolah.',
			},
		],
		steps: [
			{
				title: 'Catat siswa dan tagihan',
				text: 'Buat tagihan SPP, uang pangkal, dan biaya kegiatan per siswa. Status lunas atau belum bayar terlihat langsung.',
			},
			{
				title: 'Terima pembayaran iuran',
				text: 'Pembayaran masuk ke kas atau bank, kuitansi siap dicetak, dan piutang siswa berkurang otomatis.',
			},
			{
				title: 'Jalankan penggajian guru',
				text: 'Hitung gaji pokok, tunjangan, potongan, dan PPh 21. Slip gaji siap dibagikan tanpa hitung manual.',
			},
			{
				title: 'Pisahkan dana BOS',
				text: 'Catat realisasi pengeluaran per program dana terbatas agar laporan posisi dana tetap akurat.',
			},
			{
				title: 'Laporkan unit sekolah',
				text: 'Neraca, laba rugi, dan arus kas per unit — dengan konsolidasi jika sekolah berada dalam satu yayasan.',
			},
		],
	},
	{
		slug: 'yayasan',
		title: 'Yayasan',
		group: 'Solusi Industri',
		tagline: 'Laporan keuangan dan dana terbatas yang transparan.',
		description:
			'Pisahkan dana tidak terikat dan dana dengan pembatasan dari pemberi sumber daya. Setiap penerimaan dan pengeluaran tercatat di jurnal, sehingga laporan posisi keuangan dan perubahan aset neto ISAK 35 siap diaudit.',
		icon: HeartHandshake,
		benefits: [
			{
				title: 'Dana terbatas tidak tercampur',
				text: 'Setiap sumber dana punya saldo dan laporan sendiri. Pengeluaran program tidak mengaburkan dana yang belum boleh dipakai.',
			},
			{
				title: 'Laporan yayasan siap diaudit',
				text: 'Posisi keuangan menampilkan aset, liabilitas, dan aset neto. Perubahan aset neto menampilkan saldo awal, surplus tahun berjalan, pembebasan pembatasan, dan saldo akhir — terbentuk dari jurnal, bukan rekap manual.',
			},
			{
				title: 'Multi-unit dalam satu yayasan',
				text: 'Kelola beberapa unit sekaligus dengan bagan akun terpisah, lalu lihat konsolidasi di tingkat yayasan.',
			},
		],
		steps: [
			{
				title: 'Tetapkan sumber dana',
				text: 'Bedakan dana tidak terikat, terikat temporer, dan terikat permanen sejak pencatatan pertama.',
			},
			{
				title: 'Catat penerimaan',
				text: 'Donasi, iuran, dan dana program masuk ke kas atau bank dan langsung menambah saldo dana yang sesuai.',
			},
			{
				title: 'Catat realisasi program',
				text: 'Pengeluaran dibebankan ke program dan sumber dana yang benar, lengkap dengan bukti.',
			},
			{
				title: 'Posting jurnal otomatis',
				text: 'Setiap dokumen membentuk jurnal. Tidak ada input ulang antara bendahara dan pembukuan.',
			},
			{
				title: 'Terbitkan laporan yayasan',
				text: 'Filter tahun pelaporan dan periode ISAK 35, lalu tinjau posisi keuangan serta perubahan aset neto komparatif — termasuk penghasilan komprehensif lain.',
			},
		],
	},
];

export function getIndustrySolution(slug: string | undefined) {
	return INDUSTRY_SOLUTIONS.find(item => item.slug === slug);
}
