import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import {
	BookOpen,
	Boxes,
	Building2,
	FileBarChart,
	Landmark,
	LayoutDashboard,
	ClipboardList,
	LogOut,
	GraduationCap,
	MessageCircle,
	Target,
	Package,
	CircleDollarSign,
	Percent,
	Receipt,
	Settings,
	ShoppingCart,
	Store,
	Truck,
	Users,
	Wallet,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import type { Company } from '@/lib/accounting';
import type { TrialStatus } from '@/lib/subscription-access';
import type { EcommerceSubscription } from '@/api/ecommerce-subscriptions-api';
import type { ManualPayment } from '@/lib/manual-payments';
import type { AppPermission } from '@/data/user-roles';
import { cn } from '@/lib/utils';

const NAV_ITEMS: {
	to: string;
	labelKey: string;
	icon: typeof LayoutDashboard;
	end: boolean;
	permission: AppPermission;
	karyawanOnly?: boolean;
	/** Warna ikon saat sidebar dikecilkan (non-aktif). */
	collapsedColor: string;
}[] = [
	{ to: '/app', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true, permission: 'dasbor', collapsedColor: 'text-yellow-500' },
	{ to: '/app/penjualan', labelKey: 'nav.penjualan', icon: ShoppingCart, end: false, permission: 'penjualan', collapsedColor: 'text-blue-500' },
	{ to: '/app/pembelian', labelKey: 'nav.pembelian', icon: Truck, end: false, permission: 'pembelian', collapsedColor: 'text-purple-500' },
	{ to: '/app/kas-bank', labelKey: 'nav.kas_bank', icon: Landmark, end: false, permission: 'kas_bank', collapsedColor: 'text-orange-500' },
	{ to: '/app/aset', labelKey: 'nav.aset', icon: Boxes, end: false, permission: 'aset', collapsedColor: 'text-yellow-500' },
	{ to: '/app/biaya', labelKey: 'nav.biaya', icon: Receipt, end: false, permission: 'biaya', collapsedColor: 'text-red-500' },
	{ to: '/app/kontak', labelKey: 'nav.kontak', icon: Users, end: false, permission: 'kontak', collapsedColor: 'text-blue-700' },
	{ to: '/app/produk', labelKey: 'nav.produk', icon: Package, end: false, permission: 'produk', collapsedColor: 'text-sky-400' },
	{ to: '/app/akun', labelKey: 'nav.akun', icon: BookOpen, end: false, permission: 'akun', collapsedColor: 'text-teal-500' },
	{ to: '/app/jurnal', labelKey: 'nav.jurnal', icon: Wallet, end: false, permission: 'jurnal', collapsedColor: 'text-cyan-500' },
	{ to: '/app/laporan', labelKey: 'nav.laporan', icon: FileBarChart, end: false, permission: 'laporan', collapsedColor: 'text-indigo-500' },
	{ to: '/app/payroll', labelKey: 'nav.payroll', icon: CircleDollarSign, end: false, permission: 'payroll', collapsedColor: 'text-pink-500' },
	{ to: '/app/karyawan', labelKey: 'nav.karyawan', icon: Users, end: false, permission: 'karyawan', karyawanOnly: true, collapsedColor: 'text-rose-500' },
	{ to: '/app/pajak', labelKey: 'nav.pajak', icon: Percent, end: false, permission: 'pajak', collapsedColor: 'text-amber-500' },
	{ to: '/app/pengaturan', labelKey: 'nav.pengaturan', icon: Settings, end: false, permission: 'pengaturan', collapsedColor: 'text-slate-500' },
	{ to: '/app/pos', labelKey: 'nav.pos', icon: Store, end: false, permission: 'penjualan', collapsedColor: 'text-sky-500' },
	{ to: '/app/chat', labelKey: 'nav.chat', icon: MessageCircle, end: false, permission: 'chat', collapsedColor: 'text-fuchsia-500' },
];

interface AppSidebarProps {
	companies: Company[];
	activeCompany: Company | null;
	onSelectCompany: (id: string) => void;
	trial: TrialStatus | null;
	activeSubscription: EcommerceSubscription | null;
	activeManualPayment?: ManualPayment | null;
	pendingManualPayment?: ManualPayment | null;
	isKaryawan: boolean;
	/** True bila pengguna adalah admin pusat Catet Pajak. */
	isCentralAdmin?: boolean;
	/** True bila pengguna hanya boleh mengakses POS (role kasir). */
	isKasir: boolean;
	canAccessMenu: (permission: AppPermission) => boolean;
}

export function AppSidebar({
	companies,
	activeCompany,
	onSelectCompany,
	isKaryawan,
	isKasir,
	canAccessMenu,
}: AppSidebarProps) {
	const { user, logout } = useAuth();
	const { t } = useLanguage();
	const navigate = useNavigate();
	const location = useLocation();
	const collapsed = true;
	const [companyOpen, setCompanyOpen] = useState(false);
	const companyMenuRef = useRef<HTMLDivElement>(null);
	const [managementOpen, setManagementOpen] = useState(false);
	const managementMenuRef = useRef<HTMLDivElement>(null);

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

	useEffect(() => {
		if (!managementOpen) return;
		const onPointer = (event: MouseEvent) => {
			if (!managementMenuRef.current?.contains(event.target as Node)) {
				setManagementOpen(false);
			}
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setManagementOpen(false);
		};
		document.addEventListener('mousedown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [managementOpen]);

	const visibleItems = isKaryawan
		? NAV_ITEMS.filter(i => i.karyawanOnly)
		: isKasir
			? NAV_ITEMS.filter(i => i.to === '/app/pos')
			: NAV_ITEMS.filter(i => !i.karyawanOnly && canAccessMenu(i.permission));

	const handleLogout = () => {
		logout();
		navigate('/login');
	};

	return (
		<aside
			className={cn(
				'flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar-background text-sidebar-foreground md:h-full md:border-b-0 md:border-r',
				collapsed ? 'md:w-[4.75rem]' : 'md:w-56',
			)}
		>
			<div
				className={cn(
					'flex items-center gap-2 px-3 py-3 md:pt-4',
					collapsed ? 'justify-between md:flex-col md:px-2' : 'justify-between md:px-4',
				)}
			>
				<NavLink
					to="/"
					title="Catet Pajak"
					className={cn('flex min-w-0 items-center gap-2 px-1', collapsed && 'justify-center px-0')}
				>
					<img
						src="/catet-logo.png"
						alt="Logo Catet Pajak"
						className="brand-logo size-8 shrink-0 object-contain"
					/>
					<span className={cn('truncate text-base font-bold tracking-tight', collapsed && 'sr-only')}>
						Catet <span className="text-emerald-500">Pajak</span>
					</span>
				</NavLink>
			</div>

			{!isKaryawan && !isKasir ? (
				<div className={cn('px-5 pb-4', collapsed && 'px-3 md:px-2')}>
					{collapsed ? (
						<div ref={companyMenuRef} className="relative">
							<p className="sr-only">{t('sidebar.active_company')}</p>
							<button
								type="button"
								onClick={() => setCompanyOpen(open => !open)}
								aria-haspopup="listbox"
								aria-expanded={companyOpen}
								aria-label={`${t('sidebar.active_company')}: ${activeCompany?.name ?? t('sidebar.no_companies')}`}
								title={activeCompany?.name ?? t('sidebar.no_companies')}
								className="flex size-11 w-full items-center justify-center rounded-xl border border-border bg-background text-foreground outline-none ring-primary/20 hover:bg-secondary focus:ring-2"
							>
								<Building2 className="size-4 shrink-0 text-emerald-600" strokeWidth={2} />
							</button>
							{companyOpen ? (
								<ul
									role="listbox"
									aria-label={t('sidebar.active_company')}
									className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-popover p-1 shadow-soft md:left-full md:right-auto md:top-0 md:mt-0 md:w-56 md:translate-x-2"
								>
									{companies.length === 0 ? (
										<li className="px-3 py-2 text-sm text-muted-foreground">{t('sidebar.no_companies')}</li>
									) : (
										companies.map(company => (
											<li key={company.id}>
												<button
													type="button"
													role="option"
													aria-selected={company.id === activeCompany?.id}
													onClick={() => {
														onSelectCompany(company.id);
														setCompanyOpen(false);
													}}
													className={cn(
														'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-secondary',
														company.id === activeCompany?.id
															? 'bg-accent text-accent-foreground'
															: 'text-foreground',
													)}
												>
													{company.name}
												</button>
											</li>
										))
									)}
								</ul>
							) : null}
						</div>
					) : (
						<>
							<label
								htmlFor="company-switcher"
								className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
							>
								{t('sidebar.active_company')}
							</label>
							<select
								id="company-switcher"
								value={activeCompany?.id ?? ''}
								onChange={event => onSelectCompany(event.target.value)}
								className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
							>
								{companies.length === 0 ? <option value="">{t('sidebar.no_companies')}</option> : null}
								{companies.map(company => (
									<option key={company.id} value={company.id}>
										{company.name}
									</option>
								))}
							</select>
						</>
					)}
				</div>
			) : isKaryawan ? (
				<div className={cn('px-5 pb-4', collapsed && 'md:px-2')}>
					<p className={cn('text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', collapsed && 'sr-only')}>
						{t('sidebar.company')}
					</p>
					<p
						className={cn('mt-1.5 truncate text-sm font-semibold text-foreground', collapsed && 'sr-only')}
						title={activeCompany?.name ?? undefined}
					>
						{activeCompany?.name ?? '—'}
					</p>
					{collapsed ? (
						<p className="mt-1 flex justify-center" title={activeCompany?.name ?? t('sidebar.company')}>
							<Building2 className="size-4 text-emerald-600" strokeWidth={2} />
						</p>
					) : null}
				</div>
			) : null}

			<nav
				className={cn(
					'flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
					collapsed ? 'md:items-center md:px-2' : 'md:px-3',
				)}
			>
				{visibleItems.map(item => {
					const label = t(item.labelKey);
					return (
					<NavLink
						key={item.to}
						to={item.to}
						end={item.end}
						aria-label={label}
						className={({ isActive }) =>
							cn(
								'group/nav relative flex items-center gap-2.5 whitespace-nowrap rounded-xl py-2.5 text-sm font-semibold transition-colors',
								collapsed ? 'size-11 justify-center px-0' : 'px-3',
								isActive
									? 'bg-emerald-50 ring-2 ring-emerald-400'
									: 'hover:bg-secondary',
							)
						}
					>
						{({ isActive }) => (
							<>
								<item.icon
									className={cn(
										'size-4 shrink-0',
										collapsed && !isActive ? item.collapsedColor : undefined,
									)}
									strokeWidth={2}
								/>
								<span className={collapsed ? 'sr-only' : undefined}>{label}</span>
								{collapsed ? (
									<span
										role="tooltip"
										className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-purple-700 px-2.5 py-1.5 text-xs font-semibold text-background shadow-soft-sm [@media(hover:hover)]:group-hover/nav:block [@media(hover:hover)]:group-focus-visible/nav:block"
									>
										{label}
									</span>
								) : null}
							</>
						)}
					</NavLink>
					);
				})}
			</nav>

			{!isKaryawan && !isKasir && canAccessMenu('management') ? (
				<div ref={managementMenuRef} className={cn('relative', collapsed ? 'px-3 md:px-2' : 'px-3 md:px-3')}>
					<button
						type="button"
						onClick={() => setManagementOpen(open => !open)}
						aria-haspopup="listbox"
						aria-expanded={managementOpen}
						aria-label={t('nav.management')}
						title={t('nav.management')}
						className={cn(
							'group/mgmt relative flex items-center gap-2.5 rounded-xl py-2.5 text-sm font-semibold transition-colors',
							collapsed ? 'size-11 w-full justify-center px-0' : 'w-full px-3',
							location.pathname.startsWith('/app/management')
								? 'bg-emerald-50 ring-2 ring-emerald-400'
								: 'hover:bg-secondary',
						)}
					>
						<ClipboardList className="size-4 shrink-0" strokeWidth={2} />
						<span className={collapsed ? 'sr-only' : undefined}>{t('nav.management')}</span>
						{collapsed ? (
							<span
								role="tooltip"
								className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-purple-700 px-2.5 py-1.5 text-xs font-semibold text-background shadow-soft-sm [@media(hover:hover)]:group-hover/mgmt:block [@media(hover:hover)]:group-focus-visible/mgmt:block"
							>
								{t('nav.management')}
							</span>
						) : null}
					</button>
					{managementOpen ? (
						<ul
							role="listbox"
							aria-label={t('nav.management')}
							className="absolute left-0 right-0 z-40 mt-1 overflow-auto rounded-xl border border-border bg-popover p-1 shadow-soft md:left-full md:right-auto md:top-0 md:mt-0 md:w-56 md:translate-x-2"
						>
							<li>
								<NavLink
									to="/app/management/performance"
									onClick={() => setManagementOpen(false)}
									className={({ isActive }) =>
										cn(
											'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-secondary',
											isActive ? 'bg-accent text-accent-foreground' : 'text-foreground',
										)
									}
								>
									<Target className="size-4 shrink-0 text-emerald-600" strokeWidth={2} />
									{t('mgmt.performance')}
								</NavLink>
							</li>
							<li>
								<NavLink
									to="/app/management/training"
									onClick={() => setManagementOpen(false)}
									className={({ isActive }) =>
										cn(
											'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-secondary',
											isActive ? 'bg-accent text-accent-foreground' : 'text-foreground',
										)
									}
								>
									<GraduationCap className="size-4 shrink-0 text-emerald-600" strokeWidth={2} />
									{t('mgmt.training')}
								</NavLink>
							</li>
						</ul>
					) : null}
				</div>
			) : null}

			<div
				className={cn(
					'mt-auto border-t border-sidebar-border py-3 md:py-4',
					collapsed ? 'px-3 md:px-2' : 'px-3 md:px-5',
				)}
			>
				{!isKasir ? (
					<div>
						<p className={cn('mb-2 hidden truncate text-xs text-muted-foreground md:block', collapsed && 'sr-only')} title={user?.email}>
							{user?.email}
						</p>
						<button
							type="button"
							onClick={handleLogout}
							title={t('sidebar.signout')}
							aria-label={t('sidebar.signout')}
							className="flex size-11 items-center justify-center rounded-xl text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
						>
							<LogOut className="size-4" />
							<span className="sr-only">{t('sidebar.signout')}</span>
						</button>
					</div>
				) : null}
			</div>
		</aside>
	);
}
