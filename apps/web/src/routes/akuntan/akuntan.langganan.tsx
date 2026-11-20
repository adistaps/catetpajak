import { useEffect, useState } from 'react';
import { Link, redirect } from 'react-router';
import {
	Check,
	Clock,
	Loader2,
	ShieldCheck,
	Sparkles,
	Wallet,
} from 'lucide-react';
import type { Route } from './+types/akuntan.langganan';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { getProducts } from '@/api/ecommerce-api';
import {
	getManageSubscriptionUrl,
	startSubscriptionCheckout,
} from '@/api/ecommerce-subscriptions-api';
import { AkuntanShell } from '@/components/akuntan/akuntan-shell';
import { getAkuntanRole } from '@/lib/akuntan';
import { usePencariSubscription, PENCARI_PLAN_TITLE } from '@/hooks/use-pencari-subscription';
import { ManualPaymentForm } from '@/components/akuntan/manual-payment-form';
import { MANUAL_PAYMENT_STATUS_LABELS } from '@/lib/manual-payments';
import { fetchPlanPrices, formatPlanPrice } from '@/lib/plan-prices';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Langganan Pencari Akuntan — Catet Akuntan',
			description:
				'Berlangganan Pencari Akuntan Rp49.000 per bulan untuk mengirim permintaan nama kepada akuntan di direktori.',
		},
	);
}

const PLAN_TITLE = PENCARI_PLAN_TITLE;

