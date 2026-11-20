import { Link } from 'react-router';
import { ArrowRight, Check, MessageCircle, Star } from 'lucide-react';

const BULLETS = [
	'Penjualan, pembelian, persediaan, aset, payroll & pajak terintegrasi',
	'Kelola multi-perusahaan dengan bagan akun & jurnal otomatis',
	'Laporan neraca, laba rugi, arus kas & e-Bupot instan',
];

export function Hero() {
	return (
		<section className="relative -mt-16 overflow-hidden bg-[#0e7a4e] text-white">
			<div className="pointer-events-none absolute inset-0" aria-hidden>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_28%,#1aa86a_0%,#0e7a4e_46%,#0b6842_100%)]" />
				<div className="absolute bottom-0 left-1/2 h-72 w-[120%] -translate-x-1/2 rounded-[100%] bg-gradient-to-t from-[#085c3a]/90 to-transparent" />
			</div>

			<div className="relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col items-center justify-center px-5 pb-20 pt-28 text-center md:px-8 md:pb-24 md:pt-32">
				<p className="mb-6 inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-200">
					Software akuntansi multi divisi
				</p>
				<h1 className="max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl lg:text-[4.25rem]">
					<span className="relative inline-block">Aplikasi akuntansi</span>
					<br />
					pajak & payroll all-in-one
				</h1>
				<p className="mt-6 max-w-2xl text-base leading-relaxed text-emerald-50/80 md:text-lg">
					Kelola bisnis lebih rapi dengan invoice, persediaan, penggajian, dan e-Bupot dalam satu platform — untuk banyak perusahaan sekaligus.
				</p>
				<ul className="mt-6 flex max-w-xl flex-col items-start gap-2 text-left text-sm text-emerald-50/75">
					{BULLETS.map(item => (
						<li key={item} className="flex items-start gap-2">
							<Check className="mt-0.5 size-4 shrink-0 text-emerald-300" strokeWidth={2.5} />
							{item}
						</li>
					))}
				</ul>
				<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
					<Link
						to="/login"
						className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-300 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-[0_10px_30px_rgba(110,231,183,0.25)] transition-transform hover:-translate-y-0.5"
					>
						Mulai gratis
						<ArrowRight className="size-4" />
					</Link>
					<Link
						to="/app"
						className="inline-flex min-h-11 items-center rounded-full border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
					>
						Buka dasbor
					</Link>
					<a
						href="https://wa.me/6285110565506"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
					>
						<MessageCircle className="size-4" />
						Chat WhatsApp
					</a>
				</div>
				<div className="mt-8 flex items-center gap-3">
					<div className="flex -space-x-1.5">
						{['G', '2', 'C'].map(letter => (
							<span
								key={letter}
								className="flex size-8 items-center justify-center rounded-full border-2 border-[#0e7a4e] bg-emerald-100 text-xs font-bold text-emerald-900"
							>
								{letter}
							</span>
						))}
					</div>
					<div className="text-left">
						<p className="flex items-center gap-1 text-sm font-semibold">
							<Star className="size-3.5 fill-amber-300 text-amber-300" />
							5.0 rating
						</p>
						<p className="text-xs text-emerald-50/60">Ulasan dari pengguna bisnis</p>
					</div>
				</div>
			</div>
		</section>
	);
}
