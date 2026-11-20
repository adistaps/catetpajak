import pb from '@/lib/pocketbase-client';
import type { Student } from '@/lib/students';

export type AnnouncementStatus = 'draft' | 'published';

export interface Announcement {
	id: string;
	company: string;
	title: string;
	body: string;
	date: string;
	status: AnnouncementStatus;
	student: string;
	owner: string;
	attachment: string[];
	created: string;
	updated: string;
	expand?: { student?: Student };
}

export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
	draft: 'Draf',
	published: 'Dipublikasikan',
};

/** URL berkas lampiran untuk pengumuman. */
export function attachmentUrl(record: { id: string; attachment?: string[] }, filename: string): string {
	return pb.files.getURL({ id: record.id, collectionId: 'announcements', collectionName: 'announcements' } as never, filename);
}

/**
 * Pengumuman published yang terlihat oleh parent yang sedang masuk. Aturan
 * akses koleksi sudah membatasi hanya pengumuman untuk perusahaan/siswa yang
 * terhubung dengan parent tersebut.
 */
export async function fetchParentAnnouncements(): Promise<Announcement[]> {
	return pb.collection('announcements').getFullList<Announcement>({
		filter: pb.filter('status = "published"'),
		sort: '-date,-created',
		expand: 'student',
		requestKey: null,
	});
}

/** Seluruh pengumuman untuk sebuah perusahaan (pengelolaan internal). */
export async function fetchCompanyAnnouncements(companyId: string): Promise<Announcement[]> {
	return pb.collection('announcements').getFullList<Announcement>({
		filter: pb.filter('company = {:c}', { c: companyId }),
		sort: '-date,-created',
		expand: 'student',
		requestKey: null,
	});
}

export interface AnnouncementInput {
	company: string;
	title: string;
	body: string;
	date: string;
	status: AnnouncementStatus;
	owner: string;
	student?: string | null;
	attachment?: File[];
}

function buildPayload(data: AnnouncementInput): FormData {
	const fd = new FormData();
	fd.append('company', data.company);
	fd.append('title', data.title);
	fd.append('body', data.body);
	fd.append('date', data.date);
	fd.append('status', data.status);
	fd.append('owner', data.owner);
	fd.append('student', data.student || '');
	if (data.attachment && data.attachment.length > 0) {
		for (const file of data.attachment) {
			fd.append('attachment', file);
		}
	}
	return fd;
}

export async function createAnnouncement(data: AnnouncementInput): Promise<Announcement> {
	return pb.collection('announcements').create<Announcement>(buildPayload(data));
}

export async function updateAnnouncement(
	id: string,
	data: Partial<Omit<AnnouncementInput, 'company' | 'owner'>> & { student?: string | null },
): Promise<Announcement> {
	const fd = new FormData();
	if (data.title !== undefined) fd.append('title', data.title);
	if (data.body !== undefined) fd.append('body', data.body);
	if (data.date !== undefined) fd.append('date', data.date);
	if (data.status !== undefined) fd.append('status', data.status);
	fd.append('student', data.student ?? '');
	if (data.attachment && data.attachment.length > 0) {
		for (const file of data.attachment) {
			fd.append('attachment', file);
		}
	}
	return pb.collection('announcements').update<Announcement>(id, fd);
}

export async function deleteAnnouncement(id: string): Promise<void> {
	await pb.collection('announcements').delete(id);
}
