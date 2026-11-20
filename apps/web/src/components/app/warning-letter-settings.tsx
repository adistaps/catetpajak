import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Info, Loader2, Mail, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { toast } from 'sonner';
import type { Company } from '@/lib/accounting';
import { formatRupiah, todayIso } from '@/lib/accounting';
import { addDaysIso } from '@/lib/payment-terms';
import {
	DEFAULT_WARNING_LETTER,
	SAMPLE_WARNING_TIERS,
	computeWarningLetter,
	getOrCreateWarningLetterSettings,
	saveWarningLetterSettings,
	type WarningLetterSettings,
	type WarningLetterTier,
} from '@/lib/warning-letter-settings';
import { Switch } from '@/components/ui/switch';

interface WarningLetterSettingsCardProps {
	company: Company;
	ownerId: string;
	layout?: 'card' | 'drawer';
	onClose?: () => void;
}

const SAMPLE_TOTAL = 1_000_000;

function emptyTier(): WarningLetterTier {
	return { from_day: 1, to_day: 7, level: 'SP1', title: '', message: '' };
}

/**
 * Kartu pengaturan surat peringatan bertingkat per perusahaan. Pengguna
 * berwenang menambahkan beberapa rentang keterlambatan hari (mis. hari ke-1–7
 * SP1, ke-8–14 SP2, ke-15–30 SP3), masing-masing dengan level, judul, dan
 * pesan surat. Surat peringatan ditentukan berdasarkan rentang yang cocok;
 * tidak mengubah invoice atau riwayat pembayaran lama.
 */
