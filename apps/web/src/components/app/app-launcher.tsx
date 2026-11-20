import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useOutletContext } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import type { AppOutletContext } from '@/lib/app-context';
import { LogOut, Building2, ChevronDown, Check } from 'lucide-react';
import { AppStatusIcons } from '@/components/app/status-icons';
import type { AppPermission } from '@/data/user-roles';

export interface LauncherItem {
	to: string;
	labelKey: string;
	permission: AppPermission;
	end?: boolean;
	icon: LauncherIcon;
}

type LauncherIcon =
	| 'penjualan'
	| 'pembelian'
	| 'kas'
	| 'aset'
	| 'biaya'
	| 'kontak'
	| 'produk'
	| 'akun'
	| 'jurnal'
	| 'laporan'
	| 'payroll'
	| 'karyawan'
	| 'pajak'
	| 'pengaturan'
	| 'pos'
	| 'chat'
	| 'perusahaan'
	| 'dasbor';

const TILE_IMAGE: Record<LauncherIcon, string> = {
	dasbor: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/bf1a8eea-0dd1-4316-93e2-c16ebc4d8128.png',
	penjualan: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/75d2740a-758c-43a9-b757-b2742bfe5058.png',
	pembelian: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/d0ec93a1-45bf-4463-8692-5089e35c0867.png',
	kas: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/243c7350-e631-4309-a8fe-64bd618337e4.png',
	aset: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/64b7114c-1149-4ba6-9408-1310d0308f08.png',
	biaya: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/18564e7f-d5ac-4413-baae-6db1ae64b7c7.png',
	kontak: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/7a186566-25e6-4a92-809d-c22f269a0d6e.png',
	produk: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/9a5495a3-dc50-480f-865d-8c66d610a809.png',
	akun: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/41a19880-f3b3-4b90-88ad-a32722177401.png',
	jurnal: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/2c824f11-7c9e-4a6c-8673-4f25c53f143d.png',
	laporan: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/884f791c-452b-4d4a-9d52-e0b5456adcfd.png',
	payroll: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/4ee9b3d8-a6cf-41e1-bcb9-f9966da2ef95.png',
	karyawan: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/3b9d0b1d-439d-4fdd-ae6e-7804b6b827dd.png',
	pajak: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/7b370dd4-3fdf-44df-8c30-99c3f4342d9a.png',
	pos: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/d83c12b2-b5cc-4be4-8a1e-d88777531426.png',
	chat: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/c0a03121-51b3-4f41-bbfd-1dca6e931786.png',
	pengaturan: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/a5b2c4c8-33f3-4bbb-b69c-99516b01a492.png',
	perusahaan: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/6cd3e6a9-6fa4-4929-bbd4-c0916038e2fa.png',
};

export const LAUNCHER_ITEMS: LauncherItem[] = [
	{ to: '/app/dasbor', labelKey: 'nav.dashboard', permission: 'dasbor', icon: 'dasbor' },
	{ to: '/app/penjualan', labelKey: 'nav.penjualan', permission: 'penjualan', icon: 'penjualan' },
	{ to: '/app/pembelian', labelKey: 'nav.pembelian', permission: 'pembelian', icon: 'pembelian' },
	{ to: '/app/kas-bank', labelKey: 'nav.kas_bank', permission: 'kas_bank', icon: 'kas' },
	{ to: '/app/aset', labelKey: 'nav.aset', permission: 'aset', icon: 'aset' },
	{ to: '/app/biaya', labelKey: 'nav.biaya', permission: 'biaya', icon: 'biaya' },
	{ to: '/app/kontak', labelKey: 'nav.kontak', permission: 'kontak', icon: 'kontak' },
	{ to: '/app/produk', labelKey: 'nav.produk', permission: 'produk', icon: 'produk' },
	{ to: '/app/akun', labelKey: 'nav.akun', permission: 'akun', icon: 'akun' },
	{ to: '/app/jurnal', labelKey: 'nav.jurnal', permission: 'jurnal', icon: 'jurnal' },
	{ to: '/app/laporan', labelKey: 'nav.laporan', permission: 'laporan', icon: 'laporan' },
	{ to: '/app/payroll', labelKey: 'nav.payroll', permission: 'payroll', icon: 'payroll' },
	{ to: '/app/karyawan', labelKey: 'nav.karyawan', permission: 'karyawan', icon: 'karyawan' },
	{ to: '/app/pajak', labelKey: 'nav.pajak', permission: 'pajak', icon: 'pajak' },
	{ to: '/app/pos', labelKey: 'nav.pos', permission: 'penjualan', icon: 'pos' },
	{ to: '/app/chat', labelKey: 'nav.chat', permission: 'chat', icon: 'chat' },
	{ to: '/app/pengaturan', labelKey: 'nav.pengaturan', permission: 'pengaturan', icon: 'pengaturan' },
	{ to: '/app/perusahaan', labelKey: 'launcher.company', permission: 'perusahaan', icon: 'perusahaan' },
];

