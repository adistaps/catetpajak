import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
	Banknote,
	Boxes,
	Briefcase,
	CalendarDays,
	ClipboardList,
	ContactRound,
	FileBarChart,
	FileSignature,
	Gauge,
	GraduationCap,
	HeartHandshake,
	Landmark,
	Menu,
	Package,
	Receipt,
	Scale,
	ShoppingCart,
	TableProperties,
	TrendingUp,
	Truck,
	Users,
	Warehouse,
	X,
	type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
	{ label: 'Harga', href: '#harga' },
	{ label: 'Event', href: '/event' },
	{ label: 'Akuntan', href: '/akuntan' },
];

type FeatureItem = {
	title: string;
	description: string;
	icon: LucideIcon;
	href: string;
};

type FeatureGroup = {
	label: string;
	items: FeatureItem[];
};

const SOLUTIONS: FeatureItem[] = [
	{
		title: 'Dagang',
		description: 'Persediaan, multi-gudang, dan PPN',
		icon: TrendingUp,
		href: '/solusi/dagang',
	},
	{
		title: 'Jasa',
		description: 'Invoice jasa dan manajemen proyek',
		icon: Briefcase,
		href: '/solusi/jasa',
	},
	{
		title: 'Sekolah',
		description: 'Penggajian guru dan iuran siswa',
		icon: GraduationCap,
		href: '/solusi/sekolah',
	},
	{
		title: 'Yayasan',
		description: 'Laporan keuangan dan dana terbatas',
		icon: HeartHandshake,
		href: '/solusi/yayasan',
	},
];

const GROUPS: FeatureGroup[] = [
	{
		label: 'Dokumen Bisnis',
		items: [
			{
				title: 'Penjualan',
				description: 'Invoice digital sah, dibayar mudah',
				icon: ShoppingCart,
				href: '/fitur/penjualan',
			},
			{
				title: 'Pembelian',
				description: 'Kirim PO resmi gratis & mudah',
				icon: Truck,
				href: '/fitur/pembelian',
			},
			{
				title: 'Dokumen',
				description: 'Buat kuitansi langsung dari invoice',
				icon: ClipboardList,
				href: '/fitur/dokumen',
			},
		],
	},
	{
		label: 'Kas & Persediaan',
		items: [
			{
				title: 'Kas & Bank',
				description: 'Catat kas, bank, dan rekonsiliasi',
				icon: Landmark,
				href: '/fitur/kas-bank',
			},
			{
				title: 'Persediaan',
				description: 'Kelola stok produk multi-gudang',
				icon: Boxes,
				href: '/fitur/persediaan',
			},
			{
				title: 'Gudang',
				description: 'Opname dan transfer antar gudang',
				icon: Warehouse,
				href: '/fitur/gudang',
			},
		],
	},
	{
		label: 'SDM & Penggajian',
		items: [
			{
				title: 'Penggajian',
				description: 'Slip gaji, PPh 21, dan cut-off',
				icon: Users,
				href: '/fitur/penggajian',
			},
			{
				title: 'Absensi',
				description: 'Live attendance dan data kehadiran',
				icon: CalendarDays,
				href: '/fitur/absensi',
			},
			{
				title: 'Cuti & Lembur',
				description: 'Pengajuan cuti dan overtime',
				icon: Gauge,
				href: '/fitur/cuti-lembur',
			},
		],
	},
	{
		label: 'Pajak & Laporan',
		items: [
			{
				title: 'Pajak',
				description: 'PPN, PPh, dan pengaturan pajak',
				icon: Receipt,
				href: '/fitur/pajak',
			},
			{
				title: 'e-Bupot',
				description: 'Bukti potong dalam satu alur',
				icon: FileSignature,
				href: '/fitur/e-bupot',
			},
			{
				title: 'Laporan',
				description: 'Neraca, laba rugi, dan arus kas',
				icon: FileBarChart,
				href: '/fitur/laporan',
			},
			{
				title: 'Jurnal Umum',
				description: 'Pencatatan jurnal otomatis',
				icon: TableProperties,
				href: '/fitur/jurnal-umum',
			},
			{
				title: 'Aset Tetap',
				description: 'Penyusutan dan siklus hidup aset',
				icon: Package,
				href: '/fitur/aset-tetap',
			},
			{
				title: 'Biaya',
				description: 'Catat beban operasional harian',
				icon: Banknote,
				href: '/fitur/biaya',
			},
		],
	},
];

