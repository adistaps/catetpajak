import { loanBalance, loanInstallment, type EmployeeLoan, type LoanScheduleRow } from '@/lib/payroll';

const MAX_INSTALLMENTS = 600;

/** Tambahkan bulan tanpa melompati akhir bulan. */
export function loanScheduleDate(start: string, months: number): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(start);
	if (!match) return '';
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const target = new Date(Date.UTC(year, month - 1 + months, 1));
	const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
	return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function buildLoanSchedule(principal: number, installments: number, paidCount: number, paidAmount: number, disbursedDate: string, preferredAmount = 0): LoanScheduleRow[] {
	const remainingCount = installments - paidCount;
	const balance = principal - paidAmount;
	if (!Number.isSafeInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS || !Number.isSafeInteger(paidCount) || paidCount < 0 || remainingCount < 0 || !Number.isSafeInteger(balance) || balance < 0 || remainingCount === 0) return [];
	// Biarkan setidaknya satu rupiah untuk cicilan terakhir bila memungkinkan.
	const evenAmount = Math.floor(balance / remainingCount);
	const regular = Number.isSafeInteger(preferredAmount) && preferredAmount > 0 && preferredAmount * (remainingCount - 1) < balance ? preferredAmount : evenAmount;
	let remaining = balance;
	return Array.from({ length: remainingCount }, (_, index) => {
		// Gunakan nilai reguler yang sesuai; angsuran terakhir menerima sisanya.
		const principalDue = index === remainingCount - 1 ? remaining : Math.min(regular, remaining);
		remaining -= principalDue;
		return { number: paidCount + index + 1, date: loanScheduleDate(disbursedDate, paidCount + index + 1), principal: principalDue, interest: 0 };
	});
}

/** Satu baris jadwal = satu pemotongan saat periode payroll dibuat. */
export function nextLoanPayment(loan: EmployeeLoan): { principal: number; interest: number; valid: boolean } {
	const balance = loanBalance(loan);
	if (balance <= 0) return { principal: 0, interest: 0, valid: false };
	const paidCount = Number(loan.paid_installments) || 0;
	const rows = loan.installment_schedule;
	if (Array.isArray(rows) && rows.length > 0) {
		const future = rows.filter(row => row.number > paidCount).sort((a, b) => a.number - b.number);
		const valid = future.length === loan.installments - paidCount && future.every((row, index) => row.number === paidCount + index + 1 && Number.isSafeInteger(row.principal) && row.principal >= 0 && Number.isSafeInteger(row.interest) && row.interest >= 0) && future.reduce((sum, row) => sum + row.principal, 0) === balance;
		if (!valid || !future[0]) return { principal: 0, interest: 0, valid: false };
		return { principal: future[0].principal, interest: future[0].interest, valid: true };
	}
	const principal = Math.min(balance, paidCount + 1 >= (loan.installments || 1) ? balance : loanInstallment(loan));
	return { principal, interest: 0, valid: true };
}
