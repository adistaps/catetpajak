const METRICS = [
	{ value: '83%', label: 'pertumbuhan efisiensi pembukuan' },
	{ value: '2×', label: 'lebih cepat pembuatan laporan' },
	{ value: '90%', label: 'lebih cepat rekap multi-perusahaan' },
];

export function Results() {
	return (
		<section id="hasil" className="bg-white px-5 py-20 md:px-8 md:py-24">
			<div className="mx-auto max-w-6xl">
				<div className="max-w-xl">
					<h2 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
						Hasil nyata dari klien kami
					</h2>
					<p className="mt-4 text-base text-muted-foreground">
						Lihat bagaimana Catet Pajak mempercepat proses akuntansi multi-perusahaan dan
						meningkatkan akurasi data.
					</p>
				</div>

				<div className="mt-10 overflow-hidden rounded-3xl border border-border bg-secondary/40 p-6 md:p-10">
					<div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
						<blockquote className="text-xl font-medium leading-relaxed text-foreground md:text-2xl">
							“Dengan Catet Pajak, semua data jurnal dan laporan multi-perusahaan
							terkonsolidasi dalam satu tempat.{' '}
							<span className="rounded bg-emerald-100 px-1 text-emerald-900">
								Kami bisa mengejar pertumbuhan hingga 83% dalam setahun.
							</span>
							”
							<footer className="mt-6 text-sm">
								<p className="font-bold text-foreground">Henry</p>
								<p className="text-muted-foreground">
									Senior Accounting Manager, Charged Asia
								</p>
							</footer>
						</blockquote>
						<div className="grid grid-cols-3 gap-3">
							{METRICS.map(metric => (
								<div
									key={metric.label}
									className="rounded-2xl border border-border bg-white p-4 text-center shadow-soft-sm"
								>
									<p className="text-2xl font-extrabold text-primary md:text-3xl">
										{metric.value}
									</p>
									<p className="mt-2 text-[11px] leading-snug text-muted-foreground md:text-xs">
										{metric.label}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
