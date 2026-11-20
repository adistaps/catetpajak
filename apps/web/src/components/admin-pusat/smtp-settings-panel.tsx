import { useCallback, useEffect, useState } from 'react';
import { Mail, Loader2, RefreshCw, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	fetchCentralAdminSmtpSettings,
	testCentralAdminSmtp,
	updateCentralAdminSmtpSettings,
	type SmtpSettings,
} from '@/lib/central-admin';

const fieldClass =
	'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-2';
const labelClass = 'text-xs font-semibold text-muted-foreground';

/**
 * Panel pengaturan SMTP untuk Admin Pusat. Memungkinkan admin mengonfigurasi
 * server email pengirim (host, port, TLS, kredensial, identitas pengirim) agar
 * undangan dan email lain dikirim dari alamat sendiri. Kata sandi tidak pernah
 * ditampilkan setelah disimpan; biarkan kosong untuk mempertahankan yang lama.
 */
export function SmtpSettingsPanel() {
	const [settings, setSettings] = useState<SmtpSettings | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testEmail, setTestEmail] = useState('');

	const [host, setHost] = useState('');
	const [port, setPort] = useState('465');
	const [tls, setTls] = useState(true);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [senderAddress, setSenderAddress] = useState('');
	const [senderName, setSenderName] = useState('Catet Pajak');
	const [enabled, setEnabled] = useState(false);

	const apply = useCallback((s: SmtpSettings) => {
		setSettings(s);
		setHost(s.host || '');
		setPort(String(s.port || 465));
		setTls(!!s.tls);
		setUsername(s.username || '');
		setPassword('');
		setSenderAddress(s.senderAddress || '');
		setSenderName(s.senderName || 'Catet Pajak');
		setEnabled(!!s.enabled);
	}, []);

	const load = useCallback(
		async (isRefresh = false) => {
			if (isRefresh) setIsRefreshing(true);
			else setIsLoading(true);
			setError('');
			try {
				const data = await fetchCentralAdminSmtpSettings();
				apply(data);
			} catch (err) {
				if (err instanceof CentralAdminApiError) {
					if (err.status === 401) {
						window.location.href = '/login';
						return;
					}
					setError(err.message);
				} else {
					setError('Gagal memuat pengaturan SMTP. Periksa koneksi lalu coba lagi.');
				}
			} finally {
				setIsLoading(false);
				setIsRefreshing(false);
			}
		},
		[apply],
	);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleSave() {
		if (!host.trim()) {
			toast.error('Host SMTP wajib diisi.');
			return;
		}
		if (!senderAddress.trim()) {
			toast.error('Alamat email pengirim wajib diisi.');
			return;
		}
		const portNum = Number(port);
		if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
			toast.error('Port tidak valid (1–65535).');
			return;
		}
		if (enabled && !password.trim() && !settings?.passwordConfigured) {
			toast.error('Kata sandi SMTP wajib diisi sebelum mengaktifkan SMTP.');
			return;
		}
		setBusy(true);
		try {
			const { settings: updated } = await updateCentralAdminSmtpSettings({
				host: host.trim(),
				port: portNum,
				tls,
				username: username.trim(),
				...(password.trim() ? { password: password.trim() } : {}),
				senderAddress: senderAddress.trim(),
				senderName: senderName.trim(),
				enabled,
			});
			apply(updated);
			toast.success('Pengaturan SMTP disimpan.');
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal menyimpan pengaturan SMTP.',
			);
		} finally {
			setBusy(false);
		}
	}

	async function handleTest() {
		const to = testEmail.trim();
		if (!to) {
			toast.error('Masukkan email penerima untuk uji coba.');
			return;
		}
		setTesting(true);
		try {
			const result = await testCentralAdminSmtp(to);
			const viaLabel = result.via === 'smtp' ? 'SMTP' : 'relay platform';
			const sender = result.sender ? ` dari ${result.sender}` : '';
			toast.success(
				`Email uji coba berhasil dikirim melalui ${viaLabel}${sender}. Periksa kotak masuk dan folder spam.`,
				{ duration: 7000 },
			);
			if (result.via !== 'smtp') {
				toast.info(
					'Email terkirim lewat relay platform karena SMTP nonaktif. Aktifkan SMTP agar email dikirim dari alamat Anda sendiri.',
					{ duration: 8000 },
				);
			}
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal mengirim email uji coba.', {
				duration: 8000,
			});
		} finally {
			setTesting(false);
		}
	}

	return (
		<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
						<Mail className="size-5 text-primary" strokeWidth={2} />
						Pengaturan SMTP
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Atur server email pengirim agar undangan dan email lain dikirim dari alamat Anda sendiri
						(cth. info@catetpajak.com). Kata sandi tidak pernah ditampilkan setelah disimpan.
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
					<Loader2 className="size-4 animate-spin" /> Memuat pengaturan SMTP…
				</div>
			) : (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={cn(
								'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
								enabled
									? 'border-emerald-200 bg-emerald-50 text-emerald-700'
									: 'border-slate-200 bg-slate-50 text-slate-500',
							)}
						>
							{enabled ? 'SMTP Aktif' : 'SMTP Nonaktif'}
						</span>
						{settings?.passwordConfigured ? (
							<span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
								Kata sandi tersimpan
							</span>
						) : (
							<span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
								Belum ada kata sandi
							</span>
						)}
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Host SMTP *</span>
							<input
								value={host}
								onChange={event => setHost(event.target.value)}
								placeholder="cth. smtp.hostinger.com"
								className={fieldClass}
								maxLength={160}
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Port *</span>
							<input
								type="number"
								inputMode="numeric"
								value={port}
								onChange={event => setPort(event.target.value)}
								placeholder="465"
								className={fieldClass}
							/>
						</label>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Username (email SMTP)</span>
							<input
								value={username}
								onChange={event => setUsername(event.target.value)}
								placeholder="cth. info@catetpajak.com"
								className={fieldClass}
								maxLength={160}
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className={labelClass}>
								Kata sandi{' '}
								{settings?.passwordConfigured ? (
									<span className="font-normal text-muted-foreground/80">
										(tersimpan — biarkan kosong untuk tetap)
									</span>
								) : null}
							</span>
							<input
								type="password"
								value={password}
								onChange={event => setPassword(event.target.value)}
								placeholder={settings?.passwordConfigured ? '••••••••' : 'Masukkan kata sandi SMTP'}
								className={fieldClass}
								autoComplete="new-password"
							/>
						</label>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Alamat pengirim (From) *</span>
							<input
								value={senderAddress}
								onChange={event => setSenderAddress(event.target.value)}
								placeholder="cth. info@catetpajak.com"
								className={fieldClass}
								maxLength={160}
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Nama pengirim</span>
							<input
								value={senderName}
								onChange={event => setSenderName(event.target.value)}
								placeholder="Catet Pajak"
								className={fieldClass}
								maxLength={120}
							/>
						</label>
					</div>

					<div className="flex flex-wrap items-center gap-4">
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={tls}
								onChange={event => setTls(event.target.checked)}
								className="size-4 accent-primary"
							/>
							<span className="text-sm font-medium text-foreground">
								Gunakan TLS (centang untuk port 465, kosongkan untuk 587/STARTTLS)
							</span>
						</label>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={enabled}
								onChange={event => setEnabled(event.target.checked)}
								className="size-4 accent-primary"
							/>
							<span className="text-sm font-medium text-foreground">
								Aktifkan SMTP (kirim email melalui server ini)
							</span>
						</label>
					</div>

					<p className="rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
						Saat SMTP nonaktif, email tetap terkirim melalui relay platform (pengirim generik).
						Saat SMTP diaktifkan, semua email (termasuk undangan pengguna) dikirim melalui server
						ini — pastikan kredensial benar dan uji terlebih dahulu. Jika terjadi kegagalan,
						nonaktifkan SMTP untuk kembali ke relay platform.
					</p>

					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void handleSave()}
							disabled={busy}
							className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
						>
							{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
							Simpan pengaturan
						</button>
					</div>

					<div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4">
						<div>
							<h3 className="text-sm font-bold text-foreground">Uji coba pengiriman email</h3>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Simpan pengaturan terlebih dahulu, lalu kirim email uji coba untuk memverifikasi
								konfigurasi SMTP berfungsi.
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<input
								type="email"
								value={testEmail}
								onChange={event => setTestEmail(event.target.value)}
								placeholder="email penerima uji coba"
								className={cn(fieldClass, 'max-w-xs flex-1')}
							/>
							<button
								type="button"
								onClick={() => void handleTest()}
								disabled={testing}
								className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition hover:bg-secondary disabled:opacity-60"
							>
								{testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
								Kirim email uji coba
							</button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
