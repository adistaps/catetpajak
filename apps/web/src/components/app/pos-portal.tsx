import { NavLink, Outlet, useNavigate } from 'react-router';
import { LayoutGrid, LogOut, Receipt, Store } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { Company } from '@/lib/accounting';
import type { AppOutletContext } from '@/lib/app-context';
import type { CompanyPlan } from '@/lib/plan-access';
import type { AppPermission } from '@/data/user-roles';
import { AppStatusIcons } from '@/components/app/status-icons';
import { CompanySuspendedNotice } from '@/components/app/company-suspended-notice';
import { PlanUpgradeNotice } from '@/components/app/plan-upgrade-notice';
import { cn } from '@/lib/utils';

const POS_NAV: { to: string; label: string; icon: typeof Store; end: boolean }[] = [
	{ to: '/app/pos', label: 'Kasir', icon: Store, end: true },
	{ to: '/app/pos/meja', label: 'Meja', icon: LayoutGrid, end: false },
	{ to: '/app/pos/riwayat', label: 'Riwayat', icon: Receipt, end: false },
];

interface PosPortalProps {
	context: AppOutletContext;
	accessReady: boolean;
	activeCompany: Company | null;
	planDenied: AppPermission | null;
	activePlan: CompanyPlan;
}

/**
 * Portal khusus kasir: chrome ringkas yang hanya menampilkan alur kerja POS
 * (kasir, meja, riwayat invoice). Tidak ada pemilih perusahaan, sidebar
 * aplikasi umum, atau menu lain — batas data perusahaan aktif, izin role,
 * serta perilaku penjualan/inventaris/meja/pembayaran tetap berjalan seperti
 * biasa melalui context yang diteruskan ke Outlet.
 */
export function PosPortal({
	context,
	accessReady,
	activeCompany,
	planDenied,
	activePlan,
}: PosPortalProps) {
	const { user, logout } = useAuth();
	const navigate = useNavigate();

	const handleLogout = () => {
		logout();
		navigate('/login');
	};

	return (
		<div className="flex min-h-dvh flex-col bg-background text-foreground">
			<header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar-background">
				<div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
					<div className="flex min-w-0 items-center gap-2">
						<NavLink to="/" className="flex shrink-0 items-center gap-2.5">
							<img
								src="/catet-logo.png"
								alt="Logo Catet Pajak"
								className="brand-logo size-8 object-contain"
							/>
							<span className="hidden text-base font-bold tracking-tight sm:inline">
								Catet <span className="text-emerald-500">Pajak</span>
							</span>
						</NavLink>
						{activeCompany ? (
							<span className="truncate rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
								{activeCompany.name}
							</span>
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-3">
						<AppStatusIcons companyId={activeCompany?.id ?? null} showDepreciation={false} />
						<span className="hidden max-w-[12rem] truncate text-xs text-muted-foreground sm:inline">
							{user?.email}
						</span>
						<button
							type="button"
							onClick={handleLogout}
							className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
						>
							<LogOut className="size-4" strokeWidth={2} /> Keluar
						</button>
					</div>
				</div>
				<nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:px-6">
					{POS_NAV.map(item => (
						<NavLink
							key={item.to}
							to={item.to}
							end={item.end}
							className={({ isActive }) =>
								cn(
									'flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
									isActive
										? 'bg-primary text-primary-foreground shadow-soft-sm'
										: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
								)
							}
						>
							<item.icon className="size-4" strokeWidth={2} />
							{item.label}
						</NavLink>
					))}
				</nav>
			</header>
			<main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">
				{!accessReady ? (
					<div className="min-h-40" />
				) : activeCompany && activeCompany.access_status === 'suspended' ? (
					<CompanySuspendedNotice companyName={activeCompany.name} />
				) : planDenied ? (
					<PlanUpgradeNotice permission={planDenied} plan={activePlan} />
				) : (
					<Outlet context={context} />
				)}
			</main>
		</div>
	);
}
