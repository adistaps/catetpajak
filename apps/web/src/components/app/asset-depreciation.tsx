import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Trash2, TrendingDown, Scale } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	formatDate,
	formatRupiah,
	todayIso,
	type Account,
	type AccountType,
	type Company,
} from '@/lib/accounting';
import {
	bookValue,
	METHOD_LABELS,
	METHOD_SHORT,
	periodLabel,
	productionPerUnit,
	reducingBalanceAmount,
	straightLineMonthly,
	type AssetRevaluation,
	type Depreciation,
	type FixedAsset,
} from '@/lib/depreciation';
import { NoCompany } from '@/components/app/no-company';
import { ImportExportBar } from '@/components/app/import-export-bar';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

const ASSET_EXPORT_HEADERS = [
	'Nama',
	'Harga Perolehan',
	'Nilai Residu',
	'Tgl Perolehan',
	'Metode',
	'Umur Ekonomis',
	'Tarif (%)',
	'Kapasitas Produksi',
	'Kode Akun Aset',
	'Kode Akun Beban',
	'Kode Akun Akumulasi',
];

function parseMethod(raw: string): 'straight_line' | 'reducing_balance' | 'production' {
	const v = raw.toLowerCase().trim();
	if (v === 'straight_line' || v.includes('straight')) return 'straight_line';
	if (v === 'reducing_balance' || v.includes('reducing')) return 'reducing_balance';
	if (v === 'production' || v.includes('produksi') || v.includes('unit')) return 'production';
	return 'straight_line';
}

function findAccountByName(accounts: Account[], pattern: RegExp): string {
	const found = accounts.find(a => pattern.test(a.name));
	return found?.id ?? '';
}

function accumulatedFor(assetId: string, depreciations: Depreciation[]): number {
	return depreciations
		.filter(d => d.fixed_asset === assetId)
		.reduce((sum, d) => sum + (d.amount || 0), 0);
}

interface AssetDepreciationProps {
	activeCompany: Company | null;
	/** Sembunyikan header besar bila ditanam di tab Manajemen Aset. */
	embedded?: boolean;
}

