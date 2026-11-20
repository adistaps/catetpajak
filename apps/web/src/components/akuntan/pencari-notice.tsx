import { Link } from 'react-router';
import { Compass, Info } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getAkuntanRole } from '@/lib/akuntan';

/**
 * Pemberitahuan untuk pengguna yang masuk sebagai Pencari Akuntan di dasbor
 * profil: dasbor ini untuk mengelola profil akuntan, sedangkan pencari
 * diarahkan ke pengalaman menjelajah direktori.
 */
export function PencariNotice() {
	const { user, isAuthed, isLoading } = useAuth();

	if (isLoading || !isAuthed || getAkuntanRole(user) !== 'pencari') return null;

	return (
		<div className="mt-6 flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-start gap-3">
				<Info className="mt-0.5 size-5 shrink-0 text-emerald-600" strokeWidth={1.75} />
				<div>
					<p className="text-sm font-bold text-[#102a4c]">Akun Anda terdaftar sebagai Pencari Akuntan</p>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						Dasbor ini untuk akuntan yang menayangkan jasa. Anda dapat mencari dan menjelajah
						profil akuntan langsung di direktori.
					</p>
				</div>
			</div>
			<Link
				to="/akuntan"
				className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft-sm transition hover:brightness-110 active:scale-[0.99]"
			>
				<Compass className="size-4" strokeWidth={1.75} />
				Jelajahi direktori
			</Link>
		</div>
	);
}
