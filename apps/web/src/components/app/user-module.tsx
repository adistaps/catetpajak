import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ChevronDown,
	ChevronRight,
	Pencil,
	Plus,
	Send,
	Trash2,
	UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	ALL_PERMISSIONS,
	PERMISSION_LABELS,
	ROLE_DEFINITIONS,
	ROLE_OPTIONS,
	type AppPermission,
	type MemberRole,
	permissionsForRole,
} from '@/data/user-roles';
import {
	type CompanyMember,
	listCompanyMembers,
} from '@/lib/company-members';
import type { Company } from '@/lib/accounting';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { cn } from '@/lib/utils';

interface UserModuleProps {
	company: Company;
}

type FormState = {
	name: string;
	email: string;
	role: MemberRole;
	permissions: AppPermission[];
	canEdit: boolean;
	accessLimited: boolean;
	accessUntil: string;
	status: CompanyMember['status'];
};

const emptyForm = (): FormState => ({
	name: '',
	email: '',
	role: 'akuntan',
	permissions: permissionsForRole('akuntan'),
	canEdit: true,
	accessLimited: false,
	accessUntil: '',
	status: 'active',
});

export function UserModule({ company }: UserModuleProps) {
	const { user } = useAuth();
	const [members, setMembers] = useState<CompanyMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(emptyForm);
	const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({
		pemilik: true,
		admin: false,
		akuntan: false,
		finance: false,
		hr: false,
	});
	const [roleTab, setRoleTab] = useState<'existing' | 'custom'>('existing');
	const [tempPasswordInfo, setTempPasswordInfo] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const list = await listCompanyMembers(company.id);
			setMembers(list);
		} catch {
			toast.error('Gagal memuat daftar pengguna.');
		} finally {
			setLoading(false);
		}
	}, [company.id]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	const ownerRow = useMemo(
		() => ({
			id: 'owner',
			name: 'Pemilik perusahaan',
			email: user?.id === company.owner ? (user.email as string) : '—',
			role: 'pemilik' as MemberRole,
			status: 'active' as const,
		}),
		[company.owner, user],
	);

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyForm());
		setRoleTab('existing');
		setTempPasswordInfo(null);
		setShowForm(true);
	};

	const openEdit = (member: CompanyMember) => {
		setEditingId(member.id);
		setForm({
			name: member.name,
			email: member.email,
			role: member.role,
			permissions: member.permissions?.length
				? member.permissions
				: permissionsForRole(member.role),
			canEdit: member.can_edit,
			accessLimited: member.access_limited,
			accessUntil: member.access_until ? member.access_until.slice(0, 10) : '',
			status: member.status,
		});
		setRoleTab(member.role === 'custom' ? 'custom' : 'existing');
		setTempPasswordInfo(null);
		setShowForm(true);
	};

	const setRole = (role: MemberRole) => {
		setForm(prev => ({
			...prev,
			role,
			permissions: permissionsForRole(role, prev.permissions),
			canEdit: role === 'pembaca' ? false : role === 'custom' ? prev.canEdit : true,
		}));
	};

	const togglePermission = (perm: AppPermission) => {
		setForm(prev => {
			const has = prev.permissions.includes(perm);
			const next = has
				? prev.permissions.filter(p => p !== perm)
				: [...prev.permissions, perm];
			return { ...prev, role: 'custom', permissions: next };
		});
		setRoleTab('custom');
	};

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!user?.id) return;
		setSaving(true);
		setTempPasswordInfo(null);
		try {
			const payload = {
				action: editingId ? 'update' : 'invite',
				companyId: company.id,
				memberId: editingId ?? undefined,
				name: form.name,
				email: form.email,
				role: form.role,
				permissions: form.permissions,
				canEdit: form.canEdit,
				accessLimited: form.accessLimited,
				accessUntil: form.accessUntil || null,
				status: form.status,
			};
			const res = await fetch('/api/company-members', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify(payload),
			});
			const data = (await res.json()) as {
				error?: string;
				message?: string;
				createdUser?: boolean;
				invitationSent?: boolean;
			};
			if (!res.ok) {
				throw new Error(data.error || data.message || 'Gagal menyimpan pengguna.');
			}
			if (!editingId && data.createdUser) {
				setTempPasswordInfo(
					'Akun baru dibuat. Tautan untuk mengatur kata sandi telah dikirim ke email pengguna.',
				);
			} else {
				setShowForm(false);
			}
			toast.success(editingId ? 'Pengguna diperbarui.' : 'Pengguna diundang.');
			await refresh();
			if (editingId || !data.createdUser) {
				setShowForm(false);
				setEditingId(null);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal menyimpan.');
		} finally {
			setSaving(false);
		}
	};

	const resend = async (member: CompanyMember) => {
		if (!user?.id) return;
		try {
			const res = await fetch('/api/company-members', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({
					action: 'resend',
					companyId: company.id,
					memberId: member.id,
				}),
			});
			const data = (await res.json()) as { error?: string; message?: string; invitationSent?: boolean };
			if (!res.ok) throw new Error(data.error || data.message || 'Gagal mengirim ulang undangan.');
			toast.success('Email undangan telah dikirim ulang.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal mengirim ulang undangan.');
		}
	};

	const remove = async (member: CompanyMember) => {
		if (!user?.id) return;
		if (member.user === company.owner) {
			toast.error('Pemilik perusahaan tidak dapat dihapus.');
			return;
		}
		if (!window.confirm(`Hapus akses ${member.name}?`)) return;
		try {
			const res = await fetch('/api/company-members', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({
					action: 'delete',
					companyId: company.id,
					memberId: member.id,
				}),
			});
			const data = (await res.json()) as { error?: string; message?: string };
			if (!res.ok) throw new Error(data.error || data.message || 'Gagal menghapus.');
			toast.success('Pengguna dihapus dari perusahaan.');
			await refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal menghapus.');
		}
	};

	const roleLabel = (role: MemberRole) =>
		ROLE_OPTIONS.find(r => r.value === role)?.label ?? role;

	return (
		<div className="mx-auto max-w-6xl space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-sm text-muted-foreground">Pengaturan pengguna</p>
					<h1 className="text-2xl font-bold tracking-tight">Undang pengguna</h1>
				</div>
				{!showForm ? (
					<Button type="button" onClick={openCreate} className="rounded-full gap-2">
						<UserPlus className="size-4" /> Undang pengguna
					</Button>
				) : null}
			</div>

			{showForm ? (
				<form
					onSubmit={submit}
					className="rounded-2xl border border-border bg-card p-6 shadow-soft-sm space-y-8"
				>
					<section className="space-y-4">
						<h2 className="text-lg font-semibold">Info pengguna</h2>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="member-name">
									Nama pengguna <span className="text-destructive">*</span>
								</Label>
								<Input
									id="member-name"
									required
									value={form.name}
									onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
									className="rounded-xl"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="member-email">
									Email <span className="text-destructive">*</span>
								</Label>
								<Input
									id="member-email"
									type="email"
									required
									disabled={Boolean(editingId)}
									value={form.email}
									onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
									className="rounded-xl"
								/>
							</div>
						</div>

						<div className="flex items-start gap-3 pt-1">
							<Checkbox
								id="access-limit"
								checked={form.accessLimited}
								onCheckedChange={v =>
									setForm(f => ({ ...f, accessLimited: v === true }))
								}
							/>
							<div>
								<Label htmlFor="access-limit" className="font-medium">
									Terapkan batas waktu akses
								</Label>
								<p className="text-sm text-muted-foreground">
									Dapat diterapkan ke semua peran kecuali Owner dan Ultimate dengan List
									Manager tercentang.
								</p>
								{form.accessLimited ? (
									<Input
										type="date"
										className="mt-2 max-w-xs rounded-xl"
										value={form.accessUntil}
										onChange={e =>
											setForm(f => ({ ...f, accessUntil: e.target.value }))
										}
										required={form.accessLimited}
									/>
								) : null}
							</div>
						</div>
					</section>

					<section className="grid gap-6 lg:grid-cols-[1fr_280px]">
						<div className="space-y-4">
							<h2 className="text-lg font-semibold">
								Peran <span className="text-destructive">*</span>
							</h2>
							<div className="flex gap-4 border-b border-border text-sm font-semibold">
								<button
									type="button"
									className={cn(
										'border-b-2 px-1 pb-2 transition-colors',
										roleTab === 'existing'
											? 'border-primary text-primary'
											: 'border-transparent text-muted-foreground',
									)}
									onClick={() => {
										setRoleTab('existing');
										if (form.role === 'custom') setRole('akuntan');
									}}
								>
									Existing
								</button>
								<button
									type="button"
									className={cn(
										'flex items-center gap-2 border-b-2 px-1 pb-2 transition-colors',
										roleTab === 'custom'
											? 'border-primary text-primary'
											: 'border-transparent text-muted-foreground',
									)}
									onClick={() => {
										setRoleTab('custom');
										setRole('custom');
									}}
								>
									Custom
									<span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
										Baru
									</span>
								</button>
							</div>

							{roleTab === 'existing' ? (
								<div className="divide-y divide-border rounded-xl border border-border">
									{(Object.keys(ROLE_DEFINITIONS) as Array<
										keyof typeof ROLE_DEFINITIONS
									>).map(key => {
										const def = ROLE_DEFINITIONS[key];
										const open = expandedRoles[key];
										const selected = form.role === key;
										return (
											<div key={key} className="px-4 py-3">
												<div className="flex items-start gap-3">
													<button
														type="button"
														className="mt-0.5 text-muted-foreground"
														onClick={() =>
															setExpandedRoles(s => ({ ...s, [key]: !s[key] }))
														}
													>
														{open ? (
															<ChevronDown className="size-4" />
														) : (
															<ChevronRight className="size-4" />
														)}
													</button>
													<label className="flex flex-1 cursor-pointer items-start gap-3">
														<input
															type="radio"
															name="role"
															className="mt-1"
															checked={selected}
															onChange={() => setRole(key)}
														/>
														<div>
															<p className="font-semibold">{def.label}</p>
															{open ? (
																<ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
																	{def.description.map(line => (
																		<li key={line}>{line}</li>
																	))}
																</ul>
															) : null}
														</div>
													</label>
												</div>
											</div>
										);
									})}
								</div>
							) : (
								<div className="space-y-4 rounded-xl border border-border p-4">
									<p className="text-sm text-muted-foreground">
										Pilih modul yang boleh diakses. Wewenang custom bersifat dominan.
									</p>
									<div className="grid gap-2 sm:grid-cols-2">
										{ALL_PERMISSIONS.map(perm => (
											<label
												key={perm}
												className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
											>
												<Checkbox
													checked={form.permissions.includes(perm)}
													onCheckedChange={() => togglePermission(perm)}
												/>
												{PERMISSION_LABELS[perm]}
											</label>
										))}
									</div>
									<label className="flex items-center gap-2 text-sm">
										<Checkbox
											checked={form.canEdit}
											onCheckedChange={v =>
												setForm(f => ({ ...f, canEdit: v === true }))
											}
										/>
										Boleh menambah dan mengedit data (List Manager)
									</label>
								</div>
							)}

							{editingId ? (
								<div className="space-y-2">
									<Label>Status</Label>
									<select
										className="w-full max-w-xs rounded-xl border border-border bg-background px-3 py-2 text-sm"
										value={form.status}
										onChange={e =>
											setForm(f => ({
												...f,
												status: e.target.value as CompanyMember['status'],
											}))
										}
									>
										<option value="active">Aktif</option>
										<option value="invited">Diundang</option>
										<option value="disabled">Nonaktif</option>
									</select>
								</div>
							) : null}
						</div>

						<aside className="h-fit rounded-xl border border-border bg-muted/40 p-4 text-sm">
							<p className="mb-2 font-semibold">Ketentuan memilih peran</p>
							<ul className="list-disc space-y-2 pl-4 text-muted-foreground">
								<li>
									Wewenang peran custom bersifat dominan (selalu menjadi acuan pengaturan
									peran).
								</li>
								<li>
									Jika Anda memilih lebih dari 1 peran custom, wewenang dari masing-masing
									peran custom akan digabungkan.
								</li>
							</ul>
						</aside>
					</section>

					{tempPasswordInfo ? (
						<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
							{tempPasswordInfo}
						</div>
					) : null}

					<div className="flex flex-wrap gap-3">
						<Button type="submit" disabled={saving} className="rounded-full gap-2">
							{editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
							{saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Undang pengguna'}
						</Button>
						<Button
							type="button"
							variant="outline"
							className="rounded-full"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
								setTempPasswordInfo(null);
							}}
						>
							Batal
						</Button>
					</div>
				</form>
			) : null}

			<div className="rounded-2xl border border-border bg-card shadow-soft-sm overflow-hidden">
				<div className="border-b border-border px-5 py-4">
					<h2 className="font-semibold">Daftar pengguna</h2>
					<p className="text-sm text-muted-foreground">
						Kelola siapa saja yang dapat mengakses {company.name}.
					</p>
				</div>
				{loading ? (
					<p className="p-6 text-sm text-muted-foreground">Memuat…</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[640px] text-left text-sm">
							<thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-5 py-3 font-semibold">Nama</th>
									<th className="px-5 py-3 font-semibold">Email</th>
									<th className="px-5 py-3 font-semibold">Peran</th>
									<th className="px-5 py-3 font-semibold">Status</th>
									<th className="px-5 py-3 font-semibold">Akses</th>
									<th className="px-5 py-3 font-semibold text-right">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								<tr className="bg-emerald-50/40">
									<td className="px-5 py-3 font-medium">{ownerRow.name}</td>
									<td className="px-5 py-3 text-muted-foreground">{ownerRow.email}</td>
									<td className="px-5 py-3">Ultimate (Owner)</td>
									<td className="px-5 py-3">
										<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
											Aktif
										</span>
									</td>
									<td className="px-5 py-3 text-muted-foreground">Penuh</td>
									<td className="px-5 py-3 text-right text-muted-foreground">—</td>
								</tr>
								{members.map(member => (
									<tr key={member.id}>
										<td className="px-5 py-3 font-medium">{member.name}</td>
										<td className="px-5 py-3 text-muted-foreground">{member.email}</td>
										<td className="px-5 py-3">{roleLabel(member.role)}</td>
										<td className="px-5 py-3">
											<span
												className={cn(
													'rounded-full px-2 py-0.5 text-xs font-semibold',
													member.status === 'active' &&
														'bg-emerald-100 text-emerald-800',
													member.status === 'invited' &&
														'bg-amber-100 text-amber-800',
													member.status === 'disabled' &&
														'bg-slate-100 text-slate-600',
												)}
											>
												{member.status === 'active'
													? 'Aktif'
													: member.status === 'invited'
														? 'Diundang'
														: 'Nonaktif'}
											</span>
										</td>
										<td className="px-5 py-3 text-muted-foreground">
											{member.can_edit ? 'Edit & lihat' : 'Hanya lihat'}
											{member.access_limited && member.access_until
												? ` · s/d ${member.access_until.slice(0, 10)}`
												: ''}
										</td>
										<td className="px-5 py-3">
											<div className="flex justify-end gap-1">
												{member.status === 'invited' ? (
													<Button
														type="button"
														size="icon"
														variant="ghost"
														onClick={() => resend(member)}
														aria-label="Kirim ulang undangan"
														title="Kirim ulang email undangan"
													>
														<Send className="size-4" />
													</Button>
												) : null}
												<Button
													type="button"
													size="icon"
													variant="ghost"
													onClick={() => openEdit(member)}
													aria-label="Edit"
												>
													<Pencil className="size-4" />
												</Button>
												<Button
													type="button"
													size="icon"
													variant="ghost"
													onClick={() => remove(member)}
													aria-label="Hapus"
												>
													<Trash2 className="size-4 text-destructive" />
												</Button>
											</div>
										</td>
									</tr>
								))}
								{members.length === 0 ? (
									<tr>
										<td
											colSpan={6}
											className="px-5 py-8 text-center text-muted-foreground"
										>
											Belum ada pengguna diundang. Klik &quot;Undang pengguna&quot; untuk
											menambah.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
