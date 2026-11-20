import { useState } from 'react';
import { Link } from 'react-router';
import { Check, MessageCircle } from 'lucide-react';

const SHOWCASES = [
	{
		tab: 'Data siswa',
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/06605696c1105a491aff3065111a6a03.png',
		alt: 'Halaman Kontak Catet Pajak pada tab Student, menampilkan total siswa, pencarian, dan daftar siswa aktif.',
		title: 'Identitas siswa dan informasi akademik di satu daftar',
		text: 'Dari menu Kontak, tab Student menyimpan identitas siswa yang dipakai saat mencatat transaksi. Pantau total siswa dan siswa aktif, cari berdasarkan nama, NIS, orang tua, atau program.',
		points: [
			'Kolom NIS / ID, tahun ajaran, program, kelas, dan nomor VA',
			'Status siswa terlihat langsung di daftar: Aktif, Nonaktif, Lulus, atau Keluar',
			'Tambah siswa baru tanpa berpindah modul',
			'Cocok untuk bendahara sekolah yang mencatat tagihan per anak',
		],
	},
	{
		tab: 'Orang tua / wali',
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/5ce7f915162edf1647b89b2a5332dcd5.png',
		alt: 'Halaman Parent Data menampilkan akun orang tua, email login, dan siswa yang terkait.',
		title: 'Akun parent terhubung ke siswa untuk melihat tagihan',
		text: 'Tab Parent mengelola akun orang tua atau wali: nama, email login, telepon, dan siswa terkait. Satu parent bisa dikaitkan ke lebih dari satu siswa.',
		points: [
			'Kaitkan atau lepaskan siswa dari akun parent',
			'Kirim akses login dan atur ulang kata sandi',
			'Status keterkaitan terlihat tanpa membuka detail',
			'Tagihan di portal mengikuti anak yang diampu',
		],
	},
	{
		tab: 'Portal orang tua',
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/d25178609a670a687361dde43f499b04.png',
		alt: 'Portal parent menampilkan pilihan siswa, ringkasan tagihan, dan daftar invoice beserta status pembayaran.',
		title: 'Tagihan, tunggakan, dan pembayaran dari sisi wali',
		text: 'Di portal parent, wali memilih kartu siswa untuk melihat ringkasan dan tagihan anak tersebut. Status Lunas atau Belum Dibayar tampil lengkap dengan tombol Bayar.',
		points: [
			'Pilih siswa untuk memfilter tagihan invoice',
			'Riwayat pembayaran, pengumuman, dan chat sekolah',
			'Pengaturan akun parent tanpa masuk ke aplikasi bendahara',
			'Total tagihan dan tunggakan tampil di atas daftar invoice',
		],
	},
] as const;

export function SchoolPortalShowcase() {
	const [active, setActive] = useState(0);
	const item = SHOWCASES[active];

	return (
		<section className="bg-white px-5 py-14 md:px-8 md:py-20">
			<div className="mx-auto max-w-6xl">
				<div className="flex justify-center">
					<div
						role="tablist"
						aria-label="Fitur sekolah"
						className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#eef1f4] p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					>
						{SHOWCASES.map((feature, index) => {
							const selected = index === active;
							return (
								<button
									key={feature.tab}
									type="button"
									role="tab"
									aria-selected={selected}
									onClick={() => setActive(index)}
									className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors md:px-5 ${
										selected
											? 'bg-primary text-primary-foreground shadow-sm'
											: 'text-[#5c6570] hover:text-foreground'
									}`}
								>
									{feature.tab}
								</button>
							);
						})}
					</div>
				</div>

				<div className="mt-12 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
					<div>
						<h2 className="text-2xl font-bold tracking-tight text-foreground md:text-[1.75rem]">
							{item.title}
						</h2>
						<p className="mt-3 max-w-xl text-sm leading-relaxed text-[#3d4654] md:text-[15px]">
							{item.text}
						</p>
						<ul className="mt-6 space-y-3.5">
							{item.points.map(point => (
								<li key={point} className="flex items-start gap-3 text-sm text-[#2c3440] md:text-[15px]">
									<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
										<Check className="size-3" strokeWidth={3} />
									</span>
									<span>{point}</span>
								</li>
							))}
						</ul>
						<div className="mt-8 flex flex-wrap gap-3">
							<a
								href="https://wa.me/6285110565506"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.98]"
							>
								<MessageCircle className="size-4" />
								WhatsApp sales
							</a>
							<Link
								to="/login"
								className="inline-flex min-h-11 items-center rounded-lg border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-accent active:scale-[0.98]"
							>
								Mulai gratis
							</Link>
						</div>
					</div>

					<figure className="relative mx-auto w-full max-w-xl lg:max-w-none">
						<div className="overflow-hidden rounded-xl border border-[#e6ebf0] bg-white shadow-[0_18px_50px_rgba(15,40,70,0.12)]">
							<img
								src={item.src}
								alt={item.alt}
								className="h-auto w-full"
							/>
						</div>
					</figure>
				</div>
			</div>
		</section>
	);
}
