/**
 * Catatan kegagalan impor di perangkat ini, dipisah per perusahaan.
 * Bukan data bersama antar pengguna — hanya jejak lokal agar lonceng
 * bisa menampilkan impor yang gagal tanpa membuka data perusahaan lain.
 */

export type ImportFailureNotice = {
	id: string;
	companyId: string;
	label: string;
	message: string;
	at: string;
};

const FAIL_KEY = 'catet.importFailures.v1';
export const NOTICES_EVENT = 'catet:notices';
const COMPANY_KEY = 'bukubesar.activeCompanyId';

function readAll(): ImportFailureNotice[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = window.localStorage.getItem(FAIL_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as ImportFailureNotice[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writeAll(list: ImportFailureNotice[]) {
	window.localStorage.setItem(FAIL_KEY, JSON.stringify(list.slice(0, 30)));
	window.dispatchEvent(new Event(NOTICES_EVENT));
}

export function listImportFailures(companyId: string): ImportFailureNotice[] {
	if (!companyId) return [];
	return readAll().filter(item => item.companyId === companyId);
}

export function recordImportFailure(input: {
	companyId?: string;
	label: string;
	message: string;
}) {
	if (typeof window === 'undefined') return;
	const companyId =
		input.companyId || window.localStorage.getItem(COMPANY_KEY) || '';
	if (!companyId) return;
	const next: ImportFailureNotice = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		companyId,
		label: input.label,
		message: input.message,
		at: new Date().toISOString(),
	};
	writeAll([next, ...readAll()]);
}

export function dismissImportFailure(id: string) {
	if (typeof window === 'undefined') return;
	writeAll(readAll().filter(item => item.id !== id));
}
