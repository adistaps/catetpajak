const SHOWCASES = [
	{
		src: 'https://horizons-cdn.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/120013206cb21ab0c1b5148ecd0002cd.png',
		alt: 'Portal self-service Siska Utama di PT Indah Jaya: Live Attendance menampilkan jam 09.26.22, jadwal 08:00–17:00, status Terlambat, clock in 08:49, dan riwayat absensi 13 Oktober 2026.',
		kicker: 'Live Attendance',
		title: 'Clock in dan clock out langsung dari portal karyawan',
		text: 'Karyawan membuka self-service, melihat jam berjalan, jadwal hari ini, dan status kehadiran, lalu mencatat clock in atau clock out sendiri. Riwayat absensi terbaru bisa difilter per tanggal tanpa rekap manual.',
		points: [
			'Live Attendance menampilkan jam berjalan dan tanggal, contoh 09.26.22, Selasa 13 Oktober 2026',
			'Jadwal 08:00–17:00 dan status Terlambat terlihat sebelum karyawan menekan Clock in',
			'Clock in 08:49 tercatat; clock out masih kosong sampai karyawan pulang',
			'Riwayat absensi terbaru difilter 13/10/2026: clock in, clock out, dan kode On time',
			'Dari layar yang sama karyawan bisa ajukan lembur, cuti, dan pinjaman',
		],
	},
] as const;

export function AttendanceShowcase() {
	return (
		<section className="bg-white px-5 py-14 md:px-8 md:py-20">
			<div className="mx-auto max-w-6xl">
				<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
					Absensi mandiri
				</p>
				<h2 className="mt-3 max-w-3xl text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
					Kehadiran hari ini, jadwal, dan riwayat dalam satu layar
				</h2>
				<p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
					Portal self-service menampilkan Live Attendance, status terhadap jadwal, pencatatan
					clock in dan clock out, serta riwayat yang bisa difilter tanggal. Pengajuan lembur,
					cuti, dan pinjaman ada di tab yang sama.
				</p>

				<div className="mt-12 flex flex-col gap-16">
					{SHOWCASES.map(item => (
						<article
							key={item.title}
							className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
						>
							<figure className="overflow-hidden rounded-2xl border border-primary/15 bg-[#f4fbf7] shadow-soft-sm">
								<img src={item.src} alt={item.alt} className="h-auto w-full" loading="lazy" />
							</figure>
							<div>
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
