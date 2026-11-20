import { useMemo, useState } from 'react';
import { ChevronDown, Info, MessageSquarePlus } from 'lucide-react';
import {
	formatDate,
	isCurrentAsset,
	todayIso,
	type AccountBalance,
} from '@/lib/accounting';
import { cn } from '@/lib/utils';
import { FinancialAccountRows, FinancialGroup, FinancialRow, FinancialTable } from '@/components/app/laporan-tampilan';
import { useLanguage } from '@/hooks/use-language';

/** Format angka gaya Jurnal.id: 1.234.567,00 */
function formatIdAmount(value: number): string {
	return new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

type PeriodKey = 'custom' | 'this-month' | 'last-month' | 'this-year' | 'all';

function monthEnd(offset = 0): string {
	const now = new Date();
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth() + offset;
	const end = new Date(Date.UTC(y, m + 1, 0));
	return end.toISOString().slice(0, 10);
}

function yearEnd(): string {
	return `${new Date().getUTCFullYear()}-12-31`;
}

interface LaporanNeracaProps {
	balances: AccountBalance[];
	/** Nama perusahaan untuk header opsional. */
	companyName?: string;
	onExportPdf?: () => void;
}

export function LaporanNeraca({ balances, onExportPdf }: LaporanNeracaProps) {
	const { t } = useLanguage();
	const [asOf, setAsOf] = useState(todayIso());
	const [periodKey, setPeriodKey] = useState<PeriodKey>('custom');
	const [showMoreFilters, setShowMoreFilters] = useState(false);

	const applyPeriod = (key: PeriodKey) => {
		setPeriodKey(key);
		if (key === 'this-month') setAsOf(monthEnd(0));
		else if (key === 'last-month') setAsOf(monthEnd(-1));
		else if (key === 'this-year') setAsOf(yearEnd());
		else if (key === 'all') setAsOf(todayIso());
	};

	const data = useMemo(() => {
		const asetLancar = balances.filter(
			b => b.account.type === 'aset' && isCurrentAsset(b.account),
		);
		const asetTetap = balances.filter(
			b => b.account.type === 'aset' && !isCurrentAsset(b.account),
		);
		const liabilitas = balances.filter(b => b.account.type === 'liabilitas');
		const ekuitas = balances.filter(b => b.account.type === 'ekuitas');
		const pendapatan = balances
			.filter(b => b.account.type === 'pendapatan')
			.reduce((sum, b) => sum + b.balance, 0);
		const beban = balances
			.filter(b => b.account.type === 'beban')
			.reduce((sum, b) => sum + b.balance, 0);
		const labaBerjalan = pendapatan - beban;
		const oci = 0;
		const labaTahunLalu = 0;

		const totalAsetLancar = asetLancar.reduce((sum, b) => sum + b.balance, 0);
		const totalAsetTetap = asetTetap.reduce((sum, b) => sum + b.balance, 0);
		const totalAset = totalAsetLancar + totalAsetTetap;
		const totalLiabilitas = liabilitas.reduce((sum, b) => sum + b.balance, 0);
		const totalEkuitasAkun = ekuitas.reduce((sum, b) => sum + b.balance, 0);
		const totalModalPemilik = totalEkuitasAkun + oci + labaTahunLalu + labaBerjalan;
		const totalPasiva = totalLiabilitas + totalModalPemilik;

		return {
			asetLancar,
			asetTetap,
			liabilitas,
			ekuitas,
			labaBerjalan,
			oci,
			labaTahunLalu,
			totalAsetLancar,
			totalAsetTetap,
			totalAset,
			totalLiabilitas,
			totalModalPemilik,
			totalPasiva,
			seimbang: Math.round(totalAset) === Math.round(totalPasiva),
		};
	}, [balances]);

	const asOfLabel = formatDate(asOf);
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

	return (
		<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			{/* Title bar */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
				<h2 className="text-xl font-bold tracking-tight text-slate-900">
					{t('report.neraca.title')}{' '}
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
					<label className="text-xs font-medium text-slate-600" htmlFor="neraca-periode">
						{t('report.neraca.period')}
					</label>
					<input
						id="neraca-periode"
						type="date"
						value={asOf}
						onChange={e => {
							setAsOf(e.target.value);
							setPeriodKey('custom');
						}}
						className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<label className="text-xs font-medium text-slate-600" htmlFor="neraca-filter-period">
						{t('report.neraca.filter_period')}
					</label>
					<select
						id="neraca-filter-period"
						value={periodKey}
						onChange={e => applyPeriod(e.target.value as PeriodKey)}
						className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
					>
						<option value="custom">{t('report.neraca.custom')}</option>
						<option value="this-month">{t('report.neraca.this_month')}</option>
						<option value="last-month">{t('report.neraca.last_month')}</option>
						<option value="this-year">{t('report.neraca.this_year')}</option>
						<option value="all">{t('report.neraca.all')}</option>
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
					Filter tambahan akan menampilkan akun dengan saldo nol dan perbandingan periode.
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

			{/* Struktur akun mengikuti hubungan induk/sub-akun yang tersimpan. */}
			<FinancialTable amountLabel={`Saldo · ${asOfLabel}`}>
				<FinancialGroup label={t('report.neraca.asset')} value={formatIdAmount(data.totalAset)}>
					<FinancialGroup label={t('report.neraca.current_asset')} value={formatIdAmount(data.totalAsetLancar)} depth={1}>
						<FinancialAccountRows rows={data.asetLancar} context={balances} format={formatIdAmount} depth={2} />
					</FinancialGroup>
					<FinancialGroup label={t('report.neraca.fixed_asset')} value={formatIdAmount(data.totalAsetTetap)} depth={1}>
						<FinancialAccountRows rows={data.asetTetap} context={balances} format={formatIdAmount} depth={2} />
					</FinancialGroup>
					<FinancialRow label={t('report.neraca.total_asset')} value={formatIdAmount(data.totalAset)} bold />
				</FinancialGroup>
				<FinancialGroup label={t('report.neraca.liability_capital')} value={formatIdAmount(data.totalPasiva)}>
					<FinancialGroup label={t('report.neraca.liability')} value={formatIdAmount(data.totalLiabilitas)} depth={1}>
						<FinancialAccountRows rows={data.liabilitas} context={balances} format={formatIdAmount} depth={2} />
						<FinancialRow label={t('report.neraca.total_liability')} value={formatIdAmount(data.totalLiabilitas)} bold depth={1} />
					</FinancialGroup>
					<FinancialGroup label={t('report.neraca.equity')} value={formatIdAmount(data.totalModalPemilik)} depth={1}>
						<FinancialAccountRows rows={data.ekuitas} context={balances} format={formatIdAmount} depth={2} />
						<FinancialRow label={t('report.neraca.oci')} value={formatIdAmount(data.oci)} depth={2} />
						<FinancialRow label={t('report.neraca.income_last_year')} value={formatIdAmount(data.labaTahunLalu)} depth={2} />
						<FinancialRow label={t('report.neraca.income_this_period')} value={formatIdAmount(data.labaBerjalan)} depth={2} />
						<FinancialRow label={t('report.neraca.total_equity')} value={formatIdAmount(data.totalModalPemilik)} bold depth={1} />
					</FinancialGroup>
					<FinancialRow label={t('report.neraca.total_liab_equity')} value={formatIdAmount(data.totalPasiva)} bold />
				</FinancialGroup>
			</FinancialTable>

			{/* Footer note */}
			<div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
				<p>
					{t('report.neraca.note')}
				</p>
				<span
					className={cn(
						'inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold',
						data.seimbang
							? 'bg-emerald-100 text-emerald-800'
							: 'bg-red-100 text-red-700',
					)}
				>
					{data.seimbang ? t('report.neraca.balanced') : t('report.neraca.not_balanced')}
				</span>
			</div>
		</div>
	);
}
