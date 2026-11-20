import {
	Building2,
	Lock,
	Sparkles,
	HeadphonesIcon,
	Layers,
	Network,
} from 'lucide-react';

const BENEFITS = [
	{
		icon: Layers,
		title: 'Akuntansi multi-perusahaan terpadu',
		desc: 'Konsolidasi pembukuan banyak perusahaan dalam satu akun — bagan akun, jurnal, dan laporan terpisah rapi.',
	},
	{
		icon: Network,
		title: 'Siap white-label & jual kembali',
		desc: 'Bangun bisnis perangkat lunak akuntansi Anda sendiri di atas fondasi Catet Pajak yang sudah matang.',
	},
	{
		icon: HeadphonesIcon,
		title: 'Pajak & payroll bawaan',
		desc: 'e-Bupot, simulasi PPh 21, PPN, hingga slip gaji & overtime — tanpa aplikasi terpisah.',
	},
	{
		icon: Sparkles,
		title: 'Posting jurnal otomatis',
		desc: 'Setiap transaksi penjualan, pembelian, kas, biaya, dan payroll terposting ke jurnal umum secara otomatis.',
	},
	{
		icon: Building2,
		title: 'Kompatibel banyak industri',
		desc: 'Struktur akun fleksibel untuk jasa, ritel, manufaktur, dan model bisnis lainnya.',
	},
	{
		icon: Lock,
		title: 'Akses per pengguna',
		desc: 'Undang anggota, atur peran, batasan modul, dan masa berlaku. Isolasi tenant bawaan.',
	},
];

export function Benefits() {
	return (
		<section className="bg-secondary/50 px-5 py-20 md:px-8 md:py-24">
			<div className="mx-auto max-w-6xl">
				<div className="grid gap-6 md:grid-cols-[1fr_0.85fr] md:items-end">
					<h2 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
						Lebih dari pembukuan — satu sistem untuk seluruh keuangan
					</h2>
					<p className="text-base text-muted-foreground">
						Posting jurnal otomatis, pajak & payroll bawaan, serta akses terkelola
						per pengguna untuk bisnis berbagai skala.
					</p>
				</div>

				<div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{BENEFITS.map(item => (
						<article
							key={item.title}
							className="rounded-2xl border border-border bg-white p-6 shadow-soft-sm"
						>
							<span className="mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-primary">
								<item.icon className="size-5" strokeWidth={1.75} />
							</span>
							<h3 className="text-base font-bold text-foreground">{item.title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
								{item.desc}
							</p>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
