import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Check, Clock, Wallet } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ManualPaymentForm } from '@/components/akuntan/manual-payment-form';
import {
	isManualPaymentActive,
	listMyManualPayments,
	MANUAL_PAYMENT_STATUS_LABELS,
	subscribeMyManualPayments,
	type ManualPayment,
} from '@/lib/manual-payments';
import { cn } from '@/lib/utils';
import type { PlanPriceKey } from '@/lib/plan-prices';

export type ManualPlanOption = {
	title: string;
	planKey: PlanPriceKey;
	variantId: string | null;
	priceFormatted: string;
};

function formatDate(iso: string | undefined): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

/**
 * Bagian pembayaran manual (transfer bank) untuk langganan aplikasi Catet
 * Pajak (Pro/Enterprise). Pengguna memilih paket, melihat instruksi transfer
 * dengan nominal unik, lalu mengunggah bukti. Status verifikasi ditampilkan
 * hingga admin pusat memverifikasi atau verifikasi otomatis berhasil.
 */
export function ManualPaymentSection({
	plans,
	selectedTitle: controlledTitle,
	onSelectTitle,
	onStartPayment,
	autoOpenForm = false,
}: {
	plans: ManualPlanOption[];
	selectedTitle?: string;
	onSelectTitle?: (title: string) => void;
	onStartPayment?: (title: string) => void;
	autoOpenForm?: boolean;
}) {
	const { user, isAuthed, isLoading } = useAuth();
	const [payments, setPayments] = useState<ManualPayment[]>([]);
	const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const [formChoice, setFormChoice] = useState<boolean | null>(null);
	const [seenAutoOpen, setSeenAutoOpen] = useState(autoOpenForm);
	if (autoOpenForm !== seenAutoOpen) {
		setSeenAutoOpen(autoOpenForm);
		setFormChoice(null);
	}
	const showForm = formChoice ?? autoOpenForm;
	const [internalTitle, setInternalTitle] = useState(plans[0]?.title ?? 'Pro');
	const selectedTitle = controlledTitle ?? internalTitle;
	const setSelectedTitle = (title: string) => {
		if (onSelectTitle) {
			onSelectTitle(title);
		} else {
			setInternalTitle(title);
		}
	};

	useEffect(() => {
		if (isLoading || !isAuthed || !user) return;
		setLoadedUserId(null);
		let cancelled = false;
		const load = () => {
			listMyManualPayments(user.id)
				.then(items => {
					if (!cancelled) {
						setPayments(items);
						setLoadError(false);
					}
				})
				.catch(() => {
					if (!cancelled) setLoadError(true);
				})
				.finally(() => {
					if (!cancelled) setLoadedUserId(user.id);
				});
		};
		load();
		const unsubscribe = subscribeMyManualPayments(load);
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [isLoading, isAuthed, user, retryCount]);

	const appPayments = payments.filter(
		payment => payment.plan_title === 'Pro' || payment.plan_title === 'Enterprise',
	);
	const activeManual = appPayments.find(payment => isManualPaymentActive(payment)) ?? null;
	const pendingManual =
		appPayments.find(payment => payment.status === 'menunggu_verifikasi') ?? null;

	const selectedPlan = plans.find(plan => plan.title === selectedTitle) ?? plans[0];

	if (isLoading || (isAuthed && loadedUserId !== user?.id)) {
		return (
			<section className="mt-10 rounded-3xl border border-border bg-card p-7 text-sm text-muted-foreground" aria-live="polite">
				Memuat informasi pembayaran…
			</section>
		);
	}

	if (!isAuthed) {
		return (
			<section className="mt-10 rounded-3xl border border-border bg-card p-7 shadow-soft-sm">
				<div className="flex items-center gap-2.5">
					<Wallet className="size-5 text-primary" strokeWidth={1.75} />
					<h2 className="text-lg font-extrabold tracking-tight">Bayar manual (transfer bank)</h2>
				</div>
				<p className="mt-2 text-sm text-muted-foreground">
					Lebih suka transfer bank?{' '}
					<Link to={`/login?plan=${selectedPlan?.planKey ?? 'pro'}`} className="font-semibold text-primary hover:underline">
						Masuk
					</Link>{' '}
					untuk membayar langganan Pro atau Enterprise via transfer bank dengan verifikasi otomatis.
				</p>
			</section>
		);
	}

	if (loadError) {
		return (
			<section className="mt-10 rounded-3xl border border-amber-200 bg-card p-7 text-sm text-amber-800" role="alert">
				<p>Status pembayaran tidak dapat dimuat. Coba lagi sebelum melanjutkan pembayaran.</p>
				<button type="button" onClick={() => { setLoadedUserId(null); setRetryCount(count => count + 1); }} className="mt-3 font-semibold underline underline-offset-2">Coba lagi</button>
			</section>
		);
	}

	if (activeManual) {
		return (
			<section className="mt-10 overflow-hidden rounded-3xl border border-emerald-200 bg-card shadow-soft">
				<div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/60 px-7 py-5">
					<span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
						Aktif
					</span>
					<h2 className="text-lg font-extrabold tracking-tight">{activeManual.plan_title}</h2>
				</div>
				<dl className="grid grid-cols-2 gap-4 px-7 py-6 text-sm">
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
						<dd className="mt-1 font-semibold">{formatDate(activeManual.period_end)}</dd>
					</div>
				</dl>
				<div className="px-7 pb-7">
					<p className="text-xs text-muted-foreground">
						Langganan manual aktif hingga {formatDate(activeManual.period_end)}. Perpanjang dengan
						mengirim pembayaran manual kembali sebelum tanggal tersebut.
					</p>
					<button
						type="button"
						onClick={() => {
							if (!showForm) onStartPayment?.(selectedPlan?.title ?? selectedTitle);
							setFormChoice(!showForm);
						}}
						className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
					>
						<Wallet className="size-4" strokeWidth={1.75} />
						{showForm ? 'Sembunyikan form perpanjang' : 'Perpanjang sekarang'}
					</button>
					{showForm && selectedPlan ? (
						<ManualPaymentForm
							key={selectedPlan.planKey}
							variantId={selectedPlan.variantId}
							amountFormatted={selectedPlan.priceFormatted}
							planKey={selectedPlan.planKey}
							planTitle={selectedPlan.title}
							onSubmitted={() => window.location.reload()}
						/>
					) : null}
				</div>
			</section>
		);
	}

	if (pendingManual) {
		return (
			<section className="mt-10 overflow-hidden rounded-3xl border border-amber-200 bg-card shadow-soft">
				<div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-7 py-5">
					<Clock className="size-5 text-amber-600" strokeWidth={1.75} />
					<div>
						<h2 className="text-lg font-extrabold tracking-tight">
							{MANUAL_PAYMENT_STATUS_LABELS[pendingManual.status]}
						</h2>
						<p className="text-xs text-muted-foreground">
							Bukti pembayaran {pendingManual.plan_title} Anda sedang ditinjau admin Catet Pajak.
						</p>
					</div>
				</div>
				<div className="px-7 py-6 text-sm text-muted-foreground">
					<p>
						Permintaan terkirim pada {formatDate(pendingManual.created)}. Akses langganan akan
						diaktifkan otomatis setelah pembayaran diverifikasi, biasanya dalam 1×24 jam.
					</p>
					{pendingManual.verification_notes ? (
						<p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-700">
							{pendingManual.verification_notes}
						</p>
					) : null}
				</div>
			</section>
		);
	}

	return (
		<section className="mt-10 rounded-3xl border border-border bg-card p-7 shadow-soft-sm">
			<div className="flex items-center gap-2.5">
				<Wallet className="size-5 text-primary" strokeWidth={1.75} />
				<h2 className="text-lg font-extrabold tracking-tight">Bayar manual (transfer bank)</h2>
			</div>
			<p className="mt-2 text-sm text-muted-foreground">
				Tidak punya kartu kredit? Bayar Pro atau Enterprise via transfer bank. Sistem membuat
				nominal unik untuk verifikasi otomatis — jika jumlah dan bank cocok, langganan aktif
				otomatis.
			</p>

			<div className="mt-4 flex flex-wrap gap-2">
				{plans.map(plan => (
					<button
						key={plan.title}
						type="button"
						onClick={() => setSelectedTitle(plan.title)}
						className={cn(
							'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
							selectedTitle === plan.title
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-border bg-background hover:bg-secondary',
						)}
					>
						{selectedTitle === plan.title ? (
							<Check className="size-3.5" strokeWidth={3} />
						) : null}
						{plan.title} · {plan.priceFormatted}
					</button>
				))}
			</div>

			<button
				type="button"
				onClick={() => {
					if (!showForm) onStartPayment?.(selectedPlan?.title ?? selectedTitle);
					setFormChoice(!showForm);
				}}
				className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-300 bg-white px-6 py-3.5 text-sm font-semibold text-emerald-700 shadow-soft-sm transition hover:bg-emerald-50"
			>
				<Wallet className="size-4" strokeWidth={1.75} />
				{showForm ? 'Sembunyikan pembayaran manual' : 'Tampilkan instruksi transfer'}
			</button>

			{showForm && selectedPlan ? (
				<ManualPaymentForm
					key={selectedPlan.planKey}
					variantId={selectedPlan.variantId}
					amountFormatted={selectedPlan.priceFormatted}
					planKey={selectedPlan.planKey}
					planTitle={selectedPlan.title}
					onSubmitted={() => window.location.reload()}
				/>
			) : null}
		</section>
	);
}
