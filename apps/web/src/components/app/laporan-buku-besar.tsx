import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
	accountBalance,
	dayBeforeIso,
	formatDate,
	formatRupiah,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';

interface LaporanBukuBesarProps {
	accounts: Account[];
	entries: JournalEntry[];
	conversionDate?: string | null;
}

type PeriodKey = 'custom' | 'this-month' | 'last-month' | 'this-year' | 'all';

function isoToday() {
	return new Date().toISOString().slice(0, 10);
}

function monthRange(offset = 0): { start: string; end: string } {
	const now = new Date();
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth() + offset;
	const start = new Date(Date.UTC(y, m, 1));
	const end = new Date(Date.UTC(y, m + 1, 0));
	return {
		start: start.toISOString().slice(0, 10),
		end: end.toISOString().slice(0, 10),
	};
}

function yearRange(): { start: string; end: string } {
	const y = new Date().getUTCFullYear();
	return { start: `${y}-01-01`, end: `${y}-12-31` };
}

interface LedgerLine {
	id: string;
	date: string;
	description: string;
	debit: number;
	credit: number;
	balance: number;
}

interface LedgerAccount {
	account: Account;
	opening: number;
	lines: LedgerLine[];
	closing: number;
	totalDebit: number;
	totalCredit: number;
}

function buildLedgers(
	accounts: Account[],
	entries: JournalEntry[],
	startDate: string,
	endDate: string,
	conversionDate?: string | null,
	accountFilter?: string,
): LedgerAccount[] {
	const start = startDate.slice(0, 10);
	const end = endDate.slice(0, 10);
	const conv = conversionDate?.slice(0, 10);

	const list = accountFilter && accountFilter !== 'all'
		? accounts.filter(a => a.id === accountFilter)
		: accounts;

	return list
		.map(account => {
			const accountEntries = entries
				.filter(e => e.account === account.id)
				.filter(e => {
					const d = (e.date || '').slice(0, 10);
					if (conv && d < conv) return false;
					return true;
				})
				.sort((a, b) => {
					const da = (a.date || '').slice(0, 10);
					const db = (b.date || '').slice(0, 10);
					if (da !== db) return da.localeCompare(db);
					return (a.created || '').localeCompare(b.created || '');
				});

			const openingFromField = account.opening_balance || 0;
			let running = openingFromField;

			// Movement before period start (after conversion)
			for (const e of accountEntries) {
				const d = (e.date || '').slice(0, 10);
				if (d < start) {
					running += accountBalance(account.type, e.debit || 0, e.credit || 0);
				}
			}

			const opening = running;
			const lines: LedgerLine[] = [];
			let totalDebit = 0;
			let totalCredit = 0;

			for (const e of accountEntries) {
				const d = (e.date || '').slice(0, 10);
				if (d < start || d > end) continue;
				const debit = e.debit || 0;
				const credit = e.credit || 0;
				running += accountBalance(account.type, debit, credit);
				totalDebit += debit;
				totalCredit += credit;
				lines.push({
					id: e.id,
					date: d,
					description: e.description || '—',
					debit,
					credit,
					balance: running,
				});
			}

			return {
				account,
				opening,
				lines,
				closing: running,
				totalDebit,
				totalCredit,
			};
		})
		.filter(l => l.lines.length > 0 || l.opening !== 0);
}

