import { useMemo, useState } from 'react';
import { ChevronDown, Info, MessageSquarePlus } from 'lucide-react';
import {
	accountBalance,
	filterEntriesByConversion,
	formatDate,
	isCurrentAsset,
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

function isLongTermLiability(account: Account): boolean {
	return /jangka panjang|hipotek|obligasi|imbalan kerja|pensiun|utang bank/i.test(
		account.name,
	);
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

type SheetSlice = {
	asetLancar: AccountBalance[];
	asetTidakLancar: AccountBalance[];
	liabPendek: AccountBalance[];
	liabPanjang: AccountBalance[];
	ociRows: AccountBalance[];
	restrictedRows: AccountBalance[];
	surplusAkumulasi: number;
	totalOci: number;
	totalRestricted: number;
	totalAsetLancar: number;
	totalAsetTidakLancar: number;
	totalAset: number;
	totalLiabPendek: number;
	totalLiabPanjang: number;
	totalLiabilitas: number;
	totalAsetNeto: number;
	totalLiabDanAsetNeto: number;
};

function buildSlice(balances: AccountBalance[]): SheetSlice {
	const active = balances.filter(b => Math.round(b.balance) !== 0);

	const asetLancar = active.filter(
		b => b.account.type === 'aset' && isCurrentAsset(b.account),
	);
	const asetTidakLancar = active.filter(
		b => b.account.type === 'aset' && !isCurrentAsset(b.account),
	);

	const liabAll = active.filter(b => b.account.type === 'liabilitas');
	const liabPendek = liabAll.filter(b => !isLongTermLiability(b.account));
	const liabPanjang = liabAll.filter(b => isLongTermLiability(b.account));

	const ekuitas = active.filter(b => b.account.type === 'ekuitas');
	const pendapatan = active
		.filter(b => b.account.type === 'pendapatan')
		.reduce((sum, b) => sum + b.balance, 0);
	const beban = active
		.filter(b => b.account.type === 'beban')
		.reduce((sum, b) => sum + b.balance, 0);
	const surplusBerjalan = pendapatan - beban;

	const ociRows = ekuitas.filter(b => isOci(b.account));
	const restrictedRows = ekuitas.filter(
		b => isRestrictedNetAsset(b.account) && !isOci(b.account),
	);
	const unrestrictedBase = ekuitas.filter(
		b => !isRestrictedNetAsset(b.account) && !isOci(b.account),
	);

	const totalAsetLancar = asetLancar.reduce((s, b) => s + b.balance, 0);
	const totalAsetTidakLancar = asetTidakLancar.reduce((s, b) => s + b.balance, 0);
	const totalAset = totalAsetLancar + totalAsetTidakLancar;

	const totalLiabPendek = liabPendek.reduce((s, b) => s + b.balance, 0);
	const totalLiabPanjang = liabPanjang.reduce((s, b) => s + b.balance, 0);
	const totalLiabilitas = totalLiabPendek + totalLiabPanjang;

	const surplusAkumulasi =
		unrestrictedBase.reduce((s, b) => s + b.balance, 0) + surplusBerjalan;
	const totalOci = ociRows.reduce((s, b) => s + b.balance, 0);
	const totalRestricted = restrictedRows.reduce((s, b) => s + b.balance, 0);
	const totalAsetNeto = surplusAkumulasi + totalOci + totalRestricted;

	return {
		asetLancar,
		asetTidakLancar,
		liabPendek,
		liabPanjang,
		ociRows,
		restrictedRows,
		surplusAkumulasi,
		totalOci,
		totalRestricted,
		totalAsetLancar,
		totalAsetTidakLancar,
		totalAset,
		totalLiabPendek,
		totalLiabPanjang,
		totalLiabilitas,
		totalAsetNeto,
		totalLiabDanAsetNeto: totalLiabilitas + totalAsetNeto,
	};
}

function mergeAccountRows(
	curr: AccountBalance[],
	prev: AccountBalance[],
): { id: string; name: string; curr: number; prev: number }[] {
	const map = new Map<string, { id: string; name: string; curr: number; prev: number }>();
	for (const b of curr) {
		map.set(b.account.id, {
			id: b.account.id,
			name: b.account.name,
			curr: b.balance,
			prev: 0,
		});
	}
	for (const b of prev) {
		const existing = map.get(b.account.id);
		if (existing) {
			existing.prev = b.balance;
		} else {
			map.set(b.account.id, {
				id: b.account.id,
				name: b.account.name,
				curr: 0,
				prev: b.balance,
			});
		}
	}
	return Array.from(map.values()).filter(
		r => Math.round(r.curr) !== 0 || Math.round(r.prev) !== 0,
	);
}

function AccountAmtRow({
	name,
	curr,
	prev,
	indent = 0,
	bold = false,
}: {
	name: string;
	curr: number;
	prev: number;
	indent?: number;
	bold?: boolean;
}) {
	const pad =
		indent === 0 ? 'pl-5' : indent === 1 ? 'pl-8' : indent === 2 ? 'pl-12' : 'pl-16';
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
				{formatIdAmount(curr)}
			</td>
			<td
				className={cn(
					'px-5 py-2 text-right tabular-nums text-slate-800',
					bold && 'font-bold text-slate-900',
				)}
			>
				{formatIdAmount(prev)}
			</td>
		</tr>
	);
}

export function LaporanNeracaYayasan({
	balances,
	entityName: _entityName,
	asOfDate,
	accounts,
	entries,
	conversionDate,
	onExportPdf,
}: {
	balances: AccountBalance[];
	entityName?: string;
	asOfDate?: string;
	accounts?: Account[];
	entries?: JournalEntry[];
	conversionDate?: string | null;
	onExportPdf?: () => void;
}) {
	const { t } = useLanguage();
	const now = new Date();
	const defaultYear = asOfDate
		? Number(asOfDate.slice(0, 4))
		: now.getFullYear();
	const [year, setYear] = useState(defaultYear);
	const [showMoreFilters, setShowMoreFilters] = useState(false);

	const currYear = year;
	const prevYear = year - 1;
	const currAsOf = yearEndIso(currYear);
	const prevAsOf = yearEndIso(prevYear);

	const data = useMemo(() => {
		const hasHistory = Boolean(accounts && entries);

		const currBalances = hasHistory
			? balancesAsOf(accounts!, entries!, currAsOf, conversionDate)
			: balances;
		const prevBalances = hasHistory
			? balancesAsOf(accounts!, entries!, prevAsOf, conversionDate)
			: balances.map(b => ({ ...b, balance: 0, debit: 0, credit: 0 }));

		const curr = buildSlice(currBalances);
		const prev = buildSlice(prevBalances);

		const asetLancarRows = mergeAccountRows(curr.asetLancar, prev.asetLancar);
		const asetTidakLancarRows = mergeAccountRows(
			curr.asetTidakLancar,
			prev.asetTidakLancar,
		);
		const liabPendekRows = mergeAccountRows(curr.liabPendek, prev.liabPendek);
		const liabPanjangRows = mergeAccountRows(curr.liabPanjang, prev.liabPanjang);
		const ociRows = mergeAccountRows(curr.ociRows, prev.ociRows);
		const restrictedRows = mergeAccountRows(curr.restrictedRows, prev.restrictedRows);

		const seimbang =
			Math.round(curr.totalAset) === Math.round(curr.totalLiabDanAsetNeto);

		const hasData =
			curr.totalAset !== 0 ||
			curr.totalLiabDanAsetNeto !== 0 ||
			prev.totalAset !== 0 ||
			prev.totalLiabDanAsetNeto !== 0;

		return {
			curr,
			prev,
			asetLancarRows,
			asetTidakLancarRows,
			liabPendekRows,
			liabPanjangRows,
			ociRows,
			restrictedRows,
			seimbang,
			hasData,
		};
	}, [balances, accounts, entries, conversionDate, currAsOf, prevAsOf]);

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

	const asOfLabel = formatDate(currAsOf);

	return (
		<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			{/* Title bar */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
				<h2 className="text-xl font-bold tracking-tight text-slate-900">
					{t('report.yayasan.title')}{' '}
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
					<label className="text-xs font-medium text-slate-600" htmlFor="yayasan-tahun">
						{t('report.yayasan.report_year')}
					</label>
					<select
						id="yayasan-tahun"
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
					<label className="text-xs font-medium text-slate-600" htmlFor="yayasan-filter">
						Filter sesuai periode
					</label>
					<select
						id="yayasan-filter"
						value="year-end"
						className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
						disabled
					>
						<option value="year-end">{t('report.yayasan.year_end')}</option>
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
					Format ISAK 35 — kolom komparatif {currYear} dan {prevYear}. Akun dengan
					saldo nol disembunyikan.
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
				<p className="px-5 py-8 text-sm text-slate-500">{t('report.yayasan.empty')}</p>
			) : <div className="overflow-x-auto">
				<table className="w-full min-w-[720px] border-collapse text-sm">
					<thead>
						<tr className="border-y border-slate-200 bg-slate-50">
							<th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-700">
								Nama Akun
							</th>
							<th className="w-40 px-5 py-2.5 text-right text-xs font-semibold text-slate-700">
								{asOfLabel}
							</th>
							<th className="w-40 px-5 py-2.5 text-right text-xs font-semibold text-slate-700">
								{formatDate(prevAsOf)}
							</th>
						</tr>
					</thead>
					<tbody>
						<tr className="bg-slate-100/90">
							<td colSpan={3} className="px-5 py-2.5 text-sm font-bold text-slate-800">
								{t('report.yayasan.asset')}
							</td>
						</tr>

						<tr>
							<td colSpan={3} className="px-5 py-2 pl-8 text-sm font-semibold italic text-slate-600">
								{t('report.yayasan.current_asset')}
							</td>
						</tr>
						{data.asetLancarRows.length === 0 ? (
							<AccountAmtRow name="—" curr={0} prev={0} indent={1} />
						) : (
							data.asetLancarRows.map(row => (
								<AccountAmtRow
									key={row.id}
									name={row.name}
									curr={row.curr}
									prev={row.prev}
									indent={1}
								/>
							))
						)}
						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 font-bold text-slate-900">{t('report.yayasan.total_current')}</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.curr.totalAsetLancar)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.prev.totalAsetLancar)}
							</td>
						</tr>

						<tr>
							<td colSpan={3} className="px-5 py-2 pl-8 text-sm font-semibold italic text-slate-600">
								{t('report.yayasan.non_current_asset')}
							</td>
						</tr>
						{data.asetTidakLancarRows.length === 0 ? (
							<AccountAmtRow name="—" curr={0} prev={0} indent={1} />
						) : (
							data.asetTidakLancarRows.map(row => (
								<AccountAmtRow
									key={row.id}
									name={row.name}
									curr={row.curr}
									prev={row.prev}
									indent={1}
								/>
							))
						)}
						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 font-bold text-slate-900">
								{t('report.yayasan.total_non_current')}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.curr.totalAsetTidakLancar)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.prev.totalAsetTidakLancar)}
							</td>
						</tr>

						<tr className="border-t border-slate-200 bg-slate-50/50">
							<td className="px-5 py-3 font-extrabold text-slate-900">{t('report.yayasan.total_asset')}</td>
							<td className="px-5 py-3 text-right font-extrabold tabular-nums text-slate-900">
								{formatIdAmount(data.curr.totalAset)}
							</td>
							<td className="px-5 py-3 text-right font-extrabold tabular-nums text-slate-900">
								{formatIdAmount(data.prev.totalAset)}
							</td>
						</tr>

						<tr className="bg-slate-100/90">
							<td colSpan={3} className="px-5 py-2.5 text-sm font-bold text-slate-800">
								{t('report.yayasan.liability')}
							</td>
						</tr>

						<tr>
							<td colSpan={3} className="px-5 py-2 pl-8 text-sm font-semibold italic text-slate-600">
								{t('report.yayasan.short_term')}
							</td>
						</tr>
						{data.liabPendekRows.length === 0 ? (
							<AccountAmtRow name="—" curr={0} prev={0} indent={1} />
						) : (
							data.liabPendekRows.map(row => (
								<AccountAmtRow
									key={row.id}
									name={row.name}
									curr={row.curr}
									prev={row.prev}
									indent={1}
								/>
							))
						)}
						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 font-bold text-slate-900">
								{t('report.yayasan.total_short')}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.curr.totalLiabPendek)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.prev.totalLiabPendek)}
							</td>
						</tr>

						<tr>
							<td colSpan={3} className="px-5 py-2 pl-8 text-sm font-semibold italic text-slate-600">
								{t('report.yayasan.long_term')}
							</td>
						</tr>
						{data.liabPanjangRows.length === 0 ? (
							<AccountAmtRow name="—" curr={0} prev={0} indent={1} />
						) : (
							data.liabPanjangRows.map(row => (
								<AccountAmtRow
									key={row.id}
									name={row.name}
									curr={row.curr}
									prev={row.prev}
									indent={1}
								/>
							))
						)}
						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 font-bold text-slate-900">
								{t('report.yayasan.total_long')}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.curr.totalLiabPanjang)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.prev.totalLiabPanjang)}
							</td>
						</tr>

						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 font-bold text-slate-900">{t('report.yayasan.total_liability')}</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.curr.totalLiabilitas)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.prev.totalLiabilitas)}
							</td>
						</tr>

						<tr className="bg-slate-100/90">
							<td colSpan={3} className="px-5 py-2.5 text-sm font-bold text-slate-800">
								{t('report.yayasan.net_asset')}
							</td>
						</tr>

						<tr>
							<td colSpan={3} className="px-5 py-2 pl-8 text-sm font-semibold italic text-slate-600">
								{t('report.yayasan.unrestricted')}
							</td>
						</tr>
						<AccountAmtRow
							name={t('report.yayasan.accumulated_surplus')}
							curr={data.curr.surplusAkumulasi}
							prev={data.prev.surplusAkumulasi}
							indent={1}
						/>
						{data.ociRows.length === 0 ? (
							<AccountAmtRow
								name={t('report.yayasan.oci')}
								curr={0}
								prev={0}
								indent={1}
							/>
						) : (
							data.ociRows.map(row => (
								<AccountAmtRow
									key={row.id}
									name={row.name}
									curr={row.curr}
									prev={row.prev}
									indent={1}
								/>
							))
						)}

						<tr>
							<td colSpan={3} className="px-5 py-2 pl-8 text-sm font-semibold italic text-slate-600">
								{t('report.yayasan.restricted')}
							</td>
						</tr>
						{data.restrictedRows.length === 0 ? (
							<AccountAmtRow name="—" curr={0} prev={0} indent={1} />
						) : (
							data.restrictedRows.map(row => (
								<AccountAmtRow
									key={row.id}
									name={row.name}
									curr={row.curr}
									prev={row.prev}
									indent={1}
								/>
							))
						)}

						<tr className="border-t border-slate-100">
							<td className="px-5 py-2.5 font-bold text-slate-900">{t('report.yayasan.total_net_asset')}</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.curr.totalAsetNeto)}
							</td>
							<td className="px-5 py-2.5 text-right font-bold tabular-nums text-slate-900">
								{formatIdAmount(data.prev.totalAsetNeto)}
							</td>
						</tr>

						<tr className="border-t border-slate-200 bg-slate-50/50">
							<td className="px-5 py-3 font-extrabold text-slate-900">
								{t('report.yayasan.total_liab_net')}
							</td>
							<td className="px-5 py-3 text-right font-extrabold tabular-nums text-slate-900">
								{formatIdAmount(data.curr.totalLiabDanAsetNeto)}
							</td>
							<td className="px-5 py-3 text-right font-extrabold tabular-nums text-slate-900">
								{formatIdAmount(data.prev.totalLiabDanAsetNeto)}
							</td>
						</tr>
					</tbody>
				</table>
			</div>}

			<div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
				<p>
					{t('report.yayasan.note', { curr: currYear, prev: prevYear })}
				</p>
				<span
					className={cn(
						'inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold',
						data.seimbang
							? 'bg-emerald-100 text-emerald-800'
							: 'bg-red-100 text-red-700',
					)}
				>
					{data.seimbang ? t('report.yayasan.balanced') : t('report.yayasan.not_balanced')}
				</span>
			</div>
		</div>
	);
}
