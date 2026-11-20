import { useEffect, useState } from 'react';
import { Boxes, Info, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { Company } from '@/lib/accounting';
import { Switch } from '@/components/ui/switch';
import {
	DEFAULT_INVENTORY_SETTINGS,
	INVENTORY_METHOD_DESCRIPTIONS,
	INVENTORY_METHOD_LABELS,
	INVENTORY_METHOD_OPTIONS,
	getOrCreateInventorySettings,
	saveInventorySettings,
	type InventoryMethod,
	type InventorySettings,
} from '@/lib/inventory-settings';
import { useLanguage } from '@/hooks/use-language';

interface InventorySettingsCardProps {
	company: Company;
	ownerId: string;
}

/**
 * Kartu pengaturan metode persediaan per perusahaan. Pengguna memilih metode
 * penilaian persediaan (FIFO, Average, Reducing Balance, Produksi per Unit)
 * yang dipakai untuk menghitung nilai persediaan dan HPP/jurnal COGS pada
 * produk yang monitor stoknya aktif. Tidak mengubah transaksi atau jurnal lama.
 */
export function InventorySettingsCard({ company, ownerId }: InventorySettingsCardProps) {
	const { t } = useLanguage();
	const [settings, setSettings] = useState<InventorySettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [method, setMethod] = useState<InventoryMethod>(DEFAULT_INVENTORY_SETTINGS.method);
	const [isActive, setIsActive] = useState(DEFAULT_INVENTORY_SETTINGS.is_active);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		getOrCreateInventorySettings(company.id, ownerId)
			.then(record => {
				if (cancelled) return;
				setSettings(record);
				setMethod(record.method || DEFAULT_INVENTORY_SETTINGS.method);
				setIsActive(record.is_active !== false);
			})
			.catch(() => {
				if (!cancelled) {
					setSettings(null);
					setIsActive(DEFAULT_INVENTORY_SETTINGS.is_active);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [company.id, ownerId]);

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		if (!settings) {
			setError(t('inventory.not_loaded'));
			return;
		}
		setSaving(true);
		try {
			const updated = await saveInventorySettings(settings.id, {
				method,
				is_active: isActive,
			});
			setSettings(updated);
			toast.success(t('inventory.saved'));
		} catch {
			setError(t('inventory.save_failed'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-lg font-extrabold tracking-tight">{t('inventory.title')}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t('inventory.desc')}
					</p>
				</div>
				<label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
					<Switch
						checked={isActive}
						onCheckedChange={setIsActive}
						aria-label={t('inventory.toggle_aria')}
					/>
					{isActive ? t('inventory.active') : t('inventory.inactive')}
				</label>
			</header>

			{loading ? (
				<p className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> {t('inventory.loading')}
				</p>
			) : (
				<form onSubmit={handleSave} className="flex flex-col gap-5">
					<div className="flex flex-col gap-2">
						<span className="text-xs font-semibold text-foreground">{t('inventory.method_label')}</span>
						<div className="grid gap-2 sm:grid-cols-2">
							{INVENTORY_METHOD_OPTIONS.map(value => {
								const selected = method === value;
								return (
									<label
										key={value}
										className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3.5 transition-colors ${
											selected
												? 'border-primary bg-primary/5'
												: 'border-border bg-background hover:bg-accent/50'
										}`}
									>
										<input
											type="radio"
											name="inventory-method"
											value={value}
											checked={selected}
											onChange={() => setMethod(value)}
											className="mt-0.5 size-4 accent-primary"
										/>
										<span className="flex flex-col gap-0.5">
											<span className="text-sm font-bold text-foreground">
												{INVENTORY_METHOD_LABELS[value]}
											</span>
											<span className="text-xs text-muted-foreground">
												{INVENTORY_METHOD_DESCRIPTIONS[value]}
											</span>
										</span>
									</label>
								);
							})}
						</div>
					</div>

					<div className="flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
						<Info className="mt-0.5 size-4 shrink-0 text-primary" />
						<span>
							{t('inventory.note')}
						</span>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						{error ? <p className="mr-auto text-sm font-semibold text-destructive">{error}</p> : null}
						<button
							type="submit"
							disabled={saving}
							className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
						>
							{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
							{saving ? t('company.saving') : t('common.save')}
						</button>
					</div>
				</form>
			)}

			<div className="flex items-start gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
				<Boxes className="mt-0.5 size-4 shrink-0 text-primary" />
				<span>
					{t('inventory.footer')}
				</span>
			</div>
		</section>
	);
}
