import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import pb from '@/lib/pocketbase-client';
import { formatDate, formatRupiah, type Account, type Company } from '@/lib/accounting';
import { PAYROLL_ACCOUNT_CODES, LOAN_STATUS_LABELS, type EmployeeLoan } from '@/lib/payroll';
import type { Transaction } from '@/lib/transactions';
import { useLanguage } from '@/hooks/use-language';

interface LoanTransactionProcessDialogProps {
	transaction: Transaction | null;
	company: Company;
	accounts: Account[];
	onOpenChange: (open: boolean) => void;
	onDone: () => void;
}

function isCashAccount(account: Account): boolean {
	return account.type === 'aset' && /kas|bank/i.test(account.name);
}

export function LoanTransactionProcessDialog({
	transaction,
	company,
	accounts,
	onOpenChange,
	onDone,
}: LoanTransactionProcessDialogProps) {
	const { t } = useLanguage();
	const detail = transaction?.expense_detail ?? {};
	const isLoan = detail?.kind === 'loan';
	const open = Boolean(transaction) && isLoan;

	const piutangDefault = accounts.find(a => a.code === PAYROLL_ACCOUNT_CODES.piutangPinjaman);
	const cashDefault =
		accounts.find(a => a.code === '102') ??
		accounts.find(a => a.code === '101') ??
		accounts.find(isCashAccount);

	const [debitAccount, setDebitAccount] = useState('');
	const [creditAccount, setCreditAccount] = useState('');
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (transaction) {
			setDebitAccount(piutangDefault?.id ?? '');
			setCreditAccount(cashDefault?.id ?? '');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transaction?.id]);

	if (!transaction || !isLoan) return null;

	const cashAccounts = accounts.filter(isCashAccount);
	const amount = transaction.amount || 0;

	const process = async () => {
		if (!debitAccount) {
			toast.error(t('loan.process.debit_required'));
			return;
		}
		if (!creditAccount) {
			toast.error(t('loan.process.credit_required'));
			return;
		}
		if (debitAccount === creditAccount) {
			toast.error(t('loan.process.same_account'));
			return;
		}
		setSaving(true);
		try {
			if (detail.booked) {
				setSaving(false);
				toast.error(t('loan.process.already_booked'));
				return;
			}
			if (detail.loanId) {
				const linked = await pb.collection('employee_loans').getOne<EmployeeLoan>(detail.loanId, {
					requestKey: `loan-process-check-${detail.loanId}`,
				});
				if (linked.status === 'completed') {
					setSaving(false);
					toast.error(
						t('loan.process.loan_completed', { status: LOAN_STATUS_LABELS[linked.status] }),
					);
					return;
				}
			}
			const existingEntries = await pb
				.collection('entries')
				.getFullList({ filter: pb.filter('transaction = {:tx}', { tx: transaction.id }), fields: 'id' })
				.catch(() => [] as { id: string }[]);
			if (existingEntries.length > 0) {
				setSaving(false);
				await pb
					.collection('transactions')
					.update(transaction.id, { expense_detail: { ...detail, booked: true } })
					.catch(() => undefined);
				toast.error(t('loan.process.already_journal'));
				onOpenChange(false);
				onDone();
				return;
			}
			const ownerId = pb.authStore.record?.id ?? '';
			const base = {
				company: company.id,
				date: transaction.date,
				description: transaction.description,
				owner: ownerId,
				transaction: transaction.id,
			};
			await pb.collection('entries').create(
				{ ...base, account: debitAccount, debit: amount, credit: 0 },
				{ requestKey: `loan-tx-debit-${transaction.id}` },
			);
			await pb.collection('entries').create(
				{ ...base, account: creditAccount, debit: 0, credit: amount },
				{ requestKey: `loan-tx-credit-${transaction.id}` },
			);
			await pb.collection('transactions').update(transaction.id, {
				debit_account: debitAccount,
				credit_account: creditAccount,
				expense_detail: { ...detail, booked: true },
			});
			if (detail.loanId) {
				await pb.collection('employee_loans').update(detail.loanId, {
					status: 'active',
				});
			}
			toast.success(t('loan.process.success'));
			onOpenChange(false);
			onDone();
		} catch {
			toast.error(t('loan.process.failed'));
		} finally {
			setSaving(false);
		}
	};

	const reject = async () => {
		if (
			!window.confirm(
				t('loan.process.reject_confirm'),
			)
		) {
			return;
		}
		setSaving(true);
		try {
			if (detail.loanId) {
				await pb.collection('employee_loans').update(detail.loanId, {
					status: 'cancelled',
				});
			}
			await pb.collection('transactions').delete(transaction.id);
			toast.success(t('loan.process.rejected'));
			onOpenChange(false);
			onDone();
		} catch {
			toast.error(t('loan.process.reject_failed'));
		} finally {
			setSaving(false);
		}
	};

	const selectClass =
		'w-full appearance-none rounded-xl border border-emerald-300 bg-white bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat px-3 py-2.5 pr-10 text-sm text-foreground outline-none ring-emerald-200 focus:border-emerald-500 focus:ring-2';

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex h-full w-full max-w-[440px] flex-col gap-0 overflow-hidden border-0 bg-white p-0 shadow-2xl sm:max-w-[440px]"
			>
				<SheetHeader className="space-y-1.5 border-b border-border px-5 py-4 pr-12 text-left">
					<SheetTitle className="text-[17px] font-bold tracking-tight text-foreground">
						{t('loan.process.title')}
					</SheetTitle>
					<SheetDescription className="text-[13px] leading-relaxed text-muted-foreground">
						{t('loan.process.desc')}
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
				<div className="space-y-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-3.5 text-sm">
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">{t('loan.process.employee')}</span>
						<span className="font-semibold text-foreground">{detail.employeeName ?? '—'}</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">{t('loan.process.date')}</span>
						<span className="font-semibold text-foreground">{formatDate(transaction.date)}</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">{t('loan.process.principal')}</span>
						<span className="font-semibold text-foreground">{formatRupiah(amount)}</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">{t('loan.process.installments')}</span>
						<span className="font-semibold text-foreground">{detail.installments ?? 0}x</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">{t('loan.process.per_month')}</span>
						<span className="font-semibold text-foreground">
							{formatRupiah(detail.installmentAmount ?? 0)}
						</span>
					</div>
					{transaction.description ? (
						<p className="border-t border-emerald-200/70 pt-2.5 text-[13px] text-muted-foreground">
							{transaction.description}
						</p>
					) : null}
				</div>

				<div className="space-y-3.5">
					<div className="space-y-1.5">
						<label htmlFor="loan-debit" className="text-sm font-semibold text-foreground">
							{t('loan.process.debit_label')}
						</label>
						<select
							id="loan-debit"
							value={debitAccount}
							onChange={e => setDebitAccount(e.target.value)}
							className={selectClass}
							style={{
								backgroundImage:
									"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
							}}
						>
							<option value="">{t('loan.process.pick_debit')}</option>
							{accounts.map(a => (
								<option key={a.id} value={a.id}>
									{a.code} — {a.name}
								</option>
							))}
						</select>
						{!piutangDefault ? (
							<p className="text-[11px] text-amber-600">
								{t('loan.process.no_piutang')}
							</p>
						) : null}
					</div>
					<div className="space-y-1.5">
						<label htmlFor="loan-credit" className="text-sm font-semibold text-foreground">
							{t('loan.process.credit_label')}
						</label>
						<select
							id="loan-credit"
							value={creditAccount}
							onChange={e => setCreditAccount(e.target.value)}
							className={selectClass}
							style={{
								backgroundImage:
									"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
							}}
						>
							<option value="">{t('loan.process.pick_credit')}</option>
							{cashAccounts.map(a => (
								<option key={a.id} value={a.id}>
									{a.code} — {a.name}
								</option>
							))}
						</select>
						{cashAccounts.length === 0 ? (
							<p className="text-[11px] text-amber-600">
								{t('loan.process.no_cash')}
							</p>
						) : null}
					</div>
				</div>

				</div>

				<SheetFooter className="mt-auto flex-row items-center justify-between gap-3 border-t border-border bg-white px-5 py-4 sm:justify-between sm:space-x-0">
					<button
						type="button"
						onClick={reject}
						disabled={saving}
						className="text-left text-sm font-semibold text-red-500 hover:underline disabled:opacity-60"
					>
						{t('loan.process.reject')}
					</button>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
						>
							{t('company.cancel')}
						</button>
						<button
							type="button"
							onClick={process}
							disabled={saving}
							className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-soft-sm transition-colors hover:bg-emerald-600 disabled:opacity-60"
						>
							{saving ? t('common.loading') : t('loan.process.process')}
						</button>
					</div>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