function LogoutIcon() {
	return <LogOut className="size-4 text-emerald-600" strokeWidth={3} aria-hidden="true" />;
}

function LauncherFooter() {
	const { logout } = useAuth();
	const { t } = useLanguage();
	const navigate = useNavigate();
	const { companies, activeCompany, setActiveCompanyId, canAccessMenu, isKaryawan } =
		useOutletContext<AppOutletContext>();

	const [companyOpen, setCompanyOpen] = useState(false);
	const companyMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!companyOpen) return;
		const onPointer = (event: MouseEvent) => {
			if (!companyMenuRef.current?.contains(event.target as Node)) {
				setCompanyOpen(false);
			}
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setCompanyOpen(false);
		};
		document.addEventListener('mousedown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [companyOpen]);

	const canSwitchCompany = !isKaryawan && companies.length > 0;

	return (
		<div className="absolute right-5 top-5 z-20 flex flex-col items-end gap-3 sm:right-8 sm:top-6">
			<div className="flex items-center gap-1.5 sm:gap-2.5">
				<AppStatusIcons
					companyId={activeCompany?.id ?? null}
					showDepreciation={!isKaryawan && canAccessMenu('aset')}
					placement="down"
					badgeClassName="bg-emerald-500"
				/>
				{canSwitchCompany ? (
					<div ref={companyMenuRef} className="relative">
						<button
							type="button"
							onClick={() => setCompanyOpen(open => !open)}
							aria-haspopup="listbox"
							aria-expanded={companyOpen}
							title={activeCompany?.name ?? t('launcher.select_company')}
							className="inline-flex h-11 max-w-[12rem] items-center gap-2 rounded-full border border-[#e4ebe7] bg-white/90 px-4 text-[15px] font-semibold text-[#1f4d3a] shadow-[0_6px_18px_rgba(40,70,55,0.06)] transition-colors hover:bg-white active:scale-[0.98] sm:max-w-[16rem]"
						>
							<Building2 className="size-5 shrink-0 text-emerald-600" strokeWidth={1.7} />
							<span className="truncate">{activeCompany?.name ?? t('launcher.select_company')}</span>
							<ChevronDown className="size-4 shrink-0 text-[#5f6b7a]" strokeWidth={2} />
						</button>
						{companyOpen ? (
							<ul
								role="listbox"
								aria-label={t('launcher.select_company')}
								className="absolute right-0 z-50 mt-1 max-h-72 w-64 overflow-auto rounded-2xl border border-[#e4ebe7] bg-white p-1.5 shadow-[0_18px_40px_rgba(40,70,55,0.12)]"
							>
								{companies.map(company => {
									const isActive = company.id === activeCompany?.id;
									return (
										<li key={company.id}>
											<button
												type="button"
												role="option"
												aria-selected={isActive}
												onClick={() => {
													setActiveCompanyId(company.id);
													setCompanyOpen(false);
												}}
												className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-[#f0f7f3] ${
													isActive ? 'text-emerald-700' : 'text-[#1f2937]'
												}`}
											>
												<Building2
													className={`size-4 shrink-0 ${isActive ? 'text-emerald-600' : 'text-[#9aa8b5]'}`}
													strokeWidth={1.8}
												/>
												<span className="truncate">{company.name}</span>
												{isActive ? <Check className="ml-auto size-4 shrink-0 text-emerald-600" strokeWidth={2.2} /> : null}
											</button>
										</li>
									);
								})}
							</ul>
						) : null}
					</div>
				) : null}
				<button
					type="button"
					onClick={() => {
						logout();
						navigate('/login');
					}}
					aria-label={t('header.signout')}
					title={t('header.signout')}
					className="inline-flex size-11 items-center justify-center rounded-full bg-transparent transition-transform hover:scale-[1.04] active:scale-[0.98]"
				>
					<LogoutIcon />
				</button>
			</div>
		</div>
	);
}

const backdropCache = new Map<string, string>();

function isEdgeWhite(r: number, g: number, b: number) {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	return max >= 244 && max - min <= 16;
}

function removeWhiteBackdrop(src: string): Promise<string> {
	const cached = backdropCache.get(src);
	if (cached) return Promise.resolve(cached);
	return new Promise(resolve => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			const width = img.naturalWidth;
			const height = img.naturalHeight;
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx || width === 0 || height === 0) {
				resolve(src);
				return;
			}
			ctx.drawImage(img, 0, 0);
			const image = ctx.getImageData(0, 0, width, height);
			const data = image.data;
			const background = new Uint8Array(width * height);
			const stack: number[] = [];
			const visit = (x: number, y: number) => {
				const index = y * width + x;
				if (background[index]) return;
				const offset = index * 4;
				if (!isEdgeWhite(data[offset], data[offset + 1], data[offset + 2])) return;
				background[index] = 1;
				stack.push(index);
			};
			for (let x = 0; x < width; x += 1) {
				visit(x, 0);
				visit(x, height - 1);
			}
			for (let y = 0; y < height; y += 1) {
				visit(0, y);
				visit(width - 1, y);
			}
			while (stack.length > 0) {
				const index = stack.pop() as number;
				const x = index % width;
				const y = (index / width) | 0;
				if (x > 0) visit(x - 1, y);
				if (x < width - 1) visit(x + 1, y);
				if (y > 0) visit(x, y - 1);
				if (y < height - 1) visit(x, y + 1);
			}
			for (let index = 0; index < background.length; index += 1) {
				if (!background[index]) continue;
				const offset = index * 4;
				const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
				data[offset + 3] = max >= 250 ? 0 : Math.round(((250 - max) / 6) * 255);
			}
			ctx.putImageData(image, 0, 0);
			const url = canvas.toDataURL('image/png');
			backdropCache.set(src, url);
			resolve(url);
		};
		img.onerror = () => resolve(src);
		img.src = src;
	});
}

function TileIcon({ name }: { name: LauncherIcon }) {
	const src = TILE_IMAGE[name];
	const [cut, setCut] = useState<string | null>(() => backdropCache.get(src) ?? null);

	useEffect(() => {
		let cancelled = false;
		void removeWhiteBackdrop(src).then(url => {
			if (!cancelled) setCut(url);
		});
		return () => {
			cancelled = true;
		};
	}, [src]);

	return (
		<img
			src={cut ?? src}
			alt=""
			aria-hidden="true"
			draggable={false}
			className={`size-[4.4rem] object-contain drop-shadow-[0_10px_16px_rgba(180,110,80,0.18)] transition-opacity sm:size-[4.75rem] ${cut ? 'opacity-100' : 'opacity-0'}`}
		/>
	);
}

export function AppLauncher({ items }: { items: LauncherItem[] }) {
	const { t } = useLanguage();
	return (
		<div className="relative -mx-4 -my-6 flex min-h-dvh flex-col overflow-x-clip bg-white px-4 sm:-mx-5 sm:px-6 md:-mx-10 md:-my-10 md:px-8">
			<header className="relative z-10 flex items-center px-1 pt-5 sm:px-2 sm:pt-6">
				<NavLink to="/" className="inline-flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
					<img src="/catet-logo.png" alt="Logo Catet Pajak" className="brand-logo size-9 object-contain" />
					<span className="text-[1.15rem] font-bold tracking-tight text-[#111827]">
						Catet <span className="text-emerald-500">Pajak</span>
					</span>
				</NavLink>
			</header>
			<div className="relative z-10 flex flex-1 items-center justify-center px-1 py-10 pb-28">
				<ul className="grid w-full max-w-5xl grid-cols-2 justify-items-center gap-x-5 gap-y-9 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-11 md:grid-cols-4 lg:grid-cols-6 lg:gap-x-8 lg:gap-y-12">
					{items.map(item => (
						<li key={item.to} className="flex justify-center">
							<NavLink
								to={item.to}
								end={item.end}
								className="group flex w-[6.5rem] flex-col items-center gap-2.5 rounded-2xl text-center outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:w-[7.25rem]"
							>
								<span className="flex size-[4.4rem] items-center justify-center transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-[0.98] sm:size-[4.75rem]">
									<TileIcon name={item.icon} />
								</span>
								<span className="max-w-[7rem] text-[12.5px] font-medium leading-snug text-[#5f6b7a] group-hover:text-[#1f2937]">
									{t(item.labelKey)}
								</span>
							</NavLink>
						</li>
					))}
				</ul>
			</div>
			<LauncherFooter />
		</div>
	);
}