export async function clientLoader() {
	const user = requireAuth('/akuntan/masuk');
	if (getAkuntanRole(user) === 'akuntan') {
		throw redirect('/akuntan/dasbor');
	}

	const products = await getProducts({ type: 'subscription' }).then(r => r.products).catch(() => []);
	const plan = products.find(product => product.title === PLAN_TITLE);
	const variant = plan?.variants[0];

	let priceFormatted = variant?.price_formatted ?? 'Rp49.000';
	try {
		const prices = await fetchPlanPrices();
		const pencari = prices.find(item => item.plan === 'pencari_akuntan');
		if (pencari) priceFormatted = formatPlanPrice(pencari.price);
	} catch {
		// jatuh ke nilai default
	}

	return {
		user,
		variantId: variant?.id ?? null,
		priceFormatted,
	};
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-dvh bg-[#f7fbf8]" />;
}

const FEATURES = [
	'Jelajahi direktori akuntan tanpa batas',
	'Lihat detail profil lengkap setiap akuntan',
	'Kirim permintaan nama kepada akuntan pilihan',
	'Pantau status permintaan Anda di dasbor',
];

function formatDate(iso: string | undefined): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

export default function AkuntanLangganan({ loaderData }: Route.ComponentProps) {
	const { variantId, priceFormatted } = loaderData;
	const {
		isSubscribed,
		isLoading,
		subscriptions,
		activeManualPayment,
		pendingManualPayment,
	} = usePencariSubscription();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showManualForm, setShowManualForm] = useState(false);

	const activeStore = subscriptions.find(
		subscription => subscription.product_title === PLAN_TITLE && subscription.status !== 'canceled',
	) ?? null;

	useEffect(() => {
		if (!isSubscribed) return;
		setBusy(false);
		setShowManualForm(false);
	}, [isSubscribed]);

	async function handleSubscribe() {
		if (!variantId) return;
		setError(null);
		setBusy(true);
		try {
			await startSubscriptionCheckout({
				variantId,
				successPath: '/akuntan/langganan?just_subscribed=1',
				cancelPath: '/akuntan/langganan',
			});
		} catch (err) {
			const code = (err as { code?: string })?.code;
			if (code === 'ALREADY_SUBSCRIBED') {
				window.location.reload();
				return;
			}
			setError('Gagal memulai pembayaran. Coba lagi sebentar.');
			setBusy(false);
		}
	}

	async function handleManage() {
		if (!activeStore) return;
		setBusy(true);
		setError(null);
		try {
			const { url } = await getManageSubscriptionUrl({
				subscriptionId: activeStore.id,
				returnUrl: window.location.href,
			});
			window.location.href = url;
		} catch (err) {
			setError((err as Error)?.message ?? 'Gagal membuka portal tagihan.');
			setBusy(false);
		}
	}

	return (
		<AkuntanShell>
			<main className="mx-auto max-w-2xl px-5 py-10 md:px-8 md:py-14">
				<p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
					Pencari Akuntan
				</p>
				<h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#102a4c]">
					Langganan Pencari Akuntan
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Akses penuh untuk mengirim permintaan nama kepada akuntan di direktori Catet Akuntan.
				</p>

				{error ? (
					<p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
						{error}
					</p>
				) : null}

				{isLoading ? (
					<div className="mt-8 flex items-center justify-center gap-2 rounded-3xl border border-border bg-card p-12 text-sm text-muted-foreground shadow-soft-sm">
						<Loader2 className="size-4 animate-spin" /> Memuat status langganan…
					</div>
				) : isSubscribed && (activeStore || activeManualPayment) ? (
					<div className="mt-8 overflow-hidden rounded-3xl border border-emerald-200 bg-card shadow-soft">
						<div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/60 px-7 py-5">
							<span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
								Aktif
							</span>
							<h2 className="text-lg font-extrabold tracking-tight text-[#102a4c]">
								{PLAN_TITLE}
							</h2>
						</div>
						<dl className="grid grid-cols-2 gap-4 px-7 py-6 text-sm">
							<div>
								<dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Metode pembayaran
								</dt>
								<dd className="mt-1 font-semibold">
									{activeManualPayment ? 'Transfer bank (manual)' : 'Kartu/otomatis'}
								</dd>
							</div>
							<div>
								<dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Perpanjang pada
								</dt>
								<dd className="mt-1 font-semibold">
									{activeManualPayment
										? formatDate(activeManualPayment.period_end)
										: formatDate(activeStore?.current_period_end)}
								</dd>
							</div>
						</dl>
						<div className="px-7 pb-7">
							{activeStore ? (
								<button
									type="button"
									onClick={handleManage}
									disabled={busy}
									className="w-fit rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
								>
									{busy ? 'Memproses…' : 'Kelola langganan'}
								</button>
							) : (
								<p className="text-xs text-muted-foreground">
									Langganan manual aktif hingga {formatDate(activeManualPayment?.period_end)}.
									Perpanjang dengan mengirim pembayaran manual kembali sebelum tanggal tersebut.
								</p>
							)}
						</div>
					</div>
				) : pendingManualPayment ? (
					<div className="mt-8 overflow-hidden rounded-3xl border border-amber-200 bg-card shadow-soft">
						<div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-7 py-5">
							<Clock className="size-5 text-amber-600" strokeWidth={1.75} />
							<div>
								<h2 className="text-lg font-extrabold tracking-tight text-[#102a4c]">
									{MANUAL_PAYMENT_STATUS_LABELS[pendingManualPayment.status]}
								</h2>
								<p className="text-xs text-muted-foreground">
									Bukti pembayaran Anda sedang ditinjau admin Catet Pajak.
								</p>
							</div>
						</div>
						<div className="px-7 py-6 text-sm text-muted-foreground">
							<p>
								Permintaan terkirim pada {formatDate(pendingManualPayment.created)}. Akses
								langganan akan diaktifkan otomatis setelah pembayaran diverifikasi, biasanya
								dalam 1×24 jam. Anda akan melihat status berubah menjadi aktif di halaman ini.
							</p>
							{pendingManualPayment.verification_notes ? (
								<p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-700">
									{pendingManualPayment.verification_notes}
								</p>
							) : null}
						</div>
					</div>
				) : (
					<div className="mt-8 overflow-hidden rounded-3xl border border-emerald-200 bg-card shadow-soft">
						<div className="flex items-center gap-2.5 border-b border-emerald-100 bg-emerald-50/60 px-7 py-5">
							<Sparkles className="size-5 text-emerald-600" strokeWidth={1.75} />
							<h2 className="text-lg font-extrabold tracking-tight text-[#102a4c]">Paket Bulanan</h2>
						</div>
						<div className="px-7 py-6">
							<p className="text-4xl font-extrabold tracking-tight text-[#102a4c]">
								{priceFormatted}
							</p>
							<p className="mt-1 text-sm font-medium text-muted-foreground">per bulan</p>
							<ul className="mt-6 flex flex-col gap-2.5 text-sm">
								{FEATURES.map(feature => (
									<li key={feature} className="flex items-start gap-2.5">
										<Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={3} />
										<span>{feature}</span>
									</li>
								))}
							</ul>
							<button
								type="button"
								onClick={handleSubscribe}
								disabled={busy || !variantId}
								className="mt-7 w-full rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{busy ? 'Memproses…' : 'Bayar otomatis (kartu)'}
							</button>
							<p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
								<ShieldCheck className="size-3.5 text-emerald-500" strokeWidth={1.75} />
								Pembayaran aman · dapat dibatalkan kapan saja
							</p>

							<div className="my-6 flex items-center gap-3">
								<span className="h-px flex-1 bg-border" />
								<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									atau
								</span>
								<span className="h-px flex-1 bg-border" />
							</div>

							<button
								type="button"
								onClick={() => setShowManualForm(value => !value)}
								className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-300 bg-white px-6 py-3.5 text-sm font-semibold text-emerald-700 shadow-soft-sm transition hover:bg-emerald-50"
							>
								<Wallet className="size-4" strokeWidth={1.75} />
								{showManualForm ? 'Sembunyikan pembayaran manual' : 'Bayar manual (transfer bank)'}
							</button>

							{showManualForm ? (
								<ManualPaymentForm
									variantId={variantId}
									amountFormatted={priceFormatted}
									planKey="pencari_akuntan"
									onSubmitted={() => window.location.reload()}
								/>
							) : null}
						</div>
					</div>
				)}

				<div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm">
					<Link to="/akuntan" className="font-semibold text-emerald-700 hover:underline">
						← Jelajahi direktori
					</Link>
					<p className="text-muted-foreground">
						Akun Akuntan tetap gratis. Langganan ini hanya berlaku untuk Pencari Akuntan.
					</p>
				</div>
			</main>
		</AkuntanShell>
	);
}
