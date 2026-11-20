import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, redirect, useLoaderData, useLocation, useNavigate, useRevalidator } from 'react-router';
import { LogOut } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { requireAuth } from '@/lib/require-auth';
import { useAuth } from '@/hooks/use-auth';
import { AppSidebar } from '@/components/app/sidebar';
import { AppStatusIcons } from '@/components/app/status-icons';
import { useLanguage } from '@/hooks/use-language';
import { PosPortal } from '@/components/app/pos-portal';
import { CallProvider } from '@/components/app/call-provider';
import { PlanUpgradeNotice } from '@/components/app/plan-upgrade-notice';
import { FeatureDisabledNotice } from '@/components/app/feature-disabled-notice';
import { CompanySuspendedNotice } from '@/components/app/company-suspended-notice';
import { SubscriptionExpiredNotice } from '@/components/app/subscription-expired-notice';
import { normalizePlan, planAllowsMenu } from '@/lib/plan-access';
import type { Company } from '@/lib/accounting';
import type { AppOutletContext } from '@/lib/app-context';
import { loadAccessState, type TrialStatus } from '@/lib/subscription-access';
import { loadFeatureFlags, loadCompanyFeatureFlags, featureAllowsPermission } from '@/lib/feature-flags';
import { subscribeMyManualPayments } from '@/lib/manual-payments';
import type { EcommerceSubscription } from '@/api/ecommerce-subscriptions-api';
import {
	listAccessibleCompanies,
	memberHasPermission,
	type CompanyMember,
} from '@/lib/company-members';
import {
	type AppPermission,
	type MemberRole,
	isFullAccessRole,
	isKasirRole,
	ROUTE_PERMISSION,
} from '@/data/user-roles';

const STORAGE_KEY = 'bukubesar.activeCompanyId';

export async function clientLoader() {
	const user = requireAuth();
	// Sesi parent (koleksi auth terpisah) tidak boleh mengakses /app — arahkan
	// ke portal parent agar tidak membocorkan data perusahaan.
	if (user.collectionName === 'parents') {
		throw redirect('/app/parent/dashboard');
	}
	const { subscriptions, trial, active, activeManualPayment, pendingManualPayment, hasAccess } =
		await loadAccessState(user.created, user.id);

	// Ketika langganan berakhir, pengguna tetap dapat masuk dan melihat aplikasi,
	// tetapi tidak dapat menggunakan fitur bisnis. Jangan alihkan ke /plans —
	// pembatasan diterapkan di tingkat layout agar tidak dapat dilewati.
	const subscriptionExpired = !hasAccess;

	// Muat status fitur global (Admin Pusat) sekali per sesi. Cache di memori
	// dipakai sidebar dan penjaga rute untuk menyembunyikan fitur nonaktif.
	await loadFeatureFlags();

	return { user, subscriptions, trial, active, activeManualPayment, pendingManualPayment, subscriptionExpired };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-dvh bg-background" />;
}

