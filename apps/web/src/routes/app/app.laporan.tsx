import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	computeBalances,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { useLanguage } from '@/hooks/use-language';
import { LaporanNeraca } from '@/components/app/laporan-neraca';
import { LaporanLabaRugi } from '@/components/app/laporan-laba-rugi';
import { LaporanArusKas } from '@/components/app/laporan-arus-kas';
import { LaporanBukuBesar } from '@/components/app/laporan-buku-besar';
import { LaporanLabaRugiFiskal } from '@/components/app/laporan-laba-rugi-fiskal';
import { LaporanRekonsiliasiPajak } from '@/components/app/laporan-rekonsiliasi-pajak';
import { LaporanNeracaYayasan } from '@/components/app/laporan-neraca-yayasan';
import { LaporanAktivitasYayasan } from '@/components/app/laporan-aktivitas-yayasan';
import { LaporanNeracaSaldo } from '@/components/app/laporan-neraca-saldo';
import { LaporanJurnalUmum } from '@/components/app/laporan-jurnal-umum';
import { LaporanPerubahanModal } from '@/components/app/laporan-perubahan-modal';
import { LaporanRingkasanBisnis } from '@/components/app/laporan-ringkasan-bisnis';
import { exportReportPdf } from '@/lib/pdf-print';
import {
	LAPORAN_CATEGORIES,
	LAPORAN_ITEMS,
	type LaporanCategory,
	type LaporanReportId,
} from '@/data/laporan-catalog';
import { cn } from '@/lib/utils';

const REPORT_TITLE_KEY: Record<LaporanReportId, string> = {
	'neraca': 'report.neraca.title',
	'buku-besar': 'report.buku_besar.title',
	'laba-rugi': 'report.laba_rugi.title',
	'jurnal': 'report.jurnal.title',
	'arus-kas': 'report.arus_kas.title',
	'neraca-saldo': 'report.neraca_saldo.title',
	'perubahan-modal': 'report.perubahan_modal.title',
	'ringkasan-bisnis': 'report.ringkasan_bisnis.title',
	'laba-rugi-fiskal': 'report.laba_rugi_fiskal.title',
	'rekonsiliasi-pajak': 'report.rekonsiliasi_pajak.title',
	'posisi-keuangan-yayasan': 'report.posisi_yayasan.title',
	'perubahan-aset-neto': 'report.perubahan_aset_neto.title',
};

const REPORT_DESC_KEY: Record<LaporanReportId, string> = {
	'neraca': 'report.neraca.desc',
	'buku-besar': 'report.buku_besar.desc',
	'laba-rugi': 'report.laba_rugi.desc',
	'jurnal': 'report.jurnal.desc',
	'arus-kas': 'report.arus_kas.desc',
	'neraca-saldo': 'report.neraca_saldo.desc',
	'perubahan-modal': 'report.perubahan_modal.desc',
	'ringkasan-bisnis': 'report.ringkasan_bisnis.desc',
	'laba-rugi-fiskal': 'report.laba_rugi_fiskal.desc',
	'rekonsiliasi-pajak': 'report.rekonsiliasi_pajak.desc',
	'posisi-keuangan-yayasan': 'report.posisi_yayasan.desc',
	'perubahan-aset-neto': 'report.perubahan_aset_neto.desc',
};

const CATEGORY_KEY: Record<LaporanCategory, string> = {
	'sekilas': 'report.cat.sekilas',
	'penjualan': 'report.cat.penjualan',
	'pembelian': 'report.cat.pembelian',
	'produk': 'report.cat.produk',
	'aset': 'report.cat.aset',
	'bank': 'report.cat.bank',
	'pajak': 'report.cat.pajak',
	'produksi': 'report.cat.produksi',
};

