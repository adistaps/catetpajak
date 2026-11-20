import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { GraduationCap, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatDate, type Company } from '@/lib/accounting';
import {
	STUDENT_STATUS_LABELS,
	STUDENT_STATUS_OPTIONS,
	type Student,
	type StudentActiveStatus,
} from '@/lib/students';
import { cn } from '@/lib/utils';

interface StudentManagerProps {
	company: Company;
}

type FormState = {
	student_name: string;
	student_id_number: string;
	academic_year: string;
	parents_name: string;
	punishment: string;
	school_program: string;
	school_grade: string;
	active_status: StudentActiveStatus;
	virtual_account_number: string;
	phone: string;
	mobile: string;
	email: string;
	address: string;
	notes: string;
};

const emptyForm = (): FormState => ({
	student_name: '',
	student_id_number: '',
	academic_year: '',
	parents_name: '',
	punishment: '',
	school_program: '',
	school_grade: '',
	active_status: 'active',
	virtual_account_number: '',
	phone: '',
	mobile: '',
	email: '',
	address: '',
	notes: '',
});

function fromStudent(s: Student): FormState {
	return {
		student_name: s.student_name ?? '',
		student_id_number: s.student_id_number ?? '',
		academic_year: s.academic_year ?? '',
		parents_name: s.parents_name ?? '',
		punishment: s.punishment ?? '',
		school_program: s.school_program ?? '',
		school_grade: s.school_grade ?? '',
		active_status: s.active_status || 'active',
		virtual_account_number: s.virtual_account_number ?? '',
		phone: s.phone ?? '',
		mobile: s.mobile ?? '',
		email: s.email ?? '',
		address: s.address ?? '',
		notes: s.notes ?? '',
	};
}