export function AssetDepreciation({ activeCompany, embedded = false }: AssetDepreciationProps) {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [assets, setAssets] = useState<FixedAsset[]>([]);
	const [depreciations, setDepreciations] = useState<Depreciation[]>([]);
	const [revaluations, setRevaluations] = useState<AssetRevaluation[]>([]);

	// Dialog penyusutan
	const [postAsset, setPostAsset] = useState<FixedAsset | null>(null);
	const [postDate, setPostDate] = useState(todayIso());
	const [postUnits, setPostUnits] = useState('');
	const [postError, setPostError] = useState('');
	const [isPosting, setIsPosting] = useState(false);

	const [historyAsset, setHistoryAsset] = useState<FixedAsset | null>(null);

	// Dialog revaluasi aset
	const [revalueAsset, setRevalueAsset] = useState<FixedAsset | null>(null);
	const [revalueDate, setRevalueDate] = useState(todayIso());
	const [revalueNewValue, setRevalueNewValue] = useState('');
	const [revalueAccount, setRevalueAccount] = useState('');
	const [revalueError, setRevalueError] = useState('');
	const [isRevaluing, setIsRevaluing] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setAccounts([]);
			setAssets([]);
			setDepreciations([]);
			setRevaluations([]);
			return;
		}
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		Promise.all([
			pb.collection('accounts').getFullList<Account>({ filter: companyFilter, sort: 'code' }),
			pb.collection('fixed_assets').getFullList<FixedAsset>({
				filter: companyFilter,
				sort: '-created',
				expand: 'asset_account,expense_account,accum_dep_account',
			}),
			pb.collection('depreciations').getFullList<Depreciation>({
				filter: companyFilter,
				sort: '-date,-created',
			}),
			pb.collection('asset_revaluations').getFullList<AssetRevaluation>({
				filter: companyFilter,
				sort: '-date,-created',
				expand: 'revaluation_account',
			}),
		])
			.then(([accountList, assetList, depList, revList]) => {
				if (cancelled) return;
				setAccounts(accountList);
				setAssets(assetList);
				setDepreciations(depList);
				setRevaluations(revList);
				setRevalueAccount(prev =>
					prev && accountList.some(a => a.id === prev)
						? prev
						: findAccountByName(accountList, /selisih revaluasi/i),
				);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	const accountsByType = useMemo(() => {
		const groups: Record<AccountType, Account[]> = {
			aset: [],
			liabilitas: [],
			ekuitas: [],
			pendapatan: [],
			beban: [],
		};
		for (const a of accounts) groups[a.type].push(a);
		return groups;
	}, [accounts]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const hasRevalueAccount = accounts.some(a => /selisih revaluasi/i.test(a.name));

	const ensureRevalueAccount = async () => {
		if (accounts.some(a => /selisih revaluasi/i.test(a.name))) return;
		const ownerId = pb.authStore.record?.id ?? '';
		try {
			const created = await pb.collection('accounts').create<Account>(
				{
					company: activeCompany.id,
					code: '303',
					name: 'Selisih Revaluasi Aset',
					type: 'ekuitas',
					owner: ownerId,
				},
				{ requestKey: 'ensure-revalue-acct' },
			);
			const updated = [...accounts, created].sort((a, b) =>
				a.code.localeCompare(b.code),
			);
			setAccounts(updated);
			setRevalueAccount(prev => prev || findAccountByName(updated, /selisih revaluasi/i));
		} catch {
			setRevalueError('Gagal membuat akun selisih revaluasi.');
		}
	};

	const openRevalueDialog = (asset: FixedAsset) => {
		const accumulated = accumulatedFor(asset.id, depreciations);
		const currentValue = bookValue(asset, accumulated);
		setRevalueAsset(asset);
		setRevalueDate(todayIso());
		setRevalueNewValue(String(currentValue));
		setRevalueError('');
	};

	const computedRevalueAdjustment = (() => {
		if (!revalueAsset) return 0;
		const accumulated = accumulatedFor(revalueAsset.id, depreciations);
		const previousValue = bookValue(revalueAsset, accumulated);
		const newValue = Number(revalueNewValue) || 0;
		return newValue - previousValue;
	})();

	const handlePostRevaluation = async () => {
		if (!revalueAsset) return;
		setRevalueError('');
		const newValue = Number(revalueNewValue) || 0;
		if (newValue < 0) {
			setRevalueError('Nilai wajar tidak boleh negatif.');
			return;
		}
		if (!revalueAccount) {
			setRevalueError('Pilih akun selisih revaluasi.');
			return;
		}
		const adjustment = computedRevalueAdjustment;
		if (adjustment === 0) {
			setRevalueError('Nilai wajar sama dengan nilai buku — tidak ada penyesuaian.');
			return;
		}
		setIsRevaluing(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const accumulated = accumulatedFor(revalueAsset.id, depreciations);
			const previousValue = bookValue(revalueAsset, accumulated);
			const newCost = newValue + accumulated;
			const baseEntry = {
				company: activeCompany.id,
				date: revalueDate,
				description: `Revaluasi ${revalueAsset.name} — ${formatRupiah(previousValue)} → ${formatRupiah(newValue)}`,
				owner: ownerId,
			};
			const absAdj = Math.abs(adjustment);
			const isUpward = adjustment > 0;
			const debitEntry = await pb.collection('entries').create(
				{
					...baseEntry,
					account: isUpward ? revalueAsset.asset_account : revalueAccount,
					debit: absAdj,
					credit: 0,
				},
				{ requestKey: `reval-debit-${revalueAsset.id}-${revalueDate}` },
			);
			const creditEntry = await pb.collection('entries').create(
				{
					...baseEntry,
					account: isUpward ? revalueAccount : revalueAsset.asset_account,
					debit: 0,
					credit: absAdj,
				},
				{ requestKey: `reval-credit-${revalueAsset.id}-${revalueDate}` },
			);
			const revaluation = await pb.collection('asset_revaluations').create<AssetRevaluation>(
				{
					company: activeCompany.id,
					fixed_asset: revalueAsset.id,
					date: revalueDate,
					previous_value: previousValue,
					new_value: newValue,
					adjustment,
					revaluation_account: revalueAccount,
					debit_entry: debitEntry.id,
					credit_entry: creditEntry.id,
					owner: ownerId,
				},
				{ expand: 'revaluation_account' },
			);
			setRevaluations(prev => [revaluation, ...prev]);
			const updatedAsset = await pb.collection('fixed_assets').update<FixedAsset>(
				revalueAsset.id,
				{ acquisition_cost: newCost },
				{ expand: 'asset_account,expense_account,accum_dep_account' },
			);
			setAssets(prev => prev.map(a => (a.id === revalueAsset.id ? updatedAsset : a)));
			setRevalueAsset(null);
		} catch {
			setRevalueError('Gagal mencatat revaluasi. Coba lagi.');
		} finally {
			setIsRevaluing(false);
		}
	};

	const handleDeleteRevaluation = async (rev: AssetRevaluation) => {
		if (
			!window.confirm(
				'Hapus catatan revaluasi ini? Jurnal terkait akan dihapus dan nilai aset dikembalikan.',
			)
		) {
			return;
		}
		try {
			const asset = assets.find(a => a.id === rev.fixed_asset);
			if (asset) {
				const accumulated = accumulatedFor(asset.id, depreciations);
				const restoredCost = rev.previous_value + accumulated;
				const updatedAsset = await pb.collection('fixed_assets').update<FixedAsset>(
					asset.id,
					{ acquisition_cost: restoredCost },
					{ expand: 'asset_account,expense_account,accum_dep_account' },
				);
				setAssets(prev => prev.map(a => (a.id === asset.id ? updatedAsset : a)));
			}
			await pb.collection('asset_revaluations').delete(rev.id);
			setRevaluations(prev => prev.filter(r => r.id !== rev.id));
		} catch {
			/* ignore */
		}
	};

	const handleExportAssets = () => {
		const rows = [ASSET_EXPORT_HEADERS, ...assets.map(a => [
			a.name,
			String(a.acquisition_cost ?? 0),
			String(a.salvage_value ?? 0),
			a.acquisition_date ?? '',
			METHOD_LABELS[a.method] ?? a.method,
			String(a.useful_life ?? ''),
			String(a.rate ?? ''),
			String(a.production_capacity ?? ''),
			a.expand?.asset_account?.code ?? '',
			a.expand?.expense_account?.code ?? '',
			a.expand?.accum_dep_account?.code ?? '',
		])];
		exportCsv(timestampedFilename('aset-tetap'), rows);
	};

	const handleImportAssets = async (rows: string[][]) => {
		const ownerId = pb.authStore.record?.id ?? '';
		let created = 0;
		let skipped = 0;
		for (let idx = 0; idx < rows.length; idx += 1) {
			const row = rows[idx];
			const [
				rawName, rawCost, rawSalvage, rawDate, rawMethod,
				rawLife, rawRate, rawCapacity, rawAssetCode, rawExpenseCode, rawAccumCode,
			] = row;
			const name = (rawName ?? '').trim();
			const costNum = Number(rawCost) || 0;
			const assetAcc = accounts.find(a => a.code === (rawAssetCode ?? '').trim());
			const expenseAcc = accounts.find(a => a.code === (rawExpenseCode ?? '').trim());
			const accumAcc = accounts.find(a => a.code === (rawAccumCode ?? '').trim());
			if (!name || costNum <= 0 || !assetAcc || !expenseAcc || !accumAcc) {
				skipped += 1;
				continue;
			}
			const method = parseMethod(rawMethod ?? '');
			const payload: Record<string, unknown> = {
				company: activeCompany.id,
				name,
				asset_account: assetAcc.id,
				expense_account: expenseAcc.id,
				accum_dep_account: accumAcc.id,
				acquisition_cost: costNum,
				salvage_value: Number(rawSalvage) || 0,
				acquisition_date: (rawDate ?? '').trim() || todayIso(),
				method,
				status: 'active',
				owner: ownerId,
			};
			if (method === 'straight_line') payload.useful_life = Number(rawLife) || 0;
			if (method === 'reducing_balance') {
				payload.rate = Number(rawRate) || 0;
				payload.useful_life = Number(rawLife) || 0;
			}
			if (method === 'production') payload.production_capacity = Number(rawCapacity) || 0;
			try {
				const asset = await pb.collection('fixed_assets').create<FixedAsset>(payload, {
					expand: 'asset_account,expense_account,accum_dep_account',
					requestKey: `import-asset-${idx}`,
				});
				setAssets(prev => [asset, ...prev]);
				created += 1;
			} catch {
				skipped += 1;
			}
		}
		if (created === 0) throw new Error('Tidak ada aset baru yang berhasil diimpor.');
		return { created, skipped };
	};

	const handleDeleteAsset = async (asset: FixedAsset) => {
		if (
			!window.confirm(
				`Hapus aset "${asset.name}"? Seluruh riwayat penyusutan & jurnal terkait juga akan dihapus.`,
			)
		) {
			return;
		}
		try {
			await pb.collection('fixed_assets').delete(asset.id);
			setAssets(prev => prev.filter(a => a.id !== asset.id));
			setDepreciations(prev => prev.filter(d => d.fixed_asset !== asset.id));
		} catch {
			/* ignore */
		}
	};

	const openPostDialog = (asset: FixedAsset) => {
		setPostAsset(asset);
		setPostDate(todayIso());
		setPostUnits('');
		setPostError('');
	};

	const computedPostAmount = (() => {
		if (!postAsset) return 0;
		const accumulated = accumulatedFor(postAsset.id, depreciations);
		const depreciable = Math.max(
			0,
			(postAsset.acquisition_cost || 0) - (postAsset.salvage_value || 0),
		);
		const remaining = Math.max(0, depreciable - accumulated);
		let amount = 0;
		if (postAsset.method === 'straight_line') {
			amount = straightLineMonthly(postAsset);
		} else if (postAsset.method === 'reducing_balance') {
			amount = reducingBalanceAmount(postAsset, accumulated);
		} else {
			const units = Number(postUnits) || 0;
			amount = units * productionPerUnit(postAsset);
		}
		return Math.min(amount, remaining);
	})();

	const handlePostDepreciation = async () => {
		if (!postAsset) return;
		setPostError('');
		const amount = computedPostAmount;
		if (amount <= 0) {
			setPostError('Nilai penyusutan 0 — aset mungkin sudah habis disusutkan.');
			return;
		}
		if (postAsset.method === 'production' && !(Number(postUnits) > 0)) {
			setPostError('Masukkan jumlah unit produksi periode ini.');
			return;
		}
		const label = periodLabel(postDate);
		const dup = depreciations.some(
			d => d.fixed_asset === postAsset.id && d.period_label === label,
		);
		if (dup && postAsset.method !== 'production') {
			setPostError(`Penyusutan untuk periode ${label} sudah pernah dicatat.`);
			return;
		}
		setIsPosting(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const baseEntry = {
				company: activeCompany.id,
				date: postDate,
				description: `Penyusutan ${postAsset.name} — ${METHOD_SHORT[postAsset.method]} ${label}`,
				owner: ownerId,
			};
			const debitEntry = await pb.collection('entries').create(
				{ ...baseEntry, account: postAsset.expense_account, debit: amount, credit: 0 },
				{ requestKey: `dep-debit-${postAsset.id}-${label}` },
			);
			const creditEntry = await pb.collection('entries').create(
				{ ...baseEntry, account: postAsset.accum_dep_account, debit: 0, credit: amount },
				{ requestKey: `dep-credit-${postAsset.id}-${label}` },
			);
			const depreciation = await pb.collection('depreciations').create<Depreciation>({
				company: activeCompany.id,
				fixed_asset: postAsset.id,
				date: postDate,
				period_label: label,
				amount,
				method: postAsset.method,
				units: postAsset.method === 'production' ? Number(postUnits) || 0 : 0,
				debit_entry: debitEntry.id,
				credit_entry: creditEntry.id,
				owner: ownerId,
			});
			setDepreciations(prev => [depreciation, ...prev]);

			const accumulated = accumulatedFor(postAsset.id, depreciations) + amount;
			const depreciable = Math.max(
				0,
				(postAsset.acquisition_cost || 0) - (postAsset.salvage_value || 0),
			);
			if (accumulated >= depreciable && depreciable > 0) {
				try {
					const updated = await pb.collection('fixed_assets').update<FixedAsset>(
						postAsset.id,
						{ status: 'fully_depreciated' },
						{ expand: 'asset_account,expense_account,accum_dep_account' },
					);
					setAssets(prev => prev.map(a => (a.id === postAsset.id ? updated : a)));
				} catch {
					/* status update gagal — tidak menggagalkan posting */
				}
			}
			setPostAsset(null);
		} catch {
			setPostError('Gagal mencatat penyusutan. Coba lagi.');
		} finally {
			setIsPosting(false);
		}
	};

	const handleDeleteDepreciation = async (dep: Depreciation) => {
		if (!window.confirm('Hapus posting penyusutan ini? Jurnal terkait juga akan dihapus.')) {
			return;
		}
		try {
			await pb.collection('depreciations').delete(dep.id);
			setDepreciations(prev => prev.filter(d => d.id !== dep.id));
		} catch {
			/* ignore */
		}
	};

	const activeOnly = assets.filter(
		a => a.status === 'active' || a.status === 'fully_depreciated' || !a.status,
	);

	return (
		<div className={embedded ? 'flex flex-col gap-6' : 'flex flex-col gap-8'}>
			{!embedded ? (
				<header className="flex flex-col gap-3">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
								Penyusutan Aset
							</h1>
							<p className="mt-1 text-sm text-muted-foreground">
								Daftarkan aset tetap, pilih metode (Straight Line, Reducing Balance, atau
								Produksi), dan jalankan penyusutan — jurnal debit Beban Penyusutan & kredit
								Akumulasi Penyusutan terbentuk otomatis.
							</p>
						</div>
						<Link
							to="/app/aset/daftar"
							className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
						>
							<Plus className="size-4" /> Daftarkan Aset
						</Link>
					</div>
					<div className="mt-2">
						<ImportExportBar
							importLabel="Import Aset"
							exportLabel="Export Aset"
							onExport={() => handleExportAssets()}
							onImport={async (_headers, rows) => {
								await handleImportAssets(rows);
							}}
						/>
					</div>
				</header>
			) : (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-sm text-muted-foreground">
						Jalankan penyusutan untuk aset aktif. Jurnal beban & akumulasi terbentuk otomatis.
					</p>
				</div>
			)}

			<section className="min-w-0 bg-transparent">
				<div className="flex items-center justify-between border-b border-border px-5 py-3">
					<h2 className="text-sm font-bold">Daftar Aset untuk Penyusutan</h2>
					<p className="text-xs font-semibold text-muted-foreground">
						{activeOnly.length} aset
					</p>
				</div>
				{activeOnly.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">
						Belum ada aset aktif. Simpan aset tertunda atau daftarkan aset baru terlebih dahulu.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[960px] text-sm">
							<thead>
								<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide">
									<th className="px-5 py-2.5">Aset</th>
									<th className="px-5 py-2.5">Metode</th>
									<th className="px-5 py-2.5 text-right">Perolehan</th>
									<th className="px-5 py-2.5 text-right">Akumulasi</th>
									<th className="px-5 py-2.5 text-right">Nilai Buku</th>
									<th className="px-5 py-2.5">Status</th>
									<th className="px-5 py-2.5 text-right">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{activeOnly.map(asset => {
									const accumulated = accumulatedFor(asset.id, depreciations);
									const value = bookValue(asset, accumulated);
									const isDone = asset.status === 'fully_depreciated' || value <= (asset.salvage_value || 0);
									return (
										<tr key={asset.id} className="border-b border-foreground/15 last:border-0">
											<td className="px-5 py-2.5">
												<p className="font-semibold">{asset.name}</p>
												<p className="text-[11px] text-muted-foreground">
													{asset.expand?.asset_account
														? `${asset.expand.asset_account.code} — ${asset.expand.asset_account.name}`
														: '—'}
												</p>
											</td>
											<td className="px-5 py-2.5 text-muted-foreground">
												{METHOD_SHORT[asset.method]}
												{asset.method === 'straight_line' && asset.useful_life
													? ` · ${asset.useful_life} thn`
													: null}
												{asset.method === 'reducing_balance' && asset.rate
													? ` · ${asset.rate}%`
													: null}
												{asset.method === 'production' && asset.production_capacity
													? ` · ${asset.production_capacity} unit`
													: null}
											</td>
											<td className="px-5 py-2.5 text-right tabular-nums">
												{formatRupiah(asset.acquisition_cost || 0)}
											</td>
											<td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
												{formatRupiah(accumulated)}
											</td>
											<td className="px-5 py-2.5 text-right font-semibold tabular-nums">
												{formatRupiah(value)}
											</td>
											<td className="px-5 py-2.5">
												<span
													className={
														'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ' +
														(isDone
															? 'bg-muted text-muted-foreground'
															: 'bg-primary/10 text-primary')
													}
												>
													{isDone ? 'Habis' : 'Aktif'}
												</span>
											</td>
											<td className="px-5 py-2.5">
												<div className="flex items-center justify-end gap-1.5">
													<button
														type="button"
														onClick={() => setHistoryAsset(asset)}
														className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold transition-colors hover:bg-secondary"
													>
														Riwayat
													</button>
													<button
														type="button"
														onClick={() => openRevalueDialog(asset)}
														className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10"
													>
														<Scale className="size-3" />
														Revaluasi
													</button>
													<button
														type="button"
														disabled={isDone}
														onClick={() => openPostDialog(asset)}
														className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
													>
														<TrendingDown className="size-3" />
														Susutkan
													</button>
													<button
														type="button"
														onClick={() => handleDeleteAsset(asset)}
														aria-label="Hapus aset"
														className="border border-border p-1 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
													>
														<Trash2 className="size-3.5" />
													</button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Dialog posting penyusutan */}
			<Dialog open={!!postAsset} onOpenChange={open => !open && setPostAsset(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Jalankan Penyusutan</DialogTitle>
						<DialogDescription>
							{postAsset?.name} — {postAsset ? METHOD_LABELS[postAsset.method] : ''}
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-2">
							<label className="text-xs font-semibold">Tanggal Penyusutan</label>
							<input
								type="date"
								value={postDate}
								onChange={e => setPostDate(e.target.value)}
								className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
							/>
						</div>
						{postAsset?.method === 'production' ? (
							<div className="flex flex-col gap-2">
								<label className="text-xs font-semibold">Unit Produksi Periode Ini</label>
								<input
									type="number"
									min="1"
									value={postUnits}
									onChange={e => setPostUnits(e.target.value)}
									placeholder="0"
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</div>
						) : null}
						<div className="rounded-xl bg-secondary px-4 py-3 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Nilai penyusutan</span>
								<span className="font-extrabold text-primary">
									{formatRupiah(computedPostAmount)}
								</span>
							</div>
							<p className="mt-2 text-[11px] text-muted-foreground">
								Jurnal otomatis: debit{' '}
								<strong>
									{postAsset?.expand?.expense_account?.name ?? 'Beban Penyusutan'}
								</strong>{' '}
								& kredit{' '}
								<strong>
									{postAsset?.expand?.accum_dep_account?.name ?? 'Akumulasi Penyusutan'}
								</strong>
								.
							</p>
						</div>
						{postError ? (
							<p className="text-sm font-semibold text-destructive">{postError}</p>
						) : null}
					</div>
					<DialogFooter>
						<button
							type="button"
							onClick={() => setPostAsset(null)}
							className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={isPosting || computedPostAmount <= 0}
							onClick={handlePostDepreciation}
							className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
						>
							{isPosting ? 'Memproses…' : 'Catat Penyusutan'}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog riwayat penyusutan */}
			<Dialog open={!!historyAsset} onOpenChange={open => !open && setHistoryAsset(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Riwayat Penyusutan</DialogTitle>
						<DialogDescription>{historyAsset?.name}</DialogDescription>
					</DialogHeader>
					<div className="max-h-[60vh] overflow-y-auto py-2">
						{(() => {
							if (!historyAsset) return null;
							const list = depreciations.filter(d => d.fixed_asset === historyAsset.id);
							if (list.length === 0) {
								return (
									<p className="py-6 text-center text-sm text-muted-foreground">
										Belum ada penyusutan tercatat untuk aset ini.
									</p>
								);
							}
							return (
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide">
											<th className="py-2 pr-3">Periode</th>
											<th className="py-2 pr-3">Tanggal</th>
											<th className="py-2 pr-3 text-right">Unit</th>
											<th className="py-2 pr-3 text-right">Nominal</th>
											<th className="py-2" aria-label="Aksi" />
										</tr>
									</thead>
									<tbody>
										{list.map(d => (
											<tr key={d.id} className="border-b border-foreground/10 last:border-0">
												<td className="py-2 pr-3 font-semibold">{d.period_label || '—'}</td>
												<td className="py-2 pr-3 text-muted-foreground">
													{formatDate(d.date)}
												</td>
												<td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
													{d.units ? d.units : '—'}
												</td>
												<td className="py-2 pr-3 text-right font-semibold tabular-nums">
													{formatRupiah(d.amount)}
												</td>
												<td className="py-2 text-right">
													<button
														type="button"
														onClick={() => handleDeleteDepreciation(d)}
														aria-label="Hapus penyusutan"
														className="border border-border p-1 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
													>
														<Trash2 className="size-3.5" />
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							);
						})()}
					</div>
				</DialogContent>
			</Dialog>

			{/* Dialog revaluasi aset */}
			<Dialog open={!!revalueAsset} onOpenChange={open => !open && setRevalueAsset(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revaluasi Aset</DialogTitle>
						<DialogDescription>
							Nilai buku {revalueAsset?.name} disesuaikan ke nilai wajar baru. Selisih
							dicatat ke akun ekuitas &amp; jurnal terbentuk otomatis.
						</DialogDescription>
					</DialogHeader>
					{!hasRevalueAccount ? (
						<div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm">
							<span className="text-muted-foreground">
								Akun <strong>Selisih Revaluasi Aset</strong> belum ada di bagan akun.
							</span>
							<button
								type="button"
								onClick={ensureRevalueAccount}
								className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
							>
								Tambahkan akun selisih revaluasi
							</button>
							{revalueError ? (
								<p className="text-sm font-semibold text-destructive">{revalueError}</p>
							) : null}
						</div>
					) : (
						<div className="flex flex-col gap-4 py-2">
							<div className="flex flex-col gap-2">
								<label className="text-xs font-semibold">Tanggal Revaluasi</label>
								<input
									type="date"
									value={revalueDate}
									onChange={e => setRevalueDate(e.target.value)}
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-xs font-semibold">Nilai Wajar Baru (Rp)</label>
								<input
									type="number"
									min="0"
									value={revalueNewValue}
									onChange={e => setRevalueNewValue(e.target.value)}
									placeholder="0"
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<label className="text-xs font-semibold">Akun Selisih Revaluasi</label>
								<select
									value={revalueAccount}
									onChange={e => setRevalueAccount(e.target.value)}
									className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
								>
									<option value="">Pilih akun</option>
									{accountsByType.ekuitas.map(a => (
										<option key={a.id} value={a.id}>
											{a.code} — {a.name}
										</option>
									))}
								</select>
							</div>
							<div className="rounded-xl bg-secondary px-4 py-3 text-sm">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Nilai buku saat ini</span>
									<span className="font-semibold tabular-nums">
										{formatRupiah(
											revalueAsset
												? bookValue(
														revalueAsset,
														accumulatedFor(revalueAsset.id, depreciations),
													)
												: 0,
										)}
									</span>
								</div>
								<div className="mt-1 flex justify-between">
									<span className="text-muted-foreground">Nilai wajar baru</span>
									<span className="font-semibold tabular-nums">
										{formatRupiah(Number(revalueNewValue) || 0)}
									</span>
								</div>
								<div className="mt-1 flex justify-between border-t border-border pt-2">
									<span className="text-muted-foreground">Selisih penyesuaian</span>
									<span
										className={
											'font-extrabold tabular-nums ' +
											(computedRevalueAdjustment > 0
												? 'text-primary'
												: computedRevalueAdjustment < 0
													? 'text-destructive'
													: 'text-muted-foreground')
										}
									>
										{computedRevalueAdjustment > 0 ? '+ ' : ''}
										{formatRupiah(computedRevalueAdjustment)}
									</span>
								</div>
								<p className="mt-2 text-[11px] text-muted-foreground">
									{computedRevalueAdjustment > 0
										? `Jurnal: debit ${revalueAsset?.expand?.asset_account?.name ?? 'Akun Aset'} & kredit akun selisih revaluasi.`
										: computedRevalueAdjustment < 0
											? `Jurnal: debit akun selisih revaluasi & kredit ${revalueAsset?.expand?.asset_account?.name ?? 'Akun Aset'}.`
											: 'Tidak ada penyesuaian karena nilai wajar sama dengan nilai buku.'}
								</p>
							</div>
							{revalueError ? (
								<p className="text-sm font-semibold text-destructive">{revalueError}</p>
							) : null}

							{revalueAsset &&
							revaluations.some(r => r.fixed_asset === revalueAsset.id) ? (
								<div className="rounded-xl border border-border">
									<p className="border-b border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
										Riwayat Revaluasi
									</p>
									<div className="max-h-40 overflow-y-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide">
													<th className="py-2 pl-3 pr-2">Tanggal</th>
													<th className="py-2 pr-2 text-right">Sebelum</th>
													<th className="py-2 pr-2 text-right">Sesudah</th>
													<th className="py-2 pr-2 text-right">Selisih</th>
													<th className="py-2 pr-3" aria-label="Aksi" />
												</tr>
											</thead>
											<tbody>
												{revaluations
													.filter(r => r.fixed_asset === revalueAsset.id)
													.map(r => (
														<tr
															key={r.id}
															className="border-b border-foreground/10 last:border-0"
														>
															<td className="py-2 pl-3 pr-2 text-muted-foreground">
																{formatDate(r.date)}
															</td>
															<td className="py-2 pr-2 text-right tabular-nums">
																{formatRupiah(r.previous_value)}
															</td>
															<td className="py-2 pr-2 text-right tabular-nums">
																{formatRupiah(r.new_value)}
															</td>
															<td
																className={
																	'py-2 pr-2 text-right font-semibold tabular-nums ' +
																	(r.adjustment > 0
																		? 'text-primary'
																		: 'text-destructive')
																}
															>
																{r.adjustment > 0 ? '+ ' : ''}
																{formatRupiah(r.adjustment)}
															</td>
															<td className="py-2 pr-3 text-right">
																<button
																	type="button"
																	onClick={() => handleDeleteRevaluation(r)}
																	aria-label="Hapus revaluasi"
																	className="border border-border p-1 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
																>
																	<Trash2 className="size-3.5" />
																</button>
															</td>
														</tr>
													))}
											</tbody>
										</table>
									</div>
								</div>
							) : null}
						</div>
					)}
					<DialogFooter>
						<button
							type="button"
							onClick={() => setRevalueAsset(null)}
							className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={isRevaluing || !hasRevalueAccount || computedRevalueAdjustment === 0}
							onClick={handlePostRevaluation}
							className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
						>
							{isRevaluing ? 'Memproses…' : 'Catat Revaluasi'}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
