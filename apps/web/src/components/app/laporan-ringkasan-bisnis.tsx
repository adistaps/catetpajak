import { useMemo } from 'react';
import {
	formatRupiah,
	isCashAccount,
	type Account,
	type AccountBalance,
	type JournalEntry,
} from '@/lib/accounting';
import { DashboardRatioAnalysis } from '@/components/app/dashboard-ratio-analysis';
import { DashboardRatioProjection } from '@/components/app/dashboard-ratio-projection';
import { FinancialRow, FinancialTable } from '@/components/app/laporan-tampilan';
import { useLanguage } from '@/hooks/use-language';

export function LaporanRingkasanBisnis({
	balances,
	accounts,
	entries,
	conversionDate,
}: {
	balances: AccountBalance[];
	accounts: Account[];
	entries: JournalEntry[];
	conversionDate?: string | null;
}) {
	const { t } = useLanguage();
	const data = useMemo(() => {
		const sum = (type: string) =>
			balances
				.filter(b => b.account.type === type)
				.reduce((s, b) => s + b.balance, 0);
		const pendapatan = sum('pendapatan');
		const beban = sum('beban');
		const laba = pendapatan - beban;
		const aset = sum('aset');
		const liabilitas = sum('liabilitas');
		const ekuitas = sum('ekuitas') + laba;
		const kas = balances
			.filter(b => isCashAccount(b.account))
			.reduce((s, b) => s + b.balance, 0);
		const margin = pendapatan > 0 ? (laba / pendapatan) * 100 : 0;
		return { pendapatan, beban, laba, aset, liabilitas, ekuitas, kas, margin };
	}, [balances]);

	const cards = [
		{ label: t('report.ringkasan.revenue'), value: formatRupiah(data.pendapatan) },
		{ label: t('report.ringkasan.expense'), value: formatRupiah(data.beban) },
		{
			label: data.laba >= 0 ? t('report.ringkasan.net_income') : t('report.ringkasan.net_loss'),
			value:
				data.laba >= 0
					? formatRupiah(data.laba)
					: `(${formatRupiah(Math.abs(data.laba))})`,
			primary: true,
		},
		{ label: t('report.ringkasan.margin'), value: `${data.margin.toFixed(1)}%` },
		{ label: t('report.ringkasan.total_asset'), value: formatRupiah(data.aset) },
		{ label: t('report.ringkasan.total_liability'), value: formatRupiah(data.liabilitas) },
		{ label: t('report.ringkasan.total_equity'), value: formatRupiah(data.ekuitas) },
		{ label: t('report.ringkasan.cash'), value: formatRupiah(data.kas) },
	];

	return (
		<section className="flex flex-col gap-4">
			<h2 className="financial-report-heading text-sm font-bold">{t('report.ringkasan_bisnis.title')}</h2>
			<FinancialTable>
				{cards.map(card => (
					<FinancialRow key={card.label} label={card.label} value={card.value} bold={card.primary} />
				))}
			</FinancialTable>

			<DashboardRatioAnalysis
				accounts={accounts}
				entries={entries}
				conversionDate={conversionDate}
			/>

			<DashboardRatioProjection
				accounts={accounts}
				entries={entries}
				conversionDate={conversionDate}
			/>
		</section>
	);
}