export default function AppLaporan() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { t } = useLanguage();
	const activeCompanyId = activeCompany?.id;
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [entries, setEntries] = useState<JournalEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [category, setCategory] = useState<LaporanCategory>('sekilas');
	const [activeReport, setActiveReport] = useState<LaporanReportId | null>(null);

	useEffect(() => {
		if (!activeCompanyId) {
			setAccounts([]);
			setEntries([]);
			setLoadError(false);
			return;
		}
		let cancelled = false;
		setIsLoading(true);
		setLoadError(false);
		setAccounts([]);
		setEntries([]);
		const filter = pb.filter('company = {:company}', { company: activeCompanyId });
		Promise.all([
			pb.collection('accounts').getFullList<Account>({ filter, sort: 'code', requestKey: null }),
			pb.collection('entries').getFullList<JournalEntry>({ filter, requestKey: null }),
		])
			.then(([accountList, entryList]) => {
				if (cancelled) return;
				setAccounts(accountList);
				setEntries(entryList);
			})
			.catch(() => {
				if (!cancelled) setLoadError(true);
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompanyId, loadAttempt]);

	const balances = useMemo(
		() => computeBalances(accounts, entries, activeCompany?.conversion_date),
		[accounts, entries, activeCompany?.conversion_date],
	);

	// Perbarui akun lokal saat pemetaan PSAK 118 diubah dari manajer pemetaan,
	// agar laporan langsung memakai kategori baru tanpa perlu memuat ulang.
	const updateAccount = useCallback((id: string, patch: Partial<Account>) => {
		setAccounts(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
	}, []);

	const visibleItems = useMemo(
		() => LAPORAN_ITEMS.filter(item => item.categories.includes(category)),
		[category],
	);

	const currentMeta = activeReport
		? LAPORAN_ITEMS.find(i => i.id === activeReport)
		: null;

	if (!activeCompany) {
		return <NoCompany />;
	}

	const handleExportPdf = () => {
		if (!activeReport || !currentMeta || isLoading || loadError) return;
		exportReportPdf({
			company: activeCompany,
			reportId: activeReport,
			reportTitle: currentMeta.title,
			balances,
			accounts,
			entries,
		});
	};

	const renderReport = () => {
		if (!activeReport) return null;
		switch (activeReport) {
			case 'neraca':
				return (
					<LaporanNeraca
						balances={balances}
						companyName={activeCompany.name}
						onExportPdf={handleExportPdf}
					/>
				);
			case 'laba-rugi':
				return <LaporanLabaRugi balances={balances} onAccountUpdated={updateAccount} />;
			case 'arus-kas':
				return <LaporanArusKas balances={balances} />;
			case 'buku-besar':
				return (
					<LaporanBukuBesar
						accounts={accounts}
						entries={entries}
						conversionDate={activeCompany.conversion_date}
					/>
				);
			case 'jurnal':
				return (
					<LaporanJurnalUmum
						accounts={accounts}
						entries={entries}
						conversionDate={activeCompany.conversion_date}
					/>
				);
			case 'neraca-saldo':
				return <LaporanNeracaSaldo balances={balances} />;
			case 'perubahan-modal':
				return <LaporanPerubahanModal balances={balances} />;
			case 'ringkasan-bisnis':
				return (
					<LaporanRingkasanBisnis
						balances={balances}
						accounts={accounts}
						entries={entries}
						conversionDate={activeCompany.conversion_date}
					/>
				);
			case 'laba-rugi-fiskal':
				return <LaporanLabaRugiFiskal balances={balances} />;
			case 'rekonsiliasi-pajak':
				return <LaporanRekonsiliasiPajak balances={balances} />;
			case 'posisi-keuangan-yayasan':
				return (
					<LaporanNeracaYayasan
						balances={balances}
						entityName={activeCompany.name}
						accounts={accounts}
						entries={entries}
						conversionDate={activeCompany.conversion_date}
						onExportPdf={handleExportPdf}
					/>
				);
			case 'perubahan-aset-neto':
				return (
					<LaporanAktivitasYayasan
						balances={balances}
						entityName={activeCompany.name}
						accounts={accounts}
						entries={entries}
						conversionDate={activeCompany.conversion_date}
						onExportPdf={handleExportPdf}
					/>
				);
			default:
				return null;
		}
	};

	/* ——— Detail view: one report ——— */
	if (activeReport && currentMeta) {
			const isNeracaStyle =
			activeReport === 'neraca' ||
			activeReport === 'posisi-keuangan-yayasan' ||
			activeReport === 'perubahan-aset-neto';
		return (
			<div className="flex flex-col gap-4">
				<header className="flex flex-wrap items-center justify-between gap-3">
					<button
						type="button"
						onClick={() => setActiveReport(null)}
						className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
					>
						<ArrowLeft className="size-4" />
						{t('report.back')}
					</button>
					{!isNeracaStyle ? (
						<button
							type="button"
							onClick={handleExportPdf}
							disabled={isLoading || loadError}
							className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary/5 disabled:opacity-50"
						>
							<Printer className="size-4" />
							{t('report.export_pdf')}
						</button>
					) : null}
				</header>

				{!isNeracaStyle ? (
					<div className="pb-1">
						<h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
							{t(REPORT_TITLE_KEY[activeReport])}
						</h1>
						<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
							{t(REPORT_DESC_KEY[activeReport])}
						</p>
					</div>
				) : null}

				{isLoading ? (
					<p className="text-sm font-semibold text-muted-foreground">{t('report.loading')}</p>
				) : loadError ? (
					<div role="alert" className="rounded-lg border border-border bg-white px-5 py-4 text-sm">
						<p>{t('report.load_error')}</p>
						<button type="button" onClick={() => setLoadAttempt(value => value + 1)} className="mt-2 font-semibold text-primary hover:underline">{t('report.retry')}</button>
					</div>
				) : (
					<div className="report-print-root">{renderReport()}</div>
				)}
			</div>
		);
	}

	/* ——— Hub view: catalog like Jurnal.id ——— */
	return (
		<div className="flex flex-col gap-0">
			<header className="pb-2">
				<h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
					{t('report.title')}
				</h1>
			</header>

			{/* Category tabs */}
			<nav
				className="mt-4 flex gap-0 overflow-x-auto border-b border-border"
				aria-label="Kategori laporan"
			>
				{LAPORAN_CATEGORIES.map(cat => {
					const active = category === cat.key;
					return (
						<button
							key={cat.key}
							type="button"
							onClick={() => setCategory(cat.key)}
							className={cn(
								'relative shrink-0 px-4 py-3 text-sm font-medium transition-colors',
								active
									? 'text-primary'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							{t(CATEGORY_KEY[cat.key])}
							{active ? (
								<span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
							) : null}
						</button>
					);
				})}
			</nav>

			{/* Report cards grid */}
			<div className="mt-8 grid gap-x-12 gap-y-10 md:grid-cols-2">
				{visibleItems.map(item => (
					<article key={item.id} className="flex flex-col gap-3">
						<h2 className="text-base font-bold text-foreground">{t(REPORT_TITLE_KEY[item.id])}</h2>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{t(REPORT_DESC_KEY[item.id])}
						</p>
						<div>
							<button
								type="button"
								onClick={() => setActiveReport(item.id)}
								className="mt-1 inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
							>
								{t('report.view_report')}
							</button>
						</div>
					</article>
				))}
			</div>

			{visibleItems.length === 0 ? (
				<p className="mt-8 text-sm text-muted-foreground">
					{t('report.no_reports')}
				</p>
			) : null}
		</div>
	);
}
