import { Search } from 'lucide-react';

const SERVICES = ['Pembukuan', 'Pajak tahunan', 'PPh 21', 'SPT', 'Laporan keuangan', 'Konsultasi UMKM'];

export function AkuntanHero({
	query,
	onQueryChange,
	onSearch,
	onPickService,
}: {
	query: string;
	onQueryChange: (value: string) => void;
	onSearch: () => void;
	onPickService: (service: string) => void;
}) {
	return (
		<section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-[#f7fbf8]">
			<div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-emerald-100/70 blur-2xl" />
			<div className="mx-auto max-w-6xl px-5 pb-8 pt-12 md:px-8 md:pt-16">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
					Marketplace jasa akuntan
				</p>
				<h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight text-[#102a4c] sm:text-5xl">
					Temukan akuntan yang tepat untuk usaha Anda
				</h1>
				<p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
					Jelajahi profil CV, kota, dan layanan tanpa perlu masuk. Akuntan mengelola profilnya di aplikasi Catet Akuntan — terpisah dari pembukuan perusahaan.
				</p>
				<form
					className="mt-8 flex max-w-2xl items-center gap-2 rounded-full border border-emerald-100 bg-white p-2 shadow-[0_16px_40px_rgba(16,185,129,0.12)]"
					onSubmit={event => {
						event.preventDefault();
						onSearch();
					}}
				>
					<Search className="ml-3 size-5 shrink-0 text-emerald-500" strokeWidth={1.75} />
					<input
						value={query}
						onChange={event => onQueryChange(event.target.value)}
						placeholder="Cari nama, kota, atau layanan — cth. Jakarta, PPh 21"
						className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-slate-400"
						aria-label="Cari akuntan"
					/>
					<button
						type="submit"
						className="h-11 shrink-0 rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-6 text-sm font-semibold text-white hover:brightness-110"
					>
						Cari
					</button>
				</form>
				<div className="mt-5 flex gap-2 overflow-x-auto pb-2">
					{SERVICES.map(service => (
						<button
							key={service}
							type="button"
							onClick={() => onPickService(service)}
							className="shrink-0 rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-medium text-[#12315a] shadow-sm hover:border-emerald-300 hover:bg-emerald-50"
						>
							{service}
						</button>
					))}
				</div>
			</div>
		</section>
	);
}
