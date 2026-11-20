import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Loader2, LogIn, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { usePencariSubscription } from '@/hooks/use-pencari-subscription';
import { createCvRequest } from '@/lib/cv-requests';

const fieldClass =
	'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const labelClass = 'text-[13px] font-semibold text-foreground';

/**
 * Formulir permintaan CV kepada seorang akuntan. Tamu diarahkan untuk masuk
 * atau mendaftar sebagai Pencari Akuntan; pengguna yang masuk dapat
 * mengirim permintaan dengan nama, email, telepon, nama perusahaan/CV,
 * dan pesan. Setelah terkirim, pencari melihat konfirmasi.
 */
export function CvRequestForm({
	profile,
	onSubmitted,
	compact = false,
}: {
	profile: { id: string; name: string; cv_name: string };
	onSubmitted?: () => void;
	compact?: boolean;
}) {
	const { user, isAuthed, isLoading } = useAuth();
	const { isSubscribed, isLoading: subLoading } = usePencariSubscription();
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [companyName, setCompanyName] = useState('');
	const [message, setMessage] = useState('');
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState('');
	const [sending, setSending] = useState(false);
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		if (isLoading || !user) return;
		const record = user as unknown as Record<string, string>;
		setName(record.name ?? '');
		setEmail(user.email ?? '');
		setPhone(record.phone ?? '');
		setCompanyName(record.company_name ?? '');
	}, [isLoading, user]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError('');
		const nextErrors: Record<string, string> = {};
		if (!name.trim()) nextErrors.name = 'Nama wajib diisi.';
		if (!email.trim()) {
			nextErrors.email = 'Email wajib diisi.';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
			nextErrors.email = 'Format email tidak valid.';
		}
		if (phone.trim() && phone.replace(/\D/g, '').length < 8) {
			nextErrors.phone = 'Nomor telepon tidak valid.';
		}
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0 || !user) return;

		setSending(true);
		try {
			await createCvRequest(
				{
					accountant: profile.id,
					name: name.trim(),
					email: email.trim(),
					phone: phone.trim(),
					company_name: companyName.trim(),
					message: message.trim(),
				},
				user.id,
			);
			setSubmitted(true);
			toast.success(`Permintaan nama terkirim kepada ${profile.name}.`);
			onSubmitted?.();
		} catch (err) {
			const data = (
				err as { response?: { data?: Record<string, { message?: string }> } }
			)?.response?.data;
			if (data && Object.keys(data).length > 0) {
				const fieldErrors: Record<string, string> = {};
				for (const [key, value] of Object.entries(data)) {
					fieldErrors[key] = value?.message ?? 'Nilai tidak valid.';
				}
				setErrors(fieldErrors);
			} else {
				setFormError('Gagal mengirim permintaan. Coba lagi sebentar lagi.');
			}
		} finally {
			setSending(false);
		}
	}

	if (isLoading) {
		return <div className="h-56 animate-pulse rounded-2xl bg-emerald-50" />;
	}

	if (!isAuthed) {
		return (
			<div className="flex flex-col items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 min-w-0">
				<div className="min-w-0">
					<p className="break-words text-[15px] font-bold leading-snug text-[#102a4c]">
						Minta Nama {profile.name}
					</p>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						Masuk atau daftar sebagai Pencari Akuntan untuk mengirim permintaan nama
						kepada akuntan ini.
					</p>
				</div>
				<Link
					to="/akuntan/masuk?mode=daftar"
					className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft-sm transition hover:brightness-110 active:scale-[0.99]"
				>
					<LogIn className="size-4" strokeWidth={1.75} />
					Masuk atau Daftar
				</Link>
			</div>
		);
	}

	if (subLoading) {
		return <div className="h-40 animate-pulse rounded-2xl bg-emerald-50" />;
	}

	if (!isSubscribed) {
		return (
			<div className="flex flex-col items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 min-w-0">
				<div className="min-w-0">
					<p className="break-words text-[15px] font-bold leading-snug text-[#102a4c]">
						Berlangganan untuk mengirim permintaan
					</p>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						Pengiriman permintaan nama kepada akuntan memerlukan langganan Pencari
						Akuntan aktif (Rp49.000/bulan).
					</p>
				</div>
				<Link
					to="/akuntan/langganan"
					className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-5 text-sm font-semibold text-white shadow-soft-sm transition hover:brightness-110 active:scale-[0.99]"
				>
					Berlangganan sekarang
				</Link>
			</div>
		);
	}

	if (submitted) {
		return (
			<div className="flex flex-col items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
				<p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
					<CheckCircle2 className="size-5" strokeWidth={1.75} />
					Permintaan nama terkirim
				</p>
				<p className="text-sm leading-relaxed text-muted-foreground">
					Permintaan nama Anda kepada {profile.name} ({profile.cv_name}) sudah dikirim.
					Akuntan akan melihat permintaan Anda di dasbornya dan dapat menghubungi
					Anda melalui email atau telepon yang Anda cantumkan.
				</p>
				<Link
					to="/akuntan/dasbor"
					className="text-sm font-semibold text-emerald-700 hover:underline"
				>
					Lihat status permintaan Anda di dasbor
				</Link>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className={compact ? 'flex flex-col gap-4' : 'flex flex-col gap-4'} noValidate>
			<div className="grid gap-4">
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>
						Nama <span className="text-red-500">*</span>
					</span>
					<input
						value={name}
						onChange={event => setName(event.target.value)}
						placeholder="cth. Rina Hartono"
						className={fieldClass}
						maxLength={120}
					/>
					{errors.name ? (
						<span className="text-xs font-medium text-red-600">{errors.name}</span>
					) : null}
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>
						Email <span className="text-red-500">*</span>
					</span>
					<input
						type="email"
						value={email}
						onChange={event => setEmail(event.target.value)}
						placeholder="cth. rina@perusahaan.co.id"
						className={fieldClass}
						maxLength={160}
					/>
					{errors.email ? (
						<span className="text-xs font-medium text-red-600">{errors.email}</span>
					) : null}
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Nomor telepon</span>
					<input
						value={phone}
						onChange={event => setPhone(event.target.value)}
						placeholder="cth. 0812 3456 7890"
						className={fieldClass}
						maxLength={40}
					/>
					{errors.phone ? (
						<span className="text-xs font-medium text-red-600">{errors.phone}</span>
					) : null}
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={labelClass}>Nama perusahaan</span>
					<input
						value={companyName}
						onChange={event => setCompanyName(event.target.value)}
						placeholder="cth. PT Maju Bersama"
						className={fieldClass}
						maxLength={160}
					/>
				</label>
			</div>
			<label className="flex flex-col gap-1.5">
				<span className={labelClass}>Pesan</span>
				<textarea
					value={message}
					onChange={event => setMessage(event.target.value)}
					placeholder="cth. Saya membutuhkan jasa pembukuan dan laporan pajak tahunan untuk UMKM."
					rows={3}
					maxLength={1000}
					className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100"
				/>
			</label>
			{formError ? (
				<p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
					{formError}
				</p>
			) : null}
			<button
				type="submit"
				disabled={sending}
				className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl sm:w-fit bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-6 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
			>
				{sending ? (
					<Loader2 className="size-4 animate-spin" strokeWidth={2} />
				) : (
					<Send className="size-4" strokeWidth={1.75} />
				)}
				{sending ? 'Mengirim…' : 'Kirim permintaan nama'}
			</button>
		</form>
	);
}