export function StudentManager({ company }: StudentManagerProps) {
	const [students, setStudents] = useState<Student[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState<'all' | StudentActiveStatus>('all');
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Student | null>(null);
	const [form, setForm] = useState<FormState>(emptyForm);
	const [saving, setSaving] = useState(false);
	const [photoFile, setPhotoFile] = useState<File | null>(null);
	const [photoPreview, setPhotoPreview] = useState('');

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		const filter = pb.filter('company = {:company}', { company: company.id });
		pb
			.collection('students')
			.getFullList<Student>({ filter, sort: 'student_name', requestKey: `students-${company.id}` })
			.then(list => {
				if (!cancelled) setStudents(list);
			})
			.catch(() => {
				if (!cancelled) toast.error('Gagal memuat data siswa');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [company.id]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return students.filter(s => {
			if (statusFilter !== 'all' && (s.active_status || 'active') !== statusFilter) return false;
			if (!q) return true;
			const hay = [
				s.student_name,
				s.student_id_number,
				s.parents_name,
				s.school_program,
				s.school_grade,
				s.academic_year,
				s.virtual_account_number,
				s.email,
			]
				.join(' ')
				.toLowerCase();
			return hay.includes(q);
		});
	}, [students, query, statusFilter]);

	const openCreate = () => {
		setEditing(null);
		setForm(emptyForm());
		setPhotoFile(null);
		setPhotoPreview('');
		setFormOpen(true);
	};

	const openEdit = (s: Student) => {
		setEditing(s);
		setForm(fromStudent(s));
		setPhotoFile(null);
		setPhotoPreview(s.photo ? pb.files.getURL(s, s.photo, { thumb: '100x100' }) : '');
		setFormOpen(true);
	};

	const closeForm = () => {
		if (saving) return;
		setFormOpen(false);
		setEditing(null);
		setForm(emptyForm());
		setPhotoFile(null);
		setPhotoPreview('');
	};

	const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
		setForm(prev => ({ ...prev, [key]: value }));
	};

	const handleSave = async () => {
		const name = form.student_name.trim();
		if (!name) {
			toast.error('Nama siswa wajib diisi');
			return;
		}
		const ownerId = pb.authStore.record?.id ?? '';
		if (!ownerId) {
			toast.error('Sesi tidak valid. Silakan masuk ulang.');
			return;
		}
		setSaving(true);
		const fields = {
			company: company.id,
			student_name: name,
			student_id_number: form.student_id_number.trim(),
			academic_year: form.academic_year.trim(),
			parents_name: form.parents_name.trim(),
			punishment: form.punishment.trim(),
			school_program: form.school_program.trim(),
			school_grade: form.school_grade.trim(),
			active_status: form.active_status,
			virtual_account_number: form.virtual_account_number.trim(),
			phone: form.phone.trim(),
			mobile: form.mobile.trim(),
			email: form.email.trim(),
			address: form.address.trim(),
			notes: form.notes.trim(),
			owner: ownerId,
		};
		const body: FormData | typeof fields = photoFile
			? (() => {
					const fd = new FormData();
					for (const [key, value] of Object.entries(fields)) fd.append(key, String(value));
					fd.append('photo', photoFile);
					return fd;
				})()
			: fields;
		try {
			if (editing) {
				const rec = await pb.collection('students').update<Student>(editing.id, body);
				setStudents(prev =>
					prev
						.map(s => (s.id === rec.id ? rec : s))
						.sort((a, b) => a.student_name.localeCompare(b.student_name)),
				);
				toast.success('Data siswa diperbarui');
			} else {
				const rec = await pb.collection('students').create<Student>(body, {
					requestKey: `create-student-${Date.now()}`,
				});
				setStudents(prev =>
					[...prev, rec].sort((a, b) => a.student_name.localeCompare(b.student_name)),
				);
				toast.success('Siswa ditambahkan');
			}
			closeForm();
		} catch {
			toast.error(editing ? 'Gagal memperbarui siswa' : 'Gagal menambah siswa');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (s: Student) => {
		if (!window.confirm(`Hapus data siswa ${s.student_name}?`)) return;
		try {
			await pb.collection('students').delete(s.id);
			setStudents(prev => prev.filter(item => item.id !== s.id));
			toast.success('Siswa dihapus');
		} catch {
			toast.error('Gagal menghapus siswa');
		}
	};

	const stats = useMemo(() => {
		const active = students.filter(s => (s.active_status || 'active') === 'active').length;
		return { total: students.length, active };
	}, [students]);

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						Student Data
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Kelola identitas siswa dan informasi akademik.
					</p>
				</div>
				<button
					type="button"
					onClick={openCreate}
					className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5"
				>
					<Plus className="size-4" /> Tambah Siswa
				</button>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-2xl border border-[#ded4f0] bg-[#fbf9ff] px-4 py-3 shadow-[0_4px_14px_rgba(91,55,145,0.07)]">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-[#655779]">
						Total Siswa
					</p>
					<p className="mt-1 text-2xl font-extrabold text-[#241d2e]">{stats.total}</p>
				</div>
				<div className="rounded-2xl border border-[#ded4f0] bg-[#fbf9ff] px-4 py-3 shadow-[0_4px_14px_rgba(91,55,145,0.07)]">
					<p className="text-[11px] font-semibold uppercase tracking-wide text-[#655779]">
						Siswa Aktif
					</p>
					<p className="mt-1 text-2xl font-extrabold text-[#7c3aed]">{stats.active}</p>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<div className="relative min-w-[220px] flex-1">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<input
						value={query}
						onChange={e => setQuery(e.target.value)}
						placeholder="Cari nama, NIS, orang tua, program..."
						className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none ring-primary focus:ring-2"
					/>
				</div>
				<div className="flex w-full min-w-0 items-stretch overflow-x-auto rounded-full border border-emerald-100 bg-[#f0f2f5] p-0.5 shadow-[0_8px_24px_rgba(16,185,129,0.06)] sm:w-auto">
					{(
						[
							{ key: 'all' as const, label: 'Semua' },
							...STUDENT_STATUS_OPTIONS.map(k => ({
								key: k,
								label: STUDENT_STATUS_LABELS[k],
							})),
						] as { key: 'all' | StudentActiveStatus; label: string }[]
					).map(item => (
						<button
							key={item.key}
							type="button"
							aria-pressed={statusFilter === item.key}
							onClick={() => setStatusFilter(item.key)}
							className={cn(
								'min-w-[88px] flex-1 whitespace-nowrap px-4 py-3 text-sm font-bold transition-colors first:rounded-l-full last:rounded-r-full',
								statusFilter === item.key
									? 'bg-[#d8f4e5] text-emerald-900'
									: 'text-slate-700 hover:bg-white/70',
							)}
						>
							{item.label}
						</button>
					))}
				</div>
			</div>

			<section className="overflow-hidden rounded-[1.35rem] border border-emerald-100 shadow-[0_8px_30px_rgba(16,185,129,0.06)]">
				{loading ? (
					<p className="px-5 py-10 text-sm text-emerald-800/50">Memuat data siswa...</p>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
						<div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
							<GraduationCap className="size-6" />
						</div>
						<p className="text-sm font-semibold">Belum ada data siswa</p>
						<p className="max-w-sm text-xs text-muted-foreground">
							Tambahkan siswa untuk menyimpan identitas, program sekolah, dan nomor virtual account.
						</p>
						<button
							type="button"
							onClick={openCreate}
							className="mt-1 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
						>
							<Plus className="size-3.5" /> Tambah Siswa
						</button>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[980px] text-sm">
							<thead>
								<tr className="border-b border-emerald-100/90 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/70">
									<th className="px-5 py-3.5">Nama Siswa</th>
									<th className="px-4 py-3.5">NIS / ID</th>
									<th className="px-4 py-3.5">Tahun Ajaran</th>
									<th className="px-4 py-3.5">Program</th>
									<th className="px-4 py-3.5">Kelas</th>
									<th className="px-4 py-3.5">Status</th>
									<th className="px-4 py-3.5">VA Number</th>
									<th className="px-4 py-3.5">Dibuat</th>
									<th className="px-4 py-3.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{filtered.map(s => {
									const status = s.active_status || 'active';
									const statusTone =
										status === 'active'
											? 'bg-emerald-50 text-emerald-600'
											: status === 'graduated'
												? 'bg-sky-50 text-sky-700'
												: status === 'withdrawn'
													? 'bg-amber-50 text-amber-700'
													: 'bg-stone-100 text-stone-600';
									return (
									<tr key={s.id} className="border-b border-emerald-50 last:border-0">
										<td className="px-5 py-3.5">
											<Link
												to={`/app/kontak/riwayat/siswa/${s.id}`}
												className="font-semibold text-emerald-600 hover:underline"
											>
												{s.student_name}
											</Link>
										</td>
										<td className="px-4 py-3.5 text-emerald-900/45">{s.student_id_number || '—'}</td>
										<td className="px-4 py-3.5 text-emerald-900/45">{s.academic_year || '—'}</td>
										<td className="px-4 py-3.5 lowercase text-emerald-900/55">{s.school_program || '—'}</td>
										<td className="px-4 py-3.5 text-emerald-900/45">{s.school_grade || '—'}</td>
										<td className="px-4 py-3.5">
											<span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold', statusTone)}>
												{STUDENT_STATUS_LABELS[status]}
											</span>
										</td>
										<td className="px-4 py-3.5 text-emerald-900/45">{s.virtual_account_number || '—'}</td>
										<td className="whitespace-nowrap px-4 py-3.5 text-emerald-900/55">
											{formatDate(s.created)}
										</td>
										<td className="px-4 py-3.5">
											<div className="flex justify-end gap-2">
												<button
													type="button"
													onClick={() => openEdit(s)}
													aria-label={`Edit ${s.student_name}`}
													title="Edit"
													className="inline-flex size-8 items-center justify-center rounded-full border border-emerald-200/80 text-emerald-800/70 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
												>
													<Pencil className="size-3.5" />
												</button>
												<button
													type="button"
													onClick={() => handleDelete(s)}
													aria-label={`Hapus ${s.student_name}`}
													title="Hapus"
													className="inline-flex size-8 items-center justify-center rounded-full border border-emerald-200/80 text-emerald-800/70 transition-colors hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
												>
													<Trash2 className="size-3.5" />
												</button>
											</div>
										</td>
									</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{formOpen ? (
				<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
					<div className="w-full max-w-4xl rounded-2xl border border-border bg-card shadow-soft">
						<div className="flex items-center justify-between border-b border-border px-5 py-4">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Student Data
								</p>
								<h2 className="text-lg font-extrabold">
									{editing ? 'Edit Siswa' : 'Tambah Siswa'}
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

						<div className="grid gap-8 p-5 md:grid-cols-2">
							<section>
								<h3 className="mb-4 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-wide text-foreground/80">
									Student Identity
								</h3>
								<div className="mb-4 flex items-center gap-3">
									{photoPreview ? (
										<img src={photoPreview} alt="" className="size-14 rounded-full object-cover ring-2 ring-primary/20" />
									) : (
										<span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
											{(form.student_name || '?').slice(0, 1).toUpperCase()}
										</span>
									)}
									<label className="cursor-pointer text-xs font-semibold text-primary">
										Unggah foto siswa
										<input
											type="file"
											accept="image/jpeg,image/png,image/webp"
											className="sr-only"
											onChange={e => {
												const file = e.target.files?.[0] ?? null;
												setPhotoFile(file);
												if (file) setPhotoPreview(URL.createObjectURL(file));
											}}
										/>
									</label>
								</div>
								<div className="space-y-3">
									<Field label="Student Name">
										<input
											value={form.student_name}
											onChange={e => setField('student_name', e.target.value)}
											placeholder="Nama lengkap siswa"
											className={inputClass}
										/>
									</Field>
									<Field label="Student ID Number">
										<input
											value={form.student_id_number}
											onChange={e => setField('student_id_number', e.target.value)}
											placeholder="NIS / nomor induk"
											className={inputClass}
										/>
									</Field>
									<Field label="Academic Year">
										<input
											value={form.academic_year}
											onChange={e => setField('academic_year', e.target.value)}
											placeholder="e.g. 2025/2026"
											className={inputClass}
										/>
									</Field>
									<Field label="Parents Name">
										<input
											value={form.parents_name}
											onChange={e => setField('parents_name', e.target.value)}
											placeholder="Nama orang tua / wali"
											className={inputClass}
										/>
									</Field>
									<Field label="Punishment">
										<input
											value={form.punishment}
											onChange={e => setField('punishment', e.target.value)}
											placeholder="Catatan hukuman / sanksi"
											className={inputClass}
										/>
									</Field>
									<Field label="Address">
										<textarea
											value={form.address}
											onChange={e => setField('address', e.target.value)}
											rows={2}
											placeholder="Alamat"
											className={cn(inputClass, 'resize-y')}
										/>
									</Field>
								</div>
							</section>

							<section>
								<h3 className="mb-4 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-wide text-foreground/80">
									Academic Information
								</h3>
								<div className="space-y-3">
									<Field label="School Program">
										<input
											value={form.school_program}
											onChange={e => setField('school_program', e.target.value)}
											placeholder="Program / jurusan"
											className={inputClass}
										/>
									</Field>
									<Field label="School Grade">
										<input
											value={form.school_grade}
											onChange={e => setField('school_grade', e.target.value)}
											placeholder="Kelas / tingkat"
											className={inputClass}
										/>
									</Field>
									<Field label="Student Active Status">
										<select
											value={form.active_status}
											onChange={e =>
												setField('active_status', e.target.value as StudentActiveStatus)
											}
											className={inputClass}
										>
											{STUDENT_STATUS_OPTIONS.map(opt => (
												<option key={opt} value={opt}>
													{STUDENT_STATUS_LABELS[opt]}
												</option>
											))}
										</select>
									</Field>
									<Field label="Virtual Account Number">
										<input
											value={form.virtual_account_number}
											onChange={e => setField('virtual_account_number', e.target.value)}
											placeholder="Nomor virtual account"
											className={inputClass}
										/>
									</Field>
									<div className="grid gap-3 sm:grid-cols-2">
										<Field label="Phone">
											<input
												value={form.phone}
												onChange={e => setField('phone', e.target.value)}
												className={inputClass}
											/>
										</Field>
										<Field label="Mobile">
											<input
												value={form.mobile}
												onChange={e => setField('mobile', e.target.value)}
												className={inputClass}
											/>
										</Field>
									</div>
									<Field label="Email">
										<input
											type="email"
											value={form.email}
											onChange={e => setField('email', e.target.value)}
											className={inputClass}
										/>
									</Field>
									<Field label="Notes">
										<textarea
											value={form.notes}
											onChange={e => setField('notes', e.target.value)}
											rows={2}
											className={cn(inputClass, 'resize-y')}
										/>
									</Field>
								</div>
							</section>
						</div>

						<div className="flex justify-end gap-2 border-t border-border px-5 py-4">
							<button
								type="button"
								onClick={closeForm}
								disabled={saving}
								className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
							>
								Batal
							</button>
							<button
								type="button"
								onClick={handleSave}
								disabled={saving}
								className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
							>
								{saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan Siswa'}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="grid gap-1.5">
			<span className="text-xs font-semibold text-foreground/80">{label}</span>
			{children}
		</label>
	);
}

const inputClass =
	'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary focus:ring-2';
