import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Account, JournalEntry } from '@/lib/accounting';
import {
	buildRatioCategories,
	computeRatioFigures,
	type RatioCategory,
	type RatioPeriod,
} from '@/lib/financial-ratios';
import { useLanguage } from '@/hooks/use-language';
import type { Lang } from '@/lib/i18n';

type PeriodKey = 'this_month' | 'this_year' | 'all';

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function periodRange(key: PeriodKey, lang: Lang, t: (k: string, v?: Record<string, string | number>) => string): RatioPeriod {
	const now = new Date();
	const M = lang === 'en' ? MONTHS_EN : MONTHS_ID;
	if (key === 'this_month') {
		const start = new Date(now.getFullYear(), now.getMonth(), 1)
			.toISOString()
			.slice(0, 10);
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
			.toISOString()
			.slice(0, 10);
		return {
			start,
			end,
			label: `${t('dash.period.this_month')} (${M[now.getMonth()]} ${now.getFullYear()})`,
		};
	}
	if (key === 'this_year') {
		return {
			start: `${now.getFullYear()}-01-01`,
			end: `${now.getFullYear()}-12-31`,
			label: `${t('dash.period.this_year')} (${now.getFullYear()})`,
		};
	}
	return { start: null, end: null, label: t('dash.period.all') };
}

function RatioRow({ ratio }: { ratio: RatioCategory['ratios'][number] }) {
	const { t } = useLanguage();
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-slate-200/80 px-1 py-3 last:border-b-0">
			<div className="flex min-w-0 items-center gap-1.5">
				<span className="truncate text-sm text-foreground">{ratio.name}</span>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								className="shrink-0 text-muted-foreground/70 transition hover:text-primary"
								aria-label={`${t('dash.ratio.formula')} ${ratio.name}`}
							>
								<Info className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent className="max-w-[16rem] text-xs">
							<p className="font-semibold">{t('dash.ratio.formula')}</p>
							<p className="mt-0.5">{ratio.formula}</p>
							<p className="mt-1.5 text-muted-foreground">
								{ratio.available ? ratio.interpretation : ratio.reason}
							</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
			{ratio.available ? (
				<span className="text-right text-sm tabular-nums text-foreground">{ratio.value}</span>
			) : (
				<span
					className="text-right text-xs font-medium text-amber-700"
					title={ratio.reason ?? t('dash.ratio.insufficient')}
				>
					{t('dash.ratio.not_enough')}
				</span>
			)}
		</div>
	);
}

export function DashboardRatioAnalysis({
	accounts,
	entries,
	conversionDate,
}: {
	accounts: Account[];
	entries: JournalEntry[];
	conversionDate?: string | null;
}) {
	const { lang, t } = useLanguage();
	const [periodKey, setPeriodKey] = useState<PeriodKey>('this_year');

	const categories = useMemo(() => {
		const period = periodRange(periodKey, lang, t);
		const figures = computeRatioFigures(accounts, entries, conversionDate, period);
		return buildRatioCategories(figures);
	}, [accounts, entries, conversionDate, periodKey, lang, t]);

	const range = periodRange(periodKey, lang, t);
	const hasAnyData = accounts.length > 0;

	return (
		<section className="rounded-2xl border border-border bg-card shadow-soft">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
				<div>
					<h2 className="text-base font-bold tracking-tight text-foreground">
						{t('dash.ratio.title')}
					</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{t('dash.ratio.subtitle', { period: range.label.toLowerCase() })}
					</p>
				</div>
				<Select value={periodKey} onValueChange={v => setPeriodKey(v as PeriodKey)}>
					<SelectTrigger className="h-9 w-auto min-w-[11rem] rounded-full border-border bg-white px-3 text-xs font-medium shadow-none">
						<SelectValue placeholder={range.label} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="this_month">{periodRange('this_month', lang, t).label}</SelectItem>
						<SelectItem value="this_year">{periodRange('this_year', lang, t).label}</SelectItem>
						<SelectItem value="all">{t('dash.period.all')}</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{!hasAnyData ? (
				<div className="px-5 py-10 text-center">
					<p className="text-sm text-muted-foreground">
						{t('dash.ratio.empty')}{' '}
						<span className="font-medium">{t('dash.ratio.empty_hint')}</span>
					</p>
				</div>
			) : (
				<div className="px-5 py-2">
					{categories.map(category => (
						<div key={category.id} className="border-b border-border py-3 last:border-b-0">
							<div className="mb-1 flex items-baseline gap-2 px-1">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{category.title}
								</h3>
							</div>
							<div>
								{category.ratios.map(ratio => (
									<RatioRow key={ratio.id} ratio={ratio} />
								))}
							</div>
						</div>
					))}
					<p className="px-1 pb-3 pt-1 text-[11px] leading-relaxed text-muted-foreground/80">
						{t('dash.ratio.note')}
					</p>
				</div>
			)}
		</section>
	);
}
