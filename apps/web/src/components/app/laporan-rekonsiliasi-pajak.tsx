import { useMemo } from 'react';
import { formatRupiah, type AccountBalance } from '@/lib/accounting';
import { useLanguage } from '@/hooks/use-language';

const PPH_BADAN_RATE = 0.22;

export function LaporanRekonsiliasiPajak({ balances }: { balances: AccountBalance[] }) {
	const { t } = useLanguage();
	const data = useMemo(() => {
		const totalPendapatan = balances
			.filter(b => b.account.type === 'pendapatan')
			.reduce((sum, b) => sum + b.balance, 0);
		const totalBeban = balances
			.filter(b => b.account.type === 'beban')
			.reduce((sum, b) => sum + b.balance, 0);
		const labaKomersial = totalPendapatan - totalBeban;
		const koreksiPositif = 0;
		const koreksiNegatif = 0;
		const labaFiskal = labaKomersial + koreksiPositif - koreksiNegatif;
		const pphTerutang = Math.max(0, labaFiskal) * PPH_BADAN_RATE;
		return { labaKomersial, koreksiPositif, koreksiNegatif, labaFiskal, pphTerutang };
	}, [balances]);

	const rows = [
		{ label: t('report.rekonsiliasi.commercial'), value: data.labaKomersial, bold: true },
		{ label: t('report.rekonsiliasi.positive'), value: data.koreksiPositif },
		{ label: t('report.rekonsiliasi.negative'), value: -data.koreksiNegatif },
		{ label: t('report.rekonsiliasi.fiscal'), value: data.labaFiskal, bold: true },
		{ label: t('report.rekonsiliasi.corp_tax', { rate: Math.round(PPH_BADAN_RATE * 100) }), value: data.pphTerutang, bold: true },
	];

	return (
		<section className="rounded-2xl border border-border bg-card shadow-soft">
			<h2 className="border-b border-border bg-secondary px-5 py-3 text-sm font-bold">
				{t('report.rekonsiliasi.title')}
			</h2>
			<div className="px-5 py-4">
				<p className="text-sm text-muted-foreground">
					{t('report.rekonsiliasi.desc')}
				</p>
				<table className="mt-4 w-full text-sm">
					<thead>
						<tr><th className="px-3 py-3 text-left">{t('report.col.description')}</th><th className="px-3 py-3 text-right">{t('report.col.amount')}</th></tr>
					</thead>
					<tbody>
						{rows.map((row, idx) => (
							<tr
								key={idx}
								className={
									'border-b border-border/60 last:border-0 ' +
									(row.bold ? 'bg-secondary/40 font-bold' : '')
								}
							>
								<td className="px-3 py-2.5">{row.label}</td>
								<td className="px-3 py-2.5 text-right tabular-nums">
									{row.value < 0
										? `(${formatRupiah(Math.abs(row.value))})`
										: formatRupiah(row.value)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<p className="mt-4 text-xs text-muted-foreground">
					{t('report.rekonsiliasi.note')}
				</p>
			</div>
		</section>
	);
}
