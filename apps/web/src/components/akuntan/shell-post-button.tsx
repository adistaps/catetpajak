import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getAkuntanRole } from '@/lib/akuntan';

/**
 * Tombol Posting pada navigasi Akuntan — hanya tampil untuk pengguna yang
 * sudah masuk (bukan Pencari). Mengarahkan ke halaman buat posting khusus
 * di /akuntan/posting, bukan pop-up.
 */
export function ShellPostButton() {
	const { user, isLoading } = useAuth();

	if (isLoading || !user) return null;
	if (getAkuntanRole(user) === 'pencari') return null;

	return (
		<Link
			to="/akuntan/posting"
			className="inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-4 text-sm font-semibold text-white shadow-soft-sm hover:brightness-110"
		>
			<Plus className="size-4" strokeWidth={2.25} />
			Posting
		</Link>
	);
}
