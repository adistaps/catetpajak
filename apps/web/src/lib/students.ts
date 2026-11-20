import type { RecordModel } from 'pocketbase';
import pb from '@/lib/pocketbase-client';

export type StudentActiveStatus = 'active' | 'inactive' | 'graduated' | 'withdrawn';

export interface Student {
	id: string;
	company: string;
	student_name: string;
	student_id_number: string;
	academic_year: string;
	parents_name: string;
	punishment: string;
	school_program: string;
	school_grade: string;
	active_status: StudentActiveStatus;
	parent?: string;
	virtual_account_number: string;
	phone: string;
	mobile: string;
	email: string;
	address: string;
	notes: string;
	/** Nama berkas foto profil di PocketBase, kosong bila belum diunggah. */
	photo?: string;
	owner: string;
	created: string;
	updated: string;
}

export const STUDENT_STATUS_LABELS: Record<StudentActiveStatus, string> = {
	active: 'Aktif',
	inactive: 'Nonaktif',
	graduated: 'Lulus',
	withdrawn: 'Keluar',
};

/** URL foto profil siswa, atau string kosong bila belum ada. */
export function studentPhotoUrl(student: Pick<Student, 'id' | 'photo'> & { collectionId?: string; collectionName?: string }): string {
	if (!student.photo) return '';
	return pb.files.getURL(
		{ collectionName: 'students', ...student } as unknown as RecordModel,
		student.photo,
		{ thumb: '100x100' },
	);
}

export function studentInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export const STUDENT_STATUS_OPTIONS: StudentActiveStatus[] = [
	'active',
	'inactive',
	'graduated',
	'withdrawn',
];
