import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowLeft,
	Bell,
	CalendarDays,
	FileText,
	LogOut,
	Megaphone,
	UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import {
	attachmentUrl,
	fetchParentAnnouncements,
	type Announcement,
} from '@/lib/announcements';
import {
	currentParent,
	fetchMyInvoices,
	fetchMyStudents,
	logoutParent,
	type ParentInvoice,
	type ParentStudent,
} from '@/lib/parents';
import { formatDate } from '@/lib/accounting';
import { hasVariables, resolveVariables, type VariableContext } from '@/lib/announcement-variables';

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
							className="size-24 object-cover"
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

interface RenderedAnnouncement {
	key: string;
	item: Announcement;
	studentName?: string;
	resolvedBody: string;
}

export function ParentAnnouncements() {
	const [announcements, setAnnouncements] = useState<Announcement[]>([]);
	const [students, setStudents] = useState<ParentStudent[]>([]);
	const [invoices, setInvoices] = useState<ParentInvoice[]>([]);
	const [loading, setLoading] = useState(true);

	const parent = currentParent();
	const parentName = parent?.name || parent?.email || 'Parent';

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [list, studentList, invoiceList] = await Promise.all([
				fetchParentAnnouncements(),
				fetchMyStudents(),
				fetchMyInvoices(),
			]);
			setAnnouncements(list);
			setStudents(studentList);
			setInvoices(invoiceList);
		} catch {
			setAnnouncements([]);
			toast.error('Gagal memuat pengumuman.');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const invoicesByStudent = useMemo(() => {
		const map = new Map<string, ParentInvoice[]>();
		for (const inv of invoices) {
			const sid = inv.student;
			if (!sid) continue;
			const arr = map.get(sid);
			if (arr) arr.push(inv);
			else map.set(sid, [inv]);
		}
		return map;
	}, [invoices]);

	const studentById = useMemo(() => {
		const map = new Map<string, ParentStudent>();
		for (const s of students) map.set(s.id, s);
		return map;
	}, [students]);

	/**
	 * Bangun daftar pengumuman yang sudah diisi variabelnya. Untuk pengumuman
	 * yang ditujukan ke siswa tertentu, variabel diisi dengan data siswa itu.
	 * Untuk pengumuman ke seluruh siswa: bila teks memuat variabel, tampilkan
	 * satu kartu per siswa yang terhubung (masing-masing dengan data siswa
	 * bersangkutan); bila tidak memuat variabel, tampilkan sekali saja.
	 */
	const rendered = useMemo<RenderedAnnouncement[]>(() => {
		const result: RenderedAnnouncement[] = [];
		for (const item of announcements) {
			const buildContext = (studentId: string): VariableContext => {
				const student = studentById.get(studentId);
				return {
					parentName,
					studentName: student?.student_name ?? '',
					unpaidInvoices: invoicesByStudent.get(studentId) ?? [],
				};
			};
			if (item.student) {
				result.push({
					key: item.id,
					item,
					studentName: studentById.get(item.student)?.student_name,
					resolvedBody: resolveVariables(item.body, buildContext(item.student)),
				});
				continue;
			}
			if (!hasVariables(item.body)) {
				result.push({ key: item.id, item, resolvedBody: item.body });
				continue;
			}
			for (const s of students) {
				result.push({
					key: `${item.id}-${s.id}`,
					item,
					studentName: s.student_name,
					resolvedBody: resolveVariables(item.body, buildContext(s.id)),
				});
			}
		}
		return result;
	}, [announcements, students, studentById, invoicesByStudent, parentName]);

	const handleLogout = () => {
		logoutParent();
		window.location.href = '/app/parent';
	};

	return (
		<div className="min-h-dvh bg-gradient-to-br from-emerald-50/60 via-background to-background">
			<header className="border-b border-border bg-card/80 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							Portal Parent
						</p>
						<h1 className="text-lg font-extrabold tracking-tight">{parentName}</h1>
					</div>
					<button
						type="button"
						onClick={handleLogout}
						className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
					>
						<LogOut className="size-3.5" /> Keluar
					</button>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-5 py-8">
				<Link
					to="/app/parent/dashboard"
					className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Kembali ke Dasbor
				</Link>
				<div className="mt-4 flex items-center gap-2">
					<span className="relative flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Bell className="size-5" />
						{!loading && announcements.length > 0 ? (
							<span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
								{announcements.length > 9 ? '9+' : announcements.length}
							</span>
						) : null}
					</span>
					<div>
						<h2 className="text-xl font-extrabold tracking-tight">Pengumuman</h2>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Pengumuman terbaru dari sekolah untuk Anda dan siswa yang terhubung.
						</p>
					</div>
				</div>

				<section className="mt-6">
					{loading ? (
						<p className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
							Memuat pengumuman…
						</p>
					) : rendered.length === 0 ? (
						<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center">
							<div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
								<Megaphone className="size-6" />
							</div>
							<p className="text-sm font-semibold">Belum ada pengumuman</p>
							<p className="max-w-sm text-xs text-muted-foreground">
								Pengumuman dari sekolah akan muncul di sini saat diterbitkan.
							</p>
						</div>
					) : (
						<div className="flex flex-col gap-4">
							{rendered.map(({ key, item, studentName, resolvedBody }) => (
								<article
									key={key}
									className="rounded-2xl border border-border bg-card p-5 shadow-soft-sm"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
											<Megaphone className="size-3" /> Pengumuman
										</span>
										{studentName ? (
											<span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">
												<UserRound className="size-3" /> {studentName}
											</span>
										) : (
											<span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
												Untuk Semua Siswa
											</span>
										)}
										<span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
											<CalendarDays className="size-3" /> {formatDate(item.date)}
										</span>
									</div>
									<h3 className="mt-3 text-base font-extrabold tracking-tight">{item.title}</h3>
									<p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
										{resolvedBody}
									</p>
									<AttachmentList record={item} />
								</article>
							))}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
