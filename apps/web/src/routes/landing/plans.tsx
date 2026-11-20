import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Route } from './+types/plans';
import { seo, siteOriginFrom, absoluteUrl } from '@/lib/seo';
import { getProducts } from '@/api/ecommerce-api';
import { useAuth } from '@/hooks/use-auth';
import {
	activeSubscription,
	getUserSubscriptions,
	type EcommerceSubscription,
} from '@/api/ecommerce-subscriptions-api';
import { TRIAL_DAYS } from '@/lib/subscription-access';
import { Check, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManualPaymentSection } from '@/components/plans/manual-payment-section';
import { getPlanPrices } from '@/lib/plan-prices.server';
import { formatPlanPrice, type PlanPriceKey } from '@/lib/plan-prices';

const TIER_COPY: Record<string, { blurb: string; features: string[]; featured?: boolean }> = {
	Starter: {
		blurb: 'Cukup untuk mulai mencatat pembukuan.',
		features: ['Fitur akuntansi', 'Maksimal 10 invoice per bulan'],
	},
	Pro: {
		blurb: 'Akuntansi, pajak, dan payroll untuk tim hingga 10 karyawan.',
		featured: true,
		features: [
			'Aplikasi akuntansi, pajak, dan payroll',
			'Maksimal 10 karyawan',
			'e-Bupot, PPh 21, dan laporan fiskal',
		],
	},
	Enterprise: {
		blurb: 'Semua fitur untuk operasional yang lebih besar.',
		features: ['Semua fitur aplikasi', 'Maksimal 20 karyawan', 'Prioritas dukungan'],
	},
};

export function meta({ matches, location }: Route.MetaArgs) {
	const origin = siteOriginFrom(matches);
	const url = absoluteUrl(origin, location.pathname);

	return seo(
		{ matches, location },
		{
			title: 'Harga & Paket Aplikasi Akuntansi — Catet Pajak',
			description:
				'Paket aplikasi akuntansi Catet Pajak: Starter gratis (akuntansi, 10 invoice/bulan), Pro Rp 299.000/bulan, Enterprise Rp 499.000/bulan. Bayar via transfer bank dengan nominal unik untuk pembukuan bisnis UMKM.',
			jsonLd: {
				'@context': 'https://schema.org',
				'@type': 'BreadcrumbList',
				itemListElement: [
					{ '@type': 'ListItem', position: 1, name: 'Beranda', item: absoluteUrl(origin, '/') },
					{ '@type': 'ListItem', position: 2, name: 'Harga', item: url },
				],
			},
		},
	);
}

export async function loader() {
	// Katalog Hostinger Ecommerce tidak dipakai lagi (pembayaran via transfer manual).
	// Kegagalan/ketiadaan toko tidak boleh membuat halaman harga error.
	const [products, prices] = await Promise.all([
		getProducts({ type: 'subscription' }).then(r => r.products).catch(() => []),
		getPlanPrices(),
	]);
	return { plans: products, prices };
}

