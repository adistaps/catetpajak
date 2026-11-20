import { useMemo, useState } from 'react';
import { Info, TrendingUp } from 'lucide-react';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Account, JournalEntry } from '@/lib/accounting';
import { buildRatioCategories, type RatioResult } from '@/lib/financial-ratios';
import {
	buildProjection,
	GROWTH_LABELS,
	type GrowthKey,
	type ProjectionResult,
} from '@/lib/financial-projection';

interface YearColumn {
	year: number;
	isActual: boolean;
	byId: Map<string, RatioResult>;
}

function formatPercent(value: number): string {
	const formatted = new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(value * 100);
	return `${formatted}%`;
}

function GrowthAssumptions({ projection }: { projection: ProjectionResult }) {
	const entries = Object.entries(projection.growth) as [GrowthKey, number | null | undefined][];
	const visible = entries.filter(([, value]) => value !== undefined);
	if (visible.length === 0) return null;

	return (
		<details className="group rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs">
			<summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-foreground">
				<Info className="size-3.5 text-muted-foreground" />
				Asumsi pertumbuhan (rata-rata YoY historis)
			</summary>
			<div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
				{visible.map(([key, value]) => (
					<div key={key} className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">{GROWTH_LABELS[key]}</span>
						<span className="font-medium tabular-nums text-foreground">
							{value == null ? 'Tetap (0%)' : formatPercent(value)}
						</span>
					</div>
				))}
			</div>
			<p className="mt-3 leading-relaxed text-muted-foreground">
				Figur dengan pertumbuhan tak terhitung (selalu nol atau tanpa pasangan YoY) ditahan
				tetap dengan asumsi 0%. Ubah asumsi dengan mencatat transaksi aktual pada tahun-tahun
				berikutnya — proyeksi menyesuaikan data historis terbaru.
			</p>
		</details>
	);
}

