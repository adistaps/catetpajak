import { useCallback, useEffect, useRef, useState } from 'react';
import {
	Loader2,
	Megaphone,
	Plus,
	RefreshCw,
	Trash2,
	Upload,
	ImageUp,
} from 'lucide-react';
import { toast } from 'sonner';
import {
	CentralAdminApiError,
	createCentralAdminPromo,
	deleteCentralAdminPromo,
	fetchCentralAdminPromos,
	updateCentralAdminPromo,
	type CentralAdminPromo,
} from '@/lib/central-admin';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

/**
 * Menormalisasi tautan promo menjadi URL http/https absolut sebelum disimpan,
 * sehingga gambar di dasbor selalu bisa diklik. Tautan tanpa skema (mis.
 * "www.contoh.com") diberi awalan "https://"; skema lain (javascript:, data:,
 * dsb.) dikosongkan demi keamanan.
 */
function normalizeLink(link: string): string {
	const trimmed = (link ?? '').trim();
	if (!trimmed) return '';
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
	return `https://${trimmed}`;
}

function validateFile(file: File): string | null {
	if (file.size > 5 * 1024 * 1024) return 'Ukuran gambar maksimal 5MB.';
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
		return 'Format gambar harus JPG, PNG, atau WEBP.';
	}
	return null;
}

