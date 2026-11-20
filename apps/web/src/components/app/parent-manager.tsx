import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LinkIcon, Plus, Send, Trash2, UserPlus, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { type Company } from '@/lib/accounting';
import type { Student } from '@/lib/students';

interface ParentSummary {
	id: string;
	name: string;
	email: string;
	phone: string;
	students: { id: string; student_name: string; student_id_number: string }[];
}

interface ParentManagerProps {
	company: Company;
}

export function ParentManager({ company }: ParentManagerProps) {
	const [parents, setParents] = useState<ParentSummary[]>([]);
	const [students, setStudents] = useState<Student[]>([]);
	const [loading, setLoading] = useState(true);
	const [createOpen, setCreateOpen] = useState(false);
	const [linkParent, setLinkParent] = useState<ParentSummary | null>(null);
	const [passwordParent, setPasswordParent] = useState<ParentSummary | null>(null);
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);

	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		const token = pb.authStore.token;
		try {
			const [parentRes, studentList] = await Promise.all([
				fetch('/api/parent/manage', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
					body: JSON.stringify({ action: 'list', companyId: company.id }),
				}),
				pb
					.collection('students')
					.getFullList<Student>({ filter: pb.filter('company = {:c}', { c: company.id }), sort: 'student_name', requestKey: null }),
			]);
			const data = (await parentRes.json().catch(() => ({}))) as { parents?: ParentSummary[] };
			setParents(data.parents ?? []);
			setStudents(studentList);
		} catch {
			toast.error('Gagal memuat data parent.');
		} finally {
			setLoading(false);
		}
	}, [company.id]);

	useEffect(() => {
		load();
	}, [load]);

	const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmedEmail = email.trim().toLowerCase();
		if (!name.trim()) {
			toast.error('Nama parent wajib diisi.');
			return;
		}
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
			toast.error('Email parent tidak valid.');
			return;
		}
		setSaving(true);
		try {
			const res = await fetch('/api/parent/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` },
				body: JSON.stringify({
					action: 'create',
					companyId: company.id,
					name: name.trim(),
					email: trimmedEmail,
					phone: phone.trim(),
					studentIds: selectedStudentIds,
				}),
			});
			const data = (await res.json().catch(() => ({}))) as {
				parent?: { id: string; email: string; name: string };
				invitationSent?: boolean;
				error?: string;
			};
			if (!res.ok) throw new Error(data.error || 'Gagal membuat akun parent.');
			toast.success('Akun parent dibuat. Tautan untuk mengatur kata sandi telah dikirim ke email parent.', {
				description: `Email: ${data.parent?.email}. Login di /app/parent`,
				duration: 12000,
			});
			setName('');
			setEmail('');
			setPhone('');
			setSelectedStudentIds([]);
			setCreateOpen(false);
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal membuat akun parent.');
		} finally {
			setSaving(false);
		}
	};

	const handleResend = async (parent: ParentSummary) => {
		try {
			const res = await fetch('/api/parent/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` },
				body: JSON.stringify({ action: 'resend', companyId: company.id, parentId: parent.id }),
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string; invitationSent?: boolean };
			if (!res.ok) throw new Error(data.error || 'Gagal mengirim ulang email undangan.');
			toast.success('Email undangan telah dikirim ulang ke parent.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal mengirim ulang email undangan.');
		}
	};

	const handleLink = async (studentId: string) => {
		if (!linkParent) return;
		try {
			const res = await fetch('/api/parent/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` },
				body: JSON.stringify({
					action: 'link',
					companyId: company.id,
					parentId: linkParent.id,
					studentId,
				}),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(data.error || 'Gagal mengaitkan siswa.');
			}
			toast.success('Siswa dikaitkan dengan parent.');
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal mengaitkan siswa.');
		}
	};

	const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!passwordParent) return;
		if (newPassword.length < 8) {
			toast.error('Kata sandi baru minimal 8 karakter.');
			return;
		}
		if (newPassword !== confirmPassword) {
			toast.error('Konfirmasi tidak cocok dengan kata sandi baru.');
			return;
		}
		setSaving(true);
		try {
			const res = await fetch('/api/parent/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` },
				body: JSON.stringify({
					action: 'reset-password',
					companyId: company.id,
					parentId: passwordParent.id,
					password: newPassword,
					passwordConfirm: confirmPassword,
				}),
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error || 'Gagal memperbarui kata sandi.');
			toast.success('Kata sandi parent berhasil diperbarui.');
			setPasswordParent(null);
			setNewPassword('');
			setConfirmPassword('');
			setShowNew(false);
			setShowConfirm(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal memperbarui kata sandi.');
		} finally {
			setSaving(false);
		}
	};

	const handleUnlink = async (studentId: string) => {
		if (!window.confirm('Putuskan kaitan siswa ini dari parent?')) return;
		try {
			const res = await fetch('/api/parent/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` },
				body: JSON.stringify({ action: 'unlink', companyId: company.id, studentId }),
			});
			if (!res.ok) throw new Error('Gagal memutus kaitan siswa.');
			toast.success('Kaitan siswa diputus.');
			await load();
		} catch {
			toast.error('Gagal memutus kaitan siswa.');
		}
	};

	const linkedIds = new Set(parents.flatMap((p) => p.students.map((s) => s.id)));
	const availableStudents = students.filter((s) => !linkedIds.has(s.id));

	const toggleStudent = (id: string) => {
		setSelectedStudentIds((prev) =>
			prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id],
		);
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						Parent Data
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Kelola akun parent dan kaitkan dengan siswa untuk melihat tagihan.
					</p>
				</div>
				<button
					type="button"
					onClick={() => setCreateOpen(true)}
					className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
				>
					<Plus className="size-4" /> Tambah Parent
				</button>
			</div>

			{loading ? (
				<p className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
					Memuat data parent…
				</p>
			) : parents.length === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center">
					<div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
						<Users className="size-6" />
					</div>
					<p className="text-sm font-semibold">Belum ada akun parent</p>
					<p className="max-w-sm text-xs text-muted-foreground">
						Buat akun parent, lalu kaitkan dengan siswa agar orang tua dapat melihat tagihan dan membayar.
					</p>
				</div>
			) : (
				<section className="overflow-hidden rounded-[1.35rem] border border-emerald-100 bg-white shadow-[0_8px_30px_rgba(16,185,129,0.06)]">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[860px] text-sm">
							<thead>
								<tr className="border-b border-emerald-100/90 bg-[#f7fbf8] text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/70">
									<th className="px-5 py-3.5">Nama Parent</th>
									<th className="px-4 py-3.5">Email Login</th>
									<th className="px-4 py-3.5">Telepon</th>
									<th className="px-4 py-3.5">Siswa Terkait</th>
									<th className="px-4 py-3.5">Status</th>
									<th className="px-4 py-3.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{parents.map((parent) => {
									const linked = parent.students.length > 0;
									return (
										<tr key={parent.id} className="border-b border-emerald-50 align-top last:border-0">
											<td className="px-5 py-3.5 font-semibold text-emerald-600">{parent.name || '—'}</td>
											<td className="max-w-[220px] break-all px-4 py-3.5 text-emerald-900/70">{parent.email || '—'}</td>
											<td className="whitespace-nowrap px-4 py-3.5 text-emerald-900/45">{parent.phone || '—'}</td>
											<td className="px-4 py-3.5">
												{linked ? (
													<ul className="flex flex-col gap-1.5">
														{parent.students.map((s) => (
															<li key={s.id} className="flex items-center gap-2">
																<span className="min-w-0 text-emerald-900/80">
																	<span className="font-medium">{s.student_name}</span>
																	<span className="text-emerald-900/40">
																		{' '}
																		({s.student_id_number || '—'})
																	</span>
																</span>
																<button
																	type="button"
																	onClick={() => handleUnlink(s.id)}
																	aria-label={`Putus kaitan ${s.student_name}`}
																	title="Putus kaitan siswa"
																	className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-emerald-200/80 text-emerald-800/70 transition-colors hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
																>
																	<Trash2 className="size-3.5" />
																</button>
															</li>
														))}
													</ul>
												) : (
													<span className="text-emerald-900/45">—</span>
												)}
											</td>
											<td className="px-4 py-3.5">
												<span
													className={cn(
														'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
														linked ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700',
													)}
												>
													{linked ? 'Terkait' : 'Belum terkait'}
												</span>
											</td>
											<td className="px-4 py-3.5">
												<div className="flex justify-end gap-2">
													<button
														type="button"
														onClick={() => void handleResend(parent)}
														aria-label={`Kirim ulang undangan ke ${parent.name || parent.email}`}
														title="Kirim Ulang Undangan"
														className="inline-flex size-8 items-center justify-center rounded-full border border-emerald-200/80 text-emerald-800/70 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
													>
														<Send className="size-3.5" />
													</button>
													<button
														type="button"
														onClick={() => setLinkParent(parent)}
														aria-label={`Kaitkan siswa ke ${parent.name || parent.email}`}
														title="Kaitkan Siswa"
														className="inline-flex size-8 items-center justify-center rounded-full border border-emerald-200/80 text-emerald-800/70 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
													>
														<LinkIcon className="size-3.5" />
													</button>
													<button
														type="button"
														onClick={() => {
															setPasswordParent(parent);
															setNewPassword('');
															setConfirmPassword('');
														}}
														aria-label={`Ubah kata sandi ${parent.name || parent.email}`}
														title="Ubah Kata Sandi"
														className="inline-flex size-8 items-center justify-center rounded-full border border-emerald-200/80 text-emerald-800/70 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
													>
														<KeyRound className="size-3.5" />
													</button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</section>
			)}

			{createOpen ? (
				<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
					<div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-soft">
						<div className="flex items-center justify-between border-b border-border px-5 py-4">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Parent Data
								</p>
								<h2 className="text-lg font-extrabold">Tambah Parent</h2>
							</div>
							<button
								type="button"
								onClick={() => setCreateOpen(false)}
								className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
								aria-label="Tutup"
							>
								<X className="size-4" />
							</button>
						</div>
						<form onSubmit={handleCreate} className="space-y-3 p-5">
							<label className="grid gap-1.5">
								<span className="text-xs font-semibold">Nama Parent</span>
								<input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Nama orang tua / wali"
									className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary focus:ring-2"
								/>
							</label>
							<label className="grid gap-1.5">
								<span className="text-xs font-semibold">Email</span>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="email@contoh.com"
									className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary focus:ring-2"
								/>
							</label>
							<label className="grid gap-1.5">
								<span className="text-xs font-semibold">Telepon</span>
								<input
									value={phone}
									onChange={(e) => setPhone(e.target.value)}
									placeholder="08xxxxxxxxxx"
									className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary focus:ring-2"
								/>
							</label>
							<label className="grid gap-1.5">
								<span className="text-xs font-semibold">Kaitkan Siswa</span>
								{availableStudents.length === 0 ? (
									<p className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
										Belum ada siswa yang tersedia. Tambahkan siswa terlebih dahulu pada tab Student.
									</p>
								) : (
									<div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-background">
										{availableStudents.map((s) => {
											const checked = selectedStudentIds.includes(s.id);
											return (
												<label
													key={s.id}
													className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-accent"
												>
													<input
														type="checkbox"
														checked={checked}
														onChange={() => toggleStudent(s.id)}
														className="size-4 accent-primary"
													/>
													<span className="font-semibold">{s.student_name}</span>
													{s.student_id_number ? (
														<span className="text-muted-foreground">({s.student_id_number})</span>
													) : null}
												</label>
											);
										})}
									</div>
								)}
								{selectedStudentIds.length > 0 ? (
									<p className="text-[11px] text-muted-foreground">
										{selectedStudentIds.length} siswa terpilih akan dikaitkan dengan akun parent ini.
									</p>
								) : null}
							</label>
							<p className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
								Setelah akun dibuat, tautan untuk mengatur kata sandi akan dikirim ke email parent.
							</p>
							<div className="flex justify-end gap-2 border-t border-border pt-4">
								<button
									type="button"
									onClick={() => setCreateOpen(false)}
									disabled={saving}
									className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
								>
									Batal
								</button>
								<button
									type="submit"
									disabled={saving}
									className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
								>
									<UserPlus className="size-4" /> {saving ? 'Menyimpan…' : 'Buat Akun'}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}

			{passwordParent ? (
				<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
					<div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-soft">
						<div className="flex items-center justify-between border-b border-border px-5 py-4">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Ubah Kata Sandi
								</p>
								<h2 className="text-lg font-extrabold">{passwordParent.name}</h2>
								<p className="break-all text-xs text-muted-foreground">{passwordParent.email}</p>
							</div>
							<button
								type="button"
								onClick={() => setPasswordParent(null)}
								className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
								aria-label="Tutup"
							>
								<X className="size-4" />
							</button>
						</div>
						<form onSubmit={handleResetPassword} className="space-y-3 p-5">
							<label className="grid gap-1.5">
								<span className="text-xs font-semibold">Kata Sandi Baru</span>
								<div className="relative">
									<input
										type={showNew ? 'text' : 'password'}
										autoComplete="new-password"
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										className="h-10 w-full rounded-xl border border-border bg-background px-3 pr-16 text-sm outline-none ring-primary focus:ring-2"
									/>
									<button
										type="button"
										onClick={() => setShowNew((s) => !s)}
										className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground"
									>
										{showNew ? 'Sembunyi' : 'Lihat'}
									</button>
								</div>
							</label>
							<label className="grid gap-1.5">
								<span className="text-xs font-semibold">Konfirmasi Kata Sandi Baru</span>
								<div className="relative">
									<input
										type={showConfirm ? 'text' : 'password'}
										autoComplete="new-password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										className="h-10 w-full rounded-xl border border-border bg-background px-3 pr-16 text-sm outline-none ring-primary focus:ring-2"
									/>
									<button
										type="button"
										onClick={() => setShowConfirm((s) => !s)}
										className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground"
									>
										{showConfirm ? 'Sembunyi' : 'Lihat'}
									</button>
								</div>
							</label>
							<p className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
								Kata sandi minimal 8 karakter. Kata sandi tidak disimpan sebagai teks biasa dan tidak ditampilkan kembali setelah disimpan.
							</p>
							<div className="flex justify-end gap-2 border-t border-border pt-4">
								<button
									type="button"
									onClick={() => setPasswordParent(null)}
									disabled={saving}
									className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
								>
									Batal
								</button>
								<button
									type="submit"
									disabled={saving}
									className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
								>
									<KeyRound className="size-4" /> {saving ? 'Menyimpan…' : 'Simpan Kata Sandi'}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}

			{linkParent ? (
				<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
					<div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-soft">
						<div className="flex items-center justify-between border-b border-border px-5 py-4">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Kaitkan Siswa
								</p>
								<h2 className="text-lg font-extrabold">{linkParent.name}</h2>
							</div>
							<button
								type="button"
								onClick={() => setLinkParent(null)}
								className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
								aria-label="Tutup"
							>
								<X className="size-4" />
							</button>
						</div>
						<div className="p-5">
							{availableStudents.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									Semua siswa sudah terkait dengan parent lain.
								</p>
							) : (
								<ul className="flex flex-col gap-1.5">
									{availableStudents.map((s) => (
										<li key={s.id}>
											<button
												type="button"
												onClick={() => {
													void handleLink(s.id);
													setLinkParent(null);
												}}
												className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
											>
												<span>
													<span className="font-semibold">{s.student_name}</span>
													{s.student_id_number ? (
														<span className="text-muted-foreground"> ({s.student_id_number})</span>
													) : null}
												</span>
												<LinkIcon className="size-4 text-primary" />
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
