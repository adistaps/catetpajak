import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, LogIn, Users } from 'lucide-react';
import { toast } from 'sonner';
import { loginParent } from '@/lib/parents';

export function ParentLogin() {
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		const trimmedEmail = email.trim();
		if (!trimmedEmail || !password) {
			setError('Email dan kata sandi wajib diisi.');
			return;
		}
		setLoading(true);
		try {
			await loginParent(trimmedEmail, password);
			toast.success('Berhasil masuk. Selamat datang!');
			navigate('/app/parent/dashboard', { replace: true });
		} catch (err) {
			const status =
				(err as { status?: number; isAbort?: boolean })?.status ?? 0;
			if (status === 0) {
				setError(
					'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
				);
			} else if (status === 400) {
				setError('Email atau kata sandi salah. Akun parent dibuat oleh admin sekolah.');
			} else if (status === 429) {
				setError('Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.');
			} else {
				setError('Masuk gagal. Coba lagi beberapa saat.');
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 px-4 py-10">
			<div className="w-full max-w-md">
				<div className="mb-6 flex flex-col items-center text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
						<Users className="size-7" />
					</div>
					<h1 className="mt-4 text-2xl font-extrabold tracking-tight">Portal Parent</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Lihat tagihan dan bayar invoice siswa Anda.
					</p>
				</div>

				<form
					onSubmit={handleSubmit}
					className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft"
				>
					<div className="flex flex-col gap-2">
						<label htmlFor="parent-email" className="text-xs font-semibold">
							Email
						</label>
						<input
							id="parent-email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="email@contoh.com"
							className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="parent-password" className="text-xs font-semibold">
							Kata Sandi
						</label>
						<div className="relative">
							<input
								id="parent-password"
								type={showPassword ? 'text' : 'password'}
								autoComplete="current-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
							<button
								type="button"
								onClick={() => setShowPassword((s) => !s)}
								className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
								aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
							>
								{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</button>
						</div>
					</div>

					{error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

					<button
						type="submit"
						disabled={loading}
						className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
					>
						<LogIn className="size-4" />
						{loading ? 'Memproses…' : 'Masuk'}
					</button>
				</form>

				<p className="mt-4 text-center text-xs text-muted-foreground">
					Belum punya akun? Hubungi admin sekolah untuk membuatkan akun parent.
				</p>
			</div>
		</div>
	);
}
