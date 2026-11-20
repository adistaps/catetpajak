import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	fetchCentralAdminPlanPrices,
	updateCentralAdminPlanPrice,
	type CentralAdminPlanPrice,
} from '@/lib/central-admin';
import {
	PLAN_PRICE_LABELS,
	PLAN_PRICE_ORDER,
	PLAN_PRICE_PERIODS,
	formatPlanPrice,
	type PlanPriceKey,
} from '@/lib/plan-prices';

type PriceDraft = {
	plan: PlanPriceKey;
	price: string;
	label: string;
	period: string;
	savedPrice: number;
};

const PLAN_DESCRIPTIONS: Record<PlanPriceKey, string> = {
	starter: 'Paket gratis untuk mulai mencatat pembukuan.',
	pro: 'Paket berbayar dengan akuntansi, pajak, dan payroll.',
	enterprise: 'Paket penuh untuk operasional yang lebih besar.',
	pencari_akuntan: 'Langganan Pencari Akuntan untuk mengirim permintaan CV.',
};

/**
 * Panel pengaturan harga paket langganan untuk Admin Pusat. Harga yang
 * disimpan dipakai pada halaman /plans, nominal unik pembayaran manual,
 * instruksi pembayaran, dan verifikasi.
 */
export function PlanPricesPanel() {
	const [prices, setPrices] = useState<CentralAdminPlanPrice[] | null>(null);
	const [drafts, setDrafts] = useState<PriceDraft[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [busyPlan, setBusyPlan] = useState<string | null>(null);

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		try {
			const data = await fetchCentralAdminPlanPrices();
			setPrices(data);
			setDrafts(
				PLAN_PRICE_ORDER.map(plan => {
					const found = data.find(item => item.plan === plan);
					const price = found?.price ?? 0;
					return {
						plan,
						price: String(price),
						label: PLAN_PRICE_LABELS[plan],
						period: PLAN_PRICE_PERIODS[plan],
						savedPrice: price,
					};
				}),
			);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				setError(err.message);
			} else {
				setError('Gagal memuat harga paket. Periksa koneksi lalu coba lagi.');
			}
			setPrices([]);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	function updateDraft(plan: PlanPriceKey, value: string) {
		const digits = value.replace(/[^\d]/g, '');
		setDrafts(prev => prev.map(draft => (draft.plan === plan ? { ...draft, price: digits } : draft)));
	}

	function isDirty(draft: PriceDraft): boolean {
		return Number(draft.price) !== draft.savedPrice;
	}

	async function handleSave(draft: PriceDraft) {
		const priceNum = Number(draft.price);
		if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 100000000) {
			toast.error('Harga harus antara 0 dan 100.000.000.');
			return;
		}
		setBusyPlan(draft.plan);
		try {
			const { price: updated } = await updateCentralAdminPlanPrice(draft.plan, Math.floor(priceNum));
			setDrafts(prev =>
				prev.map(item =>
					item.plan === draft.plan
						? { ...item, price: String(updated.price), savedPrice: updated.price }
						: item,
				),
			);
			setPrices(prev =>
				prev?.map(item => (item.plan === draft.plan ? { ...item, price: updated.price } : item)) ?? null,
			);
			toast.success(`Harga ${draft.label} diperbarui menjadi ${formatPlanPrice(updated.price)} per bulan.`);
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal memperbarui harga paket.',
			);
		} finally {
			setBusyPlan(null);
		}
	}

	const hasDirty = drafts.some(isDirty);

	return (
		<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
						<Tags className="size-5 text-primary" strokeWidth={2} />
						Harga Paket Langganan
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Atur harga paket Starter, Pro, Enterprise, dan Pencari Akuntan. Harga ini
						dipakai pada halaman harga, nominal unik pembayaran manual, dan verifikasi.
					</p>
				</div>
				<button
					type="button"
					onClick={() => void load(true)}
					disabled={isRefreshing}
					className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
				>
					{isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
					Muat ulang
				</button>
			</div>

			{error ? (
				<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
					{error}
				</p>
			) : null}

			{isLoading ? (
				<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat harga paket…
				</div>
			) : drafts.length === 0 ? (
				<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
					Belum ada harga paket tersimpan.
				</p>
			) : (
				<div className="grid gap-3 md:grid-cols-2">
					{drafts.map(draft => {
						const dirty = isDirty(draft);
						const previewPrice = Number(draft.price) || 0;
						return (
							<article
								key={draft.plan}
								className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
							>
								<div className="flex items-start justify-between gap-2">
									<div>
										<p className="text-sm font-bold text-foreground">{draft.label}</p>
										<p className="text-xs text-muted-foreground">{PLAN_DESCRIPTIONS[draft.plan]}</p>
									</div>
									<span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
										{draft.period}
									</span>
								</div>

								<label className="flex flex-col gap-1">
									<span className="text-xs font-semibold text-muted-foreground">
										Harga (Rupiah)
									</span>
									<div className="flex items-center gap-2">
										<span className="text-sm font-semibold text-muted-foreground">Rp</span>
										<input
											type="text"
											inputMode="numeric"
											value={Number(draft.price).toLocaleString('id-ID')}
											onChange={event => updateDraft(draft.plan, event.target.value)}
											placeholder="0"
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold tabular-nums outline-none ring-primary/20 focus:ring-2"
										/>
									</div>
									<span className="text-[11px] text-muted-foreground">
										Pratinjau: <span className="font-semibold text-foreground">{formatPlanPrice(previewPrice)}</span>
										{draft.plan === 'starter' ? ' (0 = gratis)' : ''}
									</span>
								</label>

								<button
									type="button"
									onClick={() => void handleSave(draft)}
									disabled={!dirty || busyPlan === draft.plan}
									className={cn(
										'inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold transition-colors disabled:opacity-50',
										dirty
											? 'bg-primary text-primary-foreground hover:bg-primary/90'
											: 'border border-border bg-background text-muted-foreground',
									)}
								>
									{busyPlan === draft.plan ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<Save className="size-3.5" strokeWidth={2} />
									)}
									{dirty ? 'Simpan harga' : 'Tersimpan'}
								</button>
							</article>
						);
					})}
				</div>
			)}

			{hasDirty ? (
				<p className="text-xs text-muted-foreground">
					Ada perubahan yang belum disimpan. Tekan "Simpan harga" pada paket terkait.
				</p>
			) : null}
		</section>
	);
}
