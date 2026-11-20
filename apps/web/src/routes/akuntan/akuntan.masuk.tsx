import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Briefcase, Eye, EyeOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Route } from './+types/akuntan.masuk';
import { seo } from '@/lib/seo';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { akuntanLandingPath, getAkuntanRole, type AkuntanRole } from '@/lib/akuntan';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Masuk atau Daftar — Catet Akuntan',
			description:
				'Daftar sebagai Akuntan untuk menayangkan jasa Anda, atau sebagai Pencari Akuntan untuk menjelajah direktori. Masuk membedakan kedua tipe akun secara otomatis.',
		},
	);
}

const ROLE_OPTIONS: {
	role: AkuntanRole;
	title: string;
	description: string;
	icon: typeof Briefcase;
}[] = [
	{
		role: 'akuntan',
		title: 'Daftar sebagai Akuntan',
		description:
			'Tayangkan nama CV, foto, kota, dan layanan Anda di direktori publik, lalu kelola semuanya dari dasbor profil.',
		icon: Briefcase,
	},
	{
		role: 'pencari',
		title: 'Daftar sebagai Pencari Akuntan',
		description:
			'Carikan akuntan yang tepat untuk usaha Anda — jelajahi profil, bandingkan layanan, dan hubungi langsung tanpa biaya.',
		icon: Search,
	},
];

