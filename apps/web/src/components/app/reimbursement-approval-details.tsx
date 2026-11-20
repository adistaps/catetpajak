import pb from '@/lib/pocketbase-client';
import type { Reimbursement, ReimbursementStatus, StatusHistoryEntry } from '@/lib/reimbursements';

const EVENT_LABELS: Partial<Record<ReimbursementStatus, string>> = {
	approved: 'Disetujui oleh',
	rejected: 'Ditolak oleh',
	paid: 'Pembayaran diproses oleh',
};

function recordedEvents(request: Reimbursement): StatusHistoryEntry[] {
	return Array.isArray(request.status_history)
		? request.status_history.filter(entry => entry && Boolean(EVENT_LABELS[entry.status]))
		: [];
}

/** Gunakan hanya identitas yang tercatat di riwayat atau pemroses pengajuan. */
export async function loadReimbursementActorNames(
	companyId: string,
	requests: Reimbursement[],
): Promise<Record<string, string>> {
	const ids = new Set<string>();
	const names: Record<string, string> = {};
	for (const request of requests) {
		if (request.processed_by) ids.add(request.processed_by);
		for (const event of recordedEvents(request)) {
			if (typeof event.by === 'string' && event.by) ids.add(event.by);
		}
		const processor = request.expand?.processed_by;
		if (processor?.id && processor.name?.trim()) names[processor.id] = processor.name.trim();
	}
	if (ids.size === 0) return names;

	// Nama karyawan dapat dibaca oleh anggota perusahaan sesuai aturan yang ada.
	const employees = await pb.collection('employees').getFullList<{ id: string; user?: string; name?: string }>({
		filter: pb.filter('company = {:company}', { company: companyId }),
		fields: 'id,user,name',
		requestKey: null,
	}).catch(() => []);
	for (const employee of employees) {
		if (employee.user && ids.has(employee.user) && employee.name?.trim()) {
			names[employee.user] = employee.name.trim();
		}
	}

	const currentUser = pb.authStore.record;
	if (currentUser?.id && ids.has(currentUser.id) && typeof currentUser.name === 'string' && currentUser.name.trim()) {
		names[currentUser.id] ||= currentUser.name.trim();
	}

	// Sebagian pemroses bukan karyawan. Hormati aturan akses pengguna; jika
	// profilnya tidak dapat dibaca, tampilkan bahwa nama belum tersedia.
	await Promise.all([...ids].filter(id => !names[id]).map(async id => {
		try {
			const user = await pb.collection('users').getOne<{ id: string; name?: string }>(id, {
				fields: 'id,name',
				requestKey: null,
			});
			if (user.name?.trim()) names[id] = user.name.trim();
		} catch {
			// Profil tidak tersedia bagi pengguna saat ini.
		}
	}));
	return names;
}

function displayDate(value?: string): string {
	const date = value?.slice(0, 10) ?? '';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
	const parsed = new Date(`${date}T12:00:00`);
	return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('id-ID', {
		day: 'numeric', month: 'short', year: 'numeric',
	});
}

export function ReimbursementApprovalDetails({
	request,
	names,
	loadingNames,
}: {
	request: Reimbursement;
	names: Record<string, string>;
	loadingNames: boolean;
}) {
	const events = recordedEvents(request);
	const lastCurrentEvent = events.map(event => event.status).lastIndexOf(request.status);
	// processed_by adalah pemroses status TERAKHIR dan dapat tertimpa saat
	// pembayaran. Jangan memakainya sebagai penyetuju untuk status lain.
	const displayEvents = events.map((event, index) => ({
		...event,
		by: event.by || (index === lastCurrentEvent ? request.processed_by : ''),
	}));
	if (EVENT_LABELS[request.status] && lastCurrentEvent === -1) {
		displayEvents.push({
			status: request.status,
			at: request.status === 'paid' ? request.paid_date || request.processed_date : request.processed_date,
			by: request.processed_by,
		});
	}

	return (
		<section aria-label="Rincian proses persetujuan" className="max-w-[390px] rounded-xl bg-slate-50 px-3 py-3 sm:max-w-none">
			<h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Proses persetujuan</h3>
			<ol className="mt-2 space-y-2.5">
				{displayEvents.map((event, index) => {
					const date = displayDate(event.at);
					return (
						<li key={`${event.status}-${index}`} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
							<span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${event.status === 'rejected' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
							<span>
								<span className="font-semibold">{EVENT_LABELS[event.status]}:</span>{' '}
								{(event.by && names[event.by]) || (loadingNames && event.by ? 'Memuat nama…' : 'Nama belum tersedia')}
								{date ? <span className="text-slate-500"> · {date}</span> : null}
							</span>
						</li>
					);
				})}
				{request.status === 'pending' ? (
					<li className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
						<span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" />
						<span><span className="font-semibold">Menunggu persetujuan:</span> penanggung jawab belum tersedia</span>
					</li>
				) : null}
				{request.status === 'paid' && !events.some(event => event.status === 'approved') ? (
					<li className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
						<span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-300" />
						<span>Riwayat persetujuan belum tersedia.</span>
					</li>
				) : null}
				{displayEvents.length === 0 && request.status !== 'pending' ? (
					<li className="text-xs text-slate-500">Rincian proses belum tersedia.</li>
				) : null}
			</ol>
		</section>
	);
}