const MORE: FeatureItem[] = [
	{
		title: 'Akuntansi',
		description: 'Buku besar dan laporan keuangan',
		icon: Scale,
		href: '/fitur/akuntansi',
	},
	{
		title: 'Multi-perusahaan',
		description: 'Kelola banyak perusahaan sekaligus',
		icon: Landmark,
		href: '/fitur/multi-perusahaan',
	},
	{
		title: 'Kontak & Pengguna',
		description: 'Pelanggan, supplier, dan akses tim',
		icon: ContactRound,
		href: '/fitur/kontak-pengguna',
	},
];

function FeatureLink({ item, onNavigate }: { item: FeatureItem; onNavigate: () => void }) {
	return (
		<Link
			to={item.href}
			onClick={onNavigate}
			className="group flex min-w-0 items-start gap-3 rounded-xl px-1.5 py-2 transition-colors hover:bg-emerald-50/70"
		>
			<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#f3f6f8] text-primary transition-colors group-hover:bg-white">
				<item.icon className="size-[18px]" strokeWidth={1.75} />
			</span>
			<span className="min-w-0 pt-0.5">
				<span className="block text-[14px] font-semibold leading-tight text-[#1e2a4a] group-hover:text-primary">
					{item.title}
				</span>
				<span className="mt-0.5 block text-[13px] leading-snug text-[#6b7289]">{item.description}</span>
			</span>
		</Link>
	);
}