export function WarningLetterSettingsCard({
	company,
	ownerId,
	layout = 'card',
	onClose,
}: WarningLetterSettingsCardProps) {
	const isDrawer = layout === 'drawer';
	const [settings, setSettings] = useState<WarningLetterSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [tiers, setTiers] = useState<WarningLetterTier[]>(DEFAULT_WARNING_LETTER.tiers);
	const [isActive, setIsActive] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		getOrCreateWarningLetterSettings(company.id, ownerId)
			.then(record => {
				if (cancelled) return;
				setSettings(record);
				const parsed =
					record.tiers && Array.isArray(record.tiers) && record.tiers.length > 0
						? record.tiers.map(t => ({ ...t }))
						: [];
				setTiers(parsed);
				setIsActive(record.is_active === true);
			})
			.catch(() => {
				if (!cancelled) {
					setSettings(null);
					setIsActive(false);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [company.id, ownerId]);

	// Contoh invoice jatuh tempo 10 hari lalu agar surat peringatan tampak di pratinjau.
	const sampleDueDate = useMemo(() => addDaysIso(todayIso(), -10), []);

	const preview = useMemo(() => {
		const sampleSettings: WarningLetterSettings | null = settings
			? { ...settings, tiers, is_active: isActive }
			: ({
					id: '',
					company: company.id,
					tiers,
					is_active: isActive,
					owner: ownerId,
					created: '',
					updated: '',
				} as WarningLetterSettings);
		return computeWarningLetter(sampleSettings, {
			total: SAMPLE_TOTAL,
			payment_terms: '2/3 N/30',
			date: sampleDueDate,
			paid_amount: 0,
		});
	}, [settings, tiers, isActive, company.id, ownerId, sampleDueDate]);

	const updateTier = (index: number, patch: Partial<WarningLetterTier>) => {
		setTiers(prev => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
	};
	const addTier = () => {
		const lastTo = tiers.length > 0 ? Number(tiers[tiers.length - 1].to_day) || 0 : 0;
		const nextLevel = `SP${tiers.length + 1}`;
		setTiers(prev => [
			...prev,
			{ from_day: lastTo + 1, to_day: lastTo + 7, level: nextLevel, title: '', message: '' },
		]);
	};
	const removeTier = (index: number) => {
		setTiers(prev => prev.filter((_, i) => i !== index));
	};

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		const cleaned: WarningLetterTier[] = tiers.map(t => ({
			from_day: Math.max(1, Math.round(Number(t.from_day) || 0)),
			to_day: Math.max(
				Math.round(Number(t.to_day) || 0),
				Math.max(1, Math.round(Number(t.from_day) || 0)),
			),
			level: (t.level || '').trim().slice(0, 40),
			title: (t.title || '').trim().slice(0, 160),
			message: (t.message || '').trim().slice(0, 2000),
		}));
		if (isActive && cleaned.length === 0) {
			setError('Tambahkan minimal satu tahapan surat peringatan saat fitur diaktifkan.');
			return;
		}
		for (const t of cleaned) {
			if (!t.level) {
				setError('Level surat (mis. SP1) wajib diisi untuk setiap tahapan.');
				return;
			}
			if (!t.title) {
				setError('Judul surat wajib diisi untuk setiap tahapan.');
				return;
			}
			if (!t.message) {
				setError('Pesan surat wajib diisi untuk setiap tahapan.');
				return;
			}
			if (t.to_day < t.from_day) {
				setError('Hari akhir rentang tidak boleh kurang dari hari awal.');
				return;
			}
		}
		// Cek tumpang tindih rentang.
		const sorted = [...cleaned].sort((a, b) => a.from_day - b.from_day);
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i].from_day <= sorted[i - 1].to_day) {
				setError('Rentang hari tidak boleh tumpang tindih.');
				return;
			}
		}
		if (!settings) {
			setError('Pengaturan belum dimuat. Muat ulang halaman lalu coba lagi.');
			return;
		}
		setSaving(true);
		try {
			const updated = await saveWarningLetterSettings(settings.id, {
				tiers: cleaned,
				is_active: isActive,
			});
			setSettings(updated);
			setTiers(
				updated.tiers && Array.isArray(updated.tiers)
					? updated.tiers.map(t => ({ ...t }))
					: [],
			);
			toast.success('Pengaturan surat peringatan tersimpan.');
			onClose?.();
		} catch {
			setError('Gagal menyimpan pengaturan. Periksa kembali isian Anda.');
		} finally {
			setSaving(false);
		}
	};

	const handleReset = () => {
		setTiers(SAMPLE_WARNING_TIERS.map(t => ({ ...t })));
		setIsActive(false);
	};

	const previewPanel = (
		<div className="flex min-h-[280px] flex-col rounded-xl border border-dashed border-border bg-white p-6">
			<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Pratinjau surat peringatan
			</p>
			<p className="mt-1 text-2xl font-extrabold tracking-tight text-primary">
				{isActive && preview && preview.appliedTier
					? preview.appliedTier.level || 'Surat peringatan'
					: 'Surat peringatan nonaktif'}
			</p>
			{preview ? (
				<dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
					<div className="flex items-center gap-1.5">
						<AlertTriangle className="size-3.5 text-amber-500" />
						<dt className="text-muted-foreground">Contoh total (Rp1.000.000):</dt>
						<dd className="font-bold text-foreground">{formatRupiah(SAMPLE_TOTAL)}</dd>
					</div>
					<div className="flex items-center gap-1.5">
						<AlertTriangle className="size-3.5 text-amber-500" />
						<dt className="text-muted-foreground">Hari terlambat:</dt>
						<dd className="font-bold text-foreground">{preview.daysOverdue} hari</dd>
					</div>
					{preview.appliedTier ? (
						<>
							<div className="flex items-center gap-1.5">
								<FileText className="size-3.5 text-primary" />
								<dt className="text-muted-foreground">Tahapan:</dt>
								<dd className="font-bold text-primary">
									{preview.appliedTier.level || '—'} (hari ke-
									{preview.appliedTier.from_day}–{preview.appliedTier.to_day})
								</dd>
							</div>
							<div className="flex items-center gap-1.5">
								<Mail className="size-3.5 text-primary" />
								<dt className="text-muted-foreground">Judul:</dt>
								<dd className="font-bold text-foreground">
									{preview.appliedTier.title || '—'}
								</dd>
							</div>
						</>
					) : null}
				</dl>
			) : null}
			{preview && preview.appliedTier && preview.appliedTier.message ? (
				<p className="mt-3 rounded-lg bg-background/70 p-3 text-xs leading-relaxed text-muted-foreground">
					{preview.appliedTier.message}
				</p>
			) : null}
			<p className="mt-2 text-[10px] text-muted-foreground">
				Pratinjau memakai contoh invoice Rp1.000.000 yang jatuh tempo 10 hari lalu.
				Tahapan ditentukan berdasarkan tanggal jatuh tempo invoice.
			</p>
		</div>
	);

	const previewTrigger = (
		<HoverCard openDelay={120} closeDelay={80}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label="Pratinjau surat peringatan"
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
	);

	if (loading && isDrawer) {
		return (
			<p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" /> Memuat pengaturan…
			</p>
		);
	}

	return (
		<section
			className={
				isDrawer
					? 'flex h-full min-h-0 flex-col'
					: 'flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-soft'
			}
		>
			{isDrawer ? null : (
				<header className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className="text-lg font-extrabold tracking-tight">Surat Peringatan</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Atur tahapan surat peringatan (SP) untuk invoice yang melewati jatuh tempo. Tahapan
							ditentukan berdasarkan rentang hari keterlambatan dan tidak mengubah invoice lama.
						</p>
					</div>
					<label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
						{previewTrigger}
						<Switch
							checked={isActive}
							onCheckedChange={setIsActive}
							aria-label="Aktifkan surat peringatan"
						/>
						{isActive ? 'Aktif' : 'Nonaktif'}
					</label>
				</header>
			)}

			{loading ? (
				<p className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat pengaturan…
				</p>
			) : (
				<form
					onSubmit={handleSave}
					className={isDrawer ? 'flex h-full min-h-0 flex-col' : 'flex flex-col gap-5'}
				>
					<div className={isDrawer ? 'min-h-0 flex-1 overflow-y-auto' : 'contents'}>
						<div className={isDrawer ? 'flex flex-col gap-4 p-5' : 'contents'}>
							{isDrawer ? (
								<>
									<p className="text-sm text-muted-foreground">
										Tambahkan rentang hari keterlambatan, lalu isi level (mis. SP1), judul, dan
										pesan surat. Perubahan baru berlaku setelah disimpan.
									</p>
									<label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold">
										<span className="inline-flex items-center gap-1.5">
											Surat peringatan aktif
											{previewTrigger}
										</span>
										<span className="flex items-center gap-2 text-xs text-muted-foreground">
											{isActive ? 'Aktif' : 'Nonaktif'}
											<Switch
												checked={isActive}
												onCheckedChange={setIsActive}
												aria-label="Aktifkan surat peringatan"
											/>
										</span>
									</label>
								</>
							) : null}
							<div className="flex flex-col gap-3">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-bold">Tahapan Surat</h3>
									<button
										type="button"
										onClick={addTier}
										className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-accent"
									>
										<Plus className="size-3.5" /> Tambah Tahapan
									</button>
								</div>

								{tiers.length === 0 ? (
									<p className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-6 text-center text-sm text-muted-foreground">
										Belum ada tahapan surat. Klik <span className="font-bold">Tambah Tahapan</span>{' '}
										untuk membuat surat peringatan bertingkat, mis. hari ke-1–7 SP1, hari ke-8–14
										SP2, hari ke-15–30 SP3.
									</p>
								) : (
									<div className="flex flex-col gap-3">
										{tiers.map((tier, index) => (
											<div
												key={index}
												className="rounded-xl border border-border bg-secondary/30 p-4"
											>
												<div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
													<label className="flex flex-col gap-1.5">
														<span className="text-xs font-semibold">Dari hari ke-</span>
														<input
															type="number"
															min="1"
															value={tier.from_day}
															onChange={e =>
																updateTier(index, { from_day: Number(e.target.value) })
															}
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
														/>
													</label>
													<label className="flex flex-col gap-1.5">
														<span className="text-xs font-semibold">Sampai hari ke-</span>
														<input
															type="number"
															min="1"
															value={tier.to_day}
															onChange={e =>
																updateTier(index, { to_day: Number(e.target.value) })
															}
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
														/>
													</label>
													<button
														type="button"
														onClick={() => removeTier(index)}
														aria-label="Hapus tahapan"
														className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
													>
														<Trash2 className="size-4" />
													</button>
												</div>
												<div className="mt-3 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
													<label className="flex flex-col gap-1.5">
														<span className="text-xs font-semibold">Level</span>
														<input
															type="text"
															maxLength={40}
															placeholder="SP1"
															value={tier.level}
															onChange={e => updateTier(index, { level: e.target.value })}
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
														/>
													</label>
													<label className="flex flex-col gap-1.5">
														<span className="text-xs font-semibold">Judul surat</span>
														<input
															type="text"
															maxLength={160}
															placeholder="Surat Peringatan I"
															value={tier.title}
															onChange={e => updateTier(index, { title: e.target.value })}
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
														/>
													</label>
												</div>
												<label className="mt-3 flex flex-col gap-1.5">
													<span className="text-xs font-semibold">Pesan surat</span>
													<textarea
														maxLength={2000}
														rows={3}
														placeholder="Isi pesan surat peringatan…"
														value={tier.message}
														onChange={e => updateTier(index, { message: e.target.value })}
														className="resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
													/>
												</label>
											</div>
										))}
									</div>
								)}
								<p className="text-[11px] text-muted-foreground">
									Contoh: hari ke-1 sampai 7 SP1 (peringatan awal); hari ke-8 sampai 14 SP2
									(peringatan kedua); hari ke-15 sampai 30 SP3 (peringatan akhir). Bila
									keterlambatan melebihi rentang tertinggi, tahapan tertinggi tetap berlaku.
								</p>
							</div>
						</div>
					</div>
					<div
						className={
							isDrawer
								? 'flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4'
								: 'flex flex-wrap items-center gap-3'
						}
					>
						{error ? (
							<p className="mr-auto text-sm font-semibold text-destructive">{error}</p>
						) : null}
						<button
							type="button"
							onClick={isDrawer ? onClose : handleReset}
							className={
								isDrawer
									? 'min-h-11 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:text-foreground'
									: 'inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground'
							}
						>
							{isDrawer ? (
								'Batalkan'
							) : (
								<>
									<RotateCcw className="size-4" /> Isi contoh
								</>
							)}
						</button>
						{isDrawer ? (
							<button
								type="button"
								onClick={handleReset}
								className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
							>
								Isi contoh
							</button>
						) : null}
						<button
							type="submit"
							disabled={saving}
							className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
						>
							{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
							{saving ? 'Menyimpan…' : 'Simpan'}
						</button>
					</div>
				</form>
			)}
		</section>
	);
}
