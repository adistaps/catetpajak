import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
	Briefcase,
	Inbox,
	Loader2,
	Mail,
	Phone,
	Send,
	Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { usePencariSubscription } from '@/hooks/use-pencari-subscription';
import { getAkuntanRole, getMyAkuntanProfile, type AkuntanProfile } from '@/lib/akuntan';
import {
	CV_REQUEST_STATUS_LABELS,
	cvRequestStatusClass,
	formatCvRequestDate,
	listCvRequestsForAccountant,
	listMyCvRequests,
	updateCvRequestStatus,
	type CvRequest,
	type CvRequestStatus,
} from '@/lib/cv-requests';

const STATUS_OPTIONS: CvRequestStatus[] = ['baru', 'diproses', 'selesai'];

function StatusBadge({ status }: { status: CvRequestStatus }) {
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cvRequestStatusClass(status)}`}
		>
			{CV_REQUEST_STATUS_LABELS[status]}
		</span>
	);
}

function ContactRow({ icon, value }: { icon: React.ReactNode; value: string }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			{icon}
			<span className="truncate">{value}</span>
		</span>
	);
}

/**
 * Panel permintaan CV pada dasbor Catet Akuntan. Akuntan melihat permintaan
 * yang masuk ke profilnya beserta detail pesan dan dapat menandai status
 * (Baru/Diproses/Selesai). Pencari Akuntan melihat permintaannya sendiri
 * beserta status terkini. Isolasi data ditegakkan oleh access rule
 * PocketBase pada koleksi `cv_requests`.
 */
export function CvRequestsPanel() {
	const { user, isAuthed, isLoading } = useAuth();
	const role = getAkuntanRole(user);
	const { isSubscribed, isLoading: subLoading } = usePencariSubscription();
	const [profile, setProfile] = useState<AkuntanProfile | null>(null);
	const [requests, setRequests] = useState<CvRequest[] | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [busyId, setBusyId] = useState<string | null>(null);

	const isSeeker = role === 'pencari';

	useEffect(() => {
		if (isLoading || !isAuthed || !user) return;
		let active = true;
		setRequests(null);
		setLoadError(false);

		async function load() {
			try {
				if (isSeeker) {
					const items = await listMyCvRequests(user!.id);
					if (active) setRequests(items);
				} else {
					const myProfile = await getMyAkuntanProfile(user!.id);
					if (!active) return;
					setProfile(myProfile);
					if (!myProfile) {
						setRequests([]);
						return;
					}
					const items = await listCvRequestsForAccountant(myProfile.id);
					if (active) setRequests(items);
				}
			} catch {
				if (active) setLoadError(true);
			}
		}

		void load();
		return () => {
			active = false;
		};
	}, [isLoading, isAuthed, user, isSeeker]);

	async function setStatus(id: string, status: CvRequestStatus) {
		setBusyId(id);
		try {
			const updated = await updateCvRequestStatus(id, status);
			setRequests(prev =>
				prev ? prev.map(item => (item.id === id ? updated : item)) : prev,
			);
			toast.success(`Permintaan ditandai sebagai ${CV_REQUEST_STATUS_LABELS[status]}.`);
		} catch {
			toast.error('Gagal memperbarui status permintaan. Coba lagi.');
		} finally {
			setBusyId(null);
		}
	}

	if (isLoading) {
		return <div className="mt-8 h-48 animate-pulse rounded-2xl bg-emerald-50" />;
	}

	if (!isAuthed) return null;

	if (isSeeker && !subLoading && !isSubscribed) {
		return (
			<section className="mt-10">
				<h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-[#102a4c]">
					<Send className="size-5 text-emerald-600" strokeWidth={1.75} />
					Permintaan nama saya
				</h2>
				<div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-center">
					<Briefcase className="mx-auto size-10 text-emerald-300" strokeWidth={1.5} />
					<p className="mt-3 text-sm font-semibold text-foreground">
						Berlangganan untuk mengirim permintaan nama
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Pengiriman permintaan kepada akuntan memerlukan langganan Pencari Akuntan
						aktif (Rp49.000/bulan).
					</p>
					<Link
						to="/akuntan/langganan"
						className="mt-4 inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-5 text-sm font-semibold text-white shadow-soft-sm transition hover:brightness-110"
					>
						Berlangganan sekarang
					</Link>
				</div>
			</section>
		);
	}

	return (
		<section className="mt-10">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-[#102a4c]">
					{isSeeker ? (
						<Send className="size-5 text-emerald-600" strokeWidth={1.75} />
					) : (
						<Inbox className="size-5 text-emerald-600" strokeWidth={1.75} />
					)}
					{isSeeker ? 'Permintaan nama saya' : 'Permintaan nama masuk'}
				</h2>
				{requests && requests.length > 0 ? (
					<p className="text-sm text-muted-foreground">{requests.length} permintaan</p>
				) : null}
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				{isSeeker
					? 'Pantau status permintaan nama yang Anda kirim kepada para akuntan.'
					: 'Permintaan nama dari pencari jasa akuntan untuk profil Anda.'}
			</p>

			<div className="mt-4 space-y-4">
				{loadError ? (
					<p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
						Gagal memuat permintaan. Muat ulang halaman untuk mencoba lagi.
					</p>
				) : requests === null ? (
					<div className="h-40 animate-pulse rounded-2xl bg-emerald-50" />
				) : requests.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-6 py-10 text-center">
						<Briefcase className="mx-auto size-10 text-emerald-300" strokeWidth={1.5} />
						<p className="mt-3 text-sm font-semibold text-foreground">
							{isSeeker
								? 'Belum ada permintaan terkirim'
								: profile
									? 'Belum ada permintaan nama masuk'
									: 'Buat profil akuntan Anda dulu'}
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{isSeeker
								? 'Jelajahi direktori dan kirim permintaan nama kepada akuntan yang sesuai.'
								: profile
									? 'Permintaan dari pencari akuntan akan tampil di sini.'
									: 'Permintaan nama masuk akan tampil di sini setelah profil Anda tayang.'}
						</p>
						{isSeeker ? (
							<Link
								to="/akuntan"
								className="mt-4 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft-sm transition hover:brightness-110"
							>
								Jelajahi direktori
							</Link>
						) : null}
					</div>
				) : (
					requests.map(request => {
						const accountant = request.expand?.accountant;
						return (
							<article
								key={request.id}
								className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-soft-sm"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="text-[15px] font-bold tracking-tight text-[#102a4c]">
											{isSeeker
												? accountant
													? `${accountant.name} — ${accountant.cv_name}`
													: 'Akuntan'
												: request.name}
										</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{formatCvRequestDate(request.created)}
											{!isSeeker && request.company_name
												? ` · ${request.company_name}`
												: ''}
										</p>
									</div>
									<StatusBadge status={request.status} />
								</div>

								<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
									<ContactRow icon={<Mail className="size-3.5 text-emerald-500" />} value={request.email} />
									{request.phone ? (
										<ContactRow icon={<Phone className="size-3.5 text-emerald-500" />} value={request.phone} />
									) : null}
									{isSeeker && request.company_name ? (
										<ContactRow icon={<Building2 className="size-3.5 text-emerald-500" />} value={request.company_name} />
									) : null}
								</div>

								{request.message ? (
									<p className="mt-3 rounded-xl bg-emerald-50/70 px-3.5 py-2.5 text-sm leading-relaxed text-slate-600">
										{request.message}
									</p>
								) : null}

								{!isSeeker ? (
									<div className="mt-4 flex flex-wrap items-center gap-2">
										<span className="text-xs font-semibold text-muted-foreground">
											Tandai status:
										</span>
										{STATUS_OPTIONS.map(status => (
											<button
												key={status}
												type="button"
												disabled={busyId === request.id || request.status === status}
												onClick={() => setStatus(request.id, status)}
												className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-default ${
													request.status === status
														? 'border-emerald-300 bg-emerald-100 text-emerald-800'
														: 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50'
												}`}
											>
												{busyId === request.id ? (
													<Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
												) : null}
												{CV_REQUEST_STATUS_LABELS[status]}
											</button>
										))}
									</div>
								) : null}
							</article>
						);
					})
				)}
			</div>
		</section>
	);
}
