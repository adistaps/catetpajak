import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { BookCheck, ChevronDown, ChevronRight, Menu, Plus, Scale } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	ACCOUNT_TYPE_LABELS,
	ACCOUNT_TYPES,
	computeBalances,
	formatDate,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { TutupBukuDialog } from '@/components/app/tutup-buku-dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface NestedRow {
	account: Account;
	depth: number;
	parentId: string | null;
	hasChildren: boolean;
}

function nestAccounts(group: Account[]): NestedRow[] {
	const ids = new Set(group.map(account => account.id));
	const children = new Map<string, Account[]>();
	const roots: Account[] = [];
	for (const account of group) {
		if (account.parent && ids.has(account.parent)) {
			const list = children.get(account.parent) ?? [];
			list.push(account);
			children.set(account.parent, list);
		} else {
			roots.push(account);
		}
	}
	const byCode = (a: Account, b: Account) => a.code.localeCompare(b.code, 'id');
	roots.sort(byCode);
	const rows: NestedRow[] = [];
	const walk = (account: Account, depth: number, parentId: string | null) => {
		const kids = children.get(account.id) ?? [];
		rows.push({ account, depth, parentId, hasChildren: kids.length > 0 });
		for (const child of kids.sort(byCode)) {
			walk(child, depth + 1, account.id);
		}
	};
	for (const root of roots) walk(root, 0, null);
	return rows;
}

function formatSaldo(value: number): string {
	return new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

/** Tanggal kalender Jakarta — saldo berjalan dihitung sampai hari ini. */
function jakartaToday(): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date());
}

