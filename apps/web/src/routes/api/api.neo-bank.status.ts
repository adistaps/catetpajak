import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAsUser } from '@/lib/pocketbase-public.server';
import { neoBankConfigStatus } from '@/lib/neo-bank.server';

interface StatusBody {
	token?: string;
	companyId?: string;
}

interface NeoBankSettingsRow {
	enabled?: boolean;
	status?: string;
	account_name?: string;
	account_number?: string;
}

function maskAccount(num?: string): string {
	if (!num) return '';
	const digits = num.replace(/\D/g, '');
	if (digits.length <= 4) return digits;
	return `••••${digits.slice(-4)}`;
}

/**
 * Returns the Neo Bank integration status for a company: whether the platform
 * credentials are configured (Secrets) and whether the company has enabled and
 * configured its source account. Per-user data is read under access rules, so
 * only company members see it. POST because the response is per-user and must
 * not be cached.
 */
export const action = withApi(async ({ request }) => {
	const { token, companyId } = await readJsonBody<StatusBody>(request);
	if (!token || !companyId) {
		return apiError(422, 'token and companyId are required');
	}

	const caller = await pocketbaseAsUser(request, token);
	if (!caller) {
		return apiError(401, 'Sign in first');
	}

	// Rules-bound read verifies company membership; non-members get null.
	const company = await caller.pocketbase.findFirstRecord(
		'companies',
		caller.pocketbase.filter('id = {:id}', { id: companyId }),
	);
	if (!company) {
		return apiError(403, 'You do not have access to this company');
	}

	const platform = neoBankConfigStatus();
	const settings = await caller.pocketbase.findFirstRecord<NeoBankSettingsRow>(
		'neo_bank_settings',
		caller.pocketbase.filter('company = {:company}', { company: companyId }),
	);

	return json({
		platformConfigured: platform.configured,
		missing: platform.missing,
		enabled: Boolean(settings?.enabled),
		status: settings?.status ?? 'not_configured',
		accountName: settings?.account_name ?? '',
		accountNumberMasked: maskAccount(settings?.account_number),
		companyReady:
			platform.configured &&
			Boolean(settings?.enabled) &&
			settings?.status === 'active' &&
			Boolean(settings?.account_number),
	});
});
