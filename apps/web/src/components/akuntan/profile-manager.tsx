import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
	Building2,
	Camera,
	CheckCircle2,
	FileText,
	Loader2,
	LogIn,
	Paperclip,
	Save,
	UserRound,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import {
	akuntanCvFileUrl,
	akuntanPhotoUrl,
	getMyAkuntanProfile,
	highestEducationLevel,
	parseEducationEntries,
	parseStrengths,
	parseWorkHistoryEntries,
	SERVICE_MODE_LABELS,
	type AkuntanProfile,
	type EducationEntry,
	type WorkHistoryEntry,
} from '@/lib/akuntan';
import { WorkHistoryEditor } from '@/components/akuntan/work-history-editor';
import { EducationHistoryEditor } from '@/components/akuntan/education-history-editor';
import { ImageAdjustDialog } from '@/components/akuntan/image-adjust-dialog';

const fieldClass =
	'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const areaClass =
	'w-full resize-y rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const labelClass = 'text-[13px] font-semibold text-foreground';

const CV_ACCEPT =
	'.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp';

function fillProfile(
	record: AkuntanProfile,
	setters: {
		setName: (v: string) => void;
		setCvName: (v: string) => void;
		setCity: (v: string) => void;
		setPhone: (v: string) => void;
		setDescription: (v: string) => void;
		setBirthPlace: (v: string) => void;
		setBirthDate: (v: string) => void;
		setResidence: (v: string) => void;
		setDomicile: (v: string) => void;
		setCertifications: (v: string) => void;
		setHeadline: (v: string) => void;
		setServiceMode: (v: string) => void;
		setMeetingLocation: (v: string) => void;
		setHighlight: (v: string) => void;
		setStrengths: (v: string[]) => void;
		setSavedCvName: (v: string) => void;
	},
) {
	setters.setName(record.name ?? '');
	setters.setCvName(record.cv_name ?? '');
	setters.setCity(record.city ?? '');
	setters.setPhone(record.phone ?? '');
	setters.setDescription(record.description ?? '');
	setters.setBirthPlace(record.birth_place ?? '');
	setters.setBirthDate(record.birth_date ? String(record.birth_date).slice(0, 10) : '');
	setters.setResidence(record.residence ?? '');
	setters.setDomicile(record.domicile ?? '');
	setters.setCertifications(record.certifications ?? '');
	setters.setHeadline(record.headline ?? '');
	setters.setServiceMode(record.service_mode || 'online');
	setters.setMeetingLocation(record.meeting_location ?? '');
	setters.setHighlight(record.highlight ?? '');
	setters.setStrengths(parseStrengths(record.strengths));
	setters.setSavedCvName(record.cv_file ?? '');
}

/**
 * Panel "Profil Akuntan Saya": tamu melihat ajakan masuk/daftar, pengguna
 * yang masuk dapat membuat atau mengedit profilnya. Hanya pemilik profil
 * yang dapat mengubah — ditegakkan oleh access rule PocketBase.
 */
