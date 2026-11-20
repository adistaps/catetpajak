import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';

/**
 * Build a guaranteed-valid company-logo file URL.
 *
 * `pb.files.getURL(record, filename)` returns an empty string when the record
 * is missing `collectionId`/`collectionName` — which happens for company
 * objects hydrated from the `/api/my-companies` server endpoint (a plain JSON
 * payload that may omit those SDK metadata fields). An empty string is falsy in
 * `src || fallback`, so the payslip silently fell back to the Catet Pajak logo.
 *
 * Passing a synthetic record with `collectionName: 'companies'` forces the SDK
 * to emit a real URL every time, regardless of which fields the hydrated
 * company object carries.
 */
export function companyLogoUrl(
	company: Pick<Company, 'id' | 'logo'> | null | undefined,
	thumb?: string,
): string | undefined {
	if (!company?.id || !company.logo) return undefined;
	const url = pb.files.getURL(
		{ id: company.id, collectionName: 'companies' } as Parameters<typeof pb.files.getURL>[0],
		company.logo,
		thumb ? { thumb } : {},
	);
	return url || undefined;
}

/**
 * Fetch the active company fresh and return its logo URL.
 *
 * The app-shell `activeCompany` is loaded once on mount; a logo uploaded in the
 * same session is reflected there, but the payslip is also opened from the
 * employee portal where the company record can be stale. Fetching the record
 * directly from PocketBase guarantees `logo` (and `collectionId`) are present.
 */
export async function fetchCompanyLogoUrl(companyId: string): Promise<string | undefined> {
	try {
		const company = await pb.collection('companies').getOne<Company>(companyId, {
			fields: 'id,logo',
			requestKey: null,
		});
		return companyLogoUrl(company);
	} catch {
		return undefined;
	}
}
