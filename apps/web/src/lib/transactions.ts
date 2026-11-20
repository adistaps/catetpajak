import type { Account } from '@/lib/accounting';
import type { Contact } from '@/lib/contacts';
import type { Product } from '@/lib/products';

export type TransactionCategory =
	| 'penjualan'
	| 'pembelian'
	| 'kas_bank'
	| 'aset'
	| 'biaya';

export interface Transaction {
	id: string;
	company: string;
	category: TransactionCategory;
	date: string;
	description: string;
	amount: number;
	partner: string;
	debit_account: string;
	credit_account: string;
	contact: string;
	product: string;
	quantity: number;
	unit_price: number;
	discount: number;
	tax_rate: number;
	tax_amount: number;
	owner: string;
	created: string;
	warehouse?: string;
	/** Periode payroll yang jurnalnya sudah ditautkan ke transaksi ini. */
	payroll_run?: string;
	/** Pengajuan pinjaman karyawan terkait (transaksi Biaya untuk ditinjau akuntan). */
	loan?: string;
	/** Pengajuan reimbursement karyawan terkait (transaksi Biaya untuk diproses akuntan). */
	reimbursement?: string;
	expense_detail?: {
		number?: string;
		payLater?: boolean;
		paymentMethod?: string;
		tag?: string;
		billingAddress?: string;
		taxInclusive?: boolean;
		/** Penanda transaksi pengajuan pinjaman karyawan. */
		kind?: 'loan' | 'reimbursement' | 'payroll';
		payrollRunId?: string;
		/** Id pengajuan pinjaman (employee_loans). */
		loanId?: string;
		/** Id pengajuan reimbursement (reimbursements). */
		reimbursementId?: string;
		employeeId?: string;
		employeeName?: string;
		installments?: number;
		installmentAmount?: number;
		/** True setelah akuntan memproses transaksi ke jurnal. */
		booked?: boolean;
	};
	expand?: {
		debit_account?: Account;
		credit_account?: Account;
		contact?: Contact;
		product?: Product;
		loan?: import('@/lib/payroll').EmployeeLoan;
		reimbursement?: import('@/lib/reimbursements').Reimbursement;
	};
}
