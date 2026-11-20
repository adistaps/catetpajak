const IMAGE =
	'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/4c481317976f17860f4cbe2bb3087c06.png';

export function SalesPaymentTerms() {
	return (
		<section className="bg-white px-5 py-14 md:px-8 md:py-20">
			<div className="mx-auto max-w-6xl">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
					Syarat pembayaran
				</p>
				<h2 className="mt-3 max-w-3xl text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
					Termin 2/3 N/30 langsung di invoice penjualan
				</h2>
				<p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
					Pilih syarat pembayaran saat membuat invoice. Catet Pajak menghitung tanggal diskon,
					nominal potongan, dan jatuh tempo penuh — pelanggan tahu kapan bayar lebih murah.
				</p>

				<article className="mt-12 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
					<figure className="overflow-hidden rounded-2xl border border-primary/15 bg-[#f4fbf7] shadow-soft-sm">
						<img
							src={IMAGE}
							alt="Form buat invoice penjualan dengan syarat pembayaran 2/3 N/30, diskon 2% bila dibayar pada atau sebelum 16 Oktober 2026, dan jatuh tempo 12 November 2026."
							className="h-auto w-full"
							loading="lazy"
						/>
					</figure>
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
							Contoh 2/3 N/30
						</p>
						<h3 className="mt-2 text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
							Diskon 2% dalam 3 hari, tempo penuh 30 hari
						</h3>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
							Pada invoice tanggal 13 Oktober 2026 senilai Rp 200.000, syarat 2/3 N/30 berarti
							diskon 2% berlaku bila dibayar dalam 3 hari, dan sisa tagihan jatuh tempo dalam
							30 hari.
						</p>
						<ul className="mt-5 space-y-2.5">
							<li className="flex gap-2.5 text-sm text-foreground/85">
								<span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
								<span>Diskon 2% bila dibayar pada atau sebelum 16 Oktober 2026</span>
							</li>
							<li className="flex gap-2.5 text-sm text-foreground/85">
								<span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
								<span>Nominal diskon Rp 4.000 — bayar Rp 196.000 jika memenuhi syarat</span>
							</li>
							<li className="flex gap-2.5 text-sm text-foreground/85">
								<span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
								<span>Jatuh tempo penuh 12 November 2026 bila diskon tidak diambil</span>
							</li>
							<li className="flex gap-2.5 text-sm text-foreground/85">
								<span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
								<span>Catatan di form: diskon masih berlaku hari ini, pelanggan bisa bayar lebih murah</span>
							</li>
						</ul>
					</div>
				</article>
			</div>
		</section>
	);
}
