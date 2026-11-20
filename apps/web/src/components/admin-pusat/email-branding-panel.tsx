import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageUp, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	deleteEmailBranding,
	fetchEmailBranding,
	uploadEmailBranding,
	type EmailBranding,
} from '@/lib/central-admin';

const fieldClass =
	'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-2';
const labelClass = 'text-xs font-semibold text-muted-foreground';

/**
 * Panel gambar profil email untuk Admin Pusat. Mengelola logo yang tampil di
 * bagian atas email keluar Catet Pajak (undangan, atur kata sandi, email uji
 * coba SMTP). Gambar disimpan sebagai file publik agar dapat dimuat oleh
 * klien email penerima tanpa autentikasi.
 */
export function EmailBrandingPanel() {
	const [branding, setBranding] = useState<EmailBranding | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [removing, setRemoving] = useState(false);

	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [altText, setAltText] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		try {
			const data = await fetchEmailBranding();
			setBranding(data.branding);
			setAltText(data.branding?.altText ?? '');
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				setError(err.message);
			} else {
				setError('Gagal memuat gambar profil email. Periksa koneksi lalu coba lagi.');
			}
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	// Revoke object URLs to avoid leaking memory on each new selection.
	useEffect(() => {
		return () => {
			if (preview) URL.revokeObjectURL(preview);
		};
	}, [preview]);

	function handleSelect(selected: File | null) {
		if (!selected) {
			setFile(null);
			setPreview(null);
			return;
		}
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
			toast.error('Format gambar harus JPG, PNG, atau WEBP.');
			return;
		}
		if (selected.size > 2 * 1024 * 1024) {
			toast.error('Ukuran gambar maksimal 2MB.');
			return;
		}
		if (preview) URL.revokeObjectURL(preview);
		setFile(selected);
		setPreview(URL.createObjectURL(selected));
	}

	async function handleSave() {
		if (!file) {
			toast.error('Pilih file gambar terlebih dahulu.');
			return;
		}
		setBusy(true);
		try {
			const { branding: updated } = await uploadEmailBranding(file, altText.trim());
			setBranding(updated);
			setFile(null);
			if (preview) URL.revokeObjectURL(preview);
			setPreview(null);
			if (inputRef.current) inputRef.current.value = '';
			toast.success('Gambar profil email disimpan.');
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal menyimpan gambar profil email.',
			);
		} finally {
			setBusy(false);
		}
	}

	async function handleRemove() {
		if (!branding) return;
		if (!window.confirm('Hapus gambar profil email? Email selanjutnya dikirim tanpa logo.')) return;
		setRemoving(true);
		try {
			await deleteEmailBranding();
			setBranding(null);
			setAltText('');
			toast.success('Gambar profil email dihapus.');
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal menghapus gambar profil email.',
			);
		} finally {
			setRemoving(false);
		}
	}

	const currentUrl = branding?.logoUrl ?? null;

	return (
		<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
						<ImageUp className="size-5 text-primary" strokeWidth={2} />
						Gambar Profil Email
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Logo ini tampil di bagian atas email keluar Catet Pajak (undangan pengguna, atur kata
						sandi, dan email uji coba SMTP). Disarankan gambar persegi dengan latar transparan
						(PNG/WEBP) berukuran maksimal 2MB.
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
					<Loader2 className="size-4 animate-spin" /> Memuat gambar profil email…
				</div>
			) : (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4 sm:flex-row sm:items-center">
						<div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
							{preview ? (
								<img src={preview} alt="Pratinjau" className="size-full object-contain" />
							) : currentUrl ? (
								<img src={currentUrl} alt={branding?.altText || 'Catet Pajak'} className="size-full object-contain" />
							) : (
								<span className="text-[11px] text-center font-medium text-muted-foreground/70">
									Belum ada gambar
								</span>
							)}
						</div>
						<div className="flex flex-1 flex-col gap-2">
							<p className="text-sm font-semibold text-foreground">
								{currentUrl ? 'Gambar profil saat ini' : 'Belum ada gambar profil'}
							</p>
							<p className="text-xs leading-relaxed text-muted-foreground">
								Penerima melihat gambar ini di atas isi email. Beberapa klien email memerlukan
								persetujuan untuk memuat gambar eksternal — gambar tetap dikirim melalui URL publik.
							</p>
							{currentUrl ? (
								<a
									href={currentUrl}
									target="_blank"
									rel="noreferrer"
									className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
								>
									Lihat URL gambar
								</a>
							) : null}
						</div>
					</div>

					<div className="flex flex-col gap-3">
						<label className="flex flex-col gap-1">
							<span className={labelClass}>File gambar (JPG/PNG/WEBP, maks. 2MB)</span>
							<input
								ref={inputRef}
								type="file"
								accept="image/jpeg,image/png,image/webp"
								onChange={event => handleSelect(event.target.files?.[0] ?? null)}
								className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3.5 file:py-2 file:text-xs file:font-bold file:text-primary-foreground hover:file:bg-primary/90"
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Teks alternatif (alt)</span>
							<input
								value={altText}
								onChange={event => setAltText(event.target.value)}
								placeholder="cth. Catet Pajak"
								className={fieldClass}
								maxLength={120}
							/>
						</label>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => void handleSave()}
							disabled={busy || !file}
							className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
						>
							{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
							Simpan gambar
						</button>
						{branding ? (
							<button
								type="button"
								onClick={() => void handleRemove()}
								disabled={removing}
								className={cn(
									'inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/5 px-4 text-xs font-bold text-destructive transition hover:bg-destructive/10 disabled:opacity-60',
								)}
							>
								{removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
								Hapus gambar
							</button>
						) : null}
					</div>

					<p className="rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
						Gambar disimpan sebagai file publik dan dirujuk melalui URL pada HTML email. Pastikan
						situs telah dipublikasikan agar URL gambar dapat diakses oleh penerima. Pengaturan SMTP
						tetap mengontrol jalur pengiriman (server sendiri atau relay platform).
					</p>
				</div>
			)}
		</section>
	);
}
