import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Filter } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatRupiah } from '@/lib/accounting';
import { useLanguage } from '@/hooks/use-language';
import type { Lang } from '@/lib/i18n';
import type { BusinessDocument } from '@/lib/documents';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

type PeriodKey = 'this_month' | 'last_month' | 'this_year' | 'all';

interface Bucket {
	count: number;
	total: number;
}

interface Summary {
	unpaid: Bucket;
	overdue: Bucket;
	paid: Bucket;
}

function emptySummary(): Summary {
	return {
		unpaid: { count: 0, total: 0 },
		overdue: { count: 0, total: 0 },
		paid: { count: 0, total: 0 },
	};
}

function startOfMonth(d: Date) {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
	return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function periodRange(key: PeriodKey, lang: Lang, t: (k: string, v?: Record<string, string | number>) => string): { start: Date | null; end: Date | null; label: string } {
	const now = new Date();
	const locale = lang === 'en' ? 'en-US' : 'id-ID';
	const monthShort = (d: Date) => d.toLocaleDateString(locale, { month: 'short' });
	if (key === 'this_month') {
		return {
			start: startOfMonth(now),
			end: endOfMonth(now),
			label: `${t('dash.period.this_month')} (${monthShort(now)} ${now.getFullYear()})`,
		};
	}
	if (key === 'last_month') {
		const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		return {
			start: startOfMonth(d),
			end: endOfMonth(d),
			label: `${t('dash.period.last_month')} (${monthShort(d)} ${d.getFullYear()})`,
		};
	}
	if (key === 'this_year') {
		return {
			start: new Date(now.getFullYear(), 0, 1),
			end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
			label: `${t('dash.period.this_year')} (${now.getFullYear()})`,
		};
	}
	return { start: null, end: null, label: t('dash.period.all') };
}

function inPeriod(dateStr: string, start: Date | null, end: Date | null) {
	if (!start || !end) return true;
	const t = new Date(dateStr).getTime();
	return t >= start.getTime() && t <= end.getTime();
}

/** Due date = invoice date + 30 days if no explicit due. */
function isOverdue(invoiceDate: string, today = new Date()) {
	const due = new Date(invoiceDate);
	due.setDate(due.getDate() + 30);
	return today.getTime() > due.getTime();
}

function summarize(
	invoices: BusinessDocument[],
	payments: BusinessDocument[],
	start: Date | null,
	end: Date | null,
): Summary {
	const summary = emptySummary();
	const paidBySource = new Map<string, number>();

	for (const pay of payments) {
		if (pay.status === 'cancelled') continue;
		const src = pay.source_document;
		if (!src) continue;
		paidBySource.set(src, (paidBySource.get(src) ?? 0) + (pay.paid_amount || pay.total || 0));
	}

	for (const inv of invoices) {
		if (inv.status === 'cancelled' || inv.status === 'draft') continue;
		if (!inPeriod(inv.date, start, end)) continue;

		const total = inv.total || 0;
		const paidDirect = inv.paid_amount || 0;
		const paidLinked = paidBySource.get(inv.id) ?? 0;
		const paid = Math.min(total, Math.max(paidDirect, paidLinked));
		const remaining = Math.max(0, total - paid);

		if (remaining <= 0.009) {
			summary.paid.count += 1;
			summary.paid.total += total;
		} else if (isOverdue(inv.date)) {
			summary.overdue.count += 1;
			summary.overdue.total += remaining;
		} else {
			summary.unpaid.count += 1;
			summary.unpaid.total += remaining;
		}
	}

	return summary;
}

function StatusCard({
	title,
	count,
	total,
	tone,
	href,
}: {
	title: string;
	count: number;
	total: number;
	tone: 'amber' | 'rose' | 'emerald';
	href: string;
}) {
	const { t } = useLanguage();
	const tones = {
		amber: {
			wrap: 'border-amber-300 bg-transparent',
			head: 'bg-amber-50 text-amber-800 border-amber-200',
			badge: 'bg-amber-400 text-white',
			body: 'receivable-status-body-unpaid',
		},
		rose: {
			wrap: 'border-rose-300 bg-transparent',
			head: 'bg-rose-50 text-rose-800 border-rose-200',
			badge: 'bg-rose-500 text-white',
			body: 'receivable-status-body-overdue',
		},
		emerald: {
			wrap: 'border-emerald-300 bg-transparent',
			head: 'bg-emerald-50 text-emerald-800 border-emerald-200',
			badge: 'bg-emerald-500 text-white',
			body: 'receivable-status-body-paid',
		},
	}[tone];

	return (
		<div
			className={`receivable-status-card overflow-hidden rounded-xl border ${tones.wrap}`}
			style={{ backgroundColor: '#eef6fb', backgroundImage: 'none', boxShadow: 'none' }}
		>
			<div
				className={`flex items-center justify-between border-b px-4 py-2.5 text-sm font-semibold ${tones.head}`}
			>
				<span>{title}</span>
				<span
					className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${tones.badge}`}
				>
					{count}
				</span>
			</div>
			<div
				className={`receivable-status-body px-4 py-4 ${tones.body}`}
				style={
					tone === 'amber'
						? { backgroundColor: '#fef3c7', backgroundImage: 'none' }
						: { backgroundColor: '#eef6fb', backgroundImage: 'none' }
				}
			>
				<p className="text-xs text-muted-foreground">{t('dash.receivables.total')}</p>
				<p className="mt-1 text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
					{formatRupiah(total)}
				</p>
				<Link
					to={href}
					className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
				>
					{t('dash.receivables.detail')}
				</Link>
			</div>
		</div>
	);
}

function ReceivablePanel({
	title,
	summary,
	period,
	onPeriodChange,
	detailHref,
}: {
	title: string;
	summary: Summary;
	period: PeriodKey;
	onPeriodChange: (v: PeriodKey) => void;
	detailHref: string;
}) {
	const { lang, t } = useLanguage();
	const range = periodRange(period, lang, t);

	return (
		<section
			className="receivable-status-card h-full rounded-2xl border border-transparent p-5 shadow-none md:p-6"
			style={{ backgroundColor: '#eef6fb', backgroundImage: 'none', boxShadow: 'none' }}
		>
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
				<div className="flex items-center gap-2">
					<Select value={period} onValueChange={v => onPeriodChange(v as PeriodKey)}>
						<SelectTrigger className="h-9 w-auto min-w-[11rem] rounded-full border-border bg-white px-3 text-xs font-medium shadow-none">
							<SelectValue placeholder={range.label} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="this_month">
								{periodRange('this_month', lang, t).label}
							</SelectItem>
							<SelectItem value="last_month">
								{periodRange('last_month', lang, t).label}
							</SelectItem>
							<SelectItem value="this_year">{periodRange('this_year', lang, t).label}</SelectItem>
							<SelectItem value="all">{t('dash.period.all')}</SelectItem>
						</SelectContent>
					</Select>
					<button
						type="button"
						className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-white text-muted-foreground transition hover:bg-muted"
						aria-label="Filter"
					>
						<Filter className="size-4" />
					</button>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<StatusCard
					title={t('dash.receivables.unpaid')}
					count={summary.unpaid.count}
					total={summary.unpaid.total}
					tone="amber"
					href={detailHref}
				/>
				<StatusCard
					title={t('dash.receivables.overdue')}
					count={summary.overdue.count}
					total={summary.overdue.total}
					tone="rose"
					href={detailHref}
				/>
				<div className="sm:col-span-2">
					<StatusCard
						title={t('dash.receivables.paid')}
						count={summary.paid.count}
						total={summary.paid.total}
						tone="emerald"
						href={detailHref}
					/>
				</div>
			</div>
		</section>
	);
}

export function DashboardReceivables({ companyId }: { companyId: string }) {
	const { lang, t } = useLanguage();
	const [docs, setDocs] = useState<BusinessDocument[]>([]);
	const [loading, setLoading] = useState(true);
	const [salesPeriod, setSalesPeriod] = useState<PeriodKey>('this_month');

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		pb.collection('documents')
			.getFullList<BusinessDocument>({
				filter: pb.filter('company = {:company} && (stage = "invoice" || stage = "pembayaran")', {
					company: companyId,
				}),
				sort: '-date',
				requestKey: null,
			})
			.then(list => {
				if (!cancelled) setDocs(list);
			})
			.catch(() => {
				if (!cancelled) setDocs([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [companyId]);

	const salesSummary = useMemo(() => {
		const { start, end } = periodRange(salesPeriod, lang, t);
		const invoices = docs.filter(d => d.direction === 'penjualan' && d.stage === 'invoice');
		const payments = docs.filter(d => d.direction === 'penjualan' && d.stage === 'pembayaran');
		return summarize(invoices, payments, start, end);
	}, [docs, salesPeriod]);


	if (loading) {
		return <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />;
	}

	return (
		<ReceivablePanel
			title={t('dash.receivables.title')}
			summary={salesSummary}
			period={salesPeriod}
			onPeriodChange={setSalesPeriod}
			detailHref="/app/penjualan"
		/>
	);
}
