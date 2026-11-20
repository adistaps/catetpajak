import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ACCOUNT_TYPE_LABELS, formatRupiah, type AccountBalance, type AccountType } from '@/lib/accounting';
import { useLanguage } from '@/hooks/use-language';

function BalanceGroup({ type, rows }: { type: AccountType; rows: AccountBalance[] }) {
	const [open, setOpen] = useState(true);
	const debit = rows.reduce((sum, row) => sum + row.debit, 0);
	const credit = rows.reduce((sum, row) => sum + row.credit, 0);
	return (
		<>
			<tr className="financial-row-group">
				<td className="px-5 py-3" colSpan={3}>
					<button type="button" className="financial-group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
						{open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
						{ACCOUNT_TYPE_LABELS[type]}
					</button>
				</td>
				<td className="px-3 py-3 text-right tabular-nums">{formatRupiah(debit)}</td>
				<td className="px-3 py-3 text-right tabular-nums">{formatRupiah(credit)}</td>
				<td className="px-5 py-3 text-right tabular-nums">—</td>
			</tr>
			{open && rows.map(row => (
				<tr key={row.account.id} className="border-b border-border/50">
					<td className="py-2.5 pl-11 pr-5 font-medium tabular-nums">{row.account.code}</td>
					<td className="px-3 py-2.5">{row.account.name}</td>
					<td className="px-3 py-2.5 capitalize text-muted-foreground">{row.account.type}</td>
					<td className="px-3 py-2.5 text-right tabular-nums">{row.debit ? formatRupiah(row.debit) : '—'}</td>
					<td className="px-3 py-2.5 text-right tabular-nums">{row.credit ? formatRupiah(row.credit) : '—'}</td>
					<td className="px-5 py-2.5 text-right tabular-nums">{formatRupiah(row.balance)}</td>
				</tr>
			))}
		</>
	);
}

export function LaporanNeracaSaldo({ balances }: { balances: AccountBalance[] }) {
	const { t } = useLanguage();
	const rows = useMemo(() => balances.filter(b => b.balance !== 0 || b.debit !== 0 || b.credit !== 0), [balances]);
	const groups = useMemo(() => {
		const result = new Map<AccountType, AccountBalance[]>();
		for (const row of rows) {
			const group = result.get(row.account.type) ?? [];
			group.push(row);
			result.set(row.account.type, group);
		}
		return Array.from(result.entries());
	}, [rows]);
	const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
	const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
	if (rows.length === 0) return <p className="px-5 py-8 text-sm text-muted-foreground">{t('report.neraca_saldo.empty')}</p>;
	return (
		<section className="financial-report-section">
			<div className="financial-report-heading"><h2>{t('report.neraca_saldo.title')}</h2></div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[720px] text-sm">
					<thead><tr className="border-b border-border text-left">
						<th className="px-5 py-3">{t('report.col.code')}</th><th className="px-3 py-3">{t('report.col.name')}</th><th className="px-3 py-3">{t('report.col.type')}</th>
						<th className="px-3 py-3 text-right">{t('report.col.debit')}</th><th className="px-3 py-3 text-right">{t('report.col.credit')}</th><th className="px-5 py-3 text-right">{t('report.col.balance')}</th>
					</tr></thead>
					<tbody>{groups.map(([type, items]) => <BalanceGroup key={type} type={type} rows={items} />)}</tbody>
					<tfoot><tr className="font-bold"><td className="px-5 py-3" colSpan={3}>{t('report.total')}</td><td className="px-3 py-3 text-right tabular-nums">{formatRupiah(totalDebit)}</td><td className="px-3 py-3 text-right tabular-nums">{formatRupiah(totalCredit)}</td><td className="px-5 py-3 text-right">—</td></tr></tfoot>
				</table>
			</div>
		</section>
	);
}
