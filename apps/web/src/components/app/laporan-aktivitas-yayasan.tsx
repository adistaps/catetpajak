import { useMemo, useState } from 'react';
import { ChevronDown, Info, MessageSquarePlus } from 'lucide-react';
import {
	accountBalance,
	filterEntriesByConversion,
	type Account,
	type AccountBalance,
	type JournalEntry,
} from '@/lib/accounting';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';

function formatIdAmount(value: number): string {
	return new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

function isRestrictedNetAsset(account: Account): boolean {
	return /terikat|pembatasan|with restriction|restricted|dana terikat/i.test(
		account.name,
	);
}

function isOci(account: Account): boolean {
	return /komprehensif|revaluasi|oci|selisih revaluasi/i.test(account.name);
}

function yearEndIso(year: number): string {
	return `${year}-12-31`;
}

function yearStartIso(year: number): string {
	return `${year}-01-01`;
}

function balancesAsOf(
	accounts: Account[],
	entries: JournalEntry[],
	asOf: string,
	conversionDate?: string | null,
): AccountBalance[] {
	const cut = asOf.slice(0, 10);
	const relevant = filterEntriesByConversion(entries, conversionDate).filter(
		e => (e.date || '').slice(0, 10) <= cut,
	);
	const totals = new Map<string, { debit: number; credit: number }>();
	for (const entry of relevant) {
		const total = totals.get(entry.account) ?? { debit: 0, credit: 0 };
		total.debit += entry.debit || 0;
		total.credit += entry.credit || 0;
		totals.set(entry.account, total);
	}
	return accounts.map(account => {
		const total = totals.get(account.id) ?? { debit: 0, credit: 0 };
		const opening = account.opening_balance || 0;
		return {
			account,
			debit: total.debit,
			credit: total.credit,
			balance: opening + accountBalance(account.type, total.debit, total.credit),
		};
	});
}

function periodSurplus(
	accounts: Account[],
	entries: JournalEntry[],
	year: number,
	conversionDate?: string | null,
): { unrestricted: number; restricted: number; oci: number } {
	const start = yearStartIso(year);
	const end = yearEndIso(year);
	const periodEntries = filterEntriesByConversion(entries, conversionDate).filter(e => {
		const d = (e.date || '').slice(0, 10);
		return d >= start && d <= end;
	});

	const byAccount = new Map<string, { debit: number; credit: number }>();
	for (const entry of periodEntries) {
		const t = byAccount.get(entry.account) ?? { debit: 0, credit: 0 };
		t.debit += entry.debit || 0;
		t.credit += entry.credit || 0;
		byAccount.set(entry.account, t);
	}

	let pendapatanUnrest = 0;
	let pendapatanRest = 0;
	let bebanUnrest = 0;
	let bebanRest = 0;
	let oci = 0;

	for (const account of accounts) {
		const t = byAccount.get(account.id) ?? { debit: 0, credit: 0 };
		const bal = accountBalance(account.type, t.debit, t.credit);
		if (Math.round(bal) === 0) continue;

		if (account.type === 'pendapatan') {
			if (isRestrictedNetAsset(account)) pendapatanRest += bal;
			else pendapatanUnrest += bal;
		} else if (account.type === 'beban') {
			if (isRestrictedNetAsset(account)) bebanRest += bal;
			else bebanUnrest += bal;
		} else if (account.type === 'ekuitas' && isOci(account)) {
			oci += bal;
		}
	}

	return {
		unrestricted: pendapatanUnrest - bebanUnrest,
		restricted: pendapatanRest - bebanRest,
		oci,
	};
}

type NetAssetSlice = {
	unrestrictedOpening: number;
	unrestrictedSurplus: number;
	releasedFromRestriction: number;
	unrestrictedClosing: number;
	ociOpening: number;
	ociPeriod: number;
	ociClosing: number;
	restrictedOpening: number;
	restrictedSurplus: number;
	restrictedReleased: number;
	restrictedClosing: number;
	totalNetAssets: number;
};

function buildNetAssetSlice(
	endBalances: AccountBalance[],
	startBalances: AccountBalance[],
	surplus: { unrestricted: number; restricted: number; oci: number },
): NetAssetSlice {
	const eqEnd = endBalances.filter(b => b.account.type === 'ekuitas');
	const eqStart = startBalances.filter(b => b.account.type === 'ekuitas');

	const sumEq = (rows: AccountBalance[], pred: (a: Account) => boolean) =>
		rows.filter(b => pred(b.account)).reduce((s, b) => s + b.balance, 0);

	const ociClosing = sumEq(eqEnd, a => isOci(a));
	const ociOpening = sumEq(eqStart, a => isOci(a));

	const restrictedClosingEq = sumEq(
		eqEnd,
		a => isRestrictedNetAsset(a) && !isOci(a),
	);
	const restrictedOpeningEq = sumEq(
		eqStart,
		a => isRestrictedNetAsset(a) && !isOci(a),
	);

	const unrestClosingEq = sumEq(
		eqEnd,
		a => !isRestrictedNetAsset(a) && !isOci(a),
	);
	const unrestOpeningEq = sumEq(
		eqStart,
		a => !isRestrictedNetAsset(a) && !isOci(a),
	);

	const unrestrictedOpening = unrestOpeningEq;
	const restrictedOpening = restrictedOpeningEq;

	const unrestrictedClosing = unrestClosingEq + surplus.unrestricted;
	const restrictedClosing = restrictedClosingEq + surplus.restricted;

	let released = 0;
	const unrestImplied =
		unrestrictedClosing - unrestrictedOpening - surplus.unrestricted;
	const restImplied = restrictedOpening + surplus.restricted - restrictedClosing;
	if (Math.round(unrestImplied) !== 0 || Math.round(restImplied) !== 0) {
		released = Math.round((unrestImplied + restImplied) / 2);
	}

	const ociPeriod = surplus.oci || ociClosing - ociOpening;

	const unrestrictedClosingFinal =
		unrestrictedOpening + surplus.unrestricted + released;
	const restrictedClosingFinal =
		restrictedOpening + surplus.restricted - released;
	const ociClosingFinal = ociOpening + ociPeriod;

	return {
		unrestrictedOpening,
		unrestrictedSurplus: surplus.unrestricted,
		releasedFromRestriction: released,
		unrestrictedClosing: unrestrictedClosingFinal,
		ociOpening,
		ociPeriod,
		ociClosing: ociClosingFinal,
		restrictedOpening,
		restrictedSurplus: surplus.restricted,
		restrictedReleased: released,
		restrictedClosing: restrictedClosingFinal,
		totalNetAssets:
			unrestrictedClosingFinal + ociClosingFinal + restrictedClosingFinal,
	};
}

function AmtRow({
	name,
	curr,
	prev,
	indent = 0,
	bold = false,
	parenCurr = false,
	parenPrev = false,
}: {
	name: string;
	curr: number;
	prev: number;
	indent?: number;
	bold?: boolean;
	parenCurr?: boolean;
	parenPrev?: boolean;
}) {
	const pad =
		indent === 0 ? 'pl-5' : indent === 1 ? 'pl-8' : indent === 2 ? 'pl-12' : 'pl-16';

	const fmt = (v: number, paren: boolean) => {
		const abs = Math.abs(v);
		const base = formatIdAmount(abs);
		return paren || v < 0 ? `(${base})` : base;
	};

	return (
		<tr className="border-t border-slate-100 hover:bg-slate-50/60">
			<td
				className={cn(
					'py-2 pr-5',
					pad,
					bold ? 'font-bold text-slate-900' : 'text-slate-700',
				)}
			>
				{name}
			</td>
			<td
				className={cn(
					'px-5 py-2 text-right tabular-nums text-slate-800',
					bold && 'font-bold text-slate-900',
				)}
			>
				{fmt(curr, parenCurr)}
			</td>
			<td
				className={cn(
					'px-5 py-2 text-right tabular-nums text-slate-800',
					bold && 'font-bold text-slate-900',
				)}
			>
				{fmt(prev, parenPrev)}
			</td>
		</tr>
	);
}

export function LaporanAktivitasYayasan({
	balances,
	entityName: _entityName,
	accounts,
	entries,
	conversionDate,
	onExportPdf,
}: {
	balances: AccountBalance[];
	entityName?: string;
	accounts?: Account[];
	entries?: JournalEntry[];
	conversionDate?: string | null;
	onExportPdf?: () => void;
}) {
	const { t } = useLanguage();
	const now = new Date();
	const [year, setYear] = useState(now.getFullYear());
	const [showMoreFilters, setShowMoreFilters] = useState(false);
	const currYear = year;
	const prevYear = year - 1;

	const data = useMemo(() => {
		const hasHistory = Boolean(accounts && entries);

		if (!hasHistory) {
			const pendapatan = balances
				.filter(b => b.account.type === 'pendapatan')
				.reduce((s, b) => s + b.balance, 0);
			const beban = balances
				.filter(b => b.account.type === 'beban')
				.reduce((s, b) => s + b.balance, 0);
			const surplus = pendapatan - beban;
			const ekuitas = balances.filter(b => b.account.type === 'ekuitas');
			const oci = ekuitas
				.filter(b => isOci(b.account))
				.reduce((s, b) => s + b.balance, 0);
			const restricted = ekuitas
				.filter(b => isRestrictedNetAsset(b.account) && !isOci(b.account))
				.reduce((s, b) => s + b.balance, 0);
			const unrestrictedBase = ekuitas
				.filter(b => !isRestrictedNetAsset(b.account) && !isOci(b.account))
				.reduce((s, b) => s + b.balance, 0);
			const unrestrictedOpening = unrestrictedBase;
			const unrestrictedClosing = unrestrictedBase + surplus;

			const empty: NetAssetSlice = {
				unrestrictedOpening: 0,
				unrestrictedSurplus: 0,
				releasedFromRestriction: 0,
				unrestrictedClosing: 0,
				ociOpening: 0,
				ociPeriod: 0,
				ociClosing: 0,
				restrictedOpening: 0,
				restrictedSurplus: 0,
				restrictedReleased: 0,
				restrictedClosing: 0,
				totalNetAssets: 0,
			};

			const curr: NetAssetSlice = {
				unrestrictedOpening,
				unrestrictedSurplus: surplus,
				releasedFromRestriction: 0,
				unrestrictedClosing,
				ociOpening: oci,
				ociPeriod: 0,
				ociClosing: oci,
				restrictedOpening: restricted,
				restrictedSurplus: 0,
				restrictedReleased: 0,
				restrictedClosing: restricted,
				totalNetAssets: unrestrictedClosing + oci + restricted,
			};

			const hasData =
				curr.totalNetAssets !== 0 ||
				curr.unrestrictedSurplus !== 0 ||
				pendapatan !== 0 ||
				beban !== 0;

			return { curr, prev: empty, hasData };
		}

		const dayBefore = (iso: string) => {
			const d = new Date(iso + 'T12:00:00');
			d.setDate(d.getDate() - 1);
			return d.toISOString().slice(0, 10);
		};

		const currEnd = yearEndIso(currYear);
		const prevEnd = yearEndIso(prevYear);
		const currStartBal = balancesAsOf(
			accounts!,
			entries!,
			dayBefore(yearStartIso(currYear)),
			conversionDate,
		);
		const prevStartBal = balancesAsOf(
			accounts!,
			entries!,
			dayBefore(yearStartIso(prevYear)),
			conversionDate,
		);
		const currEndBal = balancesAsOf(accounts!, entries!, currEnd, conversionDate);
		const prevEndBal = balancesAsOf(accounts!, entries!, prevEnd, conversionDate);

		const currSurplus = periodSurplus(accounts!, entries!, currYear, conversionDate);
		const prevSurplus = periodSurplus(accounts!, entries!, prevYear, conversionDate);

		const curr = buildNetAssetSlice(currEndBal, currStartBal, currSurplus);
		const prev = buildNetAssetSlice(prevEndBal, prevStartBal, prevSurplus);

		const hasData =
			curr.totalNetAssets !== 0 ||
			prev.totalNetAssets !== 0 ||
			curr.unrestrictedSurplus !== 0 ||
			prev.unrestrictedSurplus !== 0;

		return { curr, prev, hasData };
	}, [balances, accounts, entries, conversionDate, currYear, prevYear]);

	const updatedLabel = (() => {
		try {
			return new Date().toLocaleString('id-ID', {
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				timeZoneName: 'short',
			});
		} catch {
			return new Date().toLocaleString('id-ID');
		}
	})();

	const { curr, prev } = data;

	return (
		<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			{/* Title bar */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
				<h2 className="text-xl font-bold tracking-tight text-slate-900">
					{t('report.aktivitas.title')}{' '}
					<span className="text-base font-normal text-slate-500">{t('report.neraca.in_idr')}</span>
				</h2>
				<button
					type="button"
					className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-slate-50"
				>
					{t('report.neraca.feedback')}
					<ChevronDown className="size-3.5 opacity-70" />
				</button>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
				<div className="flex flex-col gap-1.5">
					<label className="text-xs font-medium text-slate-600" htmlFor="aktivitas-tahun">
						{t('report.aktivitas.report_year')}
					</label>
					<select
						id="aktivitas-tahun"
						value={currYear}
						onChange={e => setYear(Number(e.target.value))}
						className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
					>
						{Array.from({ length: 8 }, (_, i) => now.getFullYear() - i + 1).map(y => (
							<option key={y} value={y}>
								{y}
							</option>
						))}
					</select>
				</div>

				<div className="flex flex-col gap-1.5">
					<label
						className="text-xs font-medium text-slate-600"
						htmlFor="aktivitas-filter"
					>
						Filter sesuai periode
					</label>
					<select
						id="aktivitas-filter"
						value="year"
						className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
						disabled
					>
						<option value="year">{t('report.aktivitas.year_full')}</option>
					</select>
				</div>

				<button
					type="button"
					className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
				>
					{t('report.neraca.filter')}
				</button>

				<button
					type="button"
					onClick={() => setShowMoreFilters(v => !v)}
					className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
				>
					{t('report.neraca.more_filters')}
				</button>

				<div className="ml-auto flex items-center gap-2">
					{onExportPdf ? (
						<button
							type="button"
							onClick={onExportPdf}
							className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
						>
							{t('report.neraca.export')}
							<ChevronDown className="size-3.5 opacity-60" />
						</button>
					) : null}
				</div>
			</div>

			{showMoreFilters ? (
				<div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3 text-xs text-slate-500">
					Format ISAK 35 — Laporan Perubahan Aset Neto, komparatif {currYear} dan{' '}
					{prevYear}.
				</div>
			) : null}

			{/* Meta row */}
			<div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-slate-500">
				<p className="inline-flex items-center gap-1.5">
					{t('report.neraca.last_updated')} {updatedLabel}
					<span title="Waktu pembaruan data laporan">
						<Info className="size-3.5 text-slate-400" />
					</span>
				</p>
				<button
					type="button"
					className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
				>
					<MessageSquarePlus className="size-3.5" />
					{t('report.neraca.view_example')}
				</button>
			</div>

			{/* Table */}
			{!data.hasData ? (
				<p className="px-5 py-8 text-sm text-slate-500">{t('report.aktivitas.empty')}</p>
			) : <div className="overflow-x-auto">
				<table className="w-full min-w-[720px] border-collapse text-sm">
					<thead>
						<tr className="border-y border-slate-200 bg-slate-50">
							<th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-700">
								Nama Akun
							</th>
							<th className="w-40 px-5 py-2.5 text-right text-xs font-semibold text-slate-700">
								{currYear}
							</th>
							<th className="w-40 px-5 py-2.5 text-right text-xs font-semibold text-slate-700">
								{prevYear}
							</th>
						</tr>
					</thead>
					<tbody>
						<tr className="bg-slate-100/90">
							<td colSpan={3} className="px-5 py-2.5 text-sm font-bold text-slate-800">
								{t('report.aktivitas.unrestricted')}
							</td>
						</tr>
						<AmtRow
							name={t('report.aktivitas.opening')}
							curr={curr.unrestrictedOpening}
							prev={prev.unrestrictedOpening}
							indent={1}
						/>
						<AmtRow
							name={t('report.aktivitas.surplus')}
							curr={curr.unrestrictedSurplus}
							prev={prev.unrestrictedSurplus}
							indent={1}
						/>
						<AmtRow
							name={t('report.aktivitas.released')}
							curr={curr.releasedFromRestriction}
							prev={prev.releasedFromRestriction}
							indent={1}
						/>
						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 pl-8 font-bold text-slate-900">{t('report.aktivitas.closing')}</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(curr.unrestrictedClosing)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(prev.unrestrictedClosing)}
							</td>
						</tr>

						<tr className="bg-slate-100/90">
							<td colSpan={3} className="px-5 py-2.5 text-sm font-bold text-slate-800">
								{t('report.aktivitas.oci')}
							</td>
						</tr>
						<AmtRow
							name={t('report.aktivitas.opening')}
							curr={curr.ociOpening}
							prev={prev.ociOpening}
							indent={1}
						/>
						<AmtRow
							name={t('report.aktivitas.oci_period')}
							curr={curr.ociPeriod}
							prev={prev.ociPeriod}
							indent={1}
						/>
						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 pl-8 font-bold text-slate-900">{t('report.aktivitas.closing')}</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(curr.ociClosing)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(prev.ociClosing)}
							</td>
						</tr>
						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 font-bold text-slate-900">
								{t('report.aktivitas.total_unrestricted_oci')}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(curr.unrestrictedClosing + curr.ociClosing)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(prev.unrestrictedClosing + prev.ociClosing)}
							</td>
						</tr>

						<tr className="bg-slate-100/90">
							<td colSpan={3} className="px-5 py-2.5 text-sm font-bold text-slate-800">
								{t('report.aktivitas.restricted')}
							</td>
						</tr>
						<AmtRow
							name={t('report.aktivitas.opening')}
							curr={curr.restrictedOpening}
							prev={prev.restrictedOpening}
							indent={1}
						/>
						<AmtRow
							name={t('report.aktivitas.surplus')}
							curr={curr.restrictedSurplus}
							prev={prev.restrictedSurplus}
							indent={1}
						/>
						<AmtRow
							name={t('report.aktivitas.released')}
							curr={curr.restrictedReleased}
							prev={prev.restrictedReleased}
							indent={1}
							parenCurr={curr.restrictedReleased !== 0}
							parenPrev={prev.restrictedReleased !== 0}
						/>
						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 pl-8 font-bold text-slate-900">{t('report.aktivitas.closing')}</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(curr.restrictedClosing)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(prev.restrictedClosing)}
							</td>
						</tr>

						<tr className="border-t border-slate-200 bg-slate-50/50">
							<td className="px-5 py-3 font-extrabold text-slate-900">
								{t('report.aktivitas.total_net')}
							</td>
							<td className="px-5 py-3 text-right font-extrabold tabular-nums text-slate-900">
								{formatIdAmount(curr.totalNetAssets)}
							</td>
							<td className="px-5 py-3 text-right font-extrabold tabular-nums text-slate-900">
								{formatIdAmount(prev.totalNetAssets)}
							</td>
						</tr>
					</tbody>
				</table>
			</div>}

			<div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
				{t('report.aktivitas.note', { year: currYear, prev: prevYear })}
			</div>
		</div>
	);
}
