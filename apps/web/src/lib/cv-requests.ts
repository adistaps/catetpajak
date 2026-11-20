import pb from '@/lib/pocketbase-client';

/**
 * Permintaan CV pada Catet Akuntan: Pencari Akuntan mengirim permintaan ke
 * profil akuntan; akuntan melihat dan memproses permintaan yang masuk.
 * Isolasi data ditegakkan oleh access rule koleksi `cv_requests`:
 * pencari hanya melihat permintaannya sendiri, akuntan hanya melihat
 * permintaan yang ditujukan ke profil miliknya.
 */
export type CvRequestStatus = 'baru' | 'diproses' | 'selesai';

export type CvRequest = {
	id: string;
	accountant: string;
	seeker: string;
	name: string;
	email: string;
	phone: string;
	company_name: string;
	message: string;
	status: CvRequestStatus;
	created: string;
	updated: string;
	expand?: {
		accountant?: {
			id: string;
			name: string;
			cv_name: string;
			city: string;
		};
	};
};

export const CV_REQUEST_STATUS_LABELS: Record<CvRequestStatus, string> = {
	baru: 'Baru',
	diproses: 'Diproses',
	selesai: 'Selesai',
};

/** Warna badge per status permintaan. */
export function cvRequestStatusClass(status: CvRequestStatus): string {
	if (status === 'baru') return 'bg-amber-50 text-amber-700 border-amber-200';
	if (status === 'diproses') return 'bg-sky-50 text-sky-700 border-sky-200';
	return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export type CvRequestInput = {
	accountant: string;
	name: string;
	email: string;
	phone: string;
	company_name: string;
	message: string;
};

/** Kirim permintaan CV baru atas nama pengguna yang sedang masuk. */
export async function createCvRequest(
	input: CvRequestInput,
	seekerId: string,
): Promise<CvRequest> {
	const record = await pb.collection('cv_requests').create({
		...input,
		seeker: seekerId,
		status: 'baru',
	});
	return record as unknown as CvRequest;
}

/** Permintaan yang masuk ke satu profil akuntan (dipanggil pemilik profil). */
export async function listCvRequestsForAccountant(
	accountantProfileId: string,
): Promise<CvRequest[]> {
	const records = await pb.collection('cv_requests').getFullList({
		filter: pb.filter('accountant = {:id}', { id: accountantProfileId }),
		sort: '-created',
	});
	return records as unknown as CvRequest[];
}

/** Permintaan yang dikirim pengguna (pencari) sendiri. */
export async function listMyCvRequests(seekerId: string): Promise<CvRequest[]> {
	const records = await pb.collection('cv_requests').getFullList({
		filter: pb.filter('seeker = {:id}', { id: seekerId }),
		sort: '-created',
		expand: 'accountant',
	});
	return records as unknown as CvRequest[];
}

/** Akuntan menandai status permintaan (baru/diproses/selesai). */
export async function updateCvRequestStatus(
	id: string,
	status: CvRequestStatus,
): Promise<CvRequest> {
	const record = await pb
		.collection('cv_requests')
		.update(id, { status });
	return record as unknown as CvRequest;
}

/** Tanggal permintaan dalam format Indonesia yang aman untuk render. */
export function formatCvRequestDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '-';
	return date.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});
}