export function DashboardRatioProjection({
	accounts,
	entries,
	conversionDate,
}: {
	accounts: Account[];
	entries: JournalEntry[];
	conversionDate?: string | null;
}) {
	const [showAllHistory, setShowAllHistory] = useState(false);
	const projection = useMemo(
		() => buildProjection(accounts, entries, conversionDate),
		[accounts, entries, conversionDate],
	);

	const { columns, categories } = useMemo(() => {
		// Batasi tahun aktual yang ditampilkan agar tabel tetap lega; pengguna
		// dapat memperluas untuk melihat seluruh riwayat.
		const historyShown = showAllHistory
			? projection.history
			: projection.history.slice(-2);

		const all = [...historyShown, ...projection.projected];
		const cols: YearColumn[] = all.map(yf => {
			const cats = buildRatioCategories(yf.figures);
			const byId = new Map<string, RatioResult>();
			for (const c of cats) {
				for (const r of c.ratios) byId.set(r.id, r);
			}
			return { year: yf.year, isActual: yf.isActual, byId };
		});

		// Struktur kategori & urutan rasio diambil dari tahun dasar aktual.
		const baseFigures =
			projection.history[projection.history.length - 1]?.figures ?? all[0]?.figures;
		const cats = baseFigures ? buildRatioCategories(baseFigures) : [];

		return { columns: cols, categories: cats };
	}, [projection, showAllHistory]);

	const hasAnyData = accounts.length > 0;

	return (
		<section className="rounded-2xl border border-border bg-card shadow-soft">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<TrendingUp className="size-4 text-primary" />
						<h2 className="text-base font-bold tracking-tight text-foreground">
							Proyeksi Rasio Keuangan — 3 Tahun ke Depan
						</h2>
					</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Perbandingan data historis aktual dengan proyeksi berbasis tren pertumbuhan
						rata-rata tahunan.
					</p>
				</div>
				{projection.canProject && projection.history.length > 2 ? (
					<button
						type="button"
						onClick={() => setShowAllHistory(v => !v)}
						className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
					>
						{showAllHistory ? 'Ringkas' : `Tampilkan ${projection.history.length} tahun`}
					</button>
				) : null}
			</div>

			{!hasAnyData ? (
				<div className="px-5 py-10 text-center">
					<p className="text-sm text-muted-foreground">
						Belum ada bagan akun untuk perusahaan ini.{' '}
						<span className="font-medium">
							Buat akun dan catat transaksi agar proyeksi rasio dapat dihitung.
						</span>
					</p>
				</div>
			) : !projection.canProject ? (
				<div className="mx-5 my-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
					<p className="text-sm font-semibold text-amber-800">Proyeksi belum tersedia</p>
					<p className="mt-1 text-xs leading-relaxed text-amber-700">
						{projection.reason}
					</p>
					<p className="mt-2 text-xs leading-relaxed text-amber-700/80">
						Data yang diperlukan: minimal 2 tahun transaksi aktual (pendapatan, beban,
						dan posisi neraca) agar tren pertumbuhan tahunan dapat diturunkan secara
						transparan — tanpa mengarang angka.
					</p>
				</div>
			) : (
				<div className="px-5 py-4">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[640px] border-collapse text-sm">
							<thead>
								<tr>
									<th className="sticky left-0 z-10 bg-card px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										Rasio
									</th>
									{columns.map(col => (
										<th
											key={col.year}
											className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide"
										>
											<span
												className={
													col.isActual
														? 'text-foreground'
														: 'text-primary'
												}
											>
												{col.year}
											</span>
											<span
												className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
													col.isActual
														? 'bg-muted text-muted-foreground'
														: 'border border-dashed border-primary/50 bg-primary/10 text-primary'
												}`}
											>
												{col.isActual ? 'Aktual' : 'Proyeksi'}
											</span>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{categories.map(category => (
									<CategoryRows
										key={category.id}
										title={category.title}
										ratios={category.ratios}
										columns={columns}
									/>
								))}
							</tbody>
						</table>
					</div>

					<div className="mt-4">
						<GrowthAssumptions projection={projection} />
					</div>

					<p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
						Metode: posisi neraca per akhir tahun & arus laba rugi tahunan dihitung dari
						transaksi aktual; asumsi pertumbuhan = rata-rata YoY historis per figur;
						proyeksi menggandakan asumsi selama 3 tahun. Kolom <span className="font-semibold">Aktual</span>{' '}
						berbasis data tercatat; kolom <span className="font-semibold">Proyeksi</span>{' '}
						berbasis asumsi tren dan bukan jaminan hasil masa depan.
					</p>
				</div>
			)}
		</section>
	);
}

function CategoryRows({
	title,
	ratios,
	columns,
}: {
	title: string;
	ratios: RatioResult[];
	columns: YearColumn[];
}) {
	return (
		<>
			<tr>
				<td
					colSpan={columns.length + 1}
					className="border-t border-border bg-muted/30 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
				>
					{title}
				</td>
			</tr>
			{ratios.map(ratio => (
				<tr key={ratio.id} className="border-b border-border/60 last:border-b-0">
					<td className="sticky left-0 z-10 bg-card px-2 py-2">
						<div className="flex items-center gap-1.5">
							<span className="truncate text-sm text-foreground">{ratio.name}</span>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											type="button"
											className="shrink-0 text-muted-foreground/70 transition hover:text-primary"
											aria-label={`Rumus ${ratio.name}`}
										>
											<Info className="size-3.5" />
										</button>
									</TooltipTrigger>
									<TooltipContent className="max-w-[16rem] text-xs">
										<p className="font-semibold">Rumus</p>
										<p className="mt-0.5">{ratio.formula}</p>
										<p className="mt-1.5 text-muted-foreground">
											{ratio.interpretation}
										</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</td>
					{columns.map(col => {
						const cell = col.byId.get(ratio.id);
						return (
							<td key={col.year} className="px-2 py-2 text-right">
								{cell?.available ? (
									<span
										className={`tabular-nums ${
											col.isActual
												? 'text-foreground'
												: 'italic text-primary/90'
										}`}
									>
										{cell.value}
									</span>
								) : (
									<span
										className="text-xs text-amber-600/80"
										title={cell?.reason ?? 'Data belum mencukupi'}
									>
										—
									</span>
								)}
							</td>
						);
					})}
				</tr>
			))}
		</>
	);
}
