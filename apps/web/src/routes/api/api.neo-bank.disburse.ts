import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAsUser } from '@/lib/pocketbase-public.server';
import { disburseViaNeoBank, neoBankConfigStatus } from '@/lib/neo-bank.server';
import logger from '@/lib/logger.server';

interface DisburseBody {
	token?: string;
	companyId?: string;
	runId?: string;
	payslipIds?: string[];
	disbursementDate?: string;
	notes?: string;
}

interface NeoBankSettingsRow {
	enabled?: boolean;
	status?: string;
	account_name?: string;
	account_number?: string;
}

interface PayslipRow {
	id: string;
	company: string;
	run: string;
	employee: string;
	net_pay: number;
	disbursement_status?: string;
	expand?: { employee?: { bank_account?: string; name?: string } };
}

/**
 * Disburses selected payslips via Neo Bank. The caller must be a company
 * member, the platform credentials must be configured, and the company must
 * have an active Neo Bank source account. Each transfer is sent to the bank
 * and a payslip is marked paid ONLY when the bank confirms success — never
 * otherwise. POST so the per-user result is never cached.
 */
export const action = withApi(async ({ request }) => {
	const body = await readJsonBody<DisburseBody>(request);
	const { token, companyId, runId, payslipIds, disbursementDate, notes } = body;
	if (!token || !companyId || !runId || !Array.isArray(payslipIds) || payslipIds.length === 0) {
		return apiError(422, 'token, companyId, runId, and payslipIds are required');
	}
	if (!disbursementDate) {
		return apiError(422, 'Disbursement date is required');
	}

	const caller = await pocketbaseAsUser(request, token);
	if (!caller) {
		return apiError(401, 'Sign in first');
	}

	const company = await caller.pocketbase.findFirstRecord(
		'companies',
		caller.pocketbase.filter('id = {:id}', { id: companyId }),
	);
	if (!company) {
		return apiError(403, 'You do not have access to this company');
	}

	const platform = neoBankConfigStatus();
	if (!platform.configured) {
		return json({
			configured: false,
			companyReady: false,
			message: 'Neo Bank integration is awaiting platform configuration.',
		});
	}

	const settings = await caller.pocketbase.findFirstRecord<NeoBankSettingsRow>(
		'neo_bank_settings',
		caller.pocketbase.filter('company = {:company}', { company: companyId }),
	);
	if (!settings || !settings.enabled || settings.status !== 'active' || !settings.account_number) {
		return json({
			configured: true,
			companyReady: false,
			message: 'Neo Bank is not enabled for this company.',
		});
	}

	// Load selected payslips, scoped to company + run so a caller cannot touch
	// another company's slips.
	const idFilter = payslipIds.map((_, i) => `id = {:id${i}}`).join(' || ');
	const params: Record<string, unknown> = {};
	payslipIds.forEach((id, i) => {
		params[`id${i}`] = id;
	});
	const filter = caller.pocketbase.filter(`company = {:company} && run = {:run} && (${idFilter})`, {
		company: companyId,
		run: runId,
		...params,
	});

	const slips = await caller.pocketbase.listRecords<PayslipRow>('payslips', {
		filter,
		perPage: 500,
		expand: 'employee',
		skipTotal: true,
	});

	const ownerId = caller.user.id;
	const sourceAccount = settings.account_number as string;
	let success = 0;
	let failed = 0;
	const failures: { id: string; message: string }[] = [];

	for (const slip of slips.items) {
		if (slip.disbursement_status === 'paid') {
			continue;
		}
		const destAccount = slip.expand?.employee?.bank_account || '';
		const destName = slip.expand?.employee?.name || '';
		const reference = `PAY-${runId.slice(0, 8)}-${slip.id.slice(0, 6)}`;

		if (!destAccount) {
			failed += 1;
			failures.push({ id: slip.id, message: 'Rekening karyawan belum diisi.' });
			continue;
		}

		const result = await disburseViaNeoBank({
			reference,
			sourceAccount,
			destinationAccount: destAccount,
			destinationName: destName,
			amount: slip.net_pay || 0,
			description: `Payroll ${runId} - ${destName}`,
		});

		if (result.status === 'success') {
			await caller.pocketbase.updateRecord('payslips', slip.id, {
				disbursement_status: 'paid',
				disbursement_date: disbursementDate,
				disbursement_method: 'neo_bank',
				disbursement_notes: notes?.trim() || `Neo Bank ref: ${result.reference || reference}`,
				disbursement_reference: result.reference || reference,
				disbursed_by: ownerId,
			});
			success += 1;
		} else {
			failed += 1;
			failures.push({ id: slip.id, message: result.message || result.status });
		}
	}

	logger.info(`neo bank disburse run=${runId} success=${success} failed=${failed}`);
	return json({ configured: true, companyReady: true, success, failed, failures });
});