export function PromosPanel() {
	const [promos, setPromos] = useState<CentralAdminPromo[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [busyId, setBusyId] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [draftFile, setDraftFile] = useState<File | null>(null);
	const [draftPreview, setDraftPreview] = useState('');
	const [draftLink, setDraftLink] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);
	const replaceInputRef = useRef<HTMLInputElement>(null);
	const replaceTargetRef = useRef<string | null>(null);

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		try {
			const data = await fetchCentralAdminPromos();
			setPromos(data);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				setError(err.message);
			} else {
				setError('Gagal memuat daftar promo. Periksa koneksi lalu coba lagi.');
			}
			setPromos([]);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	function resetDraft() {
		setDraftFile(null);
		setDraftPreview('');
		setDraftLink('');
		if (fileInputRef.current) fileInputRef.current.value = '';
	}

	function handlePickFile(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		const invalid = validateFile(file);
		if (invalid) {
			toast.error(invalid);
			if (fileInputRef.current) fileInputRef.current.value = '';
			return;
		}
		setDraftFile(file);
		setDraftPreview(URL.createObjectURL(file));
	}

	async function handleUpload() {
		if (!draftFile) {
			toast.error('Pilih gambar promo terlebih dahulu.');
			return;
		}
		setUploading(true);
		try {
			const { promo } = await createCentralAdminPromo({
				image: draftFile,
				link: normalizeLink(draftLink),
			});
			// Promo otomatis terbit — tampilkan paling atas (terbaru).
			setPromos((prev) => [promo, ...(prev ?? [])]);
			toast.success('Gambar promo diunggah dan dipublikasikan.');
			resetDraft();
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal mengunggah promo.');
		} finally {
			setUploading(false);
		}
	}

	function startReplace(promo: CentralAdminPromo) {
		replaceTargetRef.current = promo.id;
		if (replaceInputRef.current) {
			replaceInputRef.current.value = '';
			replaceInputRef.current.click();
		}
	}

	async function handleReplaceFile(event: React.ChangeEvent<HTMLInputElement>) {
		const id = replaceTargetRef.current;
		const file = event.target.files?.[0];
		if (replaceInputRef.current) replaceInputRef.current.value = '';
		if (!id) return;
		if (!file) return;
		const invalid = validateFile(file);
		if (invalid) {
			toast.error(invalid);
			return;
		}
		setBusyId(id);
		try {
			const { promo: updated } = await updateCentralAdminPromo(id, { image: file });
			setPromos((prev) => prev?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
			toast.success('Gambar promo diperbarui.');
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal memperbarui gambar.');
		} finally {
			setBusyId(null);
			replaceTargetRef.current = null;
		}
	}

	async function handleSaveLink(promo: CentralAdminPromo, value: string) {
		const normalized = normalizeLink(value);
		if (normalized === (promo.link ?? '')) return;
		setBusyId(promo.id);
		try {
			const { promo: updated } = await updateCentralAdminPromo(promo.id, { link: normalized });
			setPromos((prev) => prev?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
			toast.success('Tautan promo disimpan.');
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal menyimpan tautan.');
		} finally {
			setBusyId(null);
		}
	}

	async function handleDelete(promo: CentralAdminPromo) {
		if (!window.confirm('Hapus gambar promo ini? Tindakan ini tidak dapat dibatalkan.')) {
			return;
		}
		setBusyId(promo.id);
		try {
			await deleteCentralAdminPromo(promo.id);
			setPromos((prev) => prev?.filter((item) => item.id !== promo.id) ?? null);
			toast.success('Promo dihapus.');
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal menghapus promo.');
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<Megaphone className="size-7 text-primary" strokeWidth={2} />
						Promo Terbaru
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Cukup unggah gambar promo — setiap gambar otomatis dipublikasikan dan
						tampil di dasbor aplikasi. Gunakan tombol “Ganti” pada setiap kartu untuk
						mengganti gambar yang sudah ada.
					</p>
				</div>
				<button
					type="button"
					onClick={() => void load(true)}
					disabled={isRefreshing}
					className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
				>
					{isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
					Muat ulang
				</button>
			</header>

			<section className="grid grid-cols-2 gap-3">
				{[
					{ label: 'Total gambar', value: promos?.length ?? 0 },
					{ label: 'Terbit', value: promos?.filter((p) => p.published).length ?? 0 },
				].map((stat) => (
					<div
						key={stat.label}
						className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-soft-sm"
					>
						<span className="text-2xl font-extrabold tracking-tight">{stat.value}</span>
						<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							{stat.label}
						</span>
					</div>
				))}
			</section>

			{error ? (
				<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
					{error}
				</p>
			) : null}

			<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
				<div className="flex items-center justify-between">
					<h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
						<Upload className="size-5 text-primary" />
						Unggah gambar promo
					</h2>
				</div>

				<label
					htmlFor="promo-image"
					className="group relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:border-primary/60 hover:bg-accent/40"
				>
					{draftPreview ? (
						<img
							src={draftPreview}
							alt="Pratinjau gambar promo"
							className="absolute inset-0 size-full object-contain"
						/>
					) : (
						<>
							<span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
								<Upload className="size-6" />
							</span>
							<div>
								<p className="text-sm font-semibold text-foreground">
									Klik untuk memilih gambar
								</p>
								<p className="mt-0.5 text-xs text-muted-foreground">
									JPG, PNG, atau WEBP. Maksimal 5MB.
								</p>
							</div>
						</>
					)}
					<input
						ref={fileInputRef}
						id="promo-image"
						type="file"
						accept={ACCEPTED_TYPES}
						onChange={handlePickFile}
						className="sr-only"
					/>
				</label>

				<div className="flex flex-col gap-1.5">
					<label htmlFor="promo-link" className="text-xs font-semibold text-foreground">
						Tautan (opsional)
					</label>
					<input
						id="promo-link"
						type="url"
						value={draftLink}
						onChange={(e) => setDraftLink(e.target.value)}
						placeholder="https://contoh.com/promo"
						className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
					/>
					<p className="text-[11px] text-muted-foreground">
						Bila diisi, gambar promo di dasbor akan mengarah ke tautan ini saat diklik.
					</p>
				</div>

				<div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
					{draftFile ? (
						<button
							type="button"
							onClick={resetDraft}
							disabled={uploading}
							className="rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
						>
							Batal
						</button>
					) : null}
					<button
						type="button"
						onClick={() => void handleUpload()}
						disabled={uploading || !draftFile}
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
					>
						{uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
						{uploading ? 'Mengunggah…' : 'Unggah promo'}
					</button>
				</div>
			</section>

			{isLoading ? (
				<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat daftar promo…
				</div>
			) : promos && promos.length === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-background px-5 py-12 text-center">
					<Megaphone className="size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						Belum ada gambar promo. Unggah gambar pertama di atas.
					</p>
				</div>
			) : (
				<div className="grid gap-3 sm:grid-cols-2">
					{promos?.map((promo) => (
						<div
							key={promo.id}
							className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm"
						>
							<div className="relative aspect-video w-full bg-secondary">
								{promo.imageUrl ? (
									<img
										src={promo.imageUrl}
										alt="Gambar promo"
										className="absolute inset-0 size-full object-contain"
									/>
								) : (
									<div className="flex size-full items-center justify-center text-xs text-muted-foreground">
										Tanpa gambar
									</div>
								)}
								<span className="absolute left-2 top-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 shadow-sm">
									Terbit
								</span>
							</div>
							<div className="flex flex-col gap-1 px-3 pt-1">
								<label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
									Tautan gambar
								</label>
								<input
									type="url"
									defaultValue={promo.link ?? ''}
									onBlur={(e) => void handleSaveLink(promo, e.target.value)}
									placeholder="https://contoh.com/promo"
									className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-primary/60"
								/>
							</div>
							<div className="flex flex-wrap items-center justify-end gap-1.5 px-3 pb-3">
								<button
									type="button"
									onClick={() => startReplace(promo)}
									disabled={busyId === promo.id}
									className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
								>
									{busyId === promo.id ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<ImageUp className="size-3.5" />
									)}
									Ganti
								</button>
								<button
									type="button"
									onClick={() => void handleDelete(promo)}
									disabled={busyId === promo.id}
									className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-background px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60"
								>
									<Trash2 className="size-3.5" />
								</button>
							</div>
						</div>
					))}
				</div>
			)}

			<input
				ref={replaceInputRef}
				type="file"
				accept={ACCEPTED_TYPES}
				onChange={(e) => void handleReplaceFile(e)}
				className="sr-only"
			/>
		</div>
	);
}