export default function AppLayout() {
	const loaderData = useLoaderData<typeof clientLoader>();
	const { logout } = useAuth();
	const { t } = useLanguage();
	const location = useLocation();
	const navigate = useNavigate();
	const revalidator = useRevalidator();
	const [companies, setCompanies] = useState<Company[]>([]);
	const companiesRevision = useRef(0);
	const [memberships, setMemberships] = useState<CompanyMember[]>([]);
	const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
	const [isKaryawan, setIsKaryawan] = useState(false);
	const [isCentralAdmin, setIsCentralAdmin] = useState(false);
	const [accessReady, setAccessReady] = useState(false);
	const [planDenied, setPlanDenied] = useState<AppPermission | null>(null);
	const [featureDenied, setFeatureDenied] = useState<AppPermission | null>(null);
	const [featureFlagsVersion, setFeatureFlagsVersion] = useState(0);

	const refreshCompanies = useCallback(async () => {
		const revision = ++companiesRevision.current;
		const userId = loaderData?.user?.id ?? pb.authStore.record?.id;
		if (!userId) {
			setCompanies([]);
			setActiveCompanyIdState(null);
			setIsKaryawan(false);
			setAccessReady(true);
			return;
		}

		// Status admin pusat diperiksa terpisah: aturan koleksi hanya mengizinkan
		// pengguna memeriksa status miliknya sendiri.
		try {
			const adminCheck = await pb.collection('central_admins').getList(1, 1, {
				filter: pb.filter('user = {:id}', { id: userId }),
				requestKey: null,
			});
			setIsCentralAdmin(adminCheck.totalItems > 0);
		} catch {
			setIsCentralAdmin(false);
		}

		const { companies: list, memberships, isKaryawan: ess } =
			await listAccessibleCompanies(userId);
		// A newer refresh or a saved name must not be overwritten by an older response.
		if (revision !== companiesRevision.current) return;

		setIsKaryawan(ess);
		setMemberships(memberships);
		setCompanies(list);
		setActiveCompanyIdState(previous => {
			if (previous && list.some(company => company.id === previous)) return previous;
			const stored = window.localStorage.getItem(STORAGE_KEY);
			if (stored && list.some(company => company.id === stored)) return stored;
			const essCompanyId = memberships.find(m => m.role === 'karyawan')?.company;
			if (essCompanyId && list.some(c => c.id === essCompanyId)) return essCompanyId;
			return list[0]?.id ?? null;
		});
		setAccessReady(true);
	}, [loaderData?.user?.id]);

	useEffect(() => {
		let cancelled = false;
		refreshCompanies().catch(() => {
			if (!cancelled) setAccessReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, [refreshCompanies]);

	// Perubahan perusahaan di sesi lain diperbarui melalui realtime bila akses
	// koleksi mengizinkan, dan saat pengguna kembali ke tab aplikasi.
	useEffect(() => {
		let cancelled = false;
		let unsubscribe: (() => Promise<void>) | undefined;
		void pb.collection('companies').subscribe('*', event => {
			if (!cancelled && event.action === 'update') void refreshCompanies().catch(() => {});
		}).then(stop => {
			if (cancelled) void stop().catch(() => {});
			else unsubscribe = stop;
		}).catch(() => {});
		const onFocus = () => { void refreshCompanies().catch(() => {}); };
		window.addEventListener('focus', onFocus);
		return () => {
			cancelled = true;
			window.removeEventListener('focus', onFocus);
			if (unsubscribe) void unsubscribe().catch(() => {});
		};
	}, [refreshCompanies]);

	useEffect(() => {
		if (!pb.authStore.isValid) return;
		let cancelled = false;
		fetch('/api/akuntan/manual-payments/verify', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${pb.authStore.token}`,
			},
			body: JSON.stringify({ sync: true }),
		})
			.then(() => {
				if (!cancelled) refreshCompanies().catch(() => {});
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [refreshCompanies]);

	useEffect(() => {
		return subscribeMyManualPayments(() => {
			revalidator.revalidate();
			refreshCompanies().catch(() => {});
		});
	}, [revalidator, refreshCompanies]);

	// Muat status fitur per perusahaan setiap kali perusahaan aktif berganti.
	// Override per perusahaan menang atas default global; setelah dimuat, naikkan
	// versi agar sidebar dan penjaga rute mengevaluasi ulang dengan flag baru.
	useEffect(() => {
		if (!activeCompanyId) return;
		let cancelled = false;
		loadCompanyFeatureFlags(activeCompanyId)
			.then(() => {
				if (!cancelled) setFeatureFlagsVersion(version => version + 1);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompanyId]);

	const updateCompanyName = useCallback((id: string, name: string) => {
		companiesRevision.current += 1;
		setCompanies(previous => previous.map(company => company.id === id ? { ...company, name } : company));
	}, []);

	const setActiveCompanyId = (id: string) => {
		window.localStorage.setItem(STORAGE_KEY, id);
		setActiveCompanyIdState(id);
	};

	const activeCompany = companies.find(company => company.id === activeCompanyId) ?? null;
	// Pembatasan paket berlaku untuk semua role, termasuk Pemilik/Admin —
	// akses penuh mereka mengikuti paket perusahaan yang aktif.
	const activePlan = normalizePlan(activeCompany?.plan);

	const userId = loaderData?.user?.id ?? pb.authStore.record?.id ?? '';
	const activeMembership =
		memberships.find(member => member.company === activeCompanyId) ?? null;
	const isCompanyOwner = Boolean(activeCompany && activeCompany.owner === userId);
	const memberRole: MemberRole | null = isCompanyOwner
		? 'pemilik'
		: (activeMembership?.role ?? null);
	const isKasir = isKasirRole(memberRole);

	const canAccessMenu = useCallback(
		(permission: AppPermission) => {
			// Fitur yang dinonaktifkan Admin Pusat disembunyikan dari semua role.
			if (!featureAllowsPermission(permission)) return false;
			// Pembatasan paket perusahaan dicek lebih dulu, sebelum izin role.
			if (!planAllowsMenu(activePlan, permission)) return false;
			if (isCompanyOwner || isFullAccessRole(memberRole)) return true;
			// Chat tersedia untuk semua anggota perusahaan aktif,
			// termasuk anggota lama yang izin tersimpannya belum memuat 'chat'.
			if (permission === 'chat') return Boolean(activeMembership);
			// Pengguna tanpa perusahaan sama sekali boleh membuka Perusahaan
			// untuk membuat perusahaan pertamanya — tanpa ini penjaga menu
			// memantulnya kembali ke dasbor dan tombol "Tambah Perusahaan"
			// menjadi jalan buntu.
			if (!isKaryawan && companies.length === 0) {
				return permission === 'dasbor' || permission === 'perusahaan';
			}
			if (!activeMembership) return permission === 'dasbor';
			return memberHasPermission(activeMembership, permission, false);
		},
		[isCompanyOwner, memberRole, activeMembership, isKaryawan, companies.length, activePlan, featureFlagsVersion],
	);

	// Karyawan users are confined to their self-service portal — both the admin
	// dashboard and every other admin route redirect there.
	useEffect(() => {
		if (!accessReady || !isKaryawan) return;
		if (location.pathname === '/app/karyawan' || location.pathname.startsWith('/app/karyawan/')) {
			return;
		}
		navigate('/app/karyawan', { replace: true });
	}, [accessReady, isKaryawan, location.pathname, navigate]);

	// Role-based menu guard: a member without the route's permission is sent
	// back to the dashboard. ESS (karyawan) users are handled above. Kasir users
	// are confined to the POS module — every other segment (including the
	// dashboard) redirects to /app/pos. A menu the company's plan does not
	// include shows a clear upgrade message instead of a silent redirect, so
	// direct URL access is also gated.
	useEffect(() => {
		if (!accessReady || isKaryawan) return;
		// Tunggu sampai perusahaan aktif benar-benar teresolusi sebelum
		// menjalankan pengalihan role/izin. Keanggotaan dan activeCompanyId
		// diperbarui melalui dua pembaruan status terpisah; pada selang itu
		// activeMembership sementara kosong. Tanpa gerbang ini, kasir yang
		// membuka /app/pos sempat dipantul ke /app lalu kembali ke /app/pos
		// begitu perusahaan aktif teresolusi, sehingga rute POS tidak stabil.
		if (companies.length > 0 && !activeCompanyId) return;
		const path = location.pathname.startsWith('/app/')
			? location.pathname.slice(5)
			: location.pathname === '/app'
				? ''
				: location.pathname;
		const segment = path.split('/')[0] ?? '';

		// Kasir hanya boleh mengakses POS; segmen lain dialihkan ke kasir.
		if (isKasir && segment !== 'pos') {
			navigate('/app/pos', { replace: true });
			return;
		}

		const permission = ROUTE_PERMISSION[segment];
		// Fitur yang dinonaktifkan Admin Pusat menampilkan pesan jelas, bukan
		// pengalihan senyap — akses URL langsung juga dijaga.
		if (permission && !featureAllowsPermission(permission)) {
			setFeatureDenied(permission);
			setPlanDenied(null);
			return;
		}
		setFeatureDenied(null);
		if (permission && !planAllowsMenu(activePlan, permission)) {
			setPlanDenied(permission);
			return;
		}
		setPlanDenied(null);
		// Kasir sudah berada di POS (segmen 'pos') dan diizinkan oleh definisi
		// peran; lewati pemeriksaan canAccessMenu yang bergantung pada data
		// keanggotaan agar kasir tidak memantul ke /app saat permissions belum
		// termuat dari endpoint. Tanpa ini terjadi loop /app/pos <-> /app.
		if (isKasir) return;
		if (permission && !canAccessMenu(permission)) {
			navigate('/app', { replace: true });
		}
	}, [accessReady, isKaryawan, isKasir, location.pathname, canAccessMenu, navigate, activePlan, companies.length, activeCompanyId, featureFlagsVersion]);

	const trial: TrialStatus | null = loaderData?.trial ?? null;
	const active: EcommerceSubscription | null = loaderData?.active ?? null;
	const activeManualPayment = loaderData?.activeManualPayment ?? null;
	const pendingManualPayment = loaderData?.pendingManualPayment ?? null;
	// Langganan berakhir: pengguna tetap masuk, tetapi fitur bisnis diblokir di
	// tingkat layout agar tidak dapat dilewati melalui jalur rute lain.
	const subscriptionExpired = Boolean(loaderData?.subscriptionExpired);

	const context: AppOutletContext = {
		companies,
		activeCompany,
		setActiveCompanyId,
		refreshCompanies,
		updateCompanyName,
		trial,
		activeSubscription: active,
		isKaryawan,
		memberRole,
		canAccessMenu,
	};

	if (isKasir) {
		if (subscriptionExpired) {
			return (
				<CallProvider companyId={activeCompany?.id ?? null}>
					<div className="flex h-dvh items-center justify-center bg-background p-6">
						<SubscriptionExpiredNotice companyName={activeCompany?.name} />
					</div>
				</CallProvider>
			);
		}
		return (
			<CallProvider companyId={activeCompany?.id ?? null}>
				<PosPortal
					context={context}
					accessReady={accessReady}
					activeCompany={activeCompany}
					planDenied={planDenied}
					activePlan={activePlan}
				/>
			</CallProvider>
		);
	}

	const handleLogout = () => {
		logout();
		navigate('/login');
	};

	const onEmployeeApp =
		location.pathname === '/app/karyawan' || location.pathname.startsWith('/app/karyawan/');
	// Header aplikasi (logo, perusahaan aktif, navigasi) disembunyikan di halaman
	// karyawan untuk semua pengguna dan semua ukuran layar.
	const hideAppChrome = isKaryawan || onEmployeeApp;
	const onLauncher = location.pathname === '/app';

	return (
		<CallProvider companyId={activeCompany?.id ?? null}>
		<div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row">
			{hideAppChrome || onLauncher ? null : (
				<div className={`h-full shrink-0 ${accessReady ? '' : 'max-md:hidden'}`}>
				<AppSidebar
					companies={companies}
					activeCompany={activeCompany}
					onSelectCompany={setActiveCompanyId}
					trial={trial}
					activeSubscription={active}
					activeManualPayment={activeManualPayment}
					pendingManualPayment={pendingManualPayment}
					isKaryawan={isKaryawan}
					isKasir={isKasir}
					isCentralAdmin={isCentralAdmin}
					canAccessMenu={canAccessMenu}
				/>
				</div>
			)}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			{location.pathname === '/app' || onEmployeeApp ? null : (
				<div className="flex shrink-0 items-center justify-end gap-2 bg-background px-4 py-2 sm:px-5 md:px-10">
					<AppStatusIcons
						companyId={activeCompany?.id ?? null}
						companyName={activeCompany?.name ?? null}
						showDepreciation={!isKaryawan && canAccessMenu('aset')}
				/>
					{hideAppChrome ? (
						<button
							type="button"
							onClick={handleLogout}
							className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-muted-foreground shadow-soft-sm transition-colors hover:text-foreground"
						>
							<LogOut className="size-4" /> {t('header.signout')}
						</button>
					) : null}
				</div>
			)}
			<main
				className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${
					onEmployeeApp
						? 'bg-[#f4f5f7]'
						: `px-4 py-6 sm:px-5 md:px-10 md:py-10 ${
								location.pathname === '/app'
									? 'bg-white'
									: location.pathname === '/app/pengaturan'
										? 'bg-[#f3f5f4]'
										: 'bg-background'
							}`
				}`}
			>
				{!accessReady || (companies.length > 0 && !activeCompanyId) ? (
					<div className="min-h-40" />
				) : activeCompany && activeCompany.access_status === 'suspended' ? (
					<CompanySuspendedNotice companyName={activeCompany.name} />
				) : subscriptionExpired ? (
					<SubscriptionExpiredNotice companyName={activeCompany?.name} />
				) : featureDenied ? (
					<FeatureDisabledNotice permission={featureDenied} />
				) : planDenied ? (
					<PlanUpgradeNotice permission={planDenied} plan={activePlan} />
				) : (
					<Outlet context={context} />
				)}
			</main>
			</div>
		</div>
		</CallProvider>
	);
}