export default function AkuntanMasuk() {
	const { login, signup, isAuthed, isLoading } = useAuth();
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const [mode, setMode] = useState<'masuk' | 'daftar' | 'lupa'>(
		params.get('mode') === 'daftar' ? 'daftar' : 'masuk',
	);
	const [role, setRole] = useState<AkuntanRole | null>(() => {
		const value = params.get('role');
		return value === 'akuntan' || value === 'pencari' ? value : null;
	});
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (isLoading || !isAuthed) return;
		navigate(akuntanLandingPath(getAkuntanRole(pb.authStore.record)), { replace: true });
	}, [isAuthed, isLoading, navigate]);

	function goAfterAuth() {
		const authRole = getAkuntanRole(pb.authStore.record);
		if (authRole === 'pencari') {
			toast.success('Selamat datang! Lihat status langganan Pencari Akuntan Anda.');
		} else if (authRole === 'akuntan') {
			toast.success('Selamat datang! Kelola profil akuntan Anda di dasbor.');
		}
		navigate(akuntanLandingPath(authRole), { replace: true });
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError('');
		setNotice('');
		setBusy(true);
		try {
			if (mode === 'lupa') {
				await pb.collection('users').requestPasswordReset(email);
				setNotice('Jika email terdaftar, tautan atur ulang kata sandi sudah dikirim.');
				return;
			}
			if (mode === 'masuk') {
				await login(email, password);
			} else {
				await signup(email, password, {
					name,
					job_title: role === 'pencari' ? 'Pencari Akuntan' : 'Akuntan',
					akuntan_role: role ?? 'akuntan',
				});
			}
			goAfterAuth();
		} catch {
			setError(
				mode === 'masuk'
					? 'Email atau kata sandi salah.'
					: mode === 'lupa'
						? 'Permintaan gagal. Periksa email lalu coba lagi.'
						: 'Pendaftaran gagal. Email mungkin sudah terdaftar atau kata sandi kurang dari 10 karakter.',
			);
		} finally {
			setBusy(false);
		}
	}

	const showRoleChooser = mode === 'daftar' && role === null;
	const activeRole = ROLE_OPTIONS.find(option => option.role === role);

	return (
		<main className="min-h-dvh bg-[#f3f8f5] text-[#102a4c]">
			<div className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-5 py-10 lg:grid-cols-2">
				<div>
					<Link to="/akuntan" className="text-sm font-semibold text-emerald-700 hover:underline">
						← Kembali ke direktori
					</Link>
					<p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Aplikasi Catet Akuntan</p>
					<h1 className="mt-3 text-4xl font-extrabold tracking-tight">
						{showRoleChooser
							? 'Daftar sesuai kebutuhan Anda'
							: mode === 'daftar'
								? `Daftar sebagai ${activeRole?.role === 'pencari' ? 'Pencari Akuntan' : 'Akuntan'}`
								: 'Masuk ke Catet Akuntan'}
					</h1>
					<p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500">
						{showRoleChooser
							? 'Pilih tipe akun terlebih dahulu: tawarkan jasa akuntan Anda, atau carikan akuntan untuk usaha Anda. Masuk membedakan keduanya secara otomatis.'
							: 'Akun ini khusus aplikasi Catet Akuntan. Login aplikasi pembukuan Catet Pajak tetap di halaman masuk perusahaan dan tidak dipakai di sini.'}
					</p>
				</div>
				<div className="rounded-[28px] border border-white bg-white p-6 shadow-[0_24px_60px_rgba(16,42,76,0.08)] sm:p-8">
					{mode !== 'daftar' ? (
						<div className="mb-5 flex rounded-full bg-emerald-50 p-1 text-sm font-semibold">
							<button
								type="button"
								onClick={() => setMode('masuk')}
								className={`h-10 flex-1 rounded-full ${mode === 'masuk' ? 'bg-white text-[#102a4c] shadow-sm' : 'text-slate-500'}`}
							>
								Masuk
							</button>
							<button
								type="button"
								onClick={() => setMode('daftar')}
								className="h-10 flex-1 rounded-full text-slate-500"
							>
								Daftar
							</button>
						</div>
					) : null}

					{showRoleChooser ? (
						<div className="flex flex-col gap-4">
							{ROLE_OPTIONS.map(option => {
								const Icon = option.icon;
								return (
									<button
										key={option.role}
										type="button"
										onClick={() => setRole(option.role)}
										className="group flex items-start gap-4 rounded-2xl border border-emerald-100 bg-white p-5 text-left shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50/60 active:scale-[0.99]"
									>
										<span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100">
											<Icon className="size-6" strokeWidth={1.75} />
										</span>
										<span>
											<span className="block text-[15px] font-bold text-[#102a4c]">{option.title}</span>
											<span className="mt-1.5 block text-sm leading-relaxed text-slate-500">
												{option.description}
											</span>
										</span>
									</button>
								);
							})}
							<p className="text-center text-sm text-slate-500">
								Sudah punya akun?{' '}
								<button type="button" onClick={() => setMode('masuk')} className="font-semibold text-emerald-700 hover:underline">
									Masuk di sini
								</button>
							</p>
						</div>
					) : (
						<form onSubmit={handleSubmit} className="flex flex-col gap-4">
							{mode === 'daftar' && activeRole ? (
								<div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
									<span className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
										<activeRole.icon className="size-4" strokeWidth={1.75} />
										{activeRole.title}
									</span>
									<button
										type="button"
										onClick={() => setRole(null)}
										className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
									>
										<ArrowLeft className="size-3.5" strokeWidth={2} />
										Ganti pilihan
									</button>
								</div>
							) : null}
							{mode === 'daftar' ? (
								<label className="flex flex-col gap-1.5 text-[13px] font-semibold">
									Nama lengkap
									<input required value={name} onChange={event => setName(event.target.value)} className={field} />
								</label>
							) : null}
							<label className="flex flex-col gap-1.5 text-[13px] font-semibold">
								Email
								<input
									type="email"
									required
									value={email}
									onChange={event => setEmail(event.target.value)}
									placeholder="nama@email.com"
									className={field}
								/>
							</label>
							{mode !== 'lupa' ? (
								<label className="flex flex-col gap-1.5 text-[13px] font-semibold">
									Kata sandi
									<div className="relative">
										<input
											type={showPassword ? 'text' : 'password'}
											required
											minLength={10}
											value={password}
											onChange={event => setPassword(event.target.value)}
											placeholder="Minimal 10 karakter"
											className={`${field} pr-11`}
										/>
										<button
											type="button"
											onClick={() => setShowPassword(value => !value)}
											className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-slate-400"
											aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
										>
											{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
										</button>
									</div>
								</label>
							) : (
								<p className="text-sm text-slate-500">Kami kirim tautan atur ulang ke email Anda.</p>
							)}
							{error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
							{notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
							<button
								type="submit"
								disabled={busy}
								className="h-12 rounded-xl bg-gradient-to-r from-[#0f3d32] to-emerald-600 text-[15px] font-semibold text-white disabled:opacity-60"
							>
								{busy
									? 'Memproses…'
									: mode === 'daftar'
										? `Buat akun ${activeRole?.role === 'pencari' ? 'Pencari Akuntan' : 'Akuntan'}`
										: mode === 'lupa'
											? 'Kirim tautan'
											: 'Masuk'}
							</button>
							{mode === 'masuk' ? (
								<p className="text-center text-xs text-slate-400">
									Berlaku untuk akun Akuntan maupun Pencari Akuntan — Anda diarahkan sesuai tipe akun.
								</p>
							) : null}
							<button
								type="button"
								onClick={() => setMode(mode === 'lupa' ? 'masuk' : 'lupa')}
								className="text-sm font-medium text-slate-500 hover:text-[#12315a]"
							>
								{mode === 'lupa' ? 'Kembali ke masuk' : 'Lupa kata sandi?'}
							</button>
						</form>
					)}
				</div>
			</div>
		</main>
	);
}

const field =
	'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
