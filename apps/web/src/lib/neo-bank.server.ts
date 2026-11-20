/**
 * Neo Bank (Bank Neo Commerce) integration helpers.
 *
 * Platform-level API credentials are stored as Secrets and read from
 * `process.env` at request time. Per-company source-account settings live in
 * the `neo_bank_settings` PocketBase collection.
 *
 * No money is ever moved unless the platform credentials are configured AND
 * the bank returns a success confirmation for a transfer. When credentials
 * are missing, every call resolves to a `not_configured` result so the UI
 * can surface the awaiting-configuration state — it never marks a payslip as
 * paid on its own.
 */
import logger from '@/lib/logger.server';

const REQUIRED_ENV_KEYS = [
	'NEO_BANK_BASE_URL',
	'NEO_BANK_CLIENT_ID',
	'NEO_BANK_CLIENT_SECRET',
	'NEO_BANK_API_KEY',
] as const;

export interface NeoBankConfigStatus {
	configured: boolean;
	missing: string[];
}

/** Whether all platform-level Neo Bank credentials are present. */
export function neoBankConfigStatus(): NeoBankConfigStatus {
	const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
	return { configured: missing.length === 0, missing };
}

export interface NeoBankTransferRequest {
	reference: string;
	sourceAccount: string;
	destinationAccount: string;
	destinationName: string;
	amount: number;
	description: string;
}

export type NeoBankTransferStatus = 'success' | 'pending' | 'failed' | 'not_configured';

export interface NeoBankTransferResult {
	status: NeoBankTransferStatus;
	reference?: string;
	message?: string;
}

/**
 * Initiates a single transfer via Neo Bank. Returns `not_configured` when the
 * platform credentials are missing — the caller must NOT mark the payslip as
 * paid in that case. When configured, this calls the Neo Bank transfer API
 * and maps the bank's response to a disbursement status.
 *
 * NOTE: the request shape follows a typical open-banking transfer endpoint.
 * Adjust the path/payload to match Neo Bank's API documentation once access is
 * granted. This branch only runs when all REQUIRED_ENV_KEYS are set, so it is
 * inert until the platform credentials are configured.
 */
export async function disburseViaNeoBank(req: NeoBankTransferRequest): Promise<NeoBankTransferResult> {
	const config = neoBankConfigStatus();
	if (!config.configured) {
		return { status: 'not_configured', message: 'Neo Bank integration is not configured.' };
	}

	const baseUrl = process.env.NEO_BANK_BASE_URL as string;
	const apiKey = process.env.NEO_BANK_API_KEY as string;

	try {
		const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/transfers`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
				'X-Client-Id': process.env.NEO_BANK_CLIENT_ID as string,
			},
			body: JSON.stringify({
				reference: req.reference,
				source_account: req.sourceAccount,
				destination_account: req.destinationAccount,
				destination_name: req.destinationName,
				amount: req.amount,
				description: req.description,
			}),
			signal: AbortSignal.timeout(30000),
		});

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			logger.warn(`neo bank transfer failed: ${response.status} ${response.statusText} ${text}`);
			return { status: 'failed', message: `Bank menolak transfer (${response.status}).` };
		}

		const data = (await response.json().catch(() => ({}))) as {
			reference?: string;
			status?: string;
			transaction_id?: string;
		};

		const bankStatus = String(data.status || '').toLowerCase();
		// Only a clear success from the bank marks the slip as paid.
		if (bankStatus === 'success' || bankStatus === 'completed' || bankStatus === 'settlement') {
			return { status: 'success', reference: data.reference || data.transaction_id || req.reference };
		}
		if (bankStatus === 'pending' || bankStatus === 'processing') {
			return { status: 'pending', reference: data.reference || req.reference, message: 'Transfer sedang diproses bank.' };
		}
		return { status: 'failed', message: 'Bank tidak mengonfirmasi transfer.' };
	} catch (error) {
		logger.error('neo bank transfer error', error instanceof Error ? error.message : String(error));
		return { status: 'failed', message: 'Tidak dapat menghubungi Neo Bank. Coba lagi nanti.' };
	}
}
