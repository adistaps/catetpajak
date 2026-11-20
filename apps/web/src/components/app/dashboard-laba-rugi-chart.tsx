import { useMemo, useState } from 'react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
	accountBalance,
	filterEntriesByConversion,
	formatRupiah,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';
import { useLanguage } from '@/hooks/use-language';
import type { Lang } from '@/lib/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ViewMode = 'chart' | 'table';
type PeriodKey = '12' | 'year' | 'last_year';

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function months(lang: Lang) {
	return lang === 'en' ? MONTHS_EN : MONTHS_ID;
}

const SERIES_KEYS = [
	{ key: 'pendapatan', labelKey: 'dash.laba_rugi.income', color: '#3B82F6' },
	{ key: 'beban', labelKey: 'dash.laba_rugi.expense', color: '#14B8A6' },
	{ key: 'laba', labelKey: 'dash.laba_rugi.net', color: '#A855F7' },
] as const;

interface MonthPoint {
	key: string;
	label: string;
	pendapatan: number;
	beban: number;
	laba: number;
}

function monthLabel(year: number, monthIndex: number, lang: Lang): string {
	const M = months(lang);
	const shortYear = String(year).slice(2);
	return `${M[monthIndex]} ${shortYear}`;
}

function buildMonths(period: PeriodKey, now = new Date()): { year: number; month: number }[] {
	if (period === 'year') {
		return Array.from({ length: 12 }, (_, month) => ({ year: now.getFullYear(), month }));
	}
	if (period === 'last_year') {
		const year = now.getFullYear() - 1;
		return Array.from({ length: 12 }, (_, month) => ({ year, month }));
	}
	const months: { year: number; month: number }[] = [];
	for (let offset = 11; offset >= 0; offset -= 1) {
		const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
		months.push({ year: date.getFullYear(), month: date.getMonth() });
	}
	return months;
}

function formatAxis(value: number): string {
	const abs = Math.abs(value);
	const sign = value < 0 ? '-' : '';
	if (abs === 0) return '0';
	if (abs >= 1_000_000_000) {
		const n = abs / 1_000_000_000;
		return `${sign}${trimNumber(n)}M`;
	}
	if (abs >= 1_000_000) {
		const n = abs / 1_000_000;
		return `${sign}${trimNumber(n)}jt`;
	}
	if (abs >= 1_000) {
		const n = abs / 1_000;
		return `${sign}${trimNumber(n)}rb`;
	}
	return `${sign}${Math.round(abs)}`;
}

