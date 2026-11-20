import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Info, Loader2, Percent, RotateCcw, Save, Wallet } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { toast } from 'sonner';
import type { Company } from '@/lib/accounting';
import { formatRupiah, formatDate, todayIso } from '@/lib/accounting';
import { addDaysIso, computePaymentTerms } from '@/lib/payment-terms';
import {
	DEFAULT_PAYMENT_TERMS,
	getOrCreatePaymentTermsSettings,
	savePaymentTermsSettings,
	type PaymentTermsSettings,
} from '@/lib/payment-terms-settings';
import { Switch } from '@/components/ui/switch';

interface PaymentTermsSettingsCardProps {
	company: Company;
	ownerId: string;
	layout?: 'card' | 'drawer';
	onClose?: () => void;
}

const SAMPLE_TOTAL = 1_000_000;

/**
 * Kartu pengaturan syarat pembayaran per perusahaan. Pengguna berwenang dapat
 * mengatur sendiri termin (persentase diskon, hari masa diskon, hari jatuh
 * tempo). Nilai default mengikuti 2/3 N/30. Pratinjau hidup menampilkan notasi,
 * tanggal batas diskon, tanggal jatuh tempo, serta nominal diskon & jumlah
 * bayar atas contoh tagihan.
 */
export function PaymentTermsSettingsCard({
	company,
	ownerId,
	layout = 'card',
	onClose,
}: PaymentTermsSettingsCardProps) {
	const isDrawer = layout === 'drawer';
	const [settings, setSettings] = useState<PaymentTermsSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [discountRate, setDiscountRate] = useState(DEFAULT_PAYMENT_TERMS.discount_rate);
	const [discountDays, setDiscountDays] = useState(DEFAULT_PAYMENT_TERMS.discount_days);
	const [netDays, setNetDays] = useState(DEFAULT_PAYMENT_TERMS.net_days);
	const [isActive, setIsActive] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		getOrCreatePaymentTermsSettings(company.id, ownerId)
			.then(record => {
				if (cancelled) return;
				setSettings(record);
				setDiscountRate(Number(record.discount_rate) || 0);
				setDiscountDays(Number(record.discount_days) || 0);
				setNetDays(Number(record.net_days) || 0);
				setIsActive(record.is_active !== false);
			})
			.catch(() => {
				if (!cancelled) {
					setSettings(null);
					setIsActive(true);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [company.id, ownerId]);

	const notation = useMemo(
		() => `${discountRate || 0}/${discountDays || 0} N/${netDays || 0}`,
		[discountRate, discountDays, netDays],
	);

	const today = todayIso();
	const preview = useMemo(
		() => computePaymentTerms(notation, today, SAMPLE_TOTAL, today),
		[notation, today],
	);

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		const rate = Number(discountRate) || 0;
		const disc = Number(discountDays) || 0;
		const net = Number(netDays) || 0;
		if (rate < 0 || rate > 100) {
			setError('Persentase diskon harus antara 0 dan 100.');
			return;
		}
		if (disc < 0 || net < 0) {
			setError('Jumlah hari tidak boleh negatif.');
			return;
		}
		if (rate > 0 && disc > net) {
			setError('Jumlah hari masa diskon tidak boleh melebihi hari jatuh tempo.');
			return;
		}
		if (!settings) {
			setError('Pengaturan belum dimuat. Muat ulang halaman lalu coba lagi.');
			return;
		}
		setSaving(true);
		try {
			const updated = await savePaymentTermsSettings(settings.id, {
				discount_rate: rate,
				discount_days: disc,
				net_days: net,
				is_active: isActive,
			});
			setSettings(updated);
			toast.success('Pengaturan syarat pembayaran tersimpan.');
			onClose?.();
		} catch {
			setError('Gagal menyimpan pengaturan. Periksa kembali isian Anda.');
		} finally {
			setSaving(false);
		}
	};

	const handleReset = () => {
		setDiscountRate(DEFAULT_PAYMENT_TERMS.discount_rate);
		setDiscountDays(DEFAULT_PAYMENT_TERMS.discount_days);
		setNetDays(DEFAULT_PAYMENT_TERMS.net_days);
		setIsActive(true);
	};

	const previewPanel = (
		<div className="flex min-h-[280px] flex-col rounded-xl border border-dashed border-border bg-white p-6">
			<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
			<p className="mt-3 text-2xl font-extrabold tracking-tight text-primary">
				{discountRate > 0 ? notation : 'Tanpa diskon (bayar penuh)'}
			</p>
			{preview ? (
				<dl className="mt-4 grid gap-3 text-sm">
					<div>
						<dt className="text-xs text-muted-foreground">Diskon</dt>
						<dd className="font-bold">
							{preview.parsed.discountRate}% bila dibayar ≤ {formatDate(preview.discountDeadline)}
						</dd>
					</div>
					<div className="flex items-center gap-1.5">
						<CalendarClock className="size-3.5 text-primary" />
						<dt className="text-muted-foreground">Jatuh tempo</dt>
						<dd className="font-bold">{formatDate(preview.dueDate)}</dd>
					</div>
					<div className="flex items-center gap-1.5">
						<Percent className="size-3.5 text-primary" />
						<dt className="text-muted-foreground">Contoh diskon (Rp1.000.000)</dt>
						<dd className="font-bold text-emerald-600">{formatRupiah(preview.discountAmount)}</dd>
					</div>
					<div className="flex items-center gap-1.5">
						<Wallet className="size-3.5 text-primary" />
						<dt className="text-muted-foreground">Bayar jika memenuhi syarat</dt>
						<dd className="font-extrabold text-primary">{formatRupiah(preview.payableWithDiscount)}</dd>
					</div>
				</dl>
			) : (
				<p className="mt-3 text-sm text-muted-foreground">
					Contoh jatuh tempo: {formatDate(addDaysIso(today, Number(netDays) || 0))}.
				</p>
			)}
			<p className="mt-4 text-xs text-muted-foreground">
				Diskon rupiah terhitung otomatis dan hanya berlaku dalam batas waktu. Setelah lewat, tagihan dibayar penuh.
			</p>
		</div>
	);

	const fields = (
		<div className="flex flex-col gap-4">
			{!isDrawer ? null : (
				<p className="text-sm text-muted-foreground">
					Atur termin default untuk invoice baru. Berlaku sebagai pengisi awal — invoice lama tidak berubah.
				</p>
			)}
			<div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold">
				<span className="inline-flex items-center gap-1.5">
					Syarat aktif
					<HoverCard openDelay={120} closeDelay={80}>
						<HoverCardTrigger asChild>
							<button
								type="button"
								aria-label="Pratinjau syarat pembayaran"
								className="inline-flex size-7 items-center justify-center rounded-full text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
							>
								<Info className="size-4" />
							</button>
						</HoverCardTrigger>
						<HoverCardContent
							align="start"
							side="bottom"
							className="z-[80] w-[min(22rem,calc(100vw-2rem))] border-0 bg-white p-0 shadow-none"
						>
							{previewPanel}
						</HoverCardContent>
					</HoverCard>
				</span>
				<span className="flex items-center gap-2 text-xs text-muted-foreground">
					{isActive ? 'Aktif' : 'Nonaktif'}
					<Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Aktifkan syarat pembayaran" />
				</span>
			</div>
			<label className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">Persentase diskon (%)</span>
				<input
					type="number"
					min="0"
					max="100"
					step="0.5"
					value={discountRate}
					onChange={e => setDiscountRate(Number(e.target.value))}
					className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
				/>
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">Hari masa diskon</span>
				<input
					type="number"
					min="0"
					value={discountDays}
					onChange={e => setDiscountDays(Number(e.target.value))}
					className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
				/>
			</label>
			<label className="flex flex-col gap-1.5">
				<span className="text-xs font-semibold">Hari jatuh tempo</span>
				<input
					type="number"
					min="0"
					value={netDays}
					onChange={e => setNetDays(Number(e.target.value))}
					className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
				/>
			</label>
			<button
				type="button"
				onClick={handleReset}
				className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
			>
				<RotateCcw className="size-3.5" /> Reset ke 2/3 N/30
			</button>
		</div>
	);

	const footer = (
		<div className={isDrawer ? 'flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4' : 'flex flex-wrap items-center gap-3'}>
			{error ? <p className="mr-auto text-sm font-semibold text-destructive">{error}</p> : null}
			{isDrawer ? (
				<button
					type="button"
					onClick={onClose}
					className="min-h-11 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
				>
					Batalkan
				</button>
			) : null}
			<button
				type="submit"
				disabled={saving || loading}
				className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
			>
				{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
				{saving ? 'Menyimpan…' : 'Simpan'}
			</button>
		</div>
	);

	if (loading && isDrawer) {
		return (
			<p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" /> Memuat pengaturan…
			</p>
		);
	}

	if (isDrawer) {
		return (
			<form onSubmit={handleSave} className="flex h-full min-h-0 flex-col">
				<div className="min-h-0 flex-1 overflow-y-auto p-5">{fields}</div>
				{footer}
			</form>
		);
	}

	return (
		<section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
			<header>
				<h2 className="text-lg font-extrabold tracking-tight">Syarat Pembayaran</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Atur termin default untuk invoice baru perusahaan ini. Invoice lama tidak berubah.
				</p>
			</header>
			{loading ? (
				<p className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat pengaturan…
				</p>
			) : (
				<form onSubmit={handleSave} className="flex flex-col gap-5">
					{fields}
					{footer}
				</form>
			)}
		</section>
	);
}
