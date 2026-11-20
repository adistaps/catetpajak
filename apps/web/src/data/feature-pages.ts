import {
	Banknote,
	Boxes,
	CalendarDays,
	ChartNoAxesCombined,
	ClipboardList,
	ContactRound,
	FileBarChart,
	FileSignature,
	Gauge,
	Landmark,
	LayoutDashboard,
	Package,
	Receipt,
	Scale,
	ShoppingCart,
	TableProperties,
	Truck,
	Users,
	Warehouse,
	type LucideIcon,
} from 'lucide-react';

export type FeatureBenefit = {
	title: string;
	text: string;
};

export type FeatureCapability = {
	title: string;
	text: string;
};

export type FeaturePage = {
	slug: string;
	title: string;
	group: string;
	icon: LucideIcon;
	tagline: string;
	description: string;
	benefits: FeatureBenefit[];
	capabilities: FeatureCapability[];
};

export const FEATURE_PAGES: FeaturePage[] = [
	{
		slug: 'penjualan',
		title: 'Penjualan',
		group: 'Dokumen Bisnis',
		icon: ShoppingCart,
		tagline: 'Invoice digital sah, dibuat dan dibayar lebih cepat.',
		description:
			'Rangkai penawaran, pemesanan, invoice, pengiriman, dan pembayaran dalam satu alur yang rapi. Setiap dokumen otomatis tercatat di jurnal dan stok tanpa input ulang.',
		benefits: [
			{
				title: 'Invoice profesional dalam hitungan detik',
				text: 'Susun invoice dengan logo, nomor dokumen, dan PPN yang terisi otomatis — lalu kirim sebagai PDF ke pelanggan.',
			},
			{
				title: 'Termin 2/3 N/30 dihitung otomatis',
				text: 'Diskon 2% bila dibayar dalam 3 hari, pembayaran penuh jatuh tempo dalam 30 hari. Tanggal diskon, nominal potongan, dan jatuh tempo tampil langsung di invoice.',
			},
			{
				title: 'Tagihan terpantau sampai lunas',
				text: 'Papan penjualan terhutang dan tagihan belum dibayar memperlihatkan umur piutang sebelum menjadi masalah.',
			},
			{
				title: 'Satu alur tanpa input ulang',
				text: 'Penawaran menjadi pemesanan, pemesanan menjadi invoice, invoice menjadi pengiriman dan pembayaran — data mengalir sendiri.',
			},
		],
		capabilities: [
			{
				title: 'Buat penawaran (QT)',
				text: 'Susun penawaran harga lengkap dengan produk, kuantitas, dan pajak per baris.',
			},
			{
				title: 'Konversi ke pemesanan (SO)',
				text: 'Ubah penawaran yang disetujui menjadi pesanan penjualan sekali klik.',
			},
			{
				title: 'Terbitkan invoice (INV)',
				text: 'Invoice bernomor otomatis dengan PPN 0%, 10%, 11%, atau 12% sesuai pengaturan pajak.',
			},
			{
				title: 'Kirim dan pantau',
				text: 'Kirim dokumen lewat email langsung dari aplikasi dan pantau statusnya hingga lunas.',
			},
			{
				title: 'Catat pembayaran (PAY)',
				text: 'Pembayaran masuk otomatis memperbarui piutang dan jurnal kas perusahaan.',
			},
		],
	},
	{
		slug: 'pembelian',
		title: 'Pembelian',
		group: 'Dokumen Bisnis',
		icon: Truck,
		tagline: 'Kirim PO resmi gratis & mudah ke supplier.',
		description:
			'Kelola pembelian dari permintaan hingga pembayaran dengan purchase order resmi. Barang yang diterima langsung menambah stok gudang dan jurnal tercatat otomatis.',
		benefits: [
			{
				title: 'PO resmi tanpa biaya tambahan',
				text: 'Terbitkan purchase order berlogo dan bernomor yang meyakinkan supplier — tanpa template manual.',
			},
			{
				title: 'Stok masuk otomatis',
				text: 'Dokumen pengiriman pembelian langsung menambah stok di gudang yang dipilih, lengkap dengan kartu stok.',
			},
			{
				title: 'Utang usaha terkendali',
				text: 'Pantau berapa dan kapan utang jatuh tempo agar pembayaran supplier selalu tepat waktu.',
			},
		],
		capabilities: [
			{
				title: 'Buat penawaran pembelian',
				text: 'Catat harga dan syarat dari supplier sebelum berkomitmen.',
			},
			{
				title: 'Kirim pemesanan (PO)',
				text: 'Terbitkan PO resmi dan kirim ke supplier lewat email dari aplikasi.',
			},
			{
				title: 'Terima barang (DO)',
				text: 'Catat penerimaan barang per gudang; stok dan nilai persediaan langsung diperbarui.',
			},
			{
				title: 'Bayar dan tutup alur',
				text: 'Pembayaran supplier otomatis mengurangi kas dan menutup dokumen terkait.',
			},
			{
				title: 'Belanja aset',
				text: 'Tandai pembelian sebagai aset tetap agar langsung masuk daftar aset untuk disusutkan.',
			},
		],
	},
	{
		slug: 'dokumen',
		title: 'Dokumen',
		group: 'Dokumen Bisnis',
		icon: ClipboardList,
		tagline: 'Buat kuitansi langsung dari invoice.',
		description:
			'Semua dokumen bisnis — penawaran, pesanan, invoice, pengiriman, pembayaran, dan kuitansi — tersimpan rapi per perusahaan dengan status dan riwayat yang jelas.',
		benefits: [
			{
				title: 'Kuitansi sekali klik',
				text: 'Terbitkan kuitansi pembayaran langsung dari invoice yang sudah lunas — siap cetak atau kirim.',
			},
			{
				title: 'Arsip terpusat per perusahaan',
				text: 'Cari dokumen berdasarkan tipe, nomor, kontak, atau tanggal tanpa membuka map fisik.',
			},
			{
				title: 'Status alur yang jelas',
				text: 'Ketahui dokumen mana masih draf, terkirim, atau selesai hanya dari satu layar.',
			},
		],
		capabilities: [
			{
				title: 'Konversi antar tahap',
				text: 'Ubah penawaran menjadi pesanan, pesanan menjadi invoice, tanpa menyalin data manual.',
			},
			{
				title: 'Cetak dan kirim PDF',
				text: 'Setiap dokumen dapat dicetak atau dikirim sebagai PDF dengan identitas perusahaan Anda.',
			},
			{
				title: 'Jurnal otomatis saat posting',
				text: 'Dokumen yang diposting langsung membentuk jurnal akuntansi yang rapi.',
			},
			{
				title: 'Riwayat per kontak',
				text: 'Buka seluruh riwayat dokumen seorang pelanggan atau supplier dari halamat kontaknya.',
			},
		],
	},
	{
		slug: 'kas-bank',
		title: 'Kas & Bank',
		group: 'Kas & Persediaan',
		icon: Landmark,
		tagline: 'Catat kas, bank, dan rekonsiliasi tanpa spreadsheet.',
		description:
			'Pisahkan transaksi kas dan bank per akun, catat uang masuk dan keluar, dan lihat saldo terkini kapan saja. Semua terhubung ke jurnal dan laporan arus kas.',
		benefits: [
			{
				title: 'Saldo kas dan bank real-time',
				text: 'Setiap transaksi tercatat langsung memperbarui saldo — tidak perlu rekap manual di akhir bulan.',
			},
			{
				title: 'Terhubung ke dokumen bisnis',
				text: 'Pembayaran invoice dan pembayaran supplier otomatis muncul sebagai mutasi kas atau bank.',
			},
			{
				title: 'Dasar laporan arus kas',
				text: 'Mutasi kas yang rapi menghasilkan laporan arus kas yang bisa dipercaya untuk keputusan.',
			},
		],
		capabilities: [
			{
				title: 'Catat uang masuk dan keluar',
				text: 'Input penerimaan dan pengeluaran dengan keterangan, akun, dan tanggal.',
			},
			{
				title: 'Pisahkan kas dan bank',
				text: 'Kelola beberapa akun kas dan rekening bank dalam satu perusahaan.',
			},
			{
				title: 'Rekonsiliasi mudah',
				text: 'Bandingkan mutasi aplikasi dengan rekening koran tanpa menghitung ulang.',
			},
			{
				title: 'Jurnal otomatis',
				text: 'Setiap transaksi kas membentuk jurnal ganda yang benar secara akuntansi.',
			},
		],
	},
	{
		slug: 'persediaan',
		title: 'Persediaan',
		group: 'Kas & Persediaan',
		icon: Boxes,
		tagline: 'Stok produk real-time, multi-gudang.',
		description:
			'Ketahui jumlah stok setiap produk di setiap gudang tanpa menunggu stock opname. Kartu stok, nilai persediaan, dan pergerakan barang tercatat otomatis dari transaksi.',
		benefits: [
			{
				title: 'Stok akurat lintas gudang',
				text: 'Penjualan mengurangi stok, pembelian menambah — di gudang yang tepat, tanpa input ganda.',
			},
			{
				title: 'Kartu stok per produk',
				text: 'Lihat riwayat masuk-keluar setiap produk beserta saldo terkini dan nilainya.',
			},
			{
				title: 'Data siap audit',
				text: 'Setiap perubahan stok punya jejak dokumen sumber yang bisa ditelusuri.',
			},
		],
		capabilities: [
			{
				title: 'Master produk dan kategori',
				text: 'Kelola produk jadi, bahan, atau jasa dengan harga beli dan jual.',
			},
			{
				title: 'Stok per gudang',
				text: 'Pantau ketersediaan tiap produk di masing-masing gudang secara terpisah.',
			},
			{
				title: 'Pergerakan otomatis',
				text: 'Invoice, pengiriman, dan pembelian terposting langsung menggerakkan stok.',
			},
			{
				title: 'Nilai persediaan',
				text: 'Laporan nilai persediaan siap dipakai untuk neraca dan analisis modal kerja.',
			},
		],
	},
	{
		slug: 'gudang',
		title: 'Gudang',
		group: 'Kas & Persediaan',
		icon: Warehouse,
		tagline: 'Opname dan transfer antar gudang yang tertib.',
		description:
			'Kelola beberapa lokasi penyimpanan dengan disiplin: stock opname untuk mencocokkan stok fisik, dan transfer antar gudang yang tercatat sebagai pergerakan sah.',
		benefits: [
			{
				title: 'Beberapa gudang, satu aplikasi',
				text: 'Definisikan gudang per lokasi dan alihkan barang antar lokasi dengan dokumen transfer.',
			},
			{
				title: 'Stock opname terdokumentasi',
				text: 'Catat hasil hitung fisik, sistem menunjukkan selisih, dan stok disesuaikan dengan jejak audit.',
			},
			{
				title: 'Kurangi selisih stok',
				text: 'Opname rutin membuat selisih cepat ketahuan sebelum memengaruhi pengiriman pelanggan.',
			},
		],
		capabilities: [
			{
				title: 'Master gudang',
				text: 'Tambahkan gudang dengan nama dan alamat lokasi penyimpanan.',
			},
			{
				title: 'Transfer gudang',
				text: 'Pindahkan stok antar gudang dengan validasi ketersediaan sumber.',
			},
			{
				title: 'Stock opname',
				text: 'Buat sesi opname, isi hasil hitung fisik, lalu sesuaikan stok dalam sekali proses.',
			},
			{
				title: 'Riwayat pergerakan',
				text: 'Setiap transfer dan penyesuaian tercatat lengkap dengan tanggal dan pengguna.',
			},
		],
	},
	{
		slug: 'penggajian',
		title: 'Penggajian',
		group: 'SDM & Penggajian',
		icon: Users,
		tagline: 'Slip gaji, komponen, lembur, jurnal, dan PPh 21 dalam satu alur.',
		description:
			'Jalankan payroll per periode dengan komponen yang punya riwayat perubahan, lembur yang menunggu persetujuan, serta hitungan bruto, potongan, dan nominal dibayar. Jurnal terbit dari periode yang sama, dan daftar pemotongan PPh 21 siap diekspor CSV atau disimulasikan dulu.',
		benefits: [
			{
				title: 'Payroll akurat per periode',
				text: 'Konfigurasi cut-off (misal 21–20) atau pakai bulan kalender — sistem menghitung rentangnya.',
			},
			{
				title: 'PPh 21 otomatis',
				text: 'Pilih metode gross atau netto, status PTKP per karyawan, dan biarkan sistem menghitung pajaknya.',
			},
			{
				title: 'Komponen dengan riwayat perubahan',
				text: 'Setiap pembaruan komponen tercatat: nomor transaksi, tipe penyesuaian, tanggal berlaku, pembuat, dan karyawan yang terdampak.',
			},
			{
				title: 'Bruto, potongan, dan yang dibayar',
				text: 'Sebelum jurnal terbit, periode menampilkan total bruto, total potongan, dan nominal dibayar — plus rincian BPJS dan PPh 21 di slip.',
			},
		],
		capabilities: [
			{
				title: 'Atur komponen gaji',
				text: 'Definisikan tunjangan dan potongan — wajib pajak, BPJS, dan urutan tampilnya.',
			},
			{
				title: 'Pilih karyawan untuk dijalankan',
				text: 'Jalankan payroll untuk semua karyawan atau hanya karyawan tertentu yang dipilih.',
			},
			{
				title: 'Hitung dan tinjau',
				text: 'Sistem menghitung gross, potongan, PPh 21, dan take-home pay per karyawan.',
			},
			{
				title: 'Terbitkan slip gaji',
				text: 'Slip gaji siap dicetak atau dibagikan ke karyawan lewat portal ESS.',
			},
			{
				title: 'Setujui lembur sebelum masuk slip',
				text: 'Pengajuan lembur menampilkan tanggal, durasi, kompensasi, dan status menunggu persetujuan. Hanya yang disetujui yang dihitung.',
			},
			{
				title: 'Ekspor dan simulasi PPh 21',
				text: 'Daftar pemotongan mengikuti data payroll. Ekspor CSV untuk e-Bupot, atau buka simulasi tanpa mengubah slip.',
			},
		],
	},
	{
		slug: 'absensi',
		title: 'Absensi',
		group: 'SDM & Penggajian',
		icon: CalendarDays,
		tagline: 'Live attendance, jadwal, dan riwayat langsung dari portal karyawan.',
		description:
			'Karyawan clock-in dan clock-out dari portal ESS sambil melihat jam berjalan, jadwal, dan status kehadiran. Riwayat bisa difilter per tanggal, dan dari layar yang sama mereka mengajukan lembur, cuti, atau pinjaman.',
		benefits: [
			{
				title: 'Live Attendance di ponsel',
				text: 'Jam berjalan, tanggal, dan tombol clock in atau clock out tampil di portal self-service — contoh 09.26.22 pada Selasa, 13 Oktober 2026.',
			},
			{
				title: 'Jadwal dan status terlihat',
				text: 'Jadwal 08:00–17:00 dan status seperti Terlambat tampil sebelum karyawan mencatat kehadiran, sehingga keterlambatan tidak tersembunyi.',
			},
			{
				title: 'Riwayat per tanggal',
				text: 'Filter tanggal menampilkan clock in, clock out, dan kode kehadiran — misalnya 13/10/2026, masuk 08:49, pulang belum tercatat, kode On time.',
			},
			{
				title: 'Lembur, cuti, dan pinjaman di tab yang sama',
				text: 'Dari self-service yang sama karyawan bisa Request Overtime, Request Cuti, dan Request Loan tanpa pindah aplikasi.',
			},
		],
		capabilities: [
			{
				title: 'Clock-in / clock-out mandiri',
				text: 'Karyawan menekan Clock in atau Clock out sendiri. Contoh: Siska Utama clock in pukul 08:49, clock out masih kosong.',
			},
			{
				title: 'Status terhadap jadwal',
				text: 'Sistem membandingkan jam masuk dengan jadwal hari itu dan menandai status, misalnya Terlambat.',
			},
			{
				title: 'Riwayat absensi terbaru',
				text: 'Pilih tanggal di filter untuk melihat tanggal, clock in, clock out, dan kode kehadiran.',
			},
			{
				title: 'Pengajuan dari layar yang sama',
				text: 'Request Overtime, Request Cuti, dan Request Loan tersedia di tab self-service, di samping Live Attendance.',
			},
		],
	},
	{
		slug: 'cuti-lembur',
		title: 'Cuti & Lembur',
		group: 'SDM & Penggajian',
		icon: Gauge,
		tagline: 'Pengajuan, persetujuan, dan saldo cuti yang rapi.',
		description:
			'Karyawan mengajukan cuti dan lembur dari ESS, atasan menyetujui dari aplikasi, dan saldo cuti selalu terbarui. Lembur yang disetujui otomatis masuk ke slip gaji.',
		benefits: [
			{
				title: 'Saldo cuti otomatis',
				text: 'Jatah tahunan, carry-forward, dan pemakaian dihitung per karyawan tanpa catatan terpisah.',
			},
			{
				title: 'Persetujuan berjenjang',
				text: 'Pengajuan mengalir ke approval line yang ditentukan, lengkap dengan riwayat keputusan.',
			},
			{
				title: 'Lembur langsung ke payroll',
				text: 'Lembur yang disetujui dihitung sebagai kompensasi dan muncul di slip gaji periode terkait.',
			},
		],
		capabilities: [
			{
				title: 'Kebijakan cuti perusahaan',
				text: 'Atur jenis cuti, jatah, bulan mulai, lampiran wajib, dan auto-approve.',
			},
			{
				title: 'Pengajuan dari ESS',
				text: 'Karyawan mengajukan cuti atau lembur lengkap dengan alasan dan lampiran.',
			},
			{
				title: 'Persetujuan admin dan atasan',
				text: 'Setujui atau tolak pengajuan dengan catatan, semua tercatat dalam riwayat.',
			},
			{
				title: 'Kompensasi lembur',
				text: 'Hitungan lembur otomatis dari jam kehadiran atau input manual dengan rate terpisah.',
			},
		],
	},
	{
		slug: 'pajak',
		title: 'Pajak',
		group: 'Pajak & Laporan',
		icon: Receipt,
		tagline: 'PPN, PPh, dan pengaturan pajak dalam satu tempat.',
		description:
			'Tentukan pajak per transaksi dengan tipe PPN dan PPh yang sudah tersedia, atur metode PPh 21 dan status PTKP default, dan simulasikan pajak sebelum memutuskan.',
		benefits: [
			{
				title: 'PPN terhitung per dokumen',
				text: 'Tipe pajak Tanpa Pajak, PPN 10%, 11%, dan 12% siap dipakai di invoice dan pembelian.',
			},
			{
				title: 'PPh 21 sesuai kebijakan',
				text: 'Metode gross/netto dan status PTKP diatur per perusahaan lalu dipakai di setiap payroll.',
			},
			{
				title: 'Simulasi sebelum eksekusi',
				text: 'Coba skenario pajak di kalkulator simulasi sebelum menerapkannya pada data sebenarnya.',
			},
		],
		capabilities: [
			{
				title: 'Pengaturan pajak perusahaan',
				text: 'Satu konfigurasi pajak untuk tiap perusahaan — tidak tertukar antar entitas.',
			},
			{
				title: 'Akun pajak default',
				text: 'PPN masukan dan keluaran otomatis terposting ke akun 207 dan 208.',
			},
			{
				title: 'Simulasi PPh 21',
				text: 'Hitung pajak tahunan atau bulanan dengan parameter yang bisa diubah-ubah.',
			},
			{
				title: 'Jejak untuk laporan fiskal',
				text: 'Semua pajak tercatat di jurnal sehingga laporan fiskal tinggal disusun.',
			},
		],
	},
	{
		slug: 'e-bupot',
		title: 'e-Bupot',
		group: 'Pajak & Laporan',
		icon: FileSignature,
		tagline: 'Bukti potong dalam satu alur.',
		description:
			'Kelola bukti potong PPh untuk vendor dan pihak lain tanpa aplikasi terpisah. Data pemotongan terkumpul dari transaksi sehingga periode pelaporan tinggal direkap.',
		benefits: [
			{
				title: 'Satu alur dengan pembelian',
				text: 'Pemotongan PPh tercatat bersama dokumen pembelian — tidak ada rekap manual di akhir bulan.',
			},
			{
				title: 'Siap untuk pelaporan',
				text: 'Rekap bukti potong per periode memudahkan penyusunan e-Bupot DJP.',
			},
			{
				title: 'Kurangi telat dan denda',
				text: 'Pengingat per periode membuat pemotongan dan pelaporan lebih disiplin.',
			},
		],
		capabilities: [
			{
				title: 'Data pemotongan terpusat',
				text: 'Semua bukti potong tersimpan per perusahaan dan bisa dicari kapan saja.',
			},
			{
				title: 'Terhubung ke kontak vendor',
				text: 'Riwayat pemotongan per supplier terlihat dari halaman kontaknya.',
			},
			{
				title: 'Rekap per periode',
				text: 'Susun daftar bukti potong per masa pajak untuk keperluan pelaporan.',
			},
		],
	},
	{
		slug: 'laporan',
		title: 'Laporan',
		group: 'Pajak & Laporan',
		icon: FileBarChart,
		tagline: 'Neraca, laba rugi, dan arus kas siap analisis.',
		description:
			'Laporan keuangan utama tersusun otomatis dari jurnal: neraca untuk posisi keuangan, laba rugi untuk performa, dan arus kas untuk kesehatan operasional.',
		benefits: [
			{
				title: 'Laporan standar akuntansi',
				text: 'Neraca, laba rugi, dan arus kas mengikuti struktur yang dikenali auditor dan bank.',
			},
			{
				title: 'Selalu terbaru',
				text: 'Setiap transaksi yang diposting langsung tercermin di laporan — tanpa tutup buku manual.',
			},
			{
				title: 'Sekilas bisnis di dashboard',
				text: 'Ringkasan arus kas dan posisi utang-piutang tampil di dashboard untuk keputusan cepat.',
			},
		],
		capabilities: [
			{
				title: 'Neraca',
				text: 'Posisi aset, kewajiban, dan ekuitas per tanggal laporan.',
			},
			{
				title: 'Laba rugi',
				text: 'Pendapatan dan beban per periode, termasuk beban penyusutan dan gaji.',
			},
			{
				title: 'Arus kas',
				text: 'Uang masuk dan keluar dari aktivitas operasional perusahaan.',
			},
			{
				title: 'Katalog laporan',
				text: 'Pilih laporan dari katalog per kategori lengkap dengan deskripsi dan sumber datanya.',
			},
		],
	},
	{
		slug: 'jurnal-umum',
		title: 'Jurnal Umum',
		group: 'Pajak & Laporan',
		icon: TableProperties,
		tagline: 'Pencatatan jurnal otomatis dari setiap transaksi.',
		description:
			'Setiap dokumen yang diposting — penjualan, pembelian, kas, payroll, penyusutan — membentuk jurnal berpasangan yang benar. Butuh penyesuaian? Tambahkan jurnal umum manual.',
		benefits: [
			{
				title: 'Tidak ada input jurnal dua kali',
				text: 'Transaksi otomatis membentuk jurnal ganda; Anda tinggal meninjaunya.',
			},
			{
				title: 'Buku besar rapi',
				text: 'Jurnal mengalir ke akun-akun yang benar sehingga buku besar selalu seimbang.',
			},
			{
				title: 'Penyesuaian tetap tercatat',
				text: 'Jurnal manual untuk koreksi akhir periode tetap menyatu dengan jurnal otomatis.',
			},
		],
		capabilities: [
			{
				title: 'Jurnal otomatis per dokumen',
				text: 'Posting invoice, pembayaran, atau payroll dan lihat jurnal yang dihasilkan.',
			},
			{
				title: 'Jurnal manual',
				text: 'Buat jurnal umum khusus untuk penyesuaian dan koreksi.',
			},
			{
				title: 'Telusuri ke sumber',
				text: 'Setiap baris jurnal menunjuk ke dokumen asalnya untuk keperluan audit.',
			},
			{
				title: 'Chart of accounts siap pakai',
				text: 'Daftar akun standar Indonesia sudah tersedia sejak awal.',
			},
		],
	},
	{
		slug: 'aset-tetap',
		title: 'Aset Tetap',
		group: 'Pajak & Laporan',
		icon: Package,
		tagline: 'Penyusutan dan siklus hidup aset yang tertib.',
		description:
			'Catat aset sejak pembelian, aktifkan, dan biarkan sistem menyusutkannya tiap periode. Metode Straight Line dan Reducing Balance tersedia, lengkap dengan status hingga aset dijual.',
		benefits: [
			{
				title: 'Penyusutan otomatis',
				text: 'Beban penyusutan dihitung per periode dan langsung masuk laba rugi.',
			},
			{
				title: 'Dua metode standar',
				text: 'Pilih Straight Line atau Reducing Balance sesuai kebijakan akuntansi perusahaan.',
			},
			{
				title: 'Dari pembelian sampai penjualan',
				text: 'Aset dibeli lewat pembelian, diaktifkan, disusutkan, lalu ditandai dijual — satu siklus penuh.',
			},
		],
		capabilities: [
			{
				title: 'Daftar aset',
				text: 'Kelola seluruh aset perusahaan dengan nilai, umur manfaat, dan statusnya.',
			},
			{
				title: 'Aktivasi aset tertunda',
				text: 'Aset baru tercatat tertunda sampai data penyusutan dilengkapi lalu diaktifkan.',
			},
			{
				title: 'Akun standar tersedia',
				text: 'Akumulasi penyusutan, selisih revaluasi, dan beban penyusutan sudah terpasang.',
			},
			{
				title: 'Jurnal penyusutan',
				text: 'Setiap penyusutan membentuk jurnal yang benar tanpa input manual.',
			},
		],
	},
	{
		slug: 'biaya',
		title: 'Biaya',
		group: 'Pajak & Laporan',
		icon: Banknote,
		tagline: 'Catat beban operasional harian dengan cepat.',
		description:
			'Belanja kantor, transportasi, dan pengeluaran harian tercatat per akun beban sehingga laba rugi selalu mencerminkan kondisi sebenarnya — tanpa menunggu rekap akhir bulan.',
		benefits: [
			{
				title: 'Pencatatan cepat',
				text: 'Formulir sederhana: tanggal, akun beban, jumlah, keterangan — selesai dalam hitungan detik.',
			},
			{
				title: 'Beban terklasifikasi rapi',
				text: 'Setiap biaya masuk ke akun yang tepat sehingga analisis beban per kategori mudah.',
			},
			{
				title: 'Laba rugi lebih jujur',
				text: 'Beban harian yang selalu tercatat membuat laba rugi tidak mengejutkan di akhir periode.',
			},
		],
		capabilities: [
			{
				title: 'Catat biaya harian',
				text: 'Input pengeluaran operasional kapan saja dari aplikasi.',
			},
			{
				title: 'Pilih akun beban',
				text: 'Biaya langsung terposting ke akun beban yang sesuai chart of accounts.',
			},
			{
				title: 'Riwayat dan filter',
				text: 'Telusuri biaya per tanggal atau akun untuk mengecek tren pengeluaran.',
			},
		],
	},
	{
		slug: 'akuntansi',
		title: 'Akuntansi',
		group: 'Lainnya',
		icon: Scale,
		tagline: 'Buku besar dan laporan keuangan yang bisa dipercaya.',
		description:
			'Fondasi Catet Pajak: chart of accounts standar Indonesia, jurnal berpasangan, dan buku besar yang selalu seimbang. Semua modul lain menumpang di atas fondasi ini.',
		benefits: [
			{
				title: 'Standar akuntansi Indonesia',
				text: 'Struktur akun dan laporan mengikuti praktik yang dikenal auditor dan konsultan pajak lokal.',
			},
			{
				title: 'Double-entry yang benar',
				text: 'Setiap transaksi tercatat berpasangan — buku besar selalu balance.',
			},
			{
				title: 'Satu sumber kebenaran',
				text: 'Penjualan, pembelian, kas, payroll, dan aset bermuara di satu buku besar.',
			},
		],
		capabilities: [
			{
				title: 'Chart of accounts',
				text: 'Kelola daftar akun perusahaan, dari kas sampai ekuitas.',
			},
			{
				title: 'Buku besar',
				text: 'Lihat mutasi dan saldo setiap akun per periode.',
			},
			{
				title: 'Neraca saldo',
				text: 'Periksa keseimbangan debit-kredit sebelum menyusun laporan.',
			},
			{
				title: 'Jurnal otomatis dan manual',
				text: 'Transaksi membentuk jurnal sendiri; penyesuaian tetap bisa ditambahkan.',
			},
		],
	},
	{
		slug: 'multi-perusahaan',
		title: 'Multi-perusahaan',
		group: 'Lainnya',
		icon: LayoutDashboard,
		tagline: 'Kelola banyak perusahaan dalam satu aplikasi.',
		description:
			'Pindah antar perusahaan sekali klik, dengan data, pengaturan pajak, dan pengguna yang terisolasi per entitas. Cocok untuk grup usaha maupun akuntan yang menangani banyak klien.',
		benefits: [
			{
				title: 'Data terisolasi per entitas',
				text: 'Transaksi, gudang, pajak, dan payroll satu perusahaan tidak bercampur dengan yang lain.',
			},
			{
				title: 'Pengalihan cepat',
				text: 'Pemilih perusahaan di sidebar memindahkan seluruh konteks aplikasi seketika.',
			},
			{
				title: 'Satu akun, banyak entitas',
				text: 'Anda dan tim masuk sekali dan mengelola seluruh perusahaan yang menjadi anggotanya.',
			},
		],
		capabilities: [
			{
				title: 'Tambah perusahaan',
				text: 'Buat entitas baru lengkap dengan identitas, alamat, dan NPWP.',
			},
			{
				title: 'Pengaturan per perusahaan',
				text: 'Pajak, payroll, cuti, dan gudang diatur terpisah untuk tiap entitas.',
			},
			{
				title: 'Anggota dan peran',
				text: 'Tentukan siapa mengelola perusahaan apa dengan peran yang berbeda.',
			},
		],
	},
	{
		slug: 'kontak-pengguna',
		title: 'Kontak & Pengguna',
		group: 'Lainnya',
		icon: ContactRound,
		tagline: 'Pelanggan, supplier, dan akses tim dalam satu tempat.',
		description:
			'Kelola daftar pelanggan dan supplier beserta riwayat transaksinya, lalu atur tim Anda: undang pengguna, tetapkan peran, dan batasi menu sesuai tanggung jawabnya.',
		benefits: [
			{
				title: 'Riwayat per kontak',
				text: 'Buka halaman kontak dan lihat seluruh dokumen, utang, dan piutangnya.',
			},
			{
				title: 'Peran yang sesuai tanggung jawab',
				text: 'Pemilik, admin, akuntan, finance, dan HR melihat menu yang berbeda sesuai perannya.',
			},
			{
				title: 'Karyawan mandiri lewat ESS',
				text: 'Undang karyawan ke portal self-service untuk absensi, cuti, lembur, dan slip gaji.',
			},
		],
		capabilities: [
			{
				title: 'Master kontak',
				text: 'Kelola pelanggan dan supplier dengan detail lengkap.',
			},
			{
				title: 'Undang pengguna',
				text: 'Kirim undangan dengan kata sandi sementara dan atur masa aktifnya.',
			},
			{
				title: 'Peran dan hak akses',
				text: 'Batasi menu dan modul per pengguna agar data sensitif tetap terjaga.',
			},
			{
				title: 'Tautkan akun ke karyawan',
				text: 'Hubungkan akun ESS dengan data karyawan agar slip dan pengajuan tepat sasaran.',
			},
		],
	},
];

export function getFeaturePage(slug: string): FeaturePage | undefined {
	return FEATURE_PAGES.find(page => page.slug === slug);
}

export function getRelatedFeatures(slug: string, count = 4): FeaturePage[] {
	const current = getFeaturePage(slug);
	if (!current) return FEATURE_PAGES.slice(0, count);
	const sameGroup = FEATURE_PAGES.filter(
		page => page.slug !== slug && page.group === current.group,
	);
	const others = FEATURE_PAGES.filter(
		page => page.slug !== slug && page.group !== current.group,
	);
	return [...sameGroup, ...others].slice(0, count);
}
