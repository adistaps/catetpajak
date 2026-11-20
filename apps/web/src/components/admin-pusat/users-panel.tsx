import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	BadgeCheck,
	Building2,
	Loader2,
	RefreshCw,
	Search,
	Send,
	ShieldCheck,
	Trash2,
	UserPlus,
	Users,
	WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/accounting';
import {
	CentralAdminApiError,
	createCentralAdminUser,
	deleteCentralAdminUser,
	fetchCentralAdminUsers,
	inviteCentralAdminUser,
	resendCentralAdminInvitation,
	type CentralAdminUserSummary,
} from '@/lib/central-admin';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function roleLabel(role: string): string {
	if (role === 'akuntan') return 'Akuntan';
	if (role === 'pencari') return 'Pencari Akuntan';
	if (role) return role;
	return 'Pengguna';
}

type FormMode = 'create' | 'invite' | null;

export function UsersPanel() {
	const [users, setUsers] = useState<CentralAdminUserSummary[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [formMode, setFormMode] = useState<FormMode>(null);
	const [formName, setFormName] = useState('');
	const [formEmail, setFormEmail] = useState('');
	const [formPassword, setFormPassword] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<CentralAdminUserSummary | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [resendingId, setResendingId] = useState<string | null>(null);
	const [inviteResult, setInviteResult] = useState<{ name: string; email: string } | null>(null);

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

	const filteredUsers = useMemo(() => {
		if (!users) return [];
		const query = search.trim().toLowerCase();
		if (!query) return users;
		return users.filter(
			user =>
				user.name.toLowerCase().includes(query) ||
				user.email.toLowerCase().includes(query),
		);
	}, [users, search]);

	const summary = useMemo(() => {
		const list = users ?? [];
		return {
			total: list.length,
			admins: list.filter(user => user.isCentralAdmin).length,
			akuntan: list.filter(user => user.akuntan_role === 'akuntan').length,
			pencari: list.filter(user => user.akuntan_role === 'pencari').length,
		};
	}, [users]);

	function openForm(mode: FormMode) {
		setFormMode(mode);
		setFormName('');
		setFormEmail('');
		setFormPassword('');
		setInviteResult(null);
	}

	async function handleSubmit() {
		if (!formMode) return;
		setIsSaving(true);
		setError('');
		try {
			if (formMode === 'create') {
				await createCentralAdminUser({
					email: formEmail,
					password: formPassword,
					name: formName,
				});
				toast.success('Pengguna berhasil ditambahkan.');
				setFormMode(null);
			} else {
				const result = await inviteCentralAdminUser({ email: formEmail, name: formName });
				if (result.createdUser) {
					setInviteResult({ name: result.user.name || formEmail, email: formEmail });
					toast.success('Undangan back end berhasil dibuat. Tautan untuk mengatur kata sandi telah dikirim ke email pengguna.');
				} else {
					toast.success('Akses back end diberikan kepada pengguna yang sudah terdaftar.');
					setFormMode(null);
				}
			}
			await load(true);
		} catch (err) {
			const message =
				err instanceof CentralAdminApiError
					? err.message
					: 'Gagal menyimpan. Coba lagi.';
			setError(message);
		} finally {
			setIsSaving(false);
		}
	}

		async function handleResend(user: CentralAdminUserSummary) {
		setResendingId(user.id);
		try {
			await resendCentralAdminInvitation(user.id);
			toast.success('Email atur kata sandi telah dikirim ulang.');
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal mengirim ulang email.');
		} finally {
			setResendingId(null);
		}
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		setIsDeleting(true);
		try {
			await deleteCentralAdminUser(deleteTarget.id);
			setUsers(prev => prev?.filter(user => user.id !== deleteTarget.id) ?? null);
			toast.success('Pengguna berhasil dihapus.');
			setDeleteTarget(null);
		} catch (err) {
			toast.error(
				err instanceof CentralAdminApiError ? err.message : 'Gagal menghapus pengguna.',
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
						<Users className="size-7 text-primary" strokeWidth={2} />
						Pengguna
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Kelola seluruh pengguna terdaftar: tambah, undang ke back end, dan hapus.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => openForm('invite')}
						className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-accent/40 px-4 py-2.5 text-xs font-bold text-accent-foreground transition-colors hover:bg-accent"
					>
						<WandSparkles className="size-3.5" /> Undang ke back end
					</button>
					<button
						type="button"
						onClick={() => openForm('create')}
						className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
					>
						<UserPlus className="size-3.5" /> Tambah pengguna
					</button>
				</div>
			</header>

			<section className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{[
					{ label: 'Total pengguna', value: summary.total },
					{ label: 'Admin pusat', value: summary.admins },
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
					<button
						type="button"
						onClick={() => void load(true)}
						disabled={isRefreshing}
						className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
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
						<Loader2 className="size-4 animate-spin" /> Memuat daftar pengguna…
					</div>
				) : filteredUsers.length === 0 ? (
					<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
						{users && users.length > 0
							? 'Tidak ada pengguna yang cocok dengan pencarian.'
							: 'Belum ada pengguna terdaftar.'}
					</p>
				) : (
					<div className="overflow-x-auto rounded-xl border border-border">
						<table className="w-full min-w-[48rem] text-left text-sm">
							<thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3 font-semibold">Pengguna</th>
									<th className="px-4 py-3 font-semibold">Role</th>
									<th className="px-4 py-3 font-semibold">Perusahaan</th>
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
											<span className="block text-xs text-muted-foreground">{user.email}</span>
										</td>
										<td className="px-4 py-3">{roleLabel(user.akuntan_role)}</td>
										<td className="px-4 py-3 text-xs">
											<span className="inline-flex items-center gap-1">
												<Building2 className="size-3 text-muted-foreground" />
												{user.ownedCompanies} milik · {user.memberCompanies} anggota
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
											<div className="flex items-center justify-end gap-1.5">
												<button
													type="button"
													onClick={() => void handleResend(user)}
													disabled={resendingId === user.id}
													className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
												>
													{resendingId === user.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
													Kirim ulang
												</button>
												<button
													type="button"
													onClick={() => setDeleteTarget(user)}
													className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-50"
												>
													<Trash2 className="size-3.5" /> Hapus
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Create / invite dialog */}
			<Dialog open={formMode !== null && !inviteResult} onOpenChange={open => !open && setFormMode(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>
							{formMode === 'create' ? 'Tambah pengguna' : 'Undang pengguna ke back end'}
						</DialogTitle>
						<DialogDescription>
							{formMode === 'create'
								? 'Buat akun pengguna baru. Pengguna dapat masuk dengan email dan kata sandi di bawah.'
								: 'Beri akses Admin Pusat kepada pengguna. Jika akun belum ada, akun akan dibuat dan tautan untuk mengatur kata sandi dikirim ke email mereka.'}
						</DialogDescription>
					</DialogHeader>
					<form
						className="flex flex-col gap-3"
						onSubmit={event => {
							event.preventDefault();
							void handleSubmit();
						}}
					>
						<label className="flex flex-col gap-1">
							<span className="text-xs font-semibold">Nama</span>
							<input
								type="text"
								value={formName}
								onChange={event => setFormName(event.target.value)}
								required
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className="text-xs font-semibold">Email</span>
							<input
								type="email"
								value={formEmail}
								onChange={event => setFormEmail(event.target.value)}
								required
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
							/>
						</label>
						{formMode === 'create' ? (
							<label className="flex flex-col gap-1">
								<span className="text-xs font-semibold">Kata sandi</span>
								<input
									type="password"
									value={formPassword}
									onChange={event => setFormPassword(event.target.value)}
									required
									minLength={8}
									placeholder="Minimal 8 karakter"
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
								/>
							</label>
						) : null}
						{error ? (
							<p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
								{error}
							</p>
						) : null}
						<div className="flex items-center justify-end gap-2 pt-1">
							<button
								type="button"
								onClick={() => setFormMode(null)}
								className="rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold"
							>
								Batal
							</button>
							<button
								type="submit"
								disabled={isSaving}
								className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
							>
								{isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
								{formMode === 'create' ? 'Tambah' : 'Undang'}
							</button>
						</div>
					</form>
				</DialogContent>
			</Dialog>

			{/* Invite result dialog */}
			<Dialog open={inviteResult !== null} onOpenChange={open => !open && setInviteResult(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Undangan back end berhasil</DialogTitle>
						<DialogDescription>
							Tautan untuk mengatur kata sandi telah dikirim ke email pengguna. Setelah mengatur kata sandi, mereka dapat masuk di halaman login dan mengakses panel Admin Pusat.
						</DialogDescription>
					</DialogHeader>
					{inviteResult ? (
						<div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4 text-sm">
							<div>
								<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nama</span>
								<p className="font-semibold">{inviteResult.name}</p>
							</div>
							<div>
								<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</span>
								<p className="font-semibold">{inviteResult.email}</p>
							</div>
							<p className="text-xs text-muted-foreground">
								Minta pengguna memeriksa kotak masuk (dan folder spam) untuk email dari Catet Pajak.
							</p>
						</div>
					) : null}
					<div className="flex justify-end">
						<button
							type="button"
							onClick={() => {
								setInviteResult(null);
								setFormMode(null);
							}}
							className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground"
						>
							Selesai
						</button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation dialog */}
			<Dialog open={deleteTarget !== null} onOpenChange={open => !open && setDeleteTarget(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Hapus pengguna?</DialogTitle>
						<DialogDescription>
							{deleteTarget?.ownedCompanies
								? `Pengguna ini memiliki ${deleteTarget.ownedCompanies} perusahaan. Hapus atau alihkan kepemilikan perusahaan terlebih dahulu.`
								: 'Tindakan ini tidak dapat dibatalkan. Seluruh data milik pengguna akan dihapus permanen.'}
						</DialogDescription>
					</DialogHeader>
					{deleteTarget ? (
						<div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
							<p className="font-semibold">{deleteTarget.name || deleteTarget.email}</p>
							<p className="text-xs text-muted-foreground">{deleteTarget.email}</p>
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
