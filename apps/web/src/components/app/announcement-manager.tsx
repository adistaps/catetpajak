import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, FileText, Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { type Company, formatDate } from '@/lib/accounting';
import {
	ANNOUNCEMENT_STATUS_LABELS,
	attachmentUrl,
	createAnnouncement,
	deleteAnnouncement,
	fetchCompanyAnnouncements,
	updateAnnouncement,
	type Announcement,
	type AnnouncementStatus,
} from '@/lib/announcements';
import type { Student } from '@/lib/students';
import { cn } from '@/lib/utils';
import {
	ANNOUNCEMENT_VARIABLES,
	SAMPLE_VARIABLE_CONTEXT,
	hasVariables,
	resolveVariables,
	variableToken,
} from '@/lib/announcement-variables';

interface AnnouncementManagerProps {
	company: Company;
}

interface AnnouncementForm {
	title: string;
	body: string;
	date: string;
	status: AnnouncementStatus;
	student: string;
}

const EMPTY_FORM: AnnouncementForm = {
	title: '',
	body: '',
	date: '',
	status: 'draft',
	student: '',
};

function todayIsoDate(): string {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function isImage(filename: string): boolean {
	return /\.(jpe?g|png|webp)$/i.test(filename);
}

function AttachmentList({ record }: { record: Announcement }) {
	const files = Array.isArray(record.attachment) ? record.attachment : [];
	if (files.length === 0) return null;
	return (
		<div className="mt-3 flex flex-wrap gap-2">
			{files.map((file) =>
				isImage(file) ? (
					<a
						key={file}
						href={attachmentUrl(record, file)}
						target="_blank"
						rel="noreferrer"
						className="block overflow-hidden rounded-lg border border-border"
					>
						<img
							src={attachmentUrl(record, file)}
							alt={file}
							className="size-20 object-cover"
						/>
					</a>
				) : (
					<a
						key={file}
						href={attachmentUrl(record, file)}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
					>
						<FileText className="size-4 text-primary" />
						<span className="max-w-[10rem] truncate">{file}</span>
					</a>
				),
			)}
		</div>
	);
}

export function AnnouncementManager({ company }: AnnouncementManagerProps) {
	const [announcements, setAnnouncements] = useState<Announcement[]>([]);
	const [students, setStudents] = useState<Student[]>([]);
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<Announcement | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);
	const [files, setFiles] = useState<File[]>([]);
	const [saving, setSaving] = useState(false);
	const [showPreview, setShowPreview] = useState(false);
	const bodyRef = useRef<HTMLTextAreaElement>(null);

	const insertVariable = (token: string) => {
		const el = bodyRef.current;
		const insert = variableToken(token);
		if (!el) {
			setForm((f) => ({ ...f, body: `${f.body}${insert}` }));
			return;
		}
		const start = el.selectionStart ?? form.body.length;
		const end = el.selectionEnd ?? form.body.length;
		const next = `${form.body.slice(0, start)}${insert}${form.body.slice(end)}`;
		setForm((f) => ({ ...f, body: next }));
		requestAnimationFrame(() => {
			el.focus();
			const pos = start + insert.length;
			el.setSelectionRange(pos, pos);
		});
	};

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [list, studentList] = await Promise.all([
				fetchCompanyAnnouncements(company.id),
				pb
					.collection('students')
					.getFullList<Student>({
						filter: pb.filter('company = {:c}', { c: company.id }),
						sort: 'student_name',
						requestKey: null,
					}),
			]);
			setAnnouncements(list);
			setStudents(studentList);
		} catch {
			toast.error('Gagal memuat pengumuman.');
		} finally {
			setLoading(false);
		}
	}, [company.id]);

	useEffect(() => {
		load();
	}, [load]);

	const openCreate = () => {
		setForm({ ...EMPTY_FORM, date: todayIsoDate() });
		setEditing(null);
		setFiles([]);
		setCreateOpen(true);
	};

	const openEdit = (item: Announcement) => {
		setForm({
			title: item.title,
			body: item.body,
			date: item.date,
			status: item.status,
			student: item.student ?? '',
		});
		setEditing(item);
		setFiles([]);
		setCreateOpen(true);
	};

	const closeForm = () => {
		setCreateOpen(false);
		setEditing(null);
		setForm(EMPTY_FORM);
		setFiles([]);
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!form.title.trim()) {
			toast.error('Judul pengumuman wajib diisi.');
			return;
		}
		if (!form.body.trim()) {
			toast.error('Isi pengumuman wajib diisi.');
			return;
		}
		if (!form.date) {
			toast.error('Tanggal pengumuman wajib diisi.');
			return;
		}
		setSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			if (editing) {
				await updateAnnouncement(editing.id, {
					title: form.title.trim(),
					body: form.body.trim(),
					date: form.date,
					status: form.status,
					student: form.student || null,
					attachment: files.length > 0 ? files : undefined,
				});
				toast.success('Pengumuman diperbarui.');
			} else {
				await createAnnouncement({
					company: company.id,
					title: form.title.trim(),
					body: form.body.trim(),
					date: form.date,
					status: form.status,
					student: form.student || null,
					owner: ownerId,
					attachment: files,
				});
				toast.success('Pengumuman dibuat.');
			}
			closeForm();
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal menyimpan pengumuman.');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (item: Announcement) => {
		if (!window.confirm(`Hapus pengumuman "${item.title}"?`)) return;
		try {
			await deleteAnnouncement(item.id);
			toast.success('Pengumuman dihapus.');
			setAnnouncements((prev) => prev.filter((a) => a.id !== item.id));
		} catch {
			toast.error('Gagal menghapus pengumuman.');
		}
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						Pengumuman
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Buat dan kelola pengumuman untuk parent dan siswa perusahaan ini.
					</p>
				</div>
				<button
					type="button"
					onClick={openCreate}
					className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
				>
					<Plus className="size-4" /> Buat Pengumuman
				</button>
			</div>

			{loading ? (
				<p className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
					Memuat pengumuman…
				</p>
			) : announcements.length === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center">
					<div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
						<Megaphone className="size-6" />
					</div>
					<p className="text-sm font-semibold">Belum ada pengumuman</p>
					<p className="max-w-sm text-xs text-muted-foreground">
						Buat pengumuman untuk memberi tahu parent mengenai tagihan, kegiatan, atau info lainnya.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-4">
					{announcements.map((item) => {
						const studentName = students.find((s) => s.id === item.student)?.student_name;
						return (
							<article
								key={item.id}
								className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm"
							>
								<div className="flex flex-wrap items-center gap-2">
									<span
										className={cn(
											'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
											item.status === 'published'
												? 'bg-emerald-100 text-emerald-700'
												: 'bg-slate-100 text-slate-600',
										)}
									>
										{ANNOUNCEMENT_STATUS_LABELS[item.status]}
									</span>
									{studentName ? (
										<span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">
											{studentName}
										</span>
									) : (
										<span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
											Untuk Semua Siswa
										</span>
									)}
									<span className="ml-auto text-[11px] font-medium text-muted-foreground">
										{formatDate(item.date)}
									</span>
								</div>
								<h3 className="mt-3 text-base font-extrabold tracking-tight">{item.title}</h3>
								<p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
									{item.body}
								</p>
								<AttachmentList record={item} />
								<div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
									<button
										type="button"
										onClick={() => openEdit(item)}
										className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
									>
										<Pencil className="size-3.5" /> Edit
									</button>
									<button
										type="button"
										onClick={() => handleDelete(item)}
										className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
									>
										<Trash2 className="size-3.5" /> Hapus
									</button>
								</div>
							</article>
						);
					})}
				</div>
			)}

			{createOpen ? (
				<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
					<div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-soft">
						<div className="flex items-center justify-between border-b border-border px-5 py-4">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Pengumuman
								</p>
								<h2 className="text-lg font-extrabold">
									{editing ? 'Edit Pengumuman' : 'Buat Pengumuman'}
								</h2>
							</div>
							<button
								type="button"
								onClick={closeForm}
								className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
								aria-label="Tutup"
							>
								<X className="size-4" />
							</button>
						</div>
						<form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5 text-sm" noValidate>
							<label className="flex flex-col gap-1.5">
								<span className="text-xs font-semibold">Judul</span>
								<input
									value={form.title}
									onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
									placeholder="cth. Jadwal Pembayaran SPP Semester Ganjil"
									maxLength={200}
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</label>
							<label className="flex flex-col gap-1.5">
								<span className="text-xs font-semibold">Isi Pengumuman</span>
								<textarea
									ref={bodyRef}
									value={form.body}
									onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
									rows={5}
									maxLength={5000}
									placeholder="Tulis isi pengumuman…"
									className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</label>
							<div className="flex flex-col gap-2">
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sisipkan Variabel:</span>
									{ANNOUNCEMENT_VARIABLES.map((v) => (
										<button
											key={v.token}
											type="button"
											onClick={() => insertVariable(v.token)}
											title={v.description}
											className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
										>
											{v.label}
										</button>
									))}
								</div>
								<p className="text-[11px] text-muted-foreground">
									Variabel seperti <code className="rounded bg-muted px-1">{'{{nama_siswa}}'}</code> akan otomatis diganti dengan data parent/siswa saat ditampilkan di Portal Parent.
								</p>
								{hasVariables(form.body) ? (
									<button
										type="button"
										onClick={() => setShowPreview((s) => !s)}
										className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
									>
										<Eye className="size-3" /> {showPreview ? 'Sembunyikan Pratinjau' : 'Lihat Pratinjau'}
									</button>
								) : null}
								{showPreview && hasVariables(form.body) ? (
									<div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-3 py-2.5">
										<p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Pratinjau (contoh data)</p>
										<p className="whitespace-pre-line text-xs leading-relaxed text-foreground">
											{resolveVariables(form.body, SAMPLE_VARIABLE_CONTEXT)}
										</p>
									</div>
								) : null}
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<label className="flex flex-col gap-1.5">
									<span className="text-xs font-semibold">Tanggal</span>
									<input
										type="date"
										value={form.date}
										onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
										className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
									/>
								</label>
								<label className="flex flex-col gap-1.5">
									<span className="text-xs font-semibold">Status</span>
									<select
										value={form.status}
										onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AnnouncementStatus }))}
										className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
									>
										<option value="draft">Draf</option>
										<option value="published">Dipublikasikan</option>
									</select>
								</label>
							</div>
							<label className="flex flex-col gap-1.5">
								<span className="text-xs font-semibold">Target Siswa (opsional)</span>
								<select
									value={form.student}
									onChange={(e) => setForm((f) => ({ ...f, student: e.target.value }))}
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								>
									<option value="">Semua Siswa (perusahaan)</option>
									{students.map((s) => (
										<option key={s.id} value={s.id}>
											{s.student_name}
											{s.student_id_number ? ` (${s.student_id_number})` : ''}
										</option>
									))}
								</select>
								<span className="text-xs text-muted-foreground">
									Pilih siswa tertentu atau biarkan untuk seluruh siswa perusahaan.
								</span>
							</label>
							<label className="flex flex-col gap-1.5">
								<span className="text-xs font-semibold">Lampiran (opsional)</span>
								{files.length > 0 ? (
									<ul className="flex flex-col gap-2">
										{files.map((file, idx) => (
											<li
												key={`${file.name}-${idx}`}
												className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2"
											>
												<span className="flex min-w-0 items-center gap-2 text-xs">
													<FileText className="size-3.5 shrink-0 text-primary" />
													<span className="truncate">{file.name}</span>
												</span>
												<button
													type="button"
													onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
													className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
													aria-label="Hapus berkas"
												>
													<X className="size-3.5" />
												</button>
											</li>
										))}
									</ul>
								) : null}
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp,application/pdf"
									multiple
									onChange={(e) => {
										const picked = Array.from(e.target.files ?? []);
										setFiles((prev) => [...prev, ...picked]);
										e.target.value = '';
									}}
									className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
								/>
								<span className="text-xs text-muted-foreground">
									Gambar (JPG/PNG/WebP) atau PDF, maksimal 5 MB per berkas, hingga 10 berkas.
								</span>
								{editing && (editing.attachment?.length ?? 0) > 0 ? (
									<span className="text-[11px] text-muted-foreground">
										Lampiran lama tetap tersimpan. Unggah berkas baru untuk menambah.
									</span>
								) : null}
							</label>
							<div className="flex justify-end gap-2 border-t border-border pt-4">
								<button
									type="button"
									onClick={closeForm}
									disabled={saving}
									className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
								>
									Batal
								</button>
								<button
									type="submit"
									disabled={saving}
									className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
								>
									{saving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Buat Pengumuman'}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</div>
	);
}
