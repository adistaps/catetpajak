import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';
import {
	createJobLevel,
	deleteJobLevel,
	emptyJobLevel,
	updateJobLevel,
	useJobLevels,
	type JobLevel,
} from '@/lib/job-levels';
import { cn } from '@/lib/utils';

interface JobLevelsManagerProps {
	company: Company;
}

export function JobLevelsManager({ company }: JobLevelsManagerProps) {
	const { levels, loading, refresh } = useJobLevels(company.id);
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState(emptyJobLevel());

	const canManage = useMemo(() => Boolean(pb.authStore.record?.id), []);

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyJobLevel());
		setShowForm(true);
	};

	const openEdit = (rec: JobLevel) => {
		setEditingId(rec.id);
		setForm({
			name: rec.name || '',
			description: rec.description || '',
			sort: Number(rec.sort) || 0,
		});
		setShowForm(true);
	};

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		const name = form.name.trim();
		if (!name) {
			toast.error('Nama level jabatan wajib diisi.');
			return;
		}
		const dup = levels.find(
			l => l.name.trim().toLowerCase() === name.toLowerCase() && l.id !== editingId,
		);
		if (dup) {
			toast.error('Level jabatan dengan nama tersebut sudah ada.');
			return;
		}
		setSaving(true);
		try {
			if (editingId) {
				await updateJobLevel(editingId, form);
				toast.success('Level jabatan diperbarui.');
			} else {
				await createJobLevel(company.id, form);
				toast.success('Level jabatan ditambahkan.');
			}
			setShowForm(false);
			setEditingId(null);
			await refresh();
		} catch {
			toast.error('Gagal menyimpan level jabatan.');
		} finally {
			setSaving(false);
		}
	};

	const remove = async (rec: JobLevel) => {
		if (!window.confirm(`Hapus level jabatan "${rec.name}"? Data karyawan yang memakai level ini tidak ikut terhapus.`)) {
			return;
		}
		try {
			await deleteJobLevel(rec.id);
			toast.success('Level jabatan dihapus.');
			await refresh();
		} catch {
			toast.error('Gagal menghapus level jabatan.');
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-base font-bold text-foreground">Level Jabatan</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Kelola daftar level jabatan (mis. Manager, Staff, Supervisor). Level yang
						dikelola di sini menjadi pilihan pada field Level Jabatan di data karyawan
						dan target level pada pengaturan reimbursement per level.
					</p>
				</div>
				{canManage ? (
					<button
						type="button"
						onClick={openCreate}
						className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
					>
						<Plus className="size-4" /> Tambah Level
					</button>
				) : null}
			</div>

			{showForm ? (
				<form
					onSubmit={submit}
					className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft-sm"
				>
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-bold">
							{editingId ? 'Ubah Level Jabatan' : 'Level Jabatan Baru'}
						</h3>
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
							}}
							className="text-muted-foreground hover:text-foreground"
							aria-label="Tutup"
						>
							<X className="size-4" />
						</button>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">
								Nama level <span className="text-destructive">*</span>
							</span>
							<input
								required
								value={form.name}
								onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
								placeholder="mis. Manager"
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							/>
						</label>
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium">Urutan tampil</span>
							<input
								type="number"
								min={0}
								value={form.sort || ''}
								onChange={e => setForm(f => ({ ...f, sort: Number(e.target.value) }))}
								className="h-10 w-full rounded-lg border border-input bg-background px-3"
							/>
							<p className="mt-1 text-xs text-muted-foreground">0 = urut abjad.</p>
						</label>
					</div>
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium">Keterangan</span>
						<textarea
							rows={2}
							value={form.description}
							onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
							placeholder="Deskripsi singkat level…"
							className="w-full rounded-lg border border-input bg-background px-3 py-2"
						/>
					</label>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								setShowForm(false);
								setEditingId(null);
							}}
							className="h-10 rounded-lg border border-border px-4 text-sm font-medium"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={saving}
							className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
						>
							{saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah'}
						</button>
					</div>
				</form>
			) : null}

			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
				{loading ? (
					<p className="px-5 py-8 text-center text-sm text-muted-foreground">Memuat…</p>
				) : levels.length === 0 ? (
					<p className="px-5 py-8 text-center text-sm text-muted-foreground">
						Belum ada level jabatan. Klik &quot;Tambah Level&quot; untuk membuat level pertama.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[560px] text-left text-sm">
							<thead>
								<tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
									<th className="px-4 py-3 font-semibold">Nama Level</th>
									<th className="px-4 py-3 font-semibold">Keterangan</th>
									<th className="px-4 py-3 text-right font-semibold">Urutan</th>
									{canManage ? (
										<th className="px-4 py-3 text-right font-semibold">Aksi</th>
									) : null}
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{levels.map(l => (
									<tr key={l.id} className="hover:bg-muted/30">
										<td className="px-4 py-3 font-medium text-foreground">{l.name}</td>
										<td className="px-4 py-3 text-muted-foreground">{l.description || '—'}</td>
										<td className="px-4 py-3 text-right tabular-nums">{l.sort || 0}</td>
										{canManage ? (
											<td className="px-4 py-3 text-right">
												<div className="flex justify-end gap-1">
													<button
														type="button"
														onClick={() => openEdit(l)}
														aria-label="Ubah"
														className="border border-border p-1 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
													>
														<Pencil className="size-3.5" />
													</button>
													<button
														type="button"
														onClick={() => remove(l)}
														aria-label="Hapus"
														className="border border-primary/30 p-1 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
													>
														<Trash2 className="size-3.5" />
													</button>
												</div>
											</td>
										) : null}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<p className={cn('text-xs text-muted-foreground')}>
				Level lama yang sudah dipakai pada data karyawan atau pengaturan reimbursement
				tetap muncul sebagai pilihan meski belum terdaftar di sini.
			</p>
		</div>
	);
}
