import { useState } from 'react';
import { Link } from 'react-router';
import { Check, MessageCircle } from 'lucide-react';

const SHOWCASES = [
	{
		tab: 'Posisi keuangan',
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/d6de44905968ce91511dfce65996ede2.png',
		alt: 'Laporan posisi keuangan yayasan dalam IDR, menampilkan aset lancar, liabilitas, dan aset neto dengan pembatasan dari pemberi sumber daya.',
		title: 'Laporan posisi keuangan yayasan sesuai ISAK 35',
		text: 'Posisi keuangan (yayasan) menyajikan aset, liabilitas, dan aset neto dalam rupiah, komparatif antar tanggal laporan. Aset neto dipisah antara tanpa pembatasan dan dengan pembatasan dari pemberi sumber daya, sehingga saldo dana tidak tercampur.',
		points: [
			'Aset lancar dan tidak lancar: kas, bank, piutang usaha, lalu total aset',
			'Liabilitas jangka pendek dan jangka panjang, termasuk utang usaha',
			'Aset neto: surplus akumulasi dan penghasilan komprehensif lain',
			'Filter tahun pelaporan, periode ISAK 35, dan ekspor laporan',
		],
	},
	{
		tab: 'Perubahan aset neto',
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/efe6c85bd12014240e93d7c506f62fac.png',
		alt: 'Laporan perubahan aset neto yayasan menampilkan saldo awal, surplus tahun berjalan, pembebasan pembatasan, dan saldo akhir.',
		title: 'Dari saldo awal sampai saldo akhir, per jenis pembatasan',
		text: 'Laporan perubahan aset neto membandingkan tahun berjalan dengan tahun sebelumnya. Setiap kelompok — tanpa pembatasan, penghasilan komprehensif lain, dan dengan pembatasan — punya saldo awal, surplus tahun berjalan, aset neto yang dibebaskan dari pembatasan, dan saldo akhir.',
		points: [
			'Aset neto tanpa pembatasan dan dengan pembatasan terpisah',
			'Surplus tahun berjalan dan pembebasan pembatasan terlihat per baris',
			'Penghasilan komprehensif lain punya saldo sendiri',
			'Format ISAK 35 untuk tahun yang berakhir 31 Desember, komparatif',
		],
	},
] as const;

export function FoundationReportShowcase() {
	const [active, setActive] = useState(0);
	const item = SHOWCASES[active];

	return (
		<section className="bg-white px-5 py-14 md:px-8 md:py-20">
			<div className="mx-auto max-w-6xl">
				<p className="text-center text-[11px] font-semibold uppercase tracking-wide text-primary">
					Laporan yayasan
				</p>
				<h2 className="mx-auto mt-3 max-w-3xl text-center text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
					Posisi keuangan dan perubahan aset neto, siap ditinjau
				</h2>
				<p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground md:text-base">
					Setiap penerimaan dan pengeluaran membentuk jurnal. Dari jurnal yang sama, pengurus
					membuka laporan posisi keuangan dan perubahan aset neto dalam IDR — tanpa rekap manual.
				</p>

				<div className="mt-10 flex justify-center">
					<div
						role="tablist"
						aria-label="Fitur yayasan"
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
						<h3 className="text-2xl font-bold tracking-tight text-foreground md:text-[1.75rem]">
							{item.title}
						</h3>
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
							<img src={item.src} alt={item.alt} className="h-auto w-full" />
						</div>
					</figure>
				</div>
			</div>
		</section>
	);
}