function trimNumber(n: number): string {
	const rounded = Math.round(n * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

const PERIOD_OPTION_KEYS: { key: PeriodKey; labelKey: string }[] = [
	{ key: '12', labelKey: 'dash.laba_rugi.period.12' },
	{ key: 'year', labelKey: 'dash.laba_rugi.period.year' },
	{ key: 'last_year', labelKey: 'dash.laba_rugi.period.last_year' },
];

export function DashboardLabaRugiChart({
	accounts,
	entries,
	conversionDate,
}: {
	accounts: Account[];
	entries: JournalEntry[];
	conversionDate?: string | null;
}) {
	const { lang, t } = useLanguage();
	const SERIES = SERIES_KEYS.map(s => ({ ...s, label: t(s.labelKey) }));
	const PERIOD_OPTIONS = PERIOD_OPTION_KEYS.map(o => ({ ...o, label: t(o.labelKey) }));
	const [view, setView] = useState<ViewMode>('chart');
	const [period, setPeriod] = useState<PeriodKey>('12');
	const [filterOpen, setFilterOpen] = useState(false);

	const points = useMemo(() => {
		const accountType = new Map(accounts.map(account => [account.id, account.type]));
		const relevant = filterEntriesByConversion(entries, conversionDate);
		const buckets = new Map<string, { pendapatan: number; beban: number }>();

		for (const entry of relevant) {
			const type = accountType.get(entry.account) ?? entry.expand?.account?.type;
			if (type !== 'pendapatan' && type !== 'beban') continue;
			const key = (entry.date || '').slice(0, 7);
			if (!/^\d{4}-\d{2}$/.test(key)) continue;
			const bucket = buckets.get(key) ?? { pendapatan: 0, beban: 0 };
			const movement = accountBalance(type, entry.debit || 0, entry.credit || 0);
			if (type === 'pendapatan') bucket.pendapatan += movement;
			else bucket.beban += movement;
			buckets.set(key, bucket);
		}

		return buildMonths(period).map(({ year, month }) => {
			const key = `${year}-${String(month + 1).padStart(2, '0')}`;
			const bucket = buckets.get(key) ?? { pendapatan: 0, beban: 0 };
			return {
				key,
				label: monthLabel(year, month, lang),
				pendapatan: bucket.pendapatan,
				beban: bucket.beban,
				laba: bucket.pendapatan - bucket.beban,
			} satisfies MonthPoint;
		});
	}, [accounts, entries, conversionDate, period, lang]);

	const hasActivity = points.some(point => point.pendapatan !== 0 || point.beban !== 0);
	const periodLabel = PERIOD_OPTIONS.find(option => option.key === period)?.label ?? '';

	return (
		<section className="h-full rounded-2xl border border-border bg-card shadow-soft-sm">
			<div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
				<div>
					<h2 className="text-base font-bold tracking-tight">{t('dash.laba_rugi.title')}</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">{periodLabel}</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs font-semibold">
						<button
							type="button"
							onClick={() => setView('chart')}
							className={cn(
								'rounded-md px-3 py-1.5 transition-colors',
								view === 'chart'
									? 'bg-sky-50 text-sky-700'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							{t('dash.laba_rugi.chart_view')}
						</button>
						<button
							type="button"
							onClick={() => setView('table')}
							className={cn(
								'rounded-md px-3 py-1.5 transition-colors',
								view === 'table'
									? 'bg-sky-50 text-sky-700'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							{t('dash.laba_rugi.table_view')}
						</button>
					</div>
					<Popover open={filterOpen} onOpenChange={setFilterOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								aria-label={t('dash.laba_rugi.period_label')}
								className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							>
								<Filter className="size-4" strokeWidth={2} />
							</button>
						</PopoverTrigger>
						<PopoverContent align="end" className="w-56 p-2">
							<p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								{t('dash.laba_rugi.period_label')}
							</p>
							{PERIOD_OPTIONS.map(option => (
								<button
									key={option.key}
									type="button"
									onClick={() => {
										setPeriod(option.key);
										setFilterOpen(false);
									}}
									className={cn(
										'flex w-full rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors hover:bg-secondary',
										period === option.key && 'bg-secondary text-foreground',
									)}
								>
									{option.label}
								</button>
							))}
						</PopoverContent>
					</Popover>
				</div>
			</div>

			{view === 'chart' ? (
				<div className="px-2 pb-4 sm:px-4">
					<div className="h-[280px] w-full min-w-0">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={points} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
								<CartesianGrid vertical={false} stroke="hsl(var(--border))" />
								<XAxis
									dataKey="label"
									tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
									axisLine={false}
									tickLine={false}
									interval={0}
									minTickGap={0}
								/>
								<YAxis
									tickFormatter={formatAxis}
									tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
									axisLine={false}
									tickLine={false}
									width={48}
								/>
								<Tooltip
									cursor={{ fill: 'hsl(var(--muted) / 0.45)' }}
									formatter={(value, name) => {
										const series = SERIES.find(item => item.key === name);
										return [formatRupiah(Number(value) || 0), series?.label ?? String(name)];
									}}
									labelStyle={{ fontWeight: 700, marginBottom: 4 }}
									contentStyle={{
										borderRadius: 12,
										border: '1px solid hsl(var(--border))',
										fontSize: 12,
									}}
								/>
								{SERIES.map(series => (
									<Bar
										key={series.key}
										dataKey={series.key}
										name={series.key}
										fill={series.color}
										radius={[3, 3, 0, 0]}
										maxBarSize={18}
									/>
								))}
							</BarChart>
						</ResponsiveContainer>
					</div>
					<ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-3 text-xs text-muted-foreground">
						{SERIES.map(series => (
							<li key={series.key} className="flex items-center gap-1.5">
								<span className="size-2.5 rounded-[3px]" style={{ backgroundColor: series.color }} />
								{series.label}
							</li>
						))}
					</ul>
					{!hasActivity ? (
						<p className="px-3 pt-3 text-xs text-muted-foreground">
							{t('dash.laba_rugi.empty_chart')}
						</p>
					) : null}
				</div>
			) : (
				<div className="overflow-x-auto px-2 pb-4 sm:px-5">
					<table className="w-full min-w-[520px] text-sm">
						<thead>
							<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								<th className="px-3 py-2">{t('dash.laba_rugi.col.month')}</th>
								<th className="px-3 py-2 text-right">{t('dash.laba_rugi.income')}</th>
								<th className="px-3 py-2 text-right">{t('dash.laba_rugi.expense')}</th>
								<th className="px-3 py-2 text-right">{t('dash.laba_rugi.net')}</th>
							</tr>
						</thead>
						<tbody>
							{points.map(point => (
								<tr key={point.key} className="border-b border-border/70 last:border-0">
									<td className="px-3 py-2 font-medium">{point.label}</td>
									<td className="px-3 py-2 text-right tabular-nums">{formatRupiah(point.pendapatan)}</td>
									<td className="px-3 py-2 text-right tabular-nums">{formatRupiah(point.beban)}</td>
									<td
										className={cn(
											'px-3 py-2 text-right font-semibold tabular-nums',
											point.laba < 0 && 'text-destructive',
										)}
									>
										{point.laba < 0
											? `(${formatRupiah(Math.abs(point.laba))})`
											: formatRupiah(point.laba)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!hasActivity ? (
						<p className="px-3 pt-3 text-xs text-muted-foreground">
							{t('dash.laba_rugi.empty_table')}
						</p>
					) : null}
				</div>
			)}
		</section>
	);
}