export default function Plans({ loaderData }: Route.ComponentProps) {
	const { plans, prices } = loaderData;
	const { isAuthed, isLoading } = useAuth();
	const [subscriptions, setSubscriptions] = useState<EcommerceSubscription[]>([]);
	const [subsLoaded, setSubsLoaded] = useState(false);
	const [searchParams, setSearchParams] = useSearchParams();
	const requestedPlan = searchParams.get('plan');
	const isPaymentFlow = requestedPlan === 'pro' || requestedPlan === 'enterprise';
	const selectedPlan = requestedPlan === 'enterprise' ? 'Enterprise' : 'Pro';
	const selectPlan = (title: string) => {
		const params = new URLSearchParams(searchParams);
		params.set('plan', title === 'Enterprise' ? 'enterprise' : 'pro');
		setSearchParams(params, { replace: true, preventScrollReset: true });
		if (!isPaymentFlow) window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const beginPayment = (title: string) => {
		selectPlan(title);
	};

	useEffect(() => {
		if (!isAuthed) {
			setSubsLoaded(true);
			return;
		}
		let cancelled = false;
		getUserSubscriptions()
			.then(({ subscriptions: next }) => {
				if (!cancelled) setSubscriptions(next);
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setSubsLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, [isAuthed]);

	const active = activeSubscription(subscriptions);
	const pro = plans.find(plan => plan.title === 'Pro');
	const enterprise = plans.find(plan => plan.title === 'Enterprise');

	const priceFor = (key: PlanPriceKey) => {
		const found = prices.find(item => item.plan === key);
		return found ? formatPlanPrice(found.price) : '';
	};

	const cards = [
		{
			key: 'starter',
			title: 'Starter',
			price: priceFor('starter') || 'Gratis',
			period: 'selamanya',
			variantId: null as string | null,
			paid: false,
		},
		{
			key: 'pro',
			title: 'Pro',
			price: priceFor('pro') || 'Rp 299.000',
			period: 'per bulan',
			variantId: pro?.variants[0]?.id ?? null,
			paid: true,
		},
		{
			key: 'enterprise',
			title: 'Enterprise',
			price: priceFor('enterprise') || 'Rp 499.000',
			period: 'per bulan',
			variantId: enterprise?.variants[0]?.id ?? null,
			paid: true,
		},
	];

	const handlePayManual = (title: string) => {
		beginPayment(title);
	};

	const returnToPlans = () => {
		const params = new URLSearchParams(searchParams);
		params.delete('plan');
		setSearchParams(params, { replace: true, preventScrollReset: true });
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	return (
		<main className="min-h-dvh bg-secondary/30 px-5 py-14 text-foreground md:px-10 md:py-20">
			<div className="mx-auto max-w-6xl">
				<Link to="/" className="mb-8 flex w-fit items-center gap-2.5">
					<img
						src="/catet-logo.png"
						alt="Logo Catet Pajak"
						className="brand-logo size-8 object-contain"
					/>
					<span className="text-lg font-bold tracking-tight">
						Catet <span className="text-emerald-500">Pajak</span>
					</span>
				</Link>

				{!isPaymentFlow && <>
				<header className="text-center">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Harga</p>
					<h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
						Tiga paket, sesuai skala usaha
					</h1>
					<p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
						Uji coba penuh {TRIAL_DAYS} hari untuk akun baru. Setelahnya, tetap di Starter gratis
						atau lanjutkan Pro dan Enterprise via transfer bank.
					</p>
				</header>

				<div className="mt-10 grid gap-5 md:grid-cols-3">
					{cards.map(card => {
						const copy = TIER_COPY[card.title];
						const isCurrent = card.paid && active?.product_title === card.title;
						const featured = Boolean(copy?.featured);
						return (
							<article
								key={card.key}
								className={cn(
									'flex flex-col rounded-3xl border bg-card p-7',
									featured ? 'border-primary shadow-soft ring-1 ring-primary/30' : 'border-border shadow-soft-sm',
								)}
							>
								<div className="flex items-center justify-between gap-3">
									<h2 className="text-xl font-extrabold tracking-tight">{card.title}</h2>
									{isCurrent ? (
										<span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
											Paket aktif
										</span>
									) : featured ? (
										<span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
											Paling dipilih
										</span>
									) : null}
								</div>
								<p className="mt-2 min-h-10 text-sm text-muted-foreground">{copy?.blurb}</p>
								<p className="mt-5 text-3xl font-extrabold tracking-tight">{card.price}</p>
								<p className="mt-1 text-xs font-medium text-muted-foreground">{card.period}</p>
								<ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
									{(copy?.features ?? []).map(feature => (
										<li key={feature} className="flex items-start gap-2.5">
											<Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={3} />
											<span>{feature}</span>
										</li>
									))}
								</ul>

								{card.paid ? (
									isLoading ? (
										<button type="button" disabled className="mt-8 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground opacity-60">
											Memuat…
										</button>
									) : !isAuthed ? (
										<Link
											to={`/login?mode=signup&plan=${card.key}`}
											className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
									>
											<Wallet className="size-4" strokeWidth={1.75} />
											Bayar
										</Link>
									) : isCurrent ? (
										<Link
											to="/subscriptions"
											className="mt-8 inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold transition-colors hover:bg-secondary"
										>
											Kelola langganan
										</Link>
									) : (
										<button
											type="button"
											onClick={() => handlePayManual(card.title)}
											className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
										>
											<Wallet className="size-4" strokeWidth={1.75} />
											Bayar
										</button>
									)
								) : (
									<Link
										to={isAuthed ? '/app' : '/login?mode=signup&plan=starter'}
										className="mt-8 inline-flex items-center justify-center rounded-full border border-primary/30 bg-white px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-accent"
									>
										{isAuthed ? 'Pakai Starter' : 'Mulai gratis'}
									</Link>
								)}
							</article>
						);
					})}
				</div>

				{isLoading || !subsLoaded ? null : (
					<p className="mt-6 text-center text-xs text-muted-foreground">
						Pembayaran langganan hanya tersedia via transfer bank dengan nominal unik dan
						verifikasi otomatis.
					</p>
				)}

				</>}

				{isPaymentFlow && (
					<button type="button" onClick={returnToPlans} className="text-sm font-semibold text-primary hover:underline">
						← Kembali ke pilihan paket
					</button>
				)}
				{isPaymentFlow && (
					<div id="bayar-manual" className="mt-2 scroll-mt-6">
						<ManualPaymentSection
							plans={[
								{
									title: 'Pro',
									planKey: 'pro',
									variantId: pro?.variants[0]?.id ?? null,
									priceFormatted: priceFor('pro') || 'Rp 299.000',
								},
								{
									title: 'Enterprise',
									planKey: 'enterprise',
									variantId: enterprise?.variants[0]?.id ?? null,
									priceFormatted: priceFor('enterprise') || 'Rp 499.000',
								},
							]}
							selectedTitle={selectedPlan}
							onSelectTitle={selectPlan}
							onStartPayment={beginPayment}
							autoOpenForm
						/>
					</div>
				)}

				<p className="mt-8 text-center text-sm text-muted-foreground">
					{isAuthed ? (
						<>
							Lihat status langganan di{' '}
							<Link to="/subscriptions" className="font-semibold underline underline-offset-4 hover:text-primary">
								halaman langganan
							</Link>
							.
						</>
					) : (
						<>
							Sudah punya akun?{' '}
							<Link to="/login" className="font-semibold underline underline-offset-4 hover:text-primary">
								Masuk
							</Link>
							.
						</>
					)}
				</p>
			</div>
		</main>
	);
}
