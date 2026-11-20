import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
	formatDate,
	formatRupiah,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/hooks/use-language';

interface Props {
	accounts: Account[];
	entries: JournalEntry[];
	conversionDate?: string | null;
}

function monthRange(): { start: string; end: string } {
	const now = new Date();
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth();
	const start = new Date(Date.UTC(y, m, 1));
	const end = new Date(Date.UTC(y, m + 1, 0));
	return {
		start: start.toISOString().slice(0, 10),
		end: end.toISOString().slice(0, 10),
	};
}

export function LaporanJurnalUmum({ accounts, entries, conversionDate }: Props) {
	const { t } = useLanguage();
	const initial = monthRange();
	const [startDate, setStartDate] = useState(initial.start);
	const [endDate, setEndDate] = useState(initial.end);
	const [applied, setApplied] = useState(initial);

	const accountMap = useMemo(() => {
		const map = new Map<string, Account>();
		for (const a of accounts) map.set(a.id, a);
		return map;
	}, [accounts]);

	const rows = useMemo(() => {
		const conv = conversionDate?.slice(0, 10);
		const start = applied.start.slice(0, 10);
		const end = applied.end.slice(0, 10);
		return entries
			.filter(e => {
				const d = (e.date || '').slice(0, 10);
				if (conv && d < conv) return false;
				return d >= start && d <= end;
			})
			.sort((a, b) => {
				const da = (a.date || '').slice(0, 10);
				const db = (b.date || '').slice(0, 10);
				if (da !== db) return da.localeCompare(db);
				return (a.created || '').localeCompare(b.created || '');
			});
	}, [entries, applied, conversionDate]);

	const dateGroups = useMemo(() => {
		const groups = new Map<string, JournalEntry[]>();
		for (const row of rows) {
			const date = (row.date || '').slice(0, 10);
			const list = groups.get(date) ?? [];
			list.push(row);
			groups.set(date, list);
		}
		return Array.from(groups.entries());
	}, [rows]);

	const totalDebit = rows.reduce((s, e) => s + (e.debit || 0), 0);
	const totalCredit = rows.reduce((s, e) => s + (e.credit || 0), 0);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft-sm">
				<div className="grid gap-1.5">
					<Label htmlFor="jurnal-start" className="text-xs text-muted-foreground">
						{t('report.buku_besar.start_date')}
					</Label>
					<Input
						id="jurnal-start"
						type="date"
						value={startDate}
						onChange={e => setStartDate(e.target.value)}
						className="h-10 w-[160px]"
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="jurnal-end" className="text-xs text-muted-foreground">
						{t('report.buku_besar.end_date')}
					</Label>
					<Input
						id="jurnal-end"
						type="date"
						value={endDate}
						onChange={e => setEndDate(e.target.value)}
						className="h-10 w-[160px]"
					/>
				</div>
				<Button
					type="button"
					className="h-10 px-5"
					onClick={() => setApplied({ start: startDate, end: endDate })}
				>
					{t('report.neraca.filter')}
				</Button>
			</div>

			{rows.length === 0 ? (
				<p className="rounded-2xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
					{t('report.jurnal_umum.empty')}
				</p>
			) : (
				<section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm">
					<h2 className="border-b border-border bg-secondary px-5 py-3 text-sm font-bold">
						{t('report.jurnal_umum.range', { start: formatDate(applied.start), end: formatDate(applied.end) })}
					</h2>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[720px] text-sm">
							<thead>
								<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									<th className="px-5 py-2.5 font-semibold">{t('report.col.date')}</th>
									<th className="px-3 py-2.5 font-semibold">{t('report.jurnal_umum.account')}</th>
									<th className="px-3 py-2.5 font-semibold">{t('report.col.description')}</th>
									<th className="px-3 py-2.5 text-right font-semibold">{t('report.col.debit')}</th>
									<th className="px-5 py-2.5 text-right font-semibold">{t('report.col.credit')}</th>
								</tr>
							</thead>
							<tbody>
								{dateGroups.map(([date, group]) => <JournalDateGroup key={date} date={date} rows={group} accountMap={accountMap} />)}
							</tbody>
							<tfoot>
								<tr className="border-t border-border bg-secondary/40 font-semibold">
									<td className="px-5 py-2.5" colSpan={3}>
										{t('report.total')}
									</td>
									<td className="px-3 py-2.5 text-right tabular-nums">
										{formatRupiah(totalDebit)}
									</td>
									<td className="px-5 py-2.5 text-right tabular-nums">
										{formatRupiah(totalCredit)}
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
				</section>
			)}
		</div>
	);
}

function JournalDateGroup({ date, rows, accountMap }: { date: string; rows: JournalEntry[]; accountMap: Map<string, Account> }) {
	const [open, setOpen] = useState(true);
	const debit = rows.reduce((sum, row) => sum + (row.debit || 0), 0);
	const credit = rows.reduce((sum, row) => sum + (row.credit || 0), 0);
	return (
		<>
			<tr className="financial-row-group">
				<td className="px-5 py-3" colSpan={3}>
					<button type="button" className="financial-group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
						{open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
						{date ? formatDate(date) : 'Tanggal tidak tersedia'}
					</button>
				</td>
				<td className="px-3 py-3 text-right tabular-nums">{formatRupiah(debit)}</td>
				<td className="px-5 py-3 text-right tabular-nums">{formatRupiah(credit)}</td>
			</tr>
			{open && rows.map(entry => {
				const account = accountMap.get(entry.account);
				return (
					<tr key={entry.id} className="border-b border-border/50">
						<td className="py-2.5 pl-11 pr-5 whitespace-nowrap text-muted-foreground">{formatDate(entry.date)}</td>
						<td className="px-3 py-2.5">{account ? `${account.code} — ${account.name}` : entry.account}</td>
						<td className="px-3 py-2.5">{entry.description || '—'}</td>
						<td className="px-3 py-2.5 text-right tabular-nums">{entry.debit ? formatRupiah(entry.debit) : '—'}</td>
						<td className="px-5 py-2.5 text-right tabular-nums">{entry.credit ? formatRupiah(entry.credit) : '—'}</td>
					</tr>
				);
			})}
		</>
	);
}
