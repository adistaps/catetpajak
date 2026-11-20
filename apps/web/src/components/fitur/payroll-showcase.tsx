const SHOWCASES = [
	{
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/a9d2ce324cad402acf776f84df92f3fe.png',
		alt: 'Periode gaji Penggajian 2026-10 dengan cut-off 1–31 Oktober, total bruto Rp 50.000.000, potongan Rp 11.427.503, total dibayar Rp 38.572.497, dan slip gaji Siska Utama sebelum jurnal diterbitkan.',
		kicker: 'Periode gaji',
		title: 'Slip gaji per periode, lalu terbitkan jurnal',
		text: 'Buka periode penggajian, tinjau cut-off dan tanggal bayar, lalu simpan perubahan atau terbitkan jurnal. Total bruto, potongan, dan nominal yang dibayar tampil sebelum slip dibagikan.',
		points: [
			'Cut-off 01/10/2026 – 31/10/2026, tanggal bayar 31/10/2026',
			'Total bruto Rp 50.000.000, potongan Rp 11.427.503, dibayar Rp 38.572.497',
			'Slip menampilkan gaji pokok, tunjangan, BPJS TK, BPJS Kesehatan, dan PPh 21',
			'Status masih Draf sampai jurnal payroll diterbitkan',
		],
	},
	{
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/c2dcbc784c4390fad358075785da330c.png',
		alt: 'Halaman Update Payroll Component dengan riwayat perubahan, transaksi 2026101301 bertipe Adjustment per 13 Oktober 2026.',
		kicker: 'Komponen payroll',
		title: 'Ubah komponen gaji dengan jejak riwayat',
		text: 'Tunjangan, potongan, dan penyesuaian komponen tidak ditimpa diam-diam. Setiap pembaruan punya nomor transaksi, tipe, tanggal berlaku, pembuat, dan jumlah karyawan yang terdampak.',
		points: [
			'Riwayat pembaruan dan riwayat per karyawan dalam satu layar',
			'Contoh transaksi 2026101301, tipe Adjustment, berlaku 13/10/2026',
			'Filter periode dan pencarian memudahkan audit komponen',
			'Perubahan bisa diterapkan ke karyawan yang dipilih',
		],
	},
	{
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/844e8bffaac4a805342e4157d8ce2737.png',
		alt: 'Daftar pengajuan lembur Siska Utama pada 13 Oktober 2026 selama 1 jam, kompensasi lembur dibayar Rp 433.526, status menunggu persetujuan.',
		kicker: 'Lembur',
		title: 'Pengajuan lembur menunggu persetujuan',
		text: 'Karyawan atau HR mengajukan lembur lengkap dengan tanggal, durasi, dan jenis kompensasi. Permintaan yang masih menunggu persetujuan tidak masuk slip sampai disetujui.',
		points: [
			'Siska Utama, ID 30939731, lembur 13 Oktober 2026 selama 1 jam',
			'Kompensasi paid overtime Rp 433.526',
			'Status Awaiting approval sebelum masuk perhitungan gaji',
			'Filter tahun, status, dan pencarian nama atau ID karyawan',
		],
	},
	{
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/d919d2e0aebc0e197f8cb309555f8334.png',
		alt: 'Daftar pemotongan PPh 21 masa Oktober 2026 untuk Siska Utama, penghasilan kotor Rp 50.000.000, tarif 20,40%, total PPh 21 Rp 10.202.029, dengan tombol ekspor CSV.',
		kicker: 'PPh 21',
		title: 'Pemotongan PPh 21 terintegrasi payroll, siap ekspor',
		text: 'Daftar bukti potong mengikuti data slip. Masa pajak, status pegawai, kode objek, penghasilan kotor, dan tarif tampil per karyawan — lalu diekspor CSV atau dicoba dulu di simulasi.',
		points: [
			'Masa 10/2026, tanggal pemotongan 13/10/2026, status pegawai aktif',
			'Siska Utama, pegawai tetap, kode objek 21-100-01, status NIK',
			'Penghasilan kotor Rp 50.000.000, tarif 20,40%, PPh 21 Rp 10.202.029',
			'Ekspor CSV dan simulasi PPh 21 tanpa mengubah data payroll',
		],
	},
] as const;

export function PayrollShowcase() {
	return (
		<section className="bg-white px-5 py-14 md:px-8 md:py-20">
			<div className="mx-auto max-w-6xl">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
					Alur penggajian
				</p>
				<h2 className="mt-3 max-w-3xl text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
					Dari komponen dan lembur sampai slip, jurnal, dan PPh 21
				</h2>
				<p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
					Periode gaji menampilkan bruto, potongan, dan nominal dibayar. Komponen punya riwayat
					perubahan, lembur menunggu persetujuan, jurnal terbit dari periode yang sama, dan
					pemotongan PPh 21 bisa diekspor.
				</p>

				<div className="mt-12 flex flex-col gap-16">
					{SHOWCASES.map((item, index) => (
						<article
							key={item.title}
							className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
						>
							<figure
								className={`overflow-hidden rounded-2xl border border-primary/15 bg-[#f4fbf7] shadow-soft-sm ${
									index % 2 === 1 ? 'lg:order-2' : ''
								}`}
							>
								<img
									src={item.src}
									alt={item.alt}
									className="h-auto w-full"
									loading="lazy"
								/>
							</figure>
							<div className={index % 2 === 1 ? 'lg:order-1' : ''}>
								<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
									{item.kicker}
								</p>
								<h3 className="mt-2 text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
									{item.title}
								</h3>
								<p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
									{item.text}
								</p>
								<ul className="mt-5 space-y-2.5">
									{item.points.map(point => (
										<li key={point} className="flex gap-2.5 text-sm text-foreground/85">
											<span
												aria-hidden
												className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
											/>
											<span>{point}</span>
										</li>
									))}
								</ul>
							</div>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
