import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, User, UserPlus } from 'lucide-react';
import type { Route } from './+types/login';
import { seo } from '@/lib/seo';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import pb from '@/lib/pocketbase-client';
import { cn } from '@/lib/utils';

const JOB_TITLES = [
	'job.owner',
	'job.director',
	'job.finance',
	'job.hr',
	'job.accountant',
	'job.staff',
	'job.other',
];

const EMPLOYEE_COUNTS = ['1–10', '11–50', '51–100', '101–300', '301–700', '700+'];

const LOGO =
	'/catet-logo.png';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Masuk — Catet Pajak',
			description: 'Masuk atau daftar untuk mengelola pembukuan, pajak, dan payroll perusahaan Anda.',
		},
	);
}

export default function Login() {
	const { user, login, signup, logout, isAuthed, isLoading: isAuthLoading } = useAuth();
	const { t } = useLanguage();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const planParam = searchParams.get('plan');
	const selectedPlan = planParam === 'starter' || planParam === 'pro' || planParam === 'enterprise' ? planParam : null;
	const selectedPlanLabel = selectedPlan === 'pro' ? 'Pro' : selectedPlan === 'enterprise' ? 'Enterprise' : selectedPlan === 'starter' ? 'Starter' : null;
	const destination = selectedPlan === 'pro' || selectedPlan === 'enterprise'
		? `/plans?plan=${selectedPlan}#bayar-manual`
		: '/app';
	const mode = searchParams.get('mode') === 'signup'
		? 'signup'
		: searchParams.get('mode') === 'forgot' ? 'forgot' : 'login';
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [companyName, setCompanyName] = useState('');
	const [jobTitle, setJobTitle] = useState('');
	const [employeeCount, setEmployeeCount] = useState('');
	const [agreed, setAgreed] = useState(false);
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const submittingRef = useRef(false);

	useEffect(() => {
		if (isAuthLoading || !isAuthed || isSubmitting || submittingRef.current || (mode === 'signup' && selectedPlan)) return;
		const record = pb.authStore.record;
		if (!record) return;
		// Sesi parent (koleksi auth terpisah) langsung ke portal parent.
		if (record.collectionName === 'parents') {
			navigate('/app/parent/dashboard', { replace: true });
			return;
		}
		// Pilihan paket berbayar kembali ke bagian pembayaran; tanpa pilihan,
		// pengguna tetap masuk ke aplikasi meskipun langganan telah berakhir.
		navigate(destination, { replace: true });
	}, [isAuthLoading, isAuthed, isSubmitting, mode, selectedPlan, navigate, destination]);

	const switchMode = (next: 'login' | 'signup' | 'forgot') => {
		const params = new URLSearchParams(searchParams);
		if (next === 'login') params.delete('mode');
		else params.set('mode', next);
		setSearchParams(params, { replace: true });
		setError('');
		setNotice('');
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (submittingRef.current) return;
		setError('');
		setNotice('');
		if (mode === 'signup' && !agreed) {
			setError(t('login.terms_required'));
			return;
		}
		submittingRef.current = true;
		setIsSubmitting(true);
		try {
			if (mode === 'forgot') {
				// Auth alert dimatikan untuk kedua koleksi, jadi meminta reset pada
				// keduanya aman: hanya koleksi yang memiliki email yang akan benar-benar
				// mengirim tautan atur ulang kata sandi.
				await Promise.all([
					pb.collection('users').requestPasswordReset(email),
					pb.collection('parents').requestPasswordReset(email),
				]);
				setNotice(t('login.forgot_notice'));
				return;
			}
			if (mode === 'login') {
				// Satu formulir, tanpa pilihan jenis akun. Sebelum mencoba
				// autentikasi, kita tanyakan ke server koleksi mana (`users` atau
				// `parents`) yang memiliki email ini. Lookup ini adalah kueri records
				// superuser — BUKAN percobaan autentikasi — jadi tidak mengonsumsi
				// batas rate `*:auth` PocketBase. Dengan demikian klien hanya melakukan
				// satu `authWithPassword` terhadap koleksi yang benar, menghindari
				// penggandaan percobaan autentikasi yang sebelumnya menghabiskan batas
				// rate bersama dan menyebabkan login pengguna perusahaan gagal.
				//
				// Urutan `users` lebih dulu: bila email terdaftar di kedua koleksi
				// (mis. karyawan yang juga orang tua siswa), kata sandi menentukan
				// identitas mana yang dipakai, dan pengguna perusahaan tetap masuk
				// ke `/app`.
				let collections: string[] = [];
				try {
					const lookupResponse = await fetch('/api/login-lookup', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ email }),
					});
					if (lookupResponse.ok) {
						const data = (await lookupResponse.json()) as { collections?: string[] };
						collections = data.collections ?? [];
					}
				} catch {
					// lookup gagal — fallback mencoba kedua koleksi di bawah
				}

				if (collections.length === 0) {
					collections = ['users', 'parents'];
				}

				let lastError: unknown = null;
				let authenticated = false;
				for (const collection of collections) {
					try {
						if (collection === 'parents') {
							await pb.collection('parents').authWithPassword(email, password);
							navigate('/app/parent/dashboard', { replace: true });
							authenticated = true;
							break;
						}
						await login(email, password);
						navigate(destination, { replace: true });
						authenticated = true;
						break;
					} catch (err) {
						lastError = err;
						// coba koleksi berikutnya bila ada
					}
				}

				if (!authenticated) {
					throw lastError ?? new Error('invalid credentials');
				}
				return;
			} else {
				const digits = phone.replace(/\D/g, '');
				try {
					await signup(email, password, {
						name,
						phone: `+62${digits}`,
						company_name: companyName,
						job_title: jobTitle,
						employee_count: employeeCount,
					});
				} catch (err) {
					if (err instanceof Error && err.name === 'SignupLoginError') {
						switchMode('login');
						setNotice(t('login.signup_success'));
						return;
					}
					throw err;
				}
			}
			navigate(destination, { replace: true });
		} catch {
			setError(
				mode === 'login'
					? t('login.error_login')
					: mode === 'forgot'
						? t('login.error_forgot')
						: t('login.error_signup'),
			);
		} finally {
			submittingRef.current = false;
			setIsSubmitting(false);
		}
	};

	return (
		<main className="relative min-h-[100dvh] overflow-hidden bg-[#f3f7fb] text-[#0f2744]">
			<div className="pointer-events-none absolute inset-0" aria-hidden>
				<div className="absolute -left-24 top-10 h-72 w-[42rem] rounded-full bg-white/80 blur-2xl" />
				<div className="absolute -bottom-32 left-[-8%] h-80 w-[70%] rounded-[100%] bg-white shadow-[0_30px_80px_rgba(15,39,68,0.06)]" />
				<div className="absolute -right-16 top-[-6%] h-[28rem] w-[28rem] rounded-full border-[28px] border-white/70" />
				<div className="absolute right-[-4%] top-[18%] h-64 w-64 rounded-full bg-white/90 shadow-inner" />
				<div className="absolute bottom-[-8%] right-[-6%] h-72 w-72 rounded-full bg-emerald-50/80" />
				<svg className="absolute bottom-0 left-0 h-48 w-full text-white" viewBox="0 0 1440 180" preserveAspectRatio="none">
					<path fill="currentColor" d="M0 90c180 70 320 90 520 40s360-120 560-80 240 90 360 70v60H0Z" />
				</svg>
			</div>

			<div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1180px] flex-col justify-center px-5 py-10 lg:px-8">
				<div className="grid items-center gap-10 lg:grid-cols-[1fr_440px] lg:gap-16">
					<section className="max-w-md lg:pb-8">
						<Link to="/" className="inline-flex items-center gap-3">
							<img src={LOGO} alt="Logo Catet Pajak" className="brand-logo size-12 object-contain" />
							<span className="text-[28px] font-extrabold tracking-tight text-[#12315a]">
								Catet <span className="text-emerald-500">Pajak</span>
							</span>
						</Link>
						<h1 className="mt-8 text-[34px] font-extrabold leading-[1.15] tracking-tight text-[#102a4c] sm:text-[40px]">
							{t('login.title').split('\n').map((line, i) => (
								<span key={i}>{i > 0 ? <br /> : null}{line}</span>
							))}
						</h1>
						<div className="mt-4 h-1 w-14 rounded-full bg-emerald-400" />
						<p className="mt-4 text-[15px] text-slate-500">{t('login.subtitle')}</p>
					</section>

					<section className="w-full justify-self-end">
						<div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_rgba(16,42,76,0.08)] backdrop-blur-sm sm:p-8">
							{mode === 'login' ? (
								<>
									<h2 className="text-[28px] font-extrabold tracking-tight text-[#102a4c]">{t('login.welcome')}</h2>
									<p className="mt-1 text-sm text-slate-500">
										{t('login.signin_prompt')}
									</p>
									<form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
										<Field label={t('login.email')}>
											<div className="relative">
												<User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" strokeWidth={1.75} />
												<input
													type="email"
													required
													autoComplete="email"
													value={email}
													onChange={event => setEmail(event.target.value)}
													placeholder="nama@perusahaan.com"
													className={fieldClass}
												/>
											</div>
										</Field>
										<Field label={t('login.password')}>
											<div className="relative">
												<Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" strokeWidth={1.75} />
												<input
													type={showPassword ? 'text' : 'password'}
													required
													autoComplete="current-password"
													value={password}
													onChange={event => setPassword(event.target.value)}
													placeholder={t('login.password_placeholder')}
													className={cn(fieldClass, 'pr-11')}
												/>
												<button
													type="button"
													onClick={() => setShowPassword(value => !value)}
													className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:text-slate-600"
													aria-label={showPassword ? t('login.hide_password') : t('login.show_password')}
												>
													{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
												</button>
											</div>
										</Field>
										<button
											type="button"
											onClick={() => switchMode('forgot')}
											className="w-fit text-sm font-medium text-[#12315a] hover:underline"
										>
											{t('login.forgot')}
										</button>
										{error ? <ErrorNote message={error} /> : null}
										{notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
										<button type="submit" disabled={isSubmitting} className={primaryButton}>
											{isSubmitting ? t('login.processing') : t('login.signin_button')}
										</button>
									</form>
									<Divider />
									<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
										<button type="button" onClick={() => switchMode('signup')} className={ghostButton}>
											<span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-[#12315a]">
												<UserPlus className="size-4" strokeWidth={1.75} />
											</span>
											<span className="min-w-0 text-left">
												<span className="block text-[13px] font-semibold text-[#12315a]">{t('login.new_user')}</span>
												<span className="block text-xs text-slate-500">{t('login.signup_here')}</span>
											</span>
											<ArrowRight className="ml-auto size-4 shrink-0 text-slate-400" />
										</button>
										<Link to="/plans" className={ghostButton}>
											<span className="flex size-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
												<KeyRound className="size-4" strokeWidth={1.75} />
											</span>
											<span className="min-w-0 text-left">
												<span className="block text-[13px] font-semibold text-[#12315a]">{t('login.no_subscription')}</span>
												<span className="block text-xs text-slate-500">{t('login.view_plans')}</span>
											</span>
											<ArrowRight className="ml-auto size-4 shrink-0 text-slate-400" />
										</Link>
									</div>
								</>
							) : null}

							{mode === 'forgot' ? (
								<>
									<h2 className="text-[26px] font-extrabold tracking-tight text-[#102a4c]">{t('login.forgot_title')}</h2>
									<p className="mt-1 text-sm text-slate-500">{t('login.forgot_prompt')}</p>
									<form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
										<Field label={t('login.email')}>
											<input
												type="email"
												required
												value={email}
												onChange={event => setEmail(event.target.value)}
												placeholder="nama@perusahaan.com"
												className={plainField}
											/>
										</Field>
										{error ? <ErrorNote message={error} /> : null}
										{notice ? (
											<p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
										) : null}
										<button type="submit" disabled={isSubmitting} className={primaryButton}>
											{isSubmitting ? t('login.sending') : t('login.send_link')}
										</button>
										<button type="button" onClick={() => switchMode('login')} className="text-sm font-medium text-slate-500 hover:text-[#12315a]">
											{t('login.back_to_signin')}
										</button>
									</form>
								</>
							) : null}

							{mode === 'signup' ? (
								<>
									<h2 className="text-[26px] font-extrabold tracking-tight text-[#102a4c]">{t('login.signup_title')}</h2>
									{selectedPlanLabel ? (
										<p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
											Paket pilihan: <strong>{selectedPlanLabel}</strong>.
											{selectedPlan !== 'starter' ? ' Setelah mendaftar, lanjutkan ke pembayaran untuk mengaktifkan paket.' : ''}
										</p>
									) : null}
									{!isAuthLoading && isAuthed && selectedPlan ? (
										<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
											<p>Anda sudah masuk{user?.email ? ` sebagai ${user.email}` : ''}.</p>
											<div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
												<Link to={user?.collectionName === 'parents' ? '/app/parent/dashboard' : destination} className="font-semibold text-emerald-700 underline underline-offset-2">
													{selectedPlan === 'starter' ? 'Lanjutkan ke aplikasi' : 'Lanjutkan dengan akun ini'}
												</Link>
												<button type="button" onClick={() => logout()} className="font-semibold text-slate-600 underline underline-offset-2">
													Keluar untuk membuat akun lain
												</button>
											</div>
										</div>
									) : (
										<p className="mt-1 text-sm text-slate-500">
											{t('login.have_account')}{' '}
											<button type="button" onClick={() => switchMode('login')} className="font-semibold text-emerald-600 hover:underline">
												{t('login.signin_here')}
											</button>
										</p>
									)}
									{isAuthLoading ? (
										<p className="mt-5 text-sm text-slate-500">{t('login.loading_session')}</p>
									) : !isAuthed ? (
									<form onSubmit={handleSubmit} className="mt-5 flex max-h-[62dvh] flex-col gap-4 overflow-y-auto pr-1">
										<Field label={t('login.full_name')} required>
											<input required value={name} onChange={event => setName(event.target.value)} className={plainField} />
										</Field>
										<Field label={t('login.work_email')} required>
											<input type="email" required value={email} onChange={event => setEmail(event.target.value)} className={plainField} />
										</Field>
										<Field label={t('login.password')} required>
											<input
												type="password"
												required
												minLength={10}
												value={password}
												onChange={event => setPassword(event.target.value)}
												placeholder={t('login.password_min')}
												className={plainField}
											/>
										</Field>
										<Field label={t('login.phone')} required>
											<div className="flex h-11 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
												<span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">+62</span>
												<input
													required
													inputMode="numeric"
													value={phone}
													onChange={event => setPhone(event.target.value.replace(/[^\d\s-]/g, ''))}
													className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
													aria-label="Nomor handphone tanpa kode negara"
												/>
											</div>
										</Field>
										<Field label={t('login.company_name')} required>
											<input required value={companyName} onChange={event => setCompanyName(event.target.value)} className={plainField} />
										</Field>
										<Field label={t('login.job_title')} required>
											<select required value={jobTitle} onChange={event => setJobTitle(event.target.value)} className={plainField}>
												<option value="">{t('login.choose_option')}</option>
												{JOB_TITLES.map(item => (
													<option key={item} value={item}>
														{t(item)}
													</option>
												))}
											</select>
										</Field>
										<Field label={t('login.employee_count')} required>
											<select required value={employeeCount} onChange={event => setEmployeeCount(event.target.value)} className={plainField}>
												<option value="">{t('login.choose_option')}</option>
												{EMPLOYEE_COUNTS.map(item => (
													<option key={item} value={item}>
														{item}
													</option>
												))}
											</select>
										</Field>
										<label className="flex items-start gap-3 text-sm leading-snug text-slate-700">
											<input
												type="checkbox"
												checked={agreed}
												onChange={event => setAgreed(event.target.checked)}
												className="mt-0.5 size-4 rounded accent-emerald-600"
											/>
											<span>
												{t('login.terms_agree')}{' '}
												<Link to="/" className="font-medium text-emerald-600 hover:underline">
													{t('login.terms_link')}
												</Link>{' '}
												{t('login.terms_suffix')}
											</span>
										</label>
										{error ? <ErrorNote message={error} /> : null}
										<button type="submit" disabled={isSubmitting || !agreed} className={primaryButton}>
											{isSubmitting ? t('login.processing') : t('login.create_account')}
										</button>
									</form>
									) : null}
								</>
							) : null}
						</div>
					</section>
				</div>
				<footer className="mt-10">
					<p className="text-xs text-slate-400">{t('login.copyright')}</p>
				</footer>
			</div>
		</main>
	);
}

const fieldClass =
	'h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

const plainField =
	'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

const primaryButton =
	'h-12 rounded-xl bg-gradient-to-r from-[#0f3d32] to-emerald-600 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';

const ghostButton =
	'flex min-h-[64px] items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40';

function Field({
	label,
	required,
	children,
}: {
	label: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<label className="flex flex-col gap-1.5">
			<span className="text-[13px] font-semibold text-[#12315a]">
				{label}
				{required ? <span className="text-red-500"> *</span> : null}
			</span>
			{children}
		</label>
	);
}

function ErrorNote({ message }: { message: string }) {
	return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{message}</p>;
}

function Divider() {
	const { t } = useLanguage();
	return (
		<div className="my-5 flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-slate-400">
			<span className="h-px flex-1 bg-slate-200" />
			{t('login.or')}
			<span className="h-px flex-1 bg-slate-200" />
		</div>
	);
}
