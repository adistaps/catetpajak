import pb from '@/lib/pocketbase-client';
import type { JournalEntry, PayrollRunMeta } from '@/lib/accounting';

export interface PayrollJournalGroup {
	runId: string;
	run: PayrollRunMeta;
	date: string;
	description: string;
	lines: JournalEntry[];
	total: number;
	transaction?: { id: string; payroll_run: string };
}

export async function loadPayrollJournalGroups(companyId: string): Promise<PayrollJournalGroup[]> {
	const { runs, lines, transactions } = await pb.send<{
		runs: PayrollRunMeta[];
		lines: JournalEntry[];
		transactions: Array<{ id: string; payroll_run: string }>;
	}>('/api/payroll-expense/list', { query: { company: companyId }, requestKey: null });
	return runs.map(run => {
		const entries = lines.filter(line => line.payroll_run === run.id)
			.sort((a, b) => (a.number || '').localeCompare(b.number || ''));
		return {
			runId: run.id,
			run,
			date: run.pay_date || entries[0]?.date || '',
			description: run.description || entries[0]?.description || `Penggajian ${run.period ?? ''}`,
			lines: entries,
			total: entries.reduce((sum, line) => sum + (Number(line.debit) || 0), 0),
			transaction: transactions.find(tx => tx.payroll_run === run.id),
		};
	});
}

export function recordPayrollTransaction(companyId: string, runId: string) {
	return pb.send<{ id: string; alreadyRecorded: boolean }>('/api/payroll-expense/record', {
		method: 'POST', body: { company: companyId, run: runId }, requestKey: `record-payroll-${runId}`,
	});
}

export function payrollErrorMessage(error: unknown, fallback: string): string {
	if (error && typeof error === 'object') {
		const response = (error as { response?: { message?: unknown } }).response;
		if (typeof response?.message === 'string' && response.message && response.message !== 'Something went wrong while processing your request.') return response.message;
	}
	return fallback;
}