export function SiteHeader({ variant = 'light' }: { variant?: 'light' | 'immersive' }) {
	const [open, setOpen] = useState(false);
	const [featuresOpen, setFeaturesOpen] = useState(false);
	const [solutionsOpen, setSolutionsOpen] = useState(false);
	const [mobileFeatures, setMobileFeatures] = useState(false);
	const [mobileSolutions, setMobileSolutions] = useState(false);
	const [scrolled, setScrolled] = useState(false);
	const immersive = variant === 'immersive' && !scrolled;
	const closeTimer = useRef<number | null>(null);
	const solutionsTimer = useRef<number | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	function clearCloseTimer() {
		if (closeTimer.current !== null) {
			window.clearTimeout(closeTimer.current);
			closeTimer.current = null;
		}
	}

	function openFeatures() {
		clearCloseTimer();
		setFeaturesOpen(true);
		setSolutionsOpen(false);
	}

	function scheduleClose() {
		clearCloseTimer();
		closeTimer.current = window.setTimeout(() => setFeaturesOpen(false), 140);
	}

	function clearSolutionsTimer() {
		if (solutionsTimer.current !== null) {
			window.clearTimeout(solutionsTimer.current);
			solutionsTimer.current = null;
		}
	}

	function openSolutions() {
		clearSolutionsTimer();
		setSolutionsOpen(true);
		setFeaturesOpen(false);
	}

	function scheduleSolutionsClose() {
		clearSolutionsTimer();
		solutionsTimer.current = window.setTimeout(() => setSolutionsOpen(false), 140);
	}

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				setFeaturesOpen(false);
				setSolutionsOpen(false);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			clearCloseTimer();
			clearSolutionsTimer();
		};
	}, []);

	useEffect(() => {
		if (variant !== 'immersive') return;
		function onScroll() {
			setScrolled(window.scrollY > 24);
		}
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	}, [variant]);

	return (
		<header
			className={cn(
				'sticky top-0 z-40 border-b transition-colors',
				immersive
					? 'border-transparent bg-transparent'
					: 'border-border/70 bg-white/95 backdrop-blur-md',
			)}
		>
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
				<Link to="/" className="flex shrink-0 items-center gap-2.5">
					<img
						src="/catet-logo.png"
						alt="Logo Catet Pajak"
						className={cn('size-8 object-contain', immersive ? 'brand-logo-on-dark' : 'brand-logo')}
					/>
					<span
						className={cn(
							'text-lg font-bold tracking-tight',
							immersive ? 'text-white' : 'text-foreground',
						)}
					>
						Catet <span className={immersive ? 'text-emerald-300' : 'text-emerald-500'}>Pajak</span>
					</span>
				</Link>

				<nav className="hidden items-center gap-7 md:flex">
					<div
						className="relative"
						onMouseEnter={openFeatures}
						onMouseLeave={scheduleClose}
					>
						<button
							type="button"
							className={cn(
								'inline-flex items-center gap-1 text-sm font-medium transition-colors',
								featuresOpen
									? 'text-emerald-300'
									: immersive
										? 'text-emerald-50/80 hover:text-white'
										: 'text-muted-foreground hover:text-foreground',
							)}
							aria-expanded={featuresOpen}
							aria-controls="fitur-panel"
							onClick={() => setFeaturesOpen(value => !value)}
						>
							Fitur
							{featuresOpen ? <X className="size-3.5" strokeWidth={2.25} /> : null}
						</button>
					</div>
					<div
						className="relative"
						onMouseEnter={openSolutions}
						onMouseLeave={scheduleSolutionsClose}
					>
						<button
							type="button"
							className={cn(
								'inline-flex items-center gap-1 text-sm font-medium transition-colors',
								solutionsOpen
									? 'text-emerald-300'
									: immersive
										? 'text-emerald-50/80 hover:text-white'
										: 'text-muted-foreground hover:text-foreground',
							)}
							aria-expanded={solutionsOpen}
							aria-controls="solusi-panel"
							onClick={() => setSolutionsOpen(value => !value)}
						>
							Solusi Industri
							{solutionsOpen ? <X className="size-3.5" strokeWidth={2.25} /> : null}
						</button>
					</div>
					{NAV.map(item => {
						const navClass = cn(
							'text-sm font-medium transition-colors',
							immersive
								? 'text-emerald-50/80 hover:text-white'
								: 'text-muted-foreground hover:text-foreground',
						);
						return item.href.startsWith('/') ? (
							<Link
								key={item.href}
								to={item.href}
								className={navClass}
								onClick={() => {
									setFeaturesOpen(false);
									setSolutionsOpen(false);
								}}
							>
								{item.label}
							</Link>
						) : (
							<a
								key={item.href}
								href={item.href}
								className={navClass}
								onClick={() => {
									setFeaturesOpen(false);
									setSolutionsOpen(false);
								}}
							>
								{item.label}
							</a>
						);
					})}
				</nav>

				<div className="hidden items-center gap-2.5 md:flex">
					<Link
						to="/login"
						className={cn(
							'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
							immersive
								? 'bg-white/10 text-white hover:bg-white/20'
								: 'text-foreground hover:text-primary',
						)}
					>
						Masuk
					</Link>
					<a
						href="https://wa.me/6285110565506"
						target="_blank"
						rel="noopener noreferrer"
						className={cn(
							'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
							immersive
								? 'border-white/30 text-white hover:bg-white/10'
								: 'border-primary/30 bg-white text-primary hover:bg-accent',
						)}
					>
						Hubungi Sales
					</a>
					<Link
						to="/login"
						className={cn(
							'inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5',
							immersive
								? 'bg-emerald-300 text-emerald-950'
								: 'bg-primary text-primary-foreground shadow-soft-sm',
						)}
					>
						Mulai Gratis
						<span aria-hidden>→</span>
					</Link>
				</div>

				<button
					type="button"
					className={cn(
						'inline-flex size-10 items-center justify-center rounded-lg border md:hidden',
						immersive ? 'border-white/20 text-white' : 'border-border',
					)}
					aria-label={open ? 'Tutup menu' : 'Buka menu'}
					onClick={() => setOpen(value => !value)}
				>
					{open ? <X className="size-5" /> : <Menu className="size-5" />}
				</button>
			</div>

			{featuresOpen ? (
				<div
					className="absolute inset-x-0 top-full hidden px-4 pb-4 pt-2 md:block"
					onMouseEnter={openFeatures}
					onMouseLeave={scheduleClose}
				>
					<div
						id="fitur-panel"
						ref={panelRef}
						className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white shadow-[0_18px_50px_rgba(20,40,80,0.12)]"
					>
						<div className="px-6 pb-2 pt-5">
							{GROUPS.map((group, index) => (
								<div
									key={group.label}
									className={cn(
										index > 0 && 'mt-4 border-t border-dashed border-[#d7e0ea] pt-4',
									)}
								>
									<p className="mb-2 px-1.5 text-[13px] font-medium text-primary">{group.label}</p>
									<div className="grid grid-cols-3 gap-x-6 gap-y-1">
										{group.items.map(item => (
											<FeatureLink
												key={item.title}
												item={item}
												onNavigate={() => setFeaturesOpen(false)}
											/>
										))}
									</div>
								</div>
							))}
						</div>

						<div className="mx-3 mb-3 rounded-xl bg-[#f4f7fa] px-5 py-4">
							<p className="mb-2 text-[13px] font-medium text-primary">Lainnya</p>
							<div className="grid grid-cols-3 gap-x-6">
								{MORE.map(item => (
									<Link
										key={item.title}
										to={item.href}
										onClick={() => setFeaturesOpen(false)}
										className="group min-w-0 rounded-lg px-1 py-1"
									>
										<span className="flex items-center gap-2 text-[14px] font-bold text-[#1e2a4a] group-hover:text-primary">
											<item.icon className="size-4 text-primary" strokeWidth={1.75} />
											{item.title}
										</span>
										<span className="mt-0.5 block pl-6 text-[13px] text-[#6b7289]">
											{item.description}
										</span>
									</Link>
								))}
							</div>
						</div>

						<div className="border-t border-[#e6ebf2] px-6 py-3">
							<Link
								to="/fitur"
								onClick={() => setFeaturesOpen(false)}
								className="text-[13px] font-semibold text-primary transition-colors hover:text-accent-foreground"
							>
								Lihat semua fitur →
							</Link>
						</div>
					</div>
				</div>
			) : null}

			{solutionsOpen ? (
				<div
					className="absolute inset-x-0 top-full hidden px-4 pb-4 pt-2 md:block"
					onMouseEnter={openSolutions}
					onMouseLeave={scheduleSolutionsClose}
				>
					<div
						id="solusi-panel"
						className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[#e6ebf2] bg-white px-6 py-5 shadow-[0_18px_50px_rgba(20,40,80,0.12)]"
					>
						<p className="mb-3 px-1.5 text-[13px] font-medium text-primary">Solusi Industri</p>
						<div className="grid grid-cols-2 gap-x-6 gap-y-1">
							{SOLUTIONS.map(item => (
								<FeatureLink
									key={item.title}
									item={item}
									onNavigate={() => setSolutionsOpen(false)}
								/>
							))}
						</div>
					</div>
				</div>
			) : null}

			<div
				className={cn(
					'max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-white px-5 py-4 md:hidden',
					open ? 'block' : 'hidden',
				)}
			>
				<nav className="flex flex-col gap-1">
					<button
						type="button"
						className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-primary"
						aria-expanded={mobileFeatures}
						onClick={() => setMobileFeatures(value => !value)}
					>
						Fitur
						{mobileFeatures ? <X className="size-4" /> : <Menu className="size-4" />}
					</button>
					{mobileFeatures ? (
						<div className="mb-2 rounded-xl border border-[#e6ebf2] bg-white p-3">
							{GROUPS.map(group => (
								<div key={group.label} className="mb-3 border-b border-dashed border-[#d7e0ea] pb-3 last:mb-0 last:border-0 last:pb-0">
									<p className="mb-1.5 text-xs font-medium text-primary">{group.label}</p>
									<div className="flex flex-col">
										{group.items.map(item => (
											<FeatureLink
												key={item.title}
												item={item}
												onNavigate={() => setOpen(false)}
											/>
										))}
									</div>
								</div>
							))}
							<div className="rounded-lg bg-[#f4f7fa] p-3">
								<p className="mb-1 text-xs font-medium text-primary">Lainnya</p>
								{MORE.map(item => (
									<Link
										key={item.title}
										to={item.href}
										onClick={() => setOpen(false)}
										className="block py-1.5"
									>
										<span className="block text-sm font-bold text-[#1e2a4a]">{item.title}</span>
										<span className="block text-xs text-[#6b7289]">{item.description}</span>
									</Link>
								))}
							</div>
						</div>
					) : null}
					<button
						type="button"
						className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-primary"
						aria-expanded={mobileSolutions}
						onClick={() => setMobileSolutions(value => !value)}
					>
						Solusi Industri
						{mobileSolutions ? <X className="size-4" /> : <Menu className="size-4" />}
					</button>
					{mobileSolutions ? (
						<div className="mb-2 rounded-xl border border-[#e6ebf2] bg-white p-3">
							<div className="flex flex-col">
								{SOLUTIONS.map(item => (
									<FeatureLink
										key={item.title}
										item={item}
										onNavigate={() => setOpen(false)}
									/>
								))}
							</div>
						</div>
					) : null}
					<Link
						to="/fitur"
						onClick={() => setOpen(false)}
						className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
					>
						Semua fitur
					</Link>
					{NAV.map(item =>
						item.href.startsWith('/') ? (
							<Link
								key={item.href}
								to={item.href}
								onClick={() => setOpen(false)}
								className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
							>
								{item.label}
							</Link>
						) : (
							<a
								key={item.href}
								href={item.href}
								onClick={() => setOpen(false)}
								className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
							>
								{item.label}
							</a>
						),
					)}
				</nav>
				<div className="mt-3 flex flex-col gap-2">
					<Link
						to="/login"
						className="rounded-full border border-border px-4 py-2.5 text-center text-sm font-semibold"
						onClick={() => setOpen(false)}
					>
						Masuk
					</Link>
					<a
						href="https://wa.me/6285110565506"
						target="_blank"
						rel="noopener noreferrer"
						className="rounded-full border border-primary/30 px-4 py-2.5 text-center text-sm font-semibold text-primary"
						onClick={() => setOpen(false)}
					>
						Hubungi Sales
					</a>
					<Link
						to="/login"
						className="rounded-full bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground"
						onClick={() => setOpen(false)}
					>
						Mulai Gratis
					</Link>
				</div>
			</div>
		</header>
	);
}
