import { useMemo } from 'react';
import { formatRupiah, type AccountBalance } from '@/lib/accounting';
import { FinancialAccountRows, FinancialGroup, FinancialRow, FinancialTable } from '@/components/app/laporan-tampilan';
import { useLanguage } from '@/hooks/use-language';

export function LaporanPerubahanModal({ balances }: { balances: AccountBalance[] }) {
	const { t } = useLanguage();
	const data = useMemo(() => {
		const ekuitas = balances.filter(b => b.account.type === 'ekuitas' && b.balance !== 0);
		const pendapatan = balances.filter(b => b.account.type === 'pendapatan').reduce((s, b) => s + b.balance, 0);
		const beban = balances.filter(b => b.account.type === 'beban').reduce((s, b) => s + b.balance, 0);
		const labaBerjalan = pendapatan - beban;
		const totalEkuitasAwal = ekuitas.reduce((s, b) => s + b.balance, 0);
		// Saldo ekuitas saat ini dianggap saldo awal seperti pada laporan sebelumnya.
		const modalAwal = totalEkuitasAwal;
		const modalAkhir = totalEkuitasAwal + labaBerjalan;
		return { ekuitas, labaBerjalan, modalAwal, modalAkhir };
	}, [balances]);
	if (data.ekuitas.length === 0 && data.labaBerjalan === 0) return <p className="px-5 py-8 text-sm text-muted-foreground">{t('report.perubahan_modal.empty')}</p>;
	return (
		<section className="financial-report-section">
			<div className="financial-report-heading"><h2>{t('report.perubahan_modal.title')}</h2></div>
			<FinancialTable>
				<FinancialGroup label={t('report.perubahan_modal.opening')} value={formatRupiah(data.modalAwal)}>
					<FinancialAccountRows rows={data.ekuitas} context={balances} format={formatRupiah} />
				</FinancialGroup>
				<FinancialRow label={data.labaBerjalan >= 0 ? t('report.perubahan_modal.income') : t('report.perubahan_modal.loss')} value={data.labaBerjalan >= 0 ? formatRupiah(data.labaBerjalan) : `(${formatRupiah(Math.abs(data.labaBerjalan))})`} />
				<FinancialRow label={t('report.perubahan_modal.closing')} value={formatRupiah(data.modalAkhir)} bold />
			</FinancialTable>
		</section>
	);
}