export function ProfileManager({ onSaved, embedded = false }: { onSaved: () => void; embedded?: boolean }) {
	const { user, isAuthed, isLoading: isAuthLoading } = useAuth();
	const [profile, setProfile] = useState<AkuntanProfile | null>(null);
	const [profileLoading, setProfileLoading] = useState(true);
	const [name, setName] = useState('');
	const [cvName, setCvName] = useState('');
	const [city, setCity] = useState('');
	const [phone, setPhone] = useState('');
	const [description, setDescription] = useState('');
	const [birthPlace, setBirthPlace] = useState('');
	const [birthDate, setBirthDate] = useState('');
	const [residence, setResidence] = useState('');
	const [domicile, setDomicile] = useState('');
	const [certifications, setCertifications] = useState('');
	const [headline, setHeadline] = useState('');
	const [serviceMode, setServiceMode] = useState('online');
	const [meetingLocation, setMeetingLocation] = useState('');
	const [highlight, setHighlight] = useState('');
	const [strengths, setStrengths] = useState<string[]>(['']);
	const [eduEntries, setEduEntries] = useState<EducationEntry[]>([]);
	const [workEntries, setWorkEntries] = useState<WorkHistoryEntry[]>([]);
	const [cvFile, setCvFile] = useState<File | null>(null);
	const [savedCvName, setSavedCvName] = useState('');
	const [savedCvUrl, setSavedCvUrl] = useState<string | null>(null);
	const [photoFile, setPhotoFile] = useState<File | null>(null);
	const [photoPreview, setPhotoPreview] = useState<string | null>(null);
	const [photoQueue, setPhotoQueue] = useState<File[]>([]);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState('');
	const [savedNotice, setSavedNotice] = useState(false);
	const [saving, setSaving] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cvInputRef = useRef<HTMLInputElement>(null);
	const objectUrlRef = useRef<string | null>(null);

	useEffect(() => {
		if (isAuthLoading) return;
		if (!user) {
			setProfileLoading(false);
			return;
		}
		let active = true;
		setProfileLoading(true);
		getMyAkuntanProfile(user.id)
			.then(record => {
				if (!active) return;
				setProfile(record);
				if (record) {
					fillProfile(record, {
						setName,
						setCvName,
						setCity,
						setPhone,
						setDescription,
						setBirthPlace,
						setBirthDate,
						setResidence,
						setDomicile,
						setCertifications,
						setHeadline,
						setServiceMode,
						setMeetingLocation,
						setHighlight,
						setStrengths,
						setSavedCvName,
					});
					const parsedEdu = parseEducationEntries(record.education_entries);
					setEduEntries(
						parsedEdu.length > 0
							? parsedEdu
							: record.education
								? [{ level: record.education, start_year: '', university: '', major: '' }]
								: [],
					);
					setWorkEntries(parseWorkHistoryEntries(record.work_history_entries));
					setPhotoPreview(akuntanPhotoUrl(record));
					void akuntanCvFileUrl(record).then(url => {
						if (active) setSavedCvUrl(url);
					});
				}
			})
			.finally(() => {
				if (active) setProfileLoading(false);
			});
		return () => {
			active = false;
		};
	}, [isAuthLoading, user]);

	useEffect(() => {
		return () => {
			if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		};
	}, []);

	function onPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0] ?? null;
		event.target.value = '';
		if (file) setPhotoQueue([file]);
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError('');
		setSavedNotice(false);
		const nextErrors: Record<string, string> = {};
		if (!name.trim()) nextErrors.name = 'Nama lengkap wajib diisi.';
		if (!cvName.trim()) nextErrors.cv_name = 'Nama wajib diisi.';
		if (birthDate && birthDate > new Date().toISOString().slice(0, 10)) {
			nextErrors.birth_date = 'Tanggal lahir tidak boleh di masa depan.';
		}
		if (headline.trim().length > 240) {
			nextErrors.headline = 'Judul profil maksimal 240 karakter.';
		}
		if (cvFile && cvFile.size > 8 * 1024 * 1024) {
			nextErrors.cv_file = 'Lampiran maksimal 8 MB.';
		}
		const currentYear = new Date().getFullYear();
		eduEntries.forEach((entry, index) => {
			const filled =
				entry.level || entry.start_year.trim() || entry.university.trim() || entry.major.trim();
			if (!filled) return;
			if (!entry.level) {
				nextErrors[`edu_${index}_level`] = 'Jenjang pendidikan wajib dipilih.';
			}
			const year = Number(entry.start_year);
			if (!entry.start_year.trim() || Number.isNaN(year)) {
				nextErrors[`edu_${index}_start_year`] = 'Tahun masuk wajib diisi.';
			} else if (year < 1900 || year > currentYear) {
				nextErrors[`edu_${index}_start_year`] = 'Tahun masuk harus antara 1900 dan tahun ini.';
			}
			if (!entry.university.trim()) {
				nextErrors[`edu_${index}_university`] = 'Universitas wajib diisi.';
			}
			if (!entry.major.trim()) {
				nextErrors[`edu_${index}_major`] = 'Jurusan wajib diisi.';
			}
		});
		workEntries.forEach((entry, index) => {
			const filled =
				entry.company.trim() ||
				entry.position.trim() ||
				entry.start_date ||
				entry.end_date ||
				entry.description.trim();
			if (!filled) return;
			if (!entry.company.trim()) {
				nextErrors[`work_${index}_company`] = 'Nama perusahaan wajib diisi.';
			}
			if (!entry.position.trim()) {
				nextErrors[`work_${index}_position`] = 'Jabatan wajib diisi.';
			}
			if (!entry.start_date) {
				nextErrors[`work_${index}_start_date`] = 'Tanggal masuk wajib diisi.';
			}
			if (entry.start_date && entry.end_date && entry.end_date < entry.start_date) {
				nextErrors[`work_${index}_end_date`] = 'Tanggal keluar tidak boleh sebelum tanggal masuk.';
			}
		});
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;
		if (!user) return;

		setSaving(true);
		try {
			const fd = new FormData();
			fd.append('name', name.trim());
			fd.append('cv_name', cvName.trim());
			fd.append('city', city.trim());
			fd.append('phone', phone.trim());
			fd.append('description', description.trim());
			fd.append('birth_place', birthPlace.trim());
			if (birthDate) fd.append('birth_date', `${birthDate} 00:00:00.000Z`);
			fd.append('residence', residence.trim());
			fd.append('domicile', domicile.trim());
			fd.append('certifications', certifications.trim());
			fd.append('headline', headline.trim());
			fd.append('service_mode', serviceMode || 'online');
			fd.append('meeting_location', meetingLocation.trim());
			fd.append('highlight', highlight.trim());
			fd.append(
				'strengths',
				JSON.stringify(strengths.map(item => item.trim()).filter(Boolean).slice(0, 8)),
			);
			const cleanEduEntries = eduEntries.filter(
				entry => entry.level || entry.start_year.trim() || entry.university.trim() || entry.major.trim(),
			);
			fd.append('education_entries', JSON.stringify(cleanEduEntries));
			fd.append('education', highestEducationLevel(cleanEduEntries));
			const cleanWorkEntries = workEntries.filter(
				entry =>
					entry.company.trim() ||
					entry.position.trim() ||
					entry.start_date ||
					entry.end_date ||
					entry.description.trim(),
			);
			fd.append('work_history_entries', JSON.stringify(cleanWorkEntries));
			if (photoFile) fd.append('photo', photoFile);
			if (cvFile) fd.append('cv_file', cvFile);
			if (!profile) fd.append('owner', user.id);

			const record = profile
				? await pb.collection('accountant_profiles').update(profile.id, fd)
				: await pb.collection('accountant_profiles').create(fd);
			const saved = record as unknown as AkuntanProfile;
			setProfile(saved);
			setPhotoFile(null);
			setCvFile(null);
			setSavedCvName(saved.cv_file ?? '');
			setSavedCvUrl(await akuntanCvFileUrl(saved));
			setPhotoPreview(akuntanPhotoUrl(saved));
			setSavedNotice(true);
			onSaved();
		} catch (err) {
			// Bila pembuatan gagal karena profil untuk akun ini ternyata sudah ada
			// (indeks unik `owner`), muat dan tampilkan profil yang ada alih-alih
			// menampilkan galat. Ini mencegah pengguna mengira profilnya hilang.
			if (!profile && user) {
				const existing = await getMyAkuntanProfile(user.id);
				if (existing) {
					setProfile(existing);
					fillProfile(existing, {
						setName,
						setCvName,
						setCity,
						setPhone,
						setDescription,
						setBirthPlace,
						setBirthDate,
						setResidence,
						setDomicile,
						setCertifications,
						setHeadline,
						setServiceMode,
						setMeetingLocation,
						setHighlight,
						setStrengths,
						setSavedCvName,
					});
					setPhotoPreview(akuntanPhotoUrl(existing));
					setSavedCvUrl(await akuntanCvFileUrl(existing));
					setErrors({});
					setSavedNotice(true);
					onSaved();
					return;
				}
			}
			const data = (
				err as { response?: { data?: Record<string, { message?: string }> } }
			)?.response?.data;
			if (data && Object.keys(data).length > 0) {
				const fieldErrors: Record<string, string> = {};
				for (const [key, value] of Object.entries(data)) {
					fieldErrors[key] = value?.message ?? 'Nilai tidak valid.';
				}
				setErrors(fieldErrors);
			} else {
				setFormError('Gagal menyimpan profil. Periksa isian lalu coba lagi.');
			}
		} finally {
			setSaving(false);
		}
	}

	if (isAuthLoading || profileLoading) {
		return (
			<section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
				<div className="h-72 animate-pulse rounded-2xl border border-border/70 bg-secondary" />
			</section>
		);
	}

	if (!isAuthed) {
		return (
			<section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
				<div className="flex flex-col items-start gap-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 sm:flex-row sm:items-center sm:justify-between md:p-8">
					<div className="min-w-0 max-w-xl">
						<h2 className="flex items-center gap-2 text-lg font-bold leading-snug text-foreground">
							<Building2 className="size-5 shrink-0 text-emerald-600" strokeWidth={1.75} />
							Tampilkan jasa akuntan Anda di sini
						</h2>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							Daftar di aplikasi Catet Akuntan, tambahkan nama dan foto, lalu profil Anda tampil di direktori.
						</p>
					</div>
					<Link
						to="/akuntan/masuk"
						className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft-sm transition hover:brightness-110 active:scale-[0.99]"
					>
						<LogIn className="size-4" strokeWidth={1.75} />
						Masuk atau Daftar
					</Link>
				</div>
			</section>
		);
	}

	return (
		<section className={embedded ? 'mt-6' : 'mx-auto max-w-6xl px-5 py-10 md:px-8'}>
			<div className="rounded-2xl border border-border/80 bg-card p-5 shadow-soft-sm sm:p-8">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="min-w-0">
						<h2 className="text-xl font-bold tracking-tight text-foreground">
							{profile ? 'Profil Akuntan Saya' : 'Tambah Profil Akuntan'}
						</h2>
						<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
							{profile
								? 'Perbarui data profil Anda di direktori akuntan.'
								: 'Lengkapi data berikut agar profil Anda tampil di direktori.'}
						</p>
					</div>
					{profile ? (
						<span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
							<CheckCircle2 className="size-3.5" strokeWidth={1.75} />
							Profil tayang
						</span>
					) : null}
				</div>

				<form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5" noValidate>
					<div className="flex flex-wrap items-center gap-5">
						<div className="size-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary">
							{photoPreview ? (
								<img src={photoPreview} alt="Pratinjau foto profil" className="size-full object-cover" />
							) : (
								<span className="flex size-full items-center justify-center">
									<UserRound className="size-10 text-emerald-300" strokeWidth={1.5} />
								</span>
							)}
						</div>
						<div className="min-w-0">
							<input
								ref={fileInputRef}
								type="file"
								accept="image/jpeg,image/png,image/webp"
								className="hidden"
								onChange={onPhotoChange}
							/>
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="inline-flex h-11 items-center gap-2 rounded-full border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition hover:bg-accent active:scale-[0.99]"
							>
								<Camera className="size-4" strokeWidth={1.75} />
								{photoPreview ? 'Ganti foto' : 'Unggah foto'}
							</button>
							<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
								Foto profil atau foto usaha. JPG, PNG, atau WebP, maksimal 5 MB.
							</p>
							{errors.photo ? (
								<p className="mt-1 text-xs font-medium text-red-600">{errors.photo}</p>
							) : null}
						</div>
					</div>

					<div className="grid gap-5 sm:grid-cols-2">
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>
								Nama lengkap <span className="text-red-500">*</span>
							</span>
							<input
								value={name}
								onChange={event => setName(event.target.value)}
								placeholder="cth. Andi Wijaya"
								className={fieldClass}
								maxLength={120}
							/>
							{errors.name ? (
								<span className="text-xs font-medium text-red-600">{errors.name}</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>
								Nama <span className="text-red-500">*</span>
							</span>
							<input
								value={cvName}
								onChange={event => setCvName(event.target.value)}
								placeholder="cth. Mitra Pajak Sejahtera"
								className={fieldClass}
								maxLength={160}
							/>
							<p className="text-xs leading-relaxed text-muted-foreground">
								Nama yang tampil pada permintaan profil.
							</p>
							{errors.cv_name ? (
								<span className="text-xs font-medium text-red-600">{errors.cv_name}</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>Tempat lahir</span>
							<input
								value={birthPlace}
								onChange={event => setBirthPlace(event.target.value)}
								placeholder="cth. Bandung"
								className={fieldClass}
								maxLength={80}
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>Tanggal lahir</span>
							<input
								type="date"
								value={birthDate}
								onChange={event => setBirthDate(event.target.value)}
								max={new Date().toISOString().slice(0, 10)}
								className={fieldClass}
							/>
							{errors.birth_date ? (
								<span className="text-xs font-medium text-red-600">{errors.birth_date}</span>
							) : (
								<span className="text-xs leading-relaxed text-muted-foreground">
									Hanya terlihat oleh Anda, tidak ditampilkan di profil publik.
								</span>
							)}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>Tempat tinggal</span>
							<input
								value={residence}
								onChange={event => setResidence(event.target.value)}
								placeholder="cth. Kebayoran Baru"
								className={fieldClass}
								maxLength={160}
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>Domisili</span>
							<input
								value={domicile}
								onChange={event => setDomicile(event.target.value)}
								placeholder="cth. DKI Jakarta"
								className={fieldClass}
								maxLength={80}
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>Kota layanan</span>
							<input
								value={city}
								onChange={event => setCity(event.target.value)}
								placeholder="cth. Jakarta Selatan"
								className={fieldClass}
								maxLength={80}
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>Nomor telepon</span>
							<input
								value={phone}
								onChange={event => setPhone(event.target.value)}
								placeholder="cth. 0812 3456 7890"
								className={fieldClass}
								maxLength={40}
							/>
							<span className="text-xs leading-relaxed text-muted-foreground">
								Nomor ini tampil di profil publik.
							</span>
						</label>
					</div>

					<label className="flex flex-col gap-1.5">
						<span className={labelClass}>Sertifikasi</span>
						<textarea
							value={certifications}
							onChange={event => setCertifications(event.target.value)}
							placeholder="cth. Brevet A-B, Certified Tax Consultant"
							rows={3}
							maxLength={800}
							className={areaClass}
						/>
					</label>
					<div className="flex flex-col gap-3">
						<span className={labelClass}>Jenjang pendidikan</span>
						<EducationHistoryEditor entries={eduEntries} onChange={setEduEntries} errors={errors} />
						<p className="text-xs leading-relaxed text-muted-foreground">
							Tambahkan beberapa jenjang pendidikan, misalnya D3 lalu S1.
						</p>
					</div>
					<div className="flex flex-col gap-3">
						<span className={labelClass}>Riwayat pekerjaan</span>
						<WorkHistoryEditor entries={workEntries} onChange={setWorkEntries} errors={errors} />
						<p className="text-xs leading-relaxed text-muted-foreground">
							Tambahkan beberapa pekerjaan. Tanggal keluar boleh dikosongkan bila masih bekerja.
						</p>
					</div>
					<div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5">
						<p className="text-sm font-bold text-foreground">Tampilan halaman detail</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
							Judul, lokasi, mode layanan, dan keunggulan ini tampil di halaman publik profil Anda.
						</p>
						<div className="mt-4 flex flex-col gap-4">
							<label className="flex flex-col gap-1.5">
								<span className={labelClass}>Judul profil</span>
								<textarea
									value={headline}
									onChange={event => setHeadline(event.target.value)}
									placeholder="cth. Adi Permana siap membantu pembukuan dan pajak usaha Anda."
									rows={2}
									maxLength={240}
									className={areaClass}
								/>
								{errors.headline ? (
									<span className="text-xs font-medium text-red-600">{errors.headline}</span>
								) : (
									<span className="text-xs text-muted-foreground">
										Kosongkan untuk memakai ringkasan otomatis dari deskripsi layanan.
									</span>
								)}
							</label>
							<div className="grid gap-4 sm:grid-cols-2">
								<label className="flex flex-col gap-1.5">
									<span className={labelClass}>Mode layanan</span>
									<select
										value={serviceMode}
										onChange={event => setServiceMode(event.target.value)}
										className={fieldClass}
									>
										{Object.entries(SERVICE_MODE_LABELS).map(([value, label]) => (
											<option key={value} value={value}>
												{label}
											</option>
										))}
									</select>
								</label>
								<label className="flex flex-col gap-1.5">
									<span className={labelClass}>Lokasi pertemuan</span>
									<input
										value={meetingLocation}
										onChange={event => setMeetingLocation(event.target.value)}
										placeholder="cth. Jakarta Selatan, atau sesuai kesepakatan"
										className={fieldClass}
										maxLength={200}
									/>
								</label>
							</div>
							<label className="flex flex-col gap-1.5">
								<span className={labelClass}>Ringkasan keunggulan</span>
								<textarea
									value={highlight}
									onChange={event => setHighlight(event.target.value)}
									placeholder="cth. Berpengalaman mendampingi UMKM untuk pembukuan bulanan dan pelaporan pajak."
									rows={3}
									maxLength={600}
									className={areaClass}
								/>
							</label>
							<div className="flex flex-col gap-2">
								<span className={labelClass}>Label keunggulan</span>
								{strengths.map((item, index) => (
									<div key={index} className="flex gap-2">
										<input
											value={item}
											onChange={event =>
												setStrengths(strengths.map((value, i) => (i === index ? event.target.value : value)))
											}
											placeholder="cth. Pembukuan"
											maxLength={40}
											className={fieldClass}
										/>
										<button
											type="button"
											onClick={() => setStrengths(strengths.filter((_, i) => i !== index))}
											className="inline-flex h-11 shrink-0 items-center rounded-xl border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
										>
											Hapus
										</button>
									</div>
								))}
								{strengths.length < 8 ? (
									<button
										type="button"
										onClick={() => setStrengths([...strengths, ''])}
										className="inline-flex h-10 w-fit items-center rounded-full border border-primary/30 px-4 text-sm font-semibold text-primary hover:bg-accent"
									>
										Tambah keunggulan
									</button>
								) : null}
							</div>
						</div>
					</div>
					<label className="flex flex-col gap-1.5">
						<span className={labelClass}>Deskripsi layanan</span>
						<textarea
							value={description}
							onChange={event => setDescription(event.target.value)}
							placeholder="cth. Jasa pembukuan, pelaporan pajak tahunan, dan konsultasi PPh 21 untuk UMKM."
							rows={3}
							maxLength={600}
							className={areaClass}
						/>
					</label>

					<div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4">
						<p className={labelClass}>Lampiran CV</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
							PDF, DOC, DOCX, atau gambar, maksimal 8 MB. Berkas hanya bisa diunduh oleh Anda.
							Pencari tetap mengirim permintaan nama untuk menghubungi Anda.
						</p>
						<input
							ref={cvInputRef}
							type="file"
							accept={CV_ACCEPT}
							className="hidden"
							onChange={event => setCvFile(event.target.files?.[0] ?? null)}
						/>
						<div className="mt-3 flex flex-wrap items-center gap-3">
							<button
								type="button"
								onClick={() => cvInputRef.current?.click()}
								className="inline-flex h-11 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
							>
								<Paperclip className="size-4" strokeWidth={1.75} />
								{cvFile || savedCvName ? 'Ganti lampiran' : 'Unggah lampiran CV'}
							</button>
							{cvFile ? (
								<span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-foreground">
									<FileText className="size-4 shrink-0 text-emerald-600" />
									<span className="truncate">{cvFile.name}</span>
								</span>
							) : savedCvName && savedCvUrl ? (
								<a
									href={savedCvUrl}
									className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
								>
									<FileText className="size-4 shrink-0" />
									<span className="truncate">Lihat lampiran tersimpan</span>
								</a>
							) : savedCvName ? (
								<span className="text-sm text-muted-foreground">Lampiran sudah tersimpan.</span>
							) : null}
						</div>
						{errors.cv_file ? (
							<p className="mt-2 text-xs font-medium text-red-600">{errors.cv_file}</p>
						) : null}
					</div>

					<ImageAdjustDialog
						queue={photoQueue}
						aspect={1}
						title="Sesuaikan foto profil"
						description="Atur posisi dan perbesar foto agar wajah tampil jelas di profil direktori."
						applyLabel="Gunakan"
						onApply={result => {
							if (objectUrlRef.current) {
								URL.revokeObjectURL(objectUrlRef.current);
								objectUrlRef.current = null;
							}
							const url = URL.createObjectURL(result);
							objectUrlRef.current = url;
							setPhotoFile(result);
							setPhotoPreview(url);
							setPhotoQueue(current => current.slice(1));
						}}
						onClose={() => setPhotoQueue([])}
					/>
					{formError ? (
						<p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
							{formError}
						</p>
					) : null}
					{savedNotice ? (
						<p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
							Profil berhasil disimpan dan sudah tampil di direktori akuntan.
						</p>
					) : null}

					<button
						type="submit"
						disabled={saving}
						className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-6 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
					>
						{saving ? (
							<Loader2 className="size-4 animate-spin" strokeWidth={2} />
						) : (
							<Save className="size-4" strokeWidth={1.75} />
						)}
						{saving ? 'Menyimpan…' : 'Update Profile'}
					</button>
					{profile ? (
						<p className="text-sm text-muted-foreground">
							Halaman detail publik profil Anda dapat dilihat pengunjung dari direktori, dan hanya Anda yang dapat mengubahnya.{' '}
							<Link
								to={`/akuntan/profil/${profile.id}`}
								className="font-semibold text-emerald-700 hover:underline"
							>
								Lihat halaman publik profil Anda
							</Link>
						</p>
					) : null}
				</form>
			</div>
		</section>
	);
}