export function LaporanBukuBesar({
	accounts,
	entries,
	conversionDate,
}: LaporanBukuBesarProps) {
	const { t } = useLanguage();
	const initial = monthRange(0);
	const [startDate, setStartDate] = useState(initial.start);
	const [endDate, setEndDate] = useState(initial.end);
	const [period, setPeriod] = useState<PeriodKey>('this-month');
	const [accountId, setAccountId] = useState('all');
	const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(() => new Set());
	const toggleAccount = (id: string) => {
		setCollapsedAccounts(previous => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};
	const [applied, setApplied] = useState({
		start: initial.start,
		end: initial.end,
		accountId: 'all',
	});

	const applyPeriod = (key: PeriodKey) => {
		setPeriod(key);
		if (key === 'this-month') {
			const r = monthRange(0);
			setStartDate(r.start);
			setEndDate(r.end);
		} else if (key === 'last-month') {
			const r = monthRange(-1);
			setStartDate(r.start);
			setEndDate(r.end);
		} else if (key === 'this-year') {
			const r = yearRange();
			setStartDate(r.start);
			setEndDate(r.end);
		} else if (key === 'all') {
			const start = conversionDate?.slice(0, 10) || '2000-01-01';
			setStartDate(start);
			setEndDate(isoToday());
		}
	};

	const handleFilter = () => {
		setApplied({ start: startDate, end: endDate, accountId });
	};

	const ledgers = useMemo(
		() =>
			buildLedgers(
				accounts,
				entries,
				applied.start,
				applied.end,
				conversionDate,
				applied.accountId,
			),
		[accounts, entries, applied, conversionDate],
	);

	const openingLabel = conversionDate
		? `${t('report.opening_balance')} ${formatDate(dayBeforeIso(conversionDate))}`
		: t('report.opening_balance');

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft-sm sm:p-5">
				<div className="flex flex-wrap items-end gap-3">
					<div className="grid gap-1.5">
						<Label htmlFor="bb-start" className="text-xs text-muted-foreground">
							{t('report.buku_besar.start_date')}
						</Label>
						<Input
							id="bb-start"
							type="date"
							value={startDate}
							onChange={e => {
								setStartDate(e.target.value);
								setPeriod('custom');
							}}
							className="h-10 w-[160px]"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="bb-end" className="text-xs text-muted-foreground">
							{t('report.buku_besar.end_date')}
						</Label>
						<Input
							id="bb-end"
							type="date"
							value={endDate}
							onChange={e => {
								setEndDate(e.target.value);
								setPeriod('custom');
							}}
							className="h-10 w-[160px]"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label className="text-xs text-muted-foreground">{t('report.buku_besar.period')}</Label>
						<Select
							value={period}
							onValueChange={v => applyPeriod(v as PeriodKey)}
						>
							<SelectTrigger className="h-10 w-[160px]">
								<SelectValue placeholder="Periode" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="this-month">{t('report.buku_besar.this_month')}</SelectItem>
								<SelectItem value="last-month">{t('report.buku_besar.last_month')}</SelectItem>
								<SelectItem value="this-year">{t('report.buku_besar.this_year')}</SelectItem>
								<SelectItem value="all">{t('report.buku_besar.all')}</SelectItem>
								<SelectItem value="custom">{t('report.buku_besar.custom')}</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1.5">
						<Label className="text-xs text-muted-foreground">{t('report.buku_besar.account')}</Label>
						<Select value={accountId} onValueChange={setAccountId}>
							<SelectTrigger className="h-10 w-[220px]">
								<SelectValue placeholder="Semua akun" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{t('report.buku_besar.all_accounts')}</SelectItem>
								{accounts.map(a => (
									<SelectItem key={a.id} value={a.id}>
										{a.code} — {a.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button type="button" onClick={handleFilter} className="h-10 px-5">
						{t('report.neraca.filter')}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					{t('report.buku_besar.showing', { start: formatDate(applied.start), end: formatDate(applied.end) })}
					{conversionDate
						? ` · ${t('report.buku_besar.conversion', { date: formatDate(conversionDate) })}`
						: null}
				</p>
			</div>

			{ledgers.length === 0 ? (
				<p className="rounded-2xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
					{t('report.buku_besar.empty')}
				</p>
			) : (
				<div className="flex flex-col gap-6">
					{ledgers.map(ledger => (
						<section
							key={ledger.account.id}
							className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm"
						>
							<header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-5 py-3">
								<div>
									<button type="button" className="financial-group-toggle text-sm font-bold" aria-expanded={!collapsedAccounts.has(ledger.account.id)} onClick={() => toggleAccount(ledger.account.id)}>
										{collapsedAccounts.has(ledger.account.id) ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
										{ledger.account.code} · {ledger.account.name}
									</button>
									<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
										{ledger.account.type}
									</p>
								</div>
								<p className="text-sm font-semibold tabular-nums">
									{t('report.buku_besar.ending_balance')}{' '}
									<span
										className={cn(
											ledger.closing < 0 && 'text-destructive',
										)}
									>
										{formatRupiah(ledger.closing)}
									</span>
								</p>
							</header>

							{!collapsedAccounts.has(ledger.account.id) ? <div className="overflow-x-auto">
								<table className="w-full min-w-[640px] text-sm">
									<thead>
										<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
											<th className="px-5 py-2.5 font-semibold">{t('report.col.date')}</th>
											<th className="px-3 py-2.5 font-semibold">{t('report.col.description')}</th>
											<th className="px-3 py-2.5 text-right font-semibold">{t('report.col.debit')}</th>
											<th className="px-3 py-2.5 text-right font-semibold">{t('report.col.credit')}</th>
											<th className="px-5 py-2.5 text-right font-semibold">{t('report.col.balance')}</th>
										</tr>
									</thead>
									<tbody>
										<tr className="border-b border-border/70 bg-muted/30">
											<td className="px-5 py-2.5 text-muted-foreground">—</td>
											<td className="px-3 py-2.5 font-medium italic text-muted-foreground">
												{openingLabel}
											</td>
											<td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">—</td>
											<td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">—</td>
											<td className="px-5 py-2.5 text-right font-semibold tabular-nums">
												{formatRupiah(ledger.opening)}
											</td>
										</tr>
										{ledger.lines.map(line => (
											<tr
												key={line.id}
												className="border-b border-border/50 last:border-0 hover:bg-muted/20"
											>
												<td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">
													{formatDate(line.date)}
												</td>
												<td className="px-3 py-2.5">{line.description}</td>
												<td className="px-3 py-2.5 text-right tabular-nums">
													{line.debit ? formatRupiah(line.debit) : '—'}
												</td>
												<td className="px-3 py-2.5 text-right tabular-nums">
													{line.credit ? formatRupiah(line.credit) : '—'}
												</td>
												<td className="px-5 py-2.5 text-right font-medium tabular-nums">
													{formatRupiah(line.balance)}
												</td>
											</tr>
										))}
									</tbody>
									<tfoot>
										<tr className="border-t border-border bg-secondary/40 font-semibold">
											<td className="px-5 py-2.5" colSpan={2}>
												{t('report.total_movement')}
											</td>
											<td className="px-3 py-2.5 text-right tabular-nums">
												{formatRupiah(ledger.totalDebit)}
											</td>
											<td className="px-3 py-2.5 text-right tabular-nums">
												{formatRupiah(ledger.totalCredit)}
											</td>
											<td className="px-5 py-2.5 text-right tabular-nums">
												{formatRupiah(ledger.closing)}
											</td>
										</tr>
									</tfoot>
								</table>
							</div> : null}
						</section>
					))}
				</div>
			)}
		</div>
	);
}
