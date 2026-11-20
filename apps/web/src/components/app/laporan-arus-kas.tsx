import { useMemo } from 'react';
import { formatAccounting, formatRupiah, isCashAccount, type AccountBalance } from '@/lib/accounting';
import { FinancialGroup, FinancialRow, FinancialTable } from '@/components/app/laporan-tampilan';
import { useLanguage } from '@/hooks/use-language';

interface FlowLine {
	row: AccountBalance;
	effect: number;
}

export function LaporanArusKas({ balances }: { balances: AccountBalance[] }) {
	const { t } = useLanguage();
	const data = useMemo(() => {
		const active = balances.filter(b => b.balance !== 0);
		const pendapatan = active.filter(b => b.account.type === 'pendapatan').reduce((sum, b) => sum + b.balance, 0);
		const beban = active.filter(b => b.account.type === 'beban').reduce((sum, b) => sum + b.balance, 0);
		const labaBersih = pendapatan - beban;
		// Perubahan tetap mengikuti perhitungan yang telah digunakan laporan ini.
		const piutang: FlowLine[] = active.filter(b => b.account.type === 'aset' && /piutang/i.test(b.account.name)).map(b => ({ row: b, effect: -b.balance }));
		const persediaan: FlowLine[] = active.filter(b => b.account.type === 'aset' && /persediaan/i.test(b.account.name)).map(b => ({ row: b, effect: -b.balance }));
		const utangUsaha: FlowLine[] = active.filter(b => b.account.type === 'liabilitas' && /utang usaha/i.test(b.account.name)).map(b => ({ row: b, effect: b.balance }));
		const asetTetap: FlowLine[] = active.filter(b => b.account.type === 'aset' && !isCashAccount(b.account) && !/piutang|persediaan/i.test(b.account.name)).map(b => ({ row: b, effect: -b.balance }));
		const pendanaan: FlowLine[] = active.filter(b => b.account.type === 'liabilitas' && !/utang usaha/i.test(b.account.name)).map(b => ({ row: b, effect: b.balance }));
		const ekuitas: FlowLine[] = active.filter(b => b.account.type === 'ekuitas').map(b => ({ row: b, effect: b.balance }));
		const kasOperasi = labaBersih + piutang.reduce((s, l) => s + l.effect, 0) + persediaan.reduce((s, l) => s + l.effect, 0) + utangUsaha.reduce((s, l) => s + l.effect, 0);
		const kasInvestasi = asetTetap.reduce((s, l) => s + l.effect, 0);
		const kasPendanaan = pendanaan.reduce((s, l) => s + l.effect, 0) + ekuitas.reduce((s, l) => s + l.effect, 0);
		const perubahanKas = kasOperasi + kasInvestasi + kasPendanaan;
		const saldoAwal = 0;
		const saldoAkhir = active.filter(b => isCashAccount(b.account)).reduce((sum, b) => sum + b.balance, 0);
		return { labaBersih, piutang, persediaan, utangUsaha, asetTetap, pendanaan, ekuitas, kasOperasi, kasInvestasi, kasPendanaan, perubahanKas, saldoAwal, saldoAkhir };
	}, [balances]);

	const hasData = data.saldoAkhir !== 0 || data.kasOperasi !== 0 || data.kasInvestasi !== 0 || data.kasPendanaan !== 0;
	if (!hasData) return <p className="px-5 py-8 text-sm text-muted-foreground">{t('report.arus_kas.empty')}</p>;

	return (
		<section className="financial-report-section">
			<div className="financial-report-heading"><h2>Laporan Arus Kas</h2></div>
			<FinancialTable>
				<FinancialGroup label={t('report.arus_kas.operating')} value={formatAccounting(data.kasOperasi)}>
					<FinancialRow label={t('report.arus_kas.net_income')} value={formatAccounting(data.labaBersih)} depth={1} />
					{[...data.piutang, ...data.persediaan].map(line => <FlowRow key={line.row.account.id} line={line} />)}
					{data.utangUsaha.map(line => <FlowRow key={line.row.account.id} line={line} liability />)}
					<FinancialRow label={t('report.arus_kas.net_operating')} value={formatAccounting(data.kasOperasi)} bold />
				</FinancialGroup>
				<FinancialGroup label={t('report.arus_kas.investing')} value={formatAccounting(data.kasInvestasi)}>
					{data.asetTetap.length ? data.asetTetap.map(line => <FlowRow key={line.row.account.id} line={line} />) : <FinancialRow label="—" value={formatAccounting(0)} depth={1} />}
					<FinancialRow label={t('report.arus_kas.net_investing')} value={formatAccounting(data.kasInvestasi)} bold />
				</FinancialGroup>
				<FinancialGroup label={t('report.arus_kas.financing')} value={formatAccounting(data.kasPendanaan)}>
					{[...data.pendanaan, ...data.ekuitas].length ? [...data.pendanaan, ...data.ekuitas].map(line => <FlowRow key={line.row.account.id} line={line} />) : <FinancialRow label="—" value={formatAccounting(0)} depth={1} />}
					<FinancialRow label={t('report.arus_kas.net_financing')} value={formatAccounting(data.kasPendanaan)} bold />
				</FinancialGroup>
				<FinancialRow label={t('report.arus_kas.net_change')} value={formatAccounting(data.perubahanKas)} bold />
				<FinancialRow label={t('report.arus_kas.opening')} value={formatRupiah(data.saldoAwal)} />
				<FinancialRow label={t('report.arus_kas.closing')} value={formatRupiah(data.saldoAkhir)} bold />
			</FinancialTable>
		</section>
	);
}

function FlowRow({ line, liability = false }: { line: FlowLine; liability?: boolean }) {
	const prefix = liability ? (line.effect < 0 ? 'Penurunan ' : 'Kenaikan ') : (line.effect < 0 ? 'Kenaikan ' : 'Penurunan ');
	return <FinancialRow label={`${prefix}${line.row.account.name}`} value={formatAccounting(line.effect)} depth={1} />;
}
