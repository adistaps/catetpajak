import { useState } from 'react';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { currentParent } from '@/lib/parents';

/**
 * Bagian pengaturan akun Parent: menampilkan email login dan form ubah kata
 * sandi yang aman. Password saat ini diverifikasi dengan authWithPassword
 * sebelum kata sandi baru disimpan; kata sandi tidak pernah ditampilkan
 * sebagai teks biasa.
 */
export function ParentAccountSettings() {
	const parent = currentParent();
	const email = parent?.email ?? '';
	const parentId = parent?.id ?? '';

	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextErrors: Record<string, string> = {};

		if (!currentPassword) nextErrors.currentPassword = 'Kata sandi saat ini wajib diisi.';
		if (!newPassword) {
			nextErrors.newPassword = 'Kata sandi baru wajib diisi.';
		} else if (newPassword.length < 8) {
			nextErrors.newPassword = 'Kata sandi baru minimal 8 karakter.';
		}
		if (!confirmPassword) {
			nextErrors.confirmPassword = 'Konfirmasi kata sandi wajib diisi.';
		} else if (newPassword && confirmPassword !== newPassword) {
			nextErrors.confirmPassword = 'Konfirmasi tidak cocok dengan kata sandi baru.';
		}
		if (currentPassword && newPassword && currentPassword === newPassword) {
			nextErrors.newPassword = 'Kata sandi baru tidak boleh sama dengan kata sandi saat ini.';
		}

		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;

		setSubmitting(true);
		try {
			// Verifikasi kata sandi saat ini dengan login ulang ke koleksi parents.
			await pb.collection('parents').authWithPassword(email, currentPassword);
			// Simpan kata sandi baru.
			await pb.collection('parents').update(parentId, {
				password: newPassword,
				passwordConfirm: confirmPassword,
			});
			toast.success('Kata sandi berhasil diperbarui.');
			setCurrentPassword('');
			setNewPassword('');
			setConfirmPassword('');
			setErrors({});
		} catch (error) {
			const message =
				error instanceof Error && error.message
					? error.message
					: 'Gagal memperbarui kata sandi. Periksa kembali kata sandi saat ini.';
			// Pesan umum: kredensial salah saat verifikasi password saat ini.
			if (/credentials|invalid|unauthorized/i.test(message)) {
				setErrors({ currentPassword: 'Kata sandi saat ini tidak benar.' });
			} else {
				toast.error(message);
			}
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<section>
			<div className="grid gap-3 lg:grid-cols-2 lg:items-start">
				<div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft-sm">
					<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						<Mail className="size-3.5" /> Email Login
					</div>
					<p className="mt-1 break-all text-sm font-semibold">{email || '—'}</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Email ini digunakan untuk masuk ke Portal Parent.
					</p>
				</div>

				<form
					onSubmit={handleSubmit}
					noValidate
					className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4 shadow-soft-sm"
				>
					<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						<KeyRound className="size-3.5" /> Ubah Kata Sandi
					</div>

					<PasswordField
						id="parent-current-password"
						label="Kata Sandi Saat Ini"
						value={currentPassword}
						onChange={setCurrentPassword}
						show={showCurrent}
						onToggle={() => setShowCurrent((s) => !s)}
						error={errors.currentPassword}
						autoComplete="current-password"
					/>
					<PasswordField
						id="parent-new-password"
						label="Kata Sandi Baru"
						value={newPassword}
						onChange={setNewPassword}
						show={showNew}
						onToggle={() => setShowNew((s) => !s)}
						error={errors.newPassword}
						autoComplete="new-password"
					/>
					<PasswordField
						id="parent-confirm-password"
						label="Konfirmasi Kata Sandi Baru"
						value={confirmPassword}
						onChange={setConfirmPassword}
						show={showConfirm}
						onToggle={() => setShowConfirm((s) => !s)}
						error={errors.confirmPassword}
						autoComplete="new-password"
					/>

					<div className="flex items-center justify-between gap-3">
						<p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
							<ShieldCheck className="size-3.5" /> Kata sandi minimal 8 karakter.
						</p>
						<button
							type="submit"
							disabled={submitting}
							className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
						>
							{submitting ? 'Menyimpan…' : 'Simpan Kata Sandi'}
						</button>
					</div>
				</form>
			</div>
		</section>
	);
}

function PasswordField({
	id,
	label,
	value,
	onChange,
	show,
	onToggle,
	error,
	autoComplete,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	show: boolean;
	onToggle: () => void;
	error?: string;
	autoComplete: string;
}) {
	return (
		<label className="flex flex-col gap-1.5" htmlFor={id}>
			<span className="text-xs font-semibold">{label}</span>
			<div className="relative">
				<input
					id={id}
					type={show ? 'text' : 'password'}
					autoComplete={autoComplete}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm outline-none ring-primary/30 focus:ring-2"
				/>
				<button
					type="button"
					onClick={onToggle}
					className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
					aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
				>
					{show ? 'Sembunyi' : 'Lihat'}
				</button>
			</div>
			{error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
		</label>
	);
}
