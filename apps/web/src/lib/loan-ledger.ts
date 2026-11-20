import pb from '@/lib/pocketbase-client';
import { todayIso, type Company } from '@/lib/accounting';
import type { EmployeeLoan } from '@/lib/payroll';

/**
 * Pengajuan pinjaman karyawan (ESS) tercatat sebagai transaksi Biaya yang belum
 * dibukukan, sehingga akuntan dapat memproses atau menolaknya. Bila transaksi
 * gagal dibuat saat pengajuan (jaringan/peramban terputus), pembuatan ulang
 * dilakukan saat halaman Biaya dibuka agar pengajuan yang menunggu tetap
 * terlihat. Tidak ada jurnal/akun yang dicatat di sini — pemrosesan ke
 * pembukuan tetap dilakukan akuntan, dan transaksi yang sudah ada tidak
 * digandakan.
 */
export async function ensureLoanTransaction(
	company: Company,
	loan: EmployeeLoan,
	employeeName: string,
): Promise<void> {
	// Idempoten: lewati bila pengajuan ini sudah memiliki transaksi Biaya tertaut,
	// agar menyetujui pinjaman atau membuka halaman Biaya tidak menghasilkan
	// transaksi/jurnal ganda.
	const existing = await pb
		.collection('transactions')
		.getFullList({
			filter: pb.filter('company = {:company} && loan = {:loan}', {
				company: company.id,
				loan: loan.id,
			}),
			fields: 'id',
			requestKey: `loan-request-tx-check-${loan.id}`,
		})
		.catch(() => [] as { id: string }[]);
	if (existing.length > 0) return;

	const ownerId = loan.owner || pb.authStore.record?.id || company.owner;
	await pb.collection('transactions').create(
		{
			company: company.id,
			category: 'biaya',
			date: (loan.disbursed_date || todayIso()).slice(0, 10),
			description: `Pengajuan Pinjaman — ${employeeName}`,
			amount: Number(loan.principal) || 0,
			partner: employeeName,
			debit_account: null,
			credit_account: null,
			contact: null,
			product: null,
			loan: loan.id,
			expense_detail: {
				kind: 'loan',
				loanId: loan.id,
				employeeId: loan.employee,
				employeeName,
				installments: Number(loan.installments) || 1,
				installmentAmount: Number(loan.installment_amount) || 0,
				booked: false,
			},
			owner: ownerId,
		},
		{ requestKey: `loan-request-tx-${loan.id}` },
	);
}

/**
 * Pastikan setiap pengajuan pinjaman karyawan yang belum dibukukan (status
 * "pending" atau sudah disetujui "active") memiliki transaksi Biaya tertaut.
 * Dipanggil dari halaman Biaya, sehingga akuntan — yang hanya boleh membaca
 * transaksi dan pinjaman perusahaan, bukan data karyawan — tetap melihat
 * pengajuannya untuk dipetakan ke akun/jurnal. Tidak menandai dibukukan:
 * pemrosesan ke jurnal tetap dilakukan akuntan.
 * Mengembalikan jumlah transaksi yang dibuat.
 */
export async function reconcileLoanTransactions(company: Company): Promise<number> {
	const [loans, transactions] = await Promise.all([
		pb.collection('employee_loans').getFullList<EmployeeLoan>({
			// Pengajuan yang menunggu maupun yang sudah disetujui (Aktif) tetap harus
			// tampil di Biaya sampai akuntan memetakan akun dan menerbitkan jurnalnya.
			filter: pb.filter(
				'company = {:company} && (status = "pending" || status = "active")',
				{ company: company.id },
			),
			sort: '-created',
			expand: 'employee',
			requestKey: `loan-reconcile-loans-${company.id}`,
		}),
		pb.collection('transactions').getFullList({
			filter: pb.filter('company = {:company} && category = "biaya"', { company: company.id }),
			fields: 'id,loan,expense_detail',
			requestKey: `loan-reconcile-tx-${company.id}`,
		}),
	]);

	const ledgerLoanIds = new Set<string>();
	for (const transaction of transactions) {
		const record = transaction as {
			loan?: string;
			expense_detail?: { kind?: string; loanId?: string };
		};
		if (record.loan) ledgerLoanIds.add(record.loan);
		if (record.expense_detail?.kind === 'loan' && record.expense_detail.loanId) {
			ledgerLoanIds.add(record.expense_detail.loanId);
		}
	}

	let created = 0;
	for (const loan of loans) {
		if (!loan.employee || ledgerLoanIds.has(loan.id)) continue;
		// Nama karyawan dipakai pada label transaksi. `expand` kosong bila aturan
		// akses karyawan tidak mengizinkan akuntan membacanya — coba ambil
		// langsung, lalu jatuh ke label umum.
		let employeeName = loan.expand?.employee?.name || '';
		if (!employeeName) {
			try {
				const employee = await pb.collection('employees').getOne(loan.employee, {
					fields: 'name',
					requestKey: `loan-reconcile-emp-name-${loan.id}`,
				});
				employeeName = (employee as { name?: string }).name || '';
			} catch {
				employeeName = '';
			}
		}
		try {
			await ensureLoanTransaction(company, loan, employeeName || 'Karyawan');
			ledgerLoanIds.add(loan.id);
			created += 1;
		} catch {
			// Gagal membuat ulang — biarkan akuntan memproses manual lewat Penggajian.
		}
	}
	return created;
}
