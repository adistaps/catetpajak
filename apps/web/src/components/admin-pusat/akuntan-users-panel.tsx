import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	BadgeCheck,
	Briefcase,
	Loader2,
	RefreshCw,
	Search,
	ShieldCheck,
	Trash2,
	UserCircle2,
	Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/accounting';
import {
	CentralAdminApiError,
	deleteCentralAdminUser,
	fetchCentralAdminUsers,
	type CentralAdminUserSummary,
} from '@/lib/central-admin';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

type RoleFilter = 'all' | 'akuntan' | 'pencari';

function roleLabel(role: string): string {
	if (role === 'akuntan') return 'Akuntan';
	if (role === 'pencari') return 'Pencari Akuntan';
	return '—';
}

function roleBadgeClass(role: string): string {
	if (role === 'akuntan') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
	if (role === 'pencari') return 'bg-sky-50 text-sky-700 border-sky-200';
	return 'bg-secondary text-secondary-foreground border-border';
}

export function AkuntanUsersPanel() {
	const [users, setUsers] = useState<CentralAdminUserSummary[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
	const [deleteTarget, setDeleteTarget] = useState<CentralAdminUserSummary | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		try {
			const data = await fetchCentralAdminUsers();
			setUsers(data);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				setError(err.message);
			} else {
				setError('Gagal memuat daftar pengguna. Periksa koneksi lalu coba lagi.');
			}
			setUsers([]);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	// Hanya pengguna dengan peran Akuntan atau Pencari Akuntan.
	const akuntanUsers = useMemo(() => {
		if (!users) return [];
		return users.filter(
			user => user.akuntan_role === 'akuntan' || user.akuntan_role === 'pencari',
		);
	}, [users]);

	const filteredUsers = useMemo(() => {
		const query = search.trim().toLowerCase();
		return akuntanUsers.filter(user => {
			if (roleFilter !== 'all' && user.akuntan_role !== roleFilter) return false;
			if (!query) return true;
			return (
				user.name.toLowerCase().includes(query) ||
				user.email.toLowerCase().includes(query)
			);
		});
	}, [akuntanUsers, search, roleFilter]);

	const summary = useMemo(
		() => ({
			total: akuntanUsers.length,
			akuntan: akuntanUsers.filter(user => user.akuntan_role === 'akuntan').length,
			pencari: akuntanUsers.filter(user => user.akuntan_role === 'pencari').length,
		}),
		[akuntanUsers],
	);

	async function handleDelete() {
		if (!deleteTarget) return;
		setIsDeleting(true);
		try {
			await deleteCentralAdminUser(deleteTarget.id);
			setUsers(prev =>
				prev?.filter(user => user.id !== deleteTarget.id) ?? null,
			);
			toast.success('Pengguna berhasil dihapus.');
			setDeleteTarget(null);
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError
					? err.message
					: 'Gagal menghapus pengguna.',
			);
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2.5 text-3xl font-extrabold tracking-tight md:text-4xl">
						<UserCircle2 className="size-7 text-primary" strokeWidth={2} />
						Akuntan &amp; Pencari Akuntan
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Daftar pengguna Catet Akuntan beserta perannya. Hanya Admin Pusat yang dapat menghapus akun.
					</p>
				</div>
				<button
					type="button"
					onClick={() => void load(true)}
					disabled={isRefreshing}
					className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-bold transition-colors hover:bg-secondary disabled:opacity-60"
				>
					{isRefreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
					Muat ulang
				</button>
			</header>

			<section className="grid grid-cols-3 gap-3">
				{[
					{ label: 'Total', value: summary.total },
					{ label: 'Akuntan', value: summary.akuntan },
					{ label: 'Pencari Akuntan', value: summary.pencari },
				].map(stat => (
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

			<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
				<div className="flex flex-col gap-3 md:flex-row md:items-center">
					<div className="relative flex-1">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<input
							type="search"
							value={search}
							onChange={event => setSearch(event.target.value)}
							placeholder="Cari nama atau email…"
							className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-primary/20 focus:ring-2"
						/>
					</div>
					<div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
						{([
							{ value: 'all', label: 'Semua' },
							{ value: 'akuntan', label: 'Akuntan' },
							{ value: 'pencari', label: 'Pencari' },
						] as { value: RoleFilter; label: string }[]).map(option => (
							<button
								key={option.value}
								type="button"
								onClick={() => setRoleFilter(option.value)}
								className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
									roleFilter === option.value
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:bg-secondary'
								}`}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>

				{error ? (
					<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
						{error}
					</p>
				) : null}

				{isLoading ? (
					<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" /> Memuat daftar pengguna…
					</div>
				) : filteredUsers.length === 0 ? (
					<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
						{akuntanUsers.length > 0
							? 'Tidak ada pengguna yang cocok dengan pencarian.'
							: 'Belum ada pengguna Akuntan atau Pencari Akuntan terdaftar.'}
					</p>
				) : (
					<div className="overflow-x-auto rounded-xl border border-border">
						<table className="w-full min-w-[44rem] text-left text-sm">
							<thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3 font-semibold">Pengguna</th>
									<th className="px-4 py-3 font-semibold">Peran</th>
									<th className="px-4 py-3 font-semibold">Status</th>
									<th className="px-4 py-3 font-semibold">Terdaftar</th>
									<th className="px-4 py-3" />
								</tr>
							</thead>
							<tbody className="divide-y divide-border bg-background">
								{filteredUsers.map(user => (
									<tr key={user.id} className="transition-colors hover:bg-secondary/30">
										<td className="px-4 py-3">
											<span className="font-semibold">{user.name || user.email}</span>
											<span className="mt-1 block text-xs text-muted-foreground">Email: {user.email || 'Tidak tersedia'}</span>
											<span className="mt-1 block text-xs text-muted-foreground">
												{user.phoneSource === 'profil' ? 'No. HP (profil)' : 'No. HP'}: {user.phone || 'Belum tersedia'}
											</span>
										</td>
										<td className="px-4 py-3">
											<span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClass(user.akuntan_role)}`}>
												{user.akuntan_role === 'akuntan' ? <Briefcase className="size-3" /> : <Users className="size-3" />}
												{roleLabel(user.akuntan_role)}
											</span>
										</td>
										<td className="px-4 py-3">
											{user.isCentralAdmin ? (
												<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
													<ShieldCheck className="size-3" /> Admin Pusat
												</span>
											) : user.verified ? (
												<span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-secondary-foreground">
													<BadgeCheck className="size-3" /> Terverifikasi
												</span>
											) : (
												<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
													Belum verifikasi
												</span>
											)}
										</td>
										<td className="px-4 py-3 text-xs text-muted-foreground">
											{formatDate(user.created)}
										</td>
										<td className="px-4 py-3 text-right">
											<button
												type="button"
												onClick={() => setDeleteTarget(user)}
												className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-50"
											>
												<Trash2 className="size-3.5" /> Hapus
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Delete confirmation dialog */}
			<Dialog open={deleteTarget !== null} onOpenChange={open => !open && setDeleteTarget(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Hapus pengguna?</DialogTitle>
						<DialogDescription>
							{deleteTarget?.ownedCompanies
								? `Pengguna ini memiliki ${deleteTarget.ownedCompanies} perusahaan. Hapus atau alihkan kepemilikan perusahaan terlebih dahulu sebelum menghapus pengguna.`
								: 'Tindakan ini tidak dapat dibatalkan. Seluruh data milik pengguna — profil akuntan, posting, permintaan CV, dan pembayaran langganan — akan dihapus permanen.'}
						</DialogDescription>
					</DialogHeader>
					{deleteTarget ? (
						<div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
							<p className="font-semibold">{deleteTarget.name || deleteTarget.email}</p>
							<p className="text-xs text-muted-foreground">{deleteTarget.email}</p>
							<p className="mt-1 text-xs font-semibold text-muted-foreground">
								Peran: {roleLabel(deleteTarget.akuntan_role)}
							</p>
						</div>
					) : null}
					<div className="flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={() => setDeleteTarget(null)}
							className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={isDeleting || Boolean(deleteTarget?.ownedCompanies)}
							onClick={() => void handleDelete()}
							className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-5 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
						>
							{isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
							Hapus permanen
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
