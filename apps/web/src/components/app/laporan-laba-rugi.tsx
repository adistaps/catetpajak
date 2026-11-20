import { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { formatRupiah, type Account, type AccountBalance } from '@/lib/accounting';
import { buildPsakGroups, type PsakCategory, type PsakGroup } from '@/lib/psak118';
import { cn } from '@/lib/utils';
import { Psak118MappingManager } from '@/components/app/psak118-mapping-manager';
import { FinancialAccountRows, FinancialGroup, FinancialRow, FinancialTable } from '@/components/app/laporan-tampilan';
import { useLanguage } from '@/hooks/use-language';

type ReportType = 'default' | 'psak118';

function formatSigned(value: number): string {
	return value < 0 ? `(${formatRupiah(Math.abs(value))})` : formatRupiah(value);
}

function formatExpense(value: number): string {
	return `(${formatRupiah(value)})`;
}

interface LaporanLabaRugiProps {
	balances: AccountBalance[];
	onAccountUpdated?: (id: string, patch: Partial<Account>) => void;
}

export function LaporanLabaRugi({ balances, onAccountUpdated }: LaporanLabaRugiProps) {
	const { t } = useLanguage();
	const [reportType, setReportType] = useState<ReportType>('default');
	const [showMapping, setShowMapping] = useState(false);

	const defaultData = useMemo(() => {
		const pendapatan = balances.filter(b => b.account.type === 'pendapatan' && b.balance !== 0);
		const beban = balances.filter(b => b.account.type === 'beban' && b.balance !== 0);
		const totalPendapatan = pendapatan.reduce((sum, b) => sum + b.balance, 0);
		const totalBeban = beban.reduce((sum, b) => sum + b.balance, 0);
		return { pendapatan, beban, totalPendapatan, totalBeban, labaBersih: totalPendapatan - totalBeban };
	}, [balances]);

	const psakData = useMemo(() => {
		const groups = buildPsakGroups(balances);
		const labaOperasi = groups.operasi.net;
		const labaSebelumPendanaanPajak = labaOperasi + groups.investasi.net;
		const labaSebelumPajak = labaSebelumPendanaanPajak + groups.pendanaan.net;
		const labaBersih = labaSebelumPajak - groups.pajak.beban.reduce((s, b) => s + b.balance, 0);
		return { groups, labaOperasi, labaSebelumPendanaanPajak, labaSebelumPajak, labaBersih };
	}, [balances]);
	const mappingAccounts = useMemo(
		() => balances.map(b => b.account).filter(a => a.type === 'pendapatan' || a.type === 'beban').sort((a, b) => a.code.localeCompare(b.code, 'id')),
		[balances],
	);
	const isEmpty = defaultData.pendapatan.length === 0 && defaultData.beban.length === 0;

	return (
		<section className="financial-report-section">
			<div className="financial-report-heading flex flex-wrap items-center justify-between gap-3">
				<h2>{t('report.laba_rugi.title')} {reportType === 'psak118' ? <span className="ml-2 text-xs font-semibold text-muted-foreground">{t('report.laba_rugi.psak118')}</span> : null}</h2>
				<div className="flex flex-wrap items-center gap-2">
					{reportType === 'psak118' ? (
						<button type="button" onClick={() => setShowMapping(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5">
							<SlidersHorizontal className="size-3.5" /> {t('report.laba_rugi.mapping')}
						</button>
					) : null}
					<div className="inline-flex rounded-lg border border-border bg-white p-0.5 text-xs font-semibold">
						{([{ key: 'default', label: t('report.laba_rugi.default') }, { key: 'psak118', label: t('report.laba_rugi.psak118') }] as const).map(option => (
							<button key={option.key} type="button" onClick={() => setReportType(option.key)} className={cn('rounded-md px-3 py-1.5 transition-colors', reportType === option.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
								{option.label}
							</button>
						))}
					</div>
				</div>
			</div>
			{isEmpty ? <p className="px-5 py-8 text-sm text-muted-foreground">{t('report.laba_rugi.empty')}</p> : reportType === 'default' ? (
				<FinancialTable>
					<FinancialGroup label={t('report.laba_rugi.revenue')} value={formatRupiah(defaultData.totalPendapatan)}>
						{defaultData.pendapatan.length ? <FinancialAccountRows rows={defaultData.pendapatan} context={balances} format={formatRupiah} /> : <FinancialRow label="—" depth={1} />}
						<FinancialRow label={t('report.laba_rugi.total_revenue')} value={formatRupiah(defaultData.totalPendapatan)} bold />
					</FinancialGroup>
					<FinancialGroup label={t('report.laba_rugi.expense')} value={formatExpense(defaultData.totalBeban)}>
						{defaultData.beban.length ? <FinancialAccountRows rows={defaultData.beban} context={balances} format={formatExpense} /> : <FinancialRow label="—" depth={1} />}
						<FinancialRow label={t('report.laba_rugi.total_expense')} value={formatExpense(defaultData.totalBeban)} bold />
					</FinancialGroup>
					<FinancialRow label={defaultData.labaBersih >= 0 ? t('report.laba_rugi.net_income') : t('report.laba_rugi.net_loss')} value={formatSigned(defaultData.labaBersih)} bold />
				</FinancialTable>
			) : <Psak118View data={psakData} balances={balances} />}
			{reportType === 'psak118' ? <Psak118MappingManager accounts={mappingAccounts} open={showMapping} onOpenChange={setShowMapping} onAccountUpdated={onAccountUpdated} /> : null}
		</section>
	);
}

function Psak118View({ data, balances }: {
	data: { groups: Record<PsakCategory, PsakGroup>; labaOperasi: number; labaSebelumPendanaanPajak: number; labaSebelumPajak: number; labaBersih: number };
	balances: AccountBalance[];
}) {
	const { t } = useLanguage();
	const { groups } = data;
	return (
		<>
			<FinancialTable>
				<FinancialGroup label={t('report.laba_rugi.operasi')} value={formatSigned(groups.operasi.net)}>
					{groups.operasi.pendapatan.length ? <FinancialAccountRows rows={groups.operasi.pendapatan} context={balances} format={formatRupiah} /> : <FinancialRow label="—" depth={1} />}
					{groups.operasi.beban.length ? <FinancialAccountRows rows={groups.operasi.beban} context={balances} format={formatExpense} /> : <FinancialRow label="—" depth={1} />}
				</FinancialGroup>
				<FinancialRow label={t('report.laba_rugi.operating_income')} value={formatSigned(data.labaOperasi)} bold />
				<FinancialGroup label={t('report.laba_rugi.investasi')} value={formatSigned(groups.investasi.net)}>
					{groups.investasi.pendapatan.length ? <FinancialAccountRows rows={groups.investasi.pendapatan} context={balances} format={formatRupiah} /> : <FinancialRow label="—" depth={1} />}
					{groups.investasi.beban.length ? <FinancialAccountRows rows={groups.investasi.beban} context={balances} format={formatExpense} /> : <FinancialRow label="—" depth={1} />}
				</FinancialGroup>
				<FinancialRow label={t('report.laba_rugi.before_finance_tax')} value={formatSigned(data.labaSebelumPendanaanPajak)} bold />
				<FinancialGroup label={t('report.laba_rugi.pendanaan')} value={formatSigned(groups.pendanaan.net)}>
					{groups.pendanaan.pendapatan.length ? <FinancialAccountRows rows={groups.pendanaan.pendapatan} context={balances} format={formatRupiah} /> : <FinancialRow label="—" depth={1} />}
					{groups.pendanaan.beban.length ? <FinancialAccountRows rows={groups.pendanaan.beban} context={balances} format={formatExpense} /> : <FinancialRow label="—" depth={1} />}
				</FinancialGroup>
				<FinancialRow label={t('report.laba_rugi.before_tax')} value={formatSigned(data.labaSebelumPajak)} bold />
				{groups.pajak.beban.length > 0 ? (
					<FinancialGroup label={t('report.laba_rugi.pajak')} value={formatExpense(groups.pajak.beban.reduce((sum, row) => sum + row.balance, 0))}>
						<FinancialAccountRows rows={groups.pajak.beban} context={balances} format={formatExpense} />
					</FinancialGroup>
				) : null}
				<FinancialRow label={t('report.laba_rugi.result')} value={formatSigned(data.labaBersih)} bold />
			</FinancialTable>
			<p className="financial-report-note">Disajikan mengikuti PSAK 118: Pengelompokan operasi, investasi, dan pendanaan dengan subtotal laba (rugi) operasi, laba (rugi) sebelum pendanaan dan pajak penghasilan, serta laba (rugi). Pemetaan akun dapat diatur melalui tombol “Atur pemetaan akun”. Pinjaman pokok bukan pos laba rugi dan tidak dimasukkan.</p>
		</>
	);
}