export default function AppAkun() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [entries, setEntries] = useState<JournalEntry[]>([]);
	const [error, setError] = useState('');
	const [showTutupBuku, setShowTutupBuku] = useState(false);
	const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
	const [balanceAsOf, setBalanceAsOf] = useState(jakartaToday);

	useEffect(() => {
		const sync = () => setBalanceAsOf(jakartaToday());
		sync();
		const timer = window.setInterval(sync, 30_000);
		window.addEventListener('focus', sync);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener('focus', sync);
		};
	}, []);

	// Pakai id perusahaan (string stabil) sebagai dependensi, bukan objek
	// activeCompany yang berganti referensi setiap kali refreshCompanies
	// berjalan (saat fokus jendela, perubahan pembayaran manual, dsb.). Tanpa
	// ini, efek & langganan realtime dibongkar-pasang berulang kali sehingga
	// permintaan data saling membatalkan (auto-cancellation) dan perubahan kode
	// akun — mis. "Kas Kecil" — tidak sempat diterima/ditampilkan.
	const companyId = activeCompany?.id ?? null;

	const loadAccounts = useCallback(async () => {
		if (!companyId) {
			setAccounts([]);
			setEntries([]);
			return;
		}
		const companyFilter = pb.filter('company = {:company}', { company: companyId });
		const [list, entryList] = await Promise.all([
			pb.collection('accounts').getFullList<Account>({
				filter: companyFilter,
				sort: 'code',
				requestKey: `akun-accounts-${companyId}`,
			}),
			pb.collection('entries').getFullList<JournalEntry>({
				filter: companyFilter,
				requestKey: `akun-entries-${companyId}`,
			}),
		]);
		setAccounts(list);
		setEntries(entryList);
	}, [companyId]);

	useEffect(() => {
		let cancelled = false;
		loadAccounts().catch(() => {
			if (!cancelled) setError('Gagal memuat bagan akun.');
		});
		if (!companyId) return () => {
			cancelled = true;
		};

		const belongs = (record: { company?: string }) => record.company === companyId;

		const patchList = <T extends { id: string }>(
			prev: T[],
			action: string,
			record: T,
		): T[] => {
			if (action === 'delete') return prev.filter(item => item.id !== record.id);
			if (prev.some(item => item.id === record.id)) {
				return prev.map(item => (item.id === record.id ? { ...item, ...record } : item));
			}
			return action === 'create' ? [...prev, record] : prev;
		};

		void pb.collection('entries').subscribe('*', event => {
			const record = event.record as unknown as JournalEntry;
			if (!belongs(record)) return;
			setBalanceAsOf(jakartaToday());
			setEntries(prev => patchList(prev, event.action, record));
		}).catch(() => {});
		void pb.collection('accounts').subscribe('*', event => {
			const record = event.record as unknown as Account;
			if (!belongs(record)) return;
			setBalanceAsOf(jakartaToday());
			setAccounts(prev => patchList(prev, event.action, record));
		}).catch(() => {});

		return () => {
			cancelled = true;
			void pb.collection('entries').unsubscribe('*').catch(() => {});
			void pb.collection('accounts').unsubscribe('*').catch(() => {});
		};
	}, [companyId, loadAccounts]);

	const balanceById = useMemo(() => {
		const computed = computeBalances(accounts, entries, activeCompany?.conversion_date);
		const own = new Map(computed.map(row => [row.account.id, row.balance]));
		const children = new Map<string, string[]>();
		for (const account of accounts) {
			if (!account.parent) continue;
			const list = children.get(account.parent) ?? [];
			list.push(account.id);
			children.set(account.parent, list);
		}
		const rolled = new Map<string, number>();
		const visit = (id: string): number => {
			const cached = rolled.get(id);
			if (cached !== undefined) return cached;
			const total = (own.get(id) ?? 0) + (children.get(id) ?? []).reduce((sum, childId) => sum + visit(childId), 0);
			rolled.set(id, total);
			return total;
		};
		for (const account of accounts) visit(account.id);
		return rolled;
	}, [accounts, entries, activeCompany?.conversion_date]);

	const rows = useMemo(() => {
		const ordered: NestedRow[] = [];
		for (const accountType of ACCOUNT_TYPES) {
			const group = accounts.filter(account => account.type === accountType);
			ordered.push(...nestAccounts(group));
		}
		return ordered;
	}, [accounts]);

	const effectiveCollapsed = useMemo(() => {
		if (collapsed) return collapsed;
		const parents = new Set<string>();
		for (const row of rows) {
			if (row.hasChildren) parents.add(row.account.id);
		}
		return parents;
	}, [collapsed, rows]);

	const visibleRows = useMemo(() => {
		const hidden = new Set<string>();
		for (const row of rows) {
			if (row.parentId && hidden.has(row.parentId)) {
				hidden.add(row.account.id);
			}
			if (row.hasChildren && effectiveCollapsed.has(row.account.id)) {
				hidden.add(row.account.id);
			}
		}
		return rows.filter(row => !(row.parentId && hidden.has(row.parentId)));
	}, [rows, effectiveCollapsed]);

	const toggleRow = (id: string) => {
		setCollapsed(prev => {
			const base = prev ?? effectiveCollapsed;
			const next = new Set(base);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	if (!activeCompany) {
		return <NoCompany />;
	}

	const conversionDate = activeCompany.conversion_date?.slice(0, 10) ?? '';

	return (
		<div className="flex flex-col gap-3 bg-transparent text-[13px] text-slate-800">
			<div className="flex flex-wrap items-center justify-end gap-3 px-1 pt-1">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="inline-flex min-h-9 items-center gap-3 rounded-md bg-[#059669] px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#047857]"
						>
							Tindakan
							<Menu className="size-4" strokeWidth={2.25} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<DropdownMenuItem asChild>
							<Link to="/app/akun/buat" className="flex items-center gap-2">
								<Plus className="size-4" />
								Tambah akun
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link to="/app/akun/saldo-awal" className="flex items-center gap-2">
								<Scale className="size-4" />
								Atur saldo awal
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setShowTutupBuku(true)} className="gap-2">
							<BookCheck className="size-4" />
							Tutup buku
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<p className="px-1 text-right text-[11px] text-slate-500">
				Saldo di bawah berdasarkan tanggal {formatDate(balanceAsOf)}, kecuali ada pernyataan lain
			</p>

			<TutupBukuDialog
				open={showTutupBuku}
				onOpenChange={setShowTutupBuku}
				companyId={activeCompany.id}
				conversionDate={conversionDate || undefined}
			/>

			{error ? <p className="px-1 text-sm font-semibold text-destructive">{error}</p> : null}

			<div className="overflow-x-auto bg-transparent">
				<table className="w-full min-w-[860px] border-collapse text-left">
					<thead>
						<tr className="bg-transparent text-[13px] font-bold text-slate-900">
							<th className="w-28 px-2 py-2.5 font-bold">Kode Akun</th>
							<th className="px-2 py-2.5 font-bold">Nama Akun</th>
							<th className="w-44 px-2 py-2.5 font-bold">Kategori Akun</th>
							<th className="w-24 px-2 py-2.5 font-bold">Pengguna</th>
							<th className="w-16 px-2 py-2.5 font-bold">Pajak</th>
							<th className="w-40 px-3 py-2.5 text-right font-bold">Saldo (dalam IDR)</th>
						</tr>
					</thead>
					<tbody>
						{visibleRows.map(({ account, depth, hasChildren }) => {
							const signed = balanceById.get(account.id) ?? 0;
							const isCollapsed = effectiveCollapsed.has(account.id);
							return (
								<tr
									key={account.id}
									className={cn(
										'border-b border-slate-100',
										hasChildren && 'cursor-pointer hover:bg-slate-50',
									)}
									onClick={hasChildren ? () => toggleRow(account.id) : undefined}
								>
									<td className="px-2 py-2 tabular-nums text-slate-800">
										<span style={{ marginLeft: depth * 16 }}>{account.code}</span>
									</td>
									<td className="px-2 py-2">
										<span className="inline-flex items-center gap-1" style={{ marginLeft: depth * 16 }}>
											{hasChildren ? (
												isCollapsed ? (
													<ChevronRight className="size-3.5 shrink-0 text-slate-500" strokeWidth={2.5} />
												) : (
													<ChevronDown className="size-3.5 shrink-0 text-slate-500" strokeWidth={2.5} />
												)
											) : null}
											<Link
												to={`/app/akun/ubah/${account.id}`}
												onClick={e => e.stopPropagation()}
												className="font-medium text-[#8b5cf6] hover:underline"
											>
												{account.name}
											</Link>
										</span>
									</td>
									<td className="px-2 py-2">
										<span className="text-[#8b5cf6]">{ACCOUNT_TYPE_LABELS[account.type]}</span>
									</td>
									<td className="px-2 py-2 text-slate-600">Semua</td>
									<td className="px-2 py-2 text-slate-400" />
									<td
										className={cn(
											'px-3 py-2 text-right tabular-nums text-slate-800',
											signed < 0 && 'text-slate-800',
										)}
									>
										{formatSaldo(signed)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{visibleRows.length === 0 ? (
					<p className="px-5 py-10 text-center text-sm text-slate-500">
						Belum ada akun. Tambahkan akun agar bagan terisi.
					</p>
				) : null}
			</div>
		</div>
	);
}
