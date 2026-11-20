import { useMemo } from 'react';
import { formatRupiah, type AccountBalance } from '@/lib/accounting';
import { FinancialAccountRows, FinancialGroup, FinancialRow, FinancialTable } from '@/components/app/laporan-tampilan';
import { useLanguage } from '@/hooks/use-language';

const PPH_BADAN_RATE = 0.22;

export function LaporanLabaRugiFiskal({ balances }: { balances: AccountBalance[] }) {
	const { t } = useLanguage();
	const data = useMemo(() => {
		const pendapatan = balances.filter(b => b.account.type === 'pendapatan' && b.balance !== 0);
		const beban = balances.filter(b => b.account.type === 'beban' && b.balance !== 0);
		const totalPendapatan = pendapatan.reduce((sum, b) => sum + b.balance, 0);
		const totalBeban = beban.reduce((sum, b) => sum + b.balance, 0);
		const labaKomersial = totalPendapatan - totalBeban;
		// Koreksi fiskal belum tersimpan data — tampilkan kerangka rekonsiliasi.
		const koreksiPositif = 0;
		const koreksiNegatif = 0;
		const labaFiskal = labaKomersial + koreksiPositif - koreksiNegatif;
		const pphTerutang = Math.max(0, labaFiskal) * PPH_BADAN_RATE;
		return {
			pendapatan,
			beban,
			totalPendapatan,
			totalBeban,
			labaKomersial,
			koreksiPositif,
			koreksiNegatif,
			labaFiskal,
			pphTerutang,
		};
	}, [balances]);

	if (data.pendapatan.length === 0 && data.beban.length === 0) {
		return (
			<p className="rounded-2xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
				{t('report.laba_rugi_fiskal.empty')}
			</p>
		);
	}

	const signed = (value: number) => value < 0 ? `(${formatRupiah(Math.abs(value))})` : formatRupiah(value);
	const expense = (value: number) => `(${formatRupiah(value)})`;
	return (
		<section className="financial-report-section">
			<div className="financial-report-heading"><h2>{t('report.laba_rugi_fiskal.title')}</h2></div>
			<FinancialTable>
				<FinancialGroup label={t('report.laba_rugi.revenue')} value={formatRupiah(data.totalPendapatan)}>
					{data.pendapatan.length ? <FinancialAccountRows rows={data.pendapatan} context={balances} format={formatRupiah} /> : <FinancialRow label="—" depth={1} />}
					<FinancialRow label={t('report.laba_rugi.total_revenue')} value={formatRupiah(data.totalPendapatan)} bold />
				</FinancialGroup>
				<FinancialGroup label={t('report.laba_rugi.expense')} value={expense(data.totalBeban)}>
					{data.beban.length ? <FinancialAccountRows rows={data.beban} context={balances} format={expense} /> : <FinancialRow label="—" depth={1} />}
					<FinancialRow label={t('report.laba_rugi.total_expense')} value={expense(data.totalBeban)} bold />
				</FinancialGroup>
				<FinancialRow label={t('report.laba_rugi_fiskal.commercial_income')} value={signed(data.labaKomersial)} bold />
				<FinancialGroup label={t('report.laba_rugi_fiskal.fiscal_correction')}>
					<FinancialRow label={t('report.laba_rugi_fiskal.positive_correction')} value={formatRupiah(data.koreksiPositif)} depth={1} />
					<FinancialRow label={t('report.laba_rugi_fiskal.negative_correction')} value={expense(data.koreksiNegatif)} depth={1} />
				</FinancialGroup>
				<FinancialRow label={t('report.laba_rugi_fiskal.taxable_income')} value={signed(data.labaFiskal)} bold />
				<FinancialRow label={t('report.laba_rugi_fiskal.corp_tax')} value={formatRupiah(data.pphTerutang)} bold />
			</FinancialTable>
			<p className="financial-report-note">{t('report.laba_rugi_fiskal.note')}</p>
		</section>
	);
}
