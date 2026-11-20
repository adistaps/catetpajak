import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/subscriptions';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import {
	activeSubscription,
	getManageSubscriptionUrl,
	getUserSubscriptions,
	isSubscriptionPending,
	waitForActiveSubscription,
	type EcommerceSubscription,
} from '@/api/ecommerce-subscriptions-api';
import { computeTrialStatus, TRIAL_DAYS } from '@/lib/subscription-access';
import {
	isManualPaymentActive,
	listMyManualPayments,
	MANUAL_PAYMENT_STATUS_LABELS,
	subscribeMyManualPayments,
	type ManualPayment,
} from '@/lib/manual-payments';
import { Check, Clock, Loader2 } from 'lucide-react';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Langganan Saya — Catet Pajak',
			description: 'Lihat dan kelola status langganan Catet Pajak Anda.',
		},
	);
}

export async function clientLoader() {
	const user = requireAuth();
	return { user };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-dvh bg-background" />;
}

function formatDate(iso: string | undefined): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

export default function Subscriptions({ loaderData }: Route.ComponentProps) {
	const { user } = loaderData;
	const [subscriptions, setSubscriptions] = useState<EcommerceSubscription[]>([]);
	const [isPolling, setIsPolling] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [manualPayments, setManualPayments] = useState<ManualPayment[]>([]);

	const trial = computeTrialStatus(user?.created);

	useEffect(() => {
		if (!user) return;
		let cancelled = false;
		const load = () => {
			listMyManualPayments(user.id)
				.then(items => {
					if (!cancelled) setManualPayments(items);
				})
				.catch(() => {});
		};
		load();
		const unsubscribe = subscribeMyManualPayments(load);
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [user]);

	const appManualPayments = manualPayments.filter(
		payment => payment.plan_title === 'Pro' || payment.plan_title === 'Enterprise',
	);
	const activeManualPayment =
		appManualPayments.find(payment => isManualPaymentActive(payment)) ?? null;
	const pendingManualPayment =
		appManualPayments.find(payment => payment.status === 'menunggu_verifikasi') ?? null;

	useEffect(() => {
		let cancelled = false;
		const pending = isSubscriptionPending();

		const load = () =>
			getUserSubscriptions()
				.then(({ subscriptions }) => {
					if (!cancelled) setSubscriptions(subscriptions);
				})
				.catch(() => {})
				.finally(() => {
					if (!cancelled) setLoaded(true);
				});

		if (pending) {
			setIsPolling(true);
			waitForActiveSubscription({ onUpdate: setSubscriptions }).then(({ isActivated }) => {
				if (cancelled) return;
				setIsPolling(false);
				setIsProcessing(!isActivated);
				setLoaded(true);
			});
		} else {
			load();
		}

		return () => {
			cancelled = true;
		};
	}, []);

	const active = activeSubscription(subscriptions);

	const handleManage = async () => {
		if (!active) return;
		setBusy(true);
		setError(null);
		try {
			const { url } = await getManageSubscriptionUrl({
				subscriptionId: active.id,
				returnUrl: window.location.href,
			});
			window.location.href = url;
		} catch (err) {
			setError((err as Error)?.message ?? 'Gagal membuka portal tagihan.');
			setBusy(false);
		}
	};

	return (
		<main className="min-h-dvh bg-secondary/30 px-5 py-14 text-foreground md:px-10 md:py-20">
			<div className="mx-auto max-w-2xl">
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

				<header>
					<p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
						Akun
					</p>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
						Langganan Saya
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">{user?.email}</p>
				</header>

				{error ? (
					<p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
						{error}
					</p>
				) : null}

				<div className="mt-8 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
					{isPolling ? (
						<div className="flex flex-col items-center gap-3 px-7 py-12 text-center">
							<Loader2 className="size-6 animate-spin text-primary" />
							<p className="text-sm font-semibold">Mengaktifkan langganan Anda…</p>
							<p className="text-xs text-muted-foreground">
								Pembayaran sedang dikonfirmasi. Mohon tunggu sebentar.
							</p>
						</div>
					) : !loaded ? (
						<div className="flex items-center justify-center gap-2 px-7 py-12 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" /> Memuat…
						</div>
					) : isProcessing ? (
						<div className="px-7 py-10 text-center">
							<p className="text-sm font-semibold">Pembayaran masih diproses</p>
							<p className="mt-2 text-xs text-muted-foreground">
								Langganan Anda belum muncul. Segarkan halaman ini beberapa saat lagi.
							</p>
						</div>
					) : active ? (
						<div className="flex flex-col gap-5 p-7 md:p-9">
							<div className="flex items-center gap-3">
								<span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
									{active.status === 'trialing' ? 'Uji coba' : 'Aktif'}
								</span>
								<h2 className="text-xl font-extrabold tracking-tight">{active.product_title}</h2>
							</div>
							<dl className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										Periode tagihan
									</dt>
									<dd className="mt-1 font-semibold">{active.variant_title}</dd>
								</div>
								<div>
									<dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										Perpanjang pada
									</dt>
									<dd className="mt-1 font-semibold">{formatDate(active.current_period_end)}</dd>
								</div>
							</dl>
							<button
								type="button"
								onClick={handleManage}
								disabled={busy}
								className="mt-1 w-fit rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
							>
								{busy ? 'Memproses…' : 'Kelola langganan'}
							</button>
							<p className="text-xs text-muted-foreground">
								Ubah paket, metode pembayaran, atau batalkan langganan melalui portal tagihan.
							</p>
						</div>
					) : activeManualPayment ? (
						<div className="flex flex-col gap-5 p-7 md:p-9">
							<div className="flex items-center gap-3">
								<span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
									Aktif
								</span>
								<h2 className="text-xl font-extrabold tracking-tight">{activeManualPayment.plan_title}</h2>
							</div>
							<dl className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										Metode pembayaran
									</dt>
									<dd className="mt-1 font-semibold">Transfer bank (manual)</dd>
								</div>
								<div>
									<dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										Aktif hingga
									</dt>
									<dd className="mt-1 font-semibold">{formatDate(activeManualPayment.period_end)}</dd>
								</div>
							</dl>
							<p className="text-xs text-muted-foreground">
								Langganan manual aktif hingga {formatDate(activeManualPayment.period_end)}. Perpanjang
								dengan membayar kembali sebelum tanggal tersebut.
							</p>
							<Link
								to="/plans"
								className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
							>
								<Check className="size-4" strokeWidth={3} />
								Perpanjang langganan
							</Link>
						</div>
					) : pendingManualPayment ? (
						<div className="flex flex-col gap-4 p-7 md:p-9">
							<div className="flex items-center gap-3">
								<Clock className="size-5 text-amber-600" strokeWidth={1.75} />
								<div>
									<h2 className="text-lg font-extrabold tracking-tight">
										{MANUAL_PAYMENT_STATUS_LABELS[pendingManualPayment.status]}
									</h2>
									<p className="text-xs text-muted-foreground">
										Bukti pembayaran {pendingManualPayment.plan_title} sedang ditinjau admin.
									</p>
								</div>
							</div>
							<p className="text-sm text-muted-foreground">
								Permintaan terkirim pada {formatDate(pendingManualPayment.created)}. Akses langganan
								diaktifkan otomatis setelah pembayaran diverifikasi, biasanya dalam 1×24 jam.
							</p>
							{pendingManualPayment.verification_notes ? (
								<p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-700">
									{pendingManualPayment.verification_notes}
								</p>
							) : null}
						</div>
					) : (
						<div className="flex flex-col gap-5 p-7 md:p-9">
							<div className="flex items-center gap-3">
								<span
									className={
										'rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ' +
										(trial.isTrialActive
											? 'bg-emerald-100 text-emerald-700'
											: 'bg-destructive/10 text-destructive')
									}
								>
									{trial.isTrialActive ? `Uji coba ${trial.daysRemaining} hari` : 'Uji coba berakhir'}
								</span>
							</div>

							{trial.isTrialActive ? (
								<p className="text-sm text-muted-foreground">
									Masa uji coba gratis Anda berakhir dalam{' '}
									<span className="font-semibold text-foreground">{trial.daysRemaining} hari</span>.
									Berlangganan Pro sekarang agar akses tidak terputus.
								</p>
							) : (
								<p className="text-sm text-muted-foreground">
									Masa uji coba gratis {TRIAL_DAYS} hari Anda telah berakhir. Berlangganan Pro
									untuk melanjutkan menggunakan Catet Pajak.
								</p>
							)}

							<Link
								to="/plans"
								className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
							>
								<Check className="size-4" strokeWidth={3} />
								Berlangganan Pro
							</Link>
						</div>
					)}
				</div>

				<p className="mt-8 text-center text-sm text-muted-foreground">
					<Link to="/app" className="font-semibold underline underline-offset-4 hover:text-primary">
						Kembali ke aplikasi
					</Link>
				</p>
			</div>
		</main>
	);
}
