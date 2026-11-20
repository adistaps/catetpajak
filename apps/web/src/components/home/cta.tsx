import { Link } from 'react-router';
import { MessageCircle, Phone } from 'lucide-react';
import { openCookiePreferences } from '@/lib/cookie-consent';
export function Cta() {
  return <>
			<section className="bg-white px-5 py-16 md:px-8 md:py-20">
				<div className="mx-auto max-w-6xl">
					<div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-10 text-primary-foreground shadow-soft md:flex md:items-center md:justify-between md:px-12 md:py-12">
						<div className="absolute -right-10 -top-10 size-48 rounded-full bg-emerald-400/30 blur-2xl" />
						<div className="absolute -bottom-16 right-24 size-40 rounded-full bg-white/10 blur-2xl" />
						<div className="relative max-w-xl">
							<h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
								Solusi tepat untuk akselerasi bisnis lebih pesat
							</h2>
							<p className="mt-3 text-sm leading-relaxed text-primary-foreground/85 md:text-base">
								Catet Pajak mempermudah operasional dan financial multi-perusahaan agar Anda
								fokus pada pertumbuhan dan pengambilan keputusan.
							</p>
						</div>
						<Link to="/login" className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-primary shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 md:mt-0">
							<MessageCircle className="size-4" />
							Mulai gratis
						</Link>
					</div>
				</div>
			</section>

			<footer className="border-t border-border bg-white px-5 py-12 md:px-8">
				<div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
					<div className="md:col-span-1">
						<div className="flex items-center gap-2.5">
							<img src="/catet-logo.png" alt="Logo Catet Pajak" className="brand-logo size-8 object-contain" />
							<span className="text-lg font-bold tracking-tight">
								Catet <span className="text-emerald-500">Pajak</span>
							</span>
						</div>
						<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
							Aplikasi akuntansi multi-perusahaan siap jual kembali.
						</p>
					</div>
					<div>
						<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
							Produk
						</p>
						<ul className="mt-3 space-y-2 text-sm text-foreground">
							<li>
								<a href="#fitur" className="hover:text-primary">
									Fitur
								</a>
							</li>
							<li>
								<a href="#solusi" className="hover:text-primary">
									Solusi
								</a>
							</li>
							<li>
								<a href="#harga" className="hover:text-primary">
									Harga
								</a>
							</li>
							<li>
								<Link to="/event" className="hover:text-primary">
									Event
								</Link>
							</li>
							<li>
								<a href="#faq" className="hover:text-primary">
									FAQ
								</a>
							</li>
						</ul>
					</div>
					<div>
						<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
							Aplikasi
						</p>
						<ul className="mt-3 space-y-2 text-sm text-foreground">
							<li>
								<Link to="/login" className="hover:text-primary">
									Masuk
								</Link>
							</li>
							<li>
								<Link to="/login" className="hover:text-primary">
									Daftar
								</Link>
							</li>
							<li>
								<Link to="/app" className="hover:text-primary">
									Dasbor
								</Link>
							</li>
						</ul>
					</div>
					<div>
						<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
							Kontak
						</p>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground">email: info@catetpajak.com</p>
					<a
						href="https://wa.me/6285110565506"
						target="_blank"
						rel="noopener noreferrer"
						className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
					>
						<Phone className="size-4" />
						WhatsApp: 0851-1056-5506
					</a>
						<address className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground not-italic">
							Infiniti Office, Arcade Business Center, 6th Floor, Unit 6-03, Jl. Pantai Indah Utara 2 Kav. C1, PIK, RT. 016/RW. 007, Kapuk Muara, Penjaringan, Kota Administrasi Jakarta Utara, DKI Jakarta
						</address>
					</div>
				</div>
				<div className="mx-auto mt-10 max-w-6xl border-t border-border pt-6 text-center text-xs text-muted-foreground">
					© {new Date().getFullYear()} PT Catet Pajak Indonesia. Aplikasi akuntansi multi-perusahaan.
					{' '}<button type="button" onClick={openCookiePreferences} className="underline hover:text-primary">Pengaturan cookie</button>
				</div>
			</footer>
		</>;
}