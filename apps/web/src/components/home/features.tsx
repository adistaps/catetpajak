import { Link } from 'react-router';
import {
	Banknote,
	Boxes,
	CalendarDays,
	ChartNoAxesCombined,
	ClipboardList,
	ContactRound,
	FileBarChart,
	FileSignature,
	FolderKanban,
	Gauge,
	Landmark,
	LayoutDashboard,
	Package,
	Receipt,
	Scale,
	ShoppingCart,
	TableProperties,
	Tags,
	Truck,
	UserRound,
	Users,
	Warehouse,
	type LucideIcon,
} from 'lucide-react';

const ICON_COLORS = [
	'#4f8a6d',
	'#5387c6',
	'#d98a45',
	'#8b70b8',
	'#4c9b9a',
	'#d16f76',
	'#c49b45',
	'#4d9fc4',
	'#d87855',
	'#6879b8',
	'#77a84e',
	'#bf6f9f',
];

const MODULES: { title: string; icon: LucideIcon; href: string }[] = [
	{ title: 'Akuntansi', icon: Scale, href: '/fitur/akuntansi' },
	{ title: 'Penjualan', icon: ShoppingCart, href: '/fitur/penjualan' },
	{ title: 'Pembelian', icon: Truck, href: '/fitur/pembelian' },
	{ title: 'Kas & Bank', icon: Landmark, href: '/fitur/kas-bank' },
	{ title: 'Aset Tetap', icon: Package, href: '/fitur/aset-tetap' },
	{ title: 'Persediaan', icon: Boxes, href: '/fitur/persediaan' },
	{ title: 'Gudang', icon: Warehouse, href: '/fitur/gudang' },
	{ title: 'Penggajian', icon: Users, href: '/fitur/penggajian' },
	{ title: 'Absensi', icon: CalendarDays, href: '/fitur/absensi' },
	{ title: 'Overtime', icon: Gauge, href: '/fitur/cuti-lembur' },
	{ title: 'Pajak', icon: Receipt, href: '/fitur/pajak' },
	{ title: 'e-Bupot', icon: FileSignature, href: '/fitur/e-bupot' },
	{ title: 'Jurnal Umum', icon: TableProperties, href: '/fitur/jurnal-umum' },
	{ title: 'Laporan', icon: FileBarChart, href: '/fitur/laporan' },
	{ title: 'Neraca', icon: ChartNoAxesCombined, href: '/fitur/laporan' },
	{ title: 'Dashboard', icon: LayoutDashboard, href: '/fitur' },
	{ title: 'Multi-perusahaan', icon: Landmark, href: '/fitur/multi-perusahaan' },
	{ title: 'Kontak', icon: ContactRound, href: '/fitur/kontak-pengguna' },
	{ title: 'Produk', icon: Tags, href: '/fitur/persediaan' },
	{ title: 'Dokumen', icon: ClipboardList, href: '/fitur/dokumen' },
	{ title: 'Pengguna', icon: UserRound, href: '/fitur/kontak-pengguna' },
	{ title: 'Biaya', icon: Banknote, href: '/fitur/biaya' },
	{ title: 'Transfer Gudang', icon: Truck, href: '/fitur/gudang' },
	{ title: 'Planning', icon: FolderKanban, href: '/fitur' },
];

export function Features() {
	return (
		<section id="fitur" className="relative overflow-hidden bg-[#f0f2f5] px-4 py-14 md:px-8 md:py-20">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-transparent"
			/>

			<div className="relative mx-auto max-w-[920px]">
				<h2 className="sr-only">Modul Catet Pajak</h2>

				<div className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 sm:gap-x-5 sm:gap-y-8 md:grid-cols-6 md:gap-x-6 md:gap-y-10">
					{MODULES.map((module, index) => (
						<Link
							key={module.title}
							to={module.href}
							className="group flex min-w-0 flex-col items-center text-center"
						>
							<div className="flex aspect-square w-full max-w-[72px] items-center justify-center rounded-2xl bg-white shadow-[0_4px_20px_rgba(15,40,80,0.06),0_1px_3px_rgba(15,40,80,0.04)] transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_10px_28px_rgba(15,40,80,0.1)] md:max-w-[80px]">
								<module.icon
									className="size-[46%]"
									style={{ color: ICON_COLORS[index % ICON_COLORS.length] }}
									strokeWidth={1.5}
								/>
							</div>
							<span className="mt-2.5 max-w-[88px] text-[12px] font-medium leading-snug tracking-[-0.01em] text-[#3d4460] md:mt-3 md:max-w-[96px] md:text-[13px]">
								{module.title}
							</span>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}
