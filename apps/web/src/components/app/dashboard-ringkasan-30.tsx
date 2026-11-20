import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
	accountBalance,
	filterEntriesByConversion,
	formatRupiah,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';
import { useLanguage } from '@/hooks/use-language';
import type { Lang } from '@/lib/i18n';

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function months(lang: Lang) {
	return lang === 'en' ? MONTHS_EN : MONTHS_ID;
}

type BucketKey = 'fleksibel' | 'penting' | 'tabungan' | 'lain';

const BUCKET_KEYS: { key: BucketKey; color: string }[] = [
	{ key: 'fleksibel', color: '#ec4899' },
	{ key: 'penting', color: '#22d3ee' },
	{ key: 'tabungan', color: '#84cc16' },
	{ key: 'lain', color: '#4b5563' },
];

function isoDay(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatRange(start: Date, end: Date, lang: Lang): string {
	const M = months(lang);
	const sameYear = start.getFullYear() === end.getFullYear();
	const left = `${start.getDate()} ${M[start.getMonth()]}`;
	const right = `${end.getDate()} ${M[end.getMonth()]}${sameYear ? '' : ` ${end.getFullYear()}`}`;
	return `${left} – ${right}`;
}

function bucketFor(name: string): BucketKey {
	const text = name.toLowerCase();
	if (/tabungan|cadangan|dana darurat|setoran/.test(text)) return 'tabungan';
	if (
		/gaji|upah|sewa|listrik|air|telepon|internet|pajak|pph|ppn|asuransi|bpjs|penyusutan|bunga|utilitas/.test(
			text,
		)
	) {
		return 'penting';
	}
	if (
		/operasional|pemasaran|iklan|promosi|perjalanan|transport|konsumsi|hiburan|administrasi|perlengkapan|atk|lain/.test(
			text,
		)
	) {
		return 'fleksibel';
	}
	return 'lain';
}

export function DashboardRingkasan30({
	accounts,
	entries,
	conversionDate,
}: {
	accounts: Account[];
	entries: JournalEntry[];
	conversionDate?: string | null;
}) {
	const { lang, t } = useLanguage();
	const summary = useMemo(() => {
		const end = new Date();
		const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
		const startIso = isoDay(start);
		const endIso = isoDay(end);
		const accountType = new Map(accounts.map(account => [account.id, account]));
		const relevant = filterEntriesByConversion(entries, conversionDate).filter(entry => {
			const day = (entry.date || '').slice(0, 10);
			return day >= startIso && day <= endIso;
		});

		let income = 0;
		let spent = 0;
		let incomeLines = 0;
		let spentLines = 0;
		const totals = new Map<BucketKey, number>();
		const names = new Map<BucketKey, Set<string>>();

		for (const entry of relevant) {
			const account = accountType.get(entry.account) ?? entry.expand?.account;
			const type = account?.type;
			if (type !== 'pendapatan' && type !== 'beban') continue;
			const movement = accountBalance(type, entry.debit || 0, entry.credit || 0);
			if (type === 'pendapatan') {
				income += movement;
				incomeLines += 1;
				continue;
			}
			spent += movement;
			spentLines += 1;
			const key = bucketFor(account?.name || '');
			totals.set(key, (totals.get(key) ?? 0) + movement);
			const set = names.get(key) ?? new Set<string>();
			if (account?.name) set.add(account.name);
			names.set(key, set);
		}

		const slices = BUCKET_KEYS.map(bucket => ({
			...bucket,
			label: t(`dash.ringkasan.bucket.${bucket.key}`),
			hint: t(`dash.ringkasan.hint.${bucket.key}`),
			value: totals.get(bucket.key) ?? 0,
			accounts: [...(names.get(bucket.key) ?? [])],
		})).filter(slice => Math.abs(slice.value) > 0.009);

		return {
			range: formatRange(start, end, lang),
			income,
			spent,
			difference: income - spent,
			incomeLines,
			spentLines,
			slices,
			hasBooks: incomeLines > 0 || spentLines > 0,
		};
	}, [accounts, entries, conversionDate, lang, t]);

	return (
		<section className="rounded-2xl border border-border bg-white shadow-soft-sm">
			<div className="border-b border-border px-5 py-4">
				<h2 className="text-xl font-bold tracking-tight text-sky-700">{t('dash.ringkasan.title')}</h2>
				<p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-500">
					<span>{summary.range}</span>
					{summary.hasBooks ? (
						<>
							<span>
								{t('dash.ringkasan.income')}:{' '}
								<span className="font-semibold text-slate-800">{formatRupiah(summary.income)}</span>
							</span>
							<span>
								{t('dash.ringkasan.expense')}:{' '}
								<span className="font-semibold text-slate-800">{formatRupiah(summary.spent)}</span>
							</span>
							<span>
								{t('dash.ringkasan.difference')}:{' '}
								<span
									className={
										summary.difference < 0
											? 'font-bold text-red-600'
											: 'font-bold text-emerald-700'
									}
								>
									{summary.difference < 0
										? `-${formatRupiah(Math.abs(summary.difference))}`
										: formatRupiah(summary.difference)}
								</span>
							</span>
						</>
					) : (
						<span>{t('dash.ringkasan.no_data')}</span>
					)}
				</p>
			</div>

			{!summary.hasBooks ? (
				<p className="px-5 py-8 text-sm text-muted-foreground">
					{t('dash.ringkasan.empty')}
				</p>
			) : summary.slices.length === 0 ? (
				<p className="px-5 py-8 text-sm text-muted-foreground">
					{t('dash.ringkasan.income_only')}
				</p>
			) : (
				<div className="grid items-center gap-2 px-4 py-5 sm:px-6 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] md:gap-8">
					<div className="relative mx-auto h-56 w-full max-w-[18rem]">
						<div
							aria-hidden
							className="pointer-events-none absolute inset-x-[18%] bottom-3 h-6 rounded-full bg-slate-400/25 blur-md"
						/>
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie
									data={summary.slices}
									dataKey="value"
									nameKey="label"
									cx="50%"
									cy="48%"
									innerRadius={0}
									outerRadius="86%"
									stroke="#fff"
									strokeWidth={3}
									paddingAngle={0.4}
									isAnimationActive={false}
								>
									{summary.slices.map(slice => (
										<Cell key={slice.key} fill={slice.color} />
									))}
								</Pie>
								<Tooltip
									formatter={(value, name) => [
										formatRupiah(Number(value) || 0),
										String(name),
									]}
								/>
							</PieChart>
						</ResponsiveContainer>
					</div>
					<ul className="min-w-0 divide-y divide-slate-100">
						{summary.slices.map(slice => {
							const share =
								summary.spent > 0 ? Math.round((slice.value / summary.spent) * 100) : 0;
							return (
								<li key={slice.key} className="flex items-center justify-between gap-4 py-2.5">
									<div className="flex min-w-0 items-start gap-2.5">
										<span
											className="mt-1 size-3 shrink-0 rounded-[2px]"
											style={{ backgroundColor: slice.color }}
											aria-hidden
										/>
										<div className="min-w-0">
											<p className="text-[15px] font-semibold leading-snug text-sky-600">
												{slice.label}
											</p>
											<p className="mt-0.5 text-xs text-slate-500">
												{share}% ·{' '}
												{slice.accounts.length > 0
													? slice.accounts.join(', ')
													: t('dash.ringkasan.no_account')}
											</p>
										</div>
									</div>
									<p className="shrink-0 text-base font-semibold tabular-nums text-slate-800">
										{formatRupiah(slice.value)}
									</p>
								</li>
							);
						})}
					</ul>
					<p className="text-xs leading-relaxed text-muted-foreground md:col-span-2">
						{t('dash.ringkasan.legend')}
					</p>
				</div>
			)}
		</section>
	);
}
