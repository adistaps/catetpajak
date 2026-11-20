import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { BookCheck, Calendar, Info, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import pb from '@/lib/pocketbase-client';
import {
	ACCOUNT_TYPE_LABELS,
	ACCOUNT_TYPES,
	dayBeforeIso,
	formatDate,
	todayIso,
	type Account,
	type AccountType,
	type Company,
	type JournalEntry,
} from '@/lib/accounting';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { TutupBukuDialog } from '@/components/app/tutup-buku-dialog';
import { cn } from '@/lib/utils';

/** Saldo normal: aset & beban di debit; liabilitas, ekuitas, pendapatan di kredit. */
function normalSide(type: AccountType): 'debit' | 'credit' {
	return type === 'aset' || type === 'beban' ? 'debit' : 'credit';
}

/** Saldo bertanda dari draf input (positif = sisi normal). */
function draftSignedOpening(account: Account, drafts: Record<string, RowDraft>): number {
	const d = drafts[account.id] ?? { debit: '', credit: '' };
	const debitVal = parseIdNumber(d.debit);
	const creditVal = parseIdNumber(d.credit);
	const side = normalSide(account.type);
	if (debitVal > 0 && creditVal > 0) {
		return side === 'debit' ? debitVal - creditVal : creditVal - debitVal;
	}
	if (debitVal > 0) return side === 'debit' ? debitVal : -debitVal;
	if (creditVal > 0) return side === 'credit' ? creditVal : -creditVal;
	return 0;
}

/** Himpunan id akun yang berperan sebagai header/induk: ber-flag `is_header`
 * atau menjadi induk dari setidaknya satu sub-akun (relasi `parent`). */
function buildHeaderIds(accounts: Account[]): Set<string> {
	const set = new Set<string>();
	for (const account of accounts) {
		if (account.is_header) set.add(account.id);
		if (account.parent) set.add(account.parent);
	}
	return set;
}

/** Peta induk → anak langsung. */
function buildChildrenMap(accounts: Account[]): Map<string, Account[]> {
	const map = new Map<string, Account[]>();
	for (const account of accounts) {
		if (!account.parent) continue;
		const list = map.get(account.parent) ?? [];
		list.push(account);
		map.set(account.parent, list);
	}
	return map;
}

function formatInputNumber(value: number): string {
	if (!value || Number.isNaN(value)) return '';
	return new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value);
}

function parseIdNumber(raw: string): number {
	const cleaned = raw.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '');
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : 0;
}

interface RowDraft {
	debit: string;
	credit: string;
}

function nestAccounts(group: Account[]): { account: Account; depth: number }[] {
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
	const rows: { account: Account; depth: number }[] = [];
	const walk = (account: Account, depth: number) => {
		rows.push({ account, depth });
		for (const child of (children.get(account.id) ?? []).sort(byCode)) {
			walk(child, depth + 1);
		}
	};
	for (const root of roots) walk(root, 0);
	return rows;
}

function isoToDisplay(iso: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) return '';
	return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Terima dd/mm/yyyy atau yyyy-mm-dd. Kosong = hapus. null = belum lengkap atau tidak valid. */
function parseTypedDate(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return '';
	const slash = /^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})$/.exec(trimmed);
	const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
	let year = 0;
	let month = 0;
	let day = 0;
	if (slash) {
		day = Number(slash[1]);
		month = Number(slash[2]);
		year = Number(slash[3]);
	} else if (iso) {
		year = Number(iso[1]);
		month = Number(iso[2]);
		day = Number(iso[3]);
	} else if (/^\d{1,2}[\/.\- ]\d{1,2}[\/.\- ]\d{0,3}$/.test(trimmed)) {
		return null;
	} else {
		return null;
	}
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function AppAkunSaldoAwal() {
	const { activeCompany, refreshCompanies } = useOutletContext<AppOutletContext>();
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
	const [savingId, setSavingId] = useState<string | null>(null);
	const [error, setError] = useState('');
	const [conversionDate, setConversionDate] = useState('');
	const [typedDate, setTypedDate] = useState<string | null>(null);
	const [dateError, setDateError] = useState('');
	const [savingConversion, setSavingConversion] = useState(false);
	const [isPublishing, setIsPublishing] = useState(false);
	const [showNotes, setShowNotes] = useState(false);
	const [showTutupBuku, setShowTutupBuku] = useState(false);
	const [history, setHistory] = useState<JournalEntry[]>([]);

	useEffect(() => {
		setConversionDate(
			activeCompany?.conversion_date
				? activeCompany.conversion_date.slice(0, 10)
				: '',
		);
	}, [activeCompany?.id, activeCompany?.conversion_date]);

	const loadAccounts = useCallback(async () => {
		if (!activeCompany) {
			setAccounts([]);
			setDrafts({});
			return;
		}
		const list = await pb.collection('accounts').getFullList<Account>({
			filter: pb.filter('company = {:company}', { company: activeCompany.id }),
			sort: 'code',
		});
		setAccounts(list);
		const headerIds = buildHeaderIds(list);
		const next: Record<string, RowDraft> = {};
		for (const account of list) {
			// Akun header/induk tidak menerima input saldo sendiri.
			if (headerIds.has(account.id)) {
				next[account.id] = { debit: '', credit: '' };
				continue;
			}
			const bal = account.opening_balance || 0;
			const side = normalSide(account.type);
			next[account.id] = {
				debit: side === 'debit' && bal ? formatInputNumber(bal) : '',
				credit: side === 'credit' && bal ? formatInputNumber(bal) : '',
			};
		}
		setDrafts(next);
	}, [activeCompany]);

	useEffect(() => {
		let cancelled = false;
		loadAccounts().catch(() => {
			if (!cancelled) setError('Gagal memuat bagan akun.');
		});
		return () => {
			cancelled = true;
		};
	}, [loadAccounts]);

	const loadHistory = useCallback(async () => {
		if (!activeCompany) {
			setHistory([]);
			return;
		}
		try {
			const list = await pb.collection('entries').getFullList<JournalEntry>({
				filter: pb.filter('company = {:company} && description ~ {:prefix}', {
					company: activeCompany.id,
					prefix: 'Saldo awal —',
				}),
				sort: '-date,-created',
				expand: 'account',
			});
			setHistory(list);
		} catch {
			setHistory([]);
		}
	}, [activeCompany]);

	useEffect(() => {
		void loadHistory();
	}, [loadHistory]);

	const childrenMap = useMemo(() => buildChildrenMap(accounts), [accounts]);

	/** Saldo akumulasi akun header dari seluruh sub-akun turunannya. */
	const accumulatedOpening = useCallback(
		(headerId: string): number => {
			let total = 0;
			const walk = (id: string) => {
				for (const child of childrenMap.get(id) ?? []) {
					// Induk (ber-flag header atau punya sub-akun) direkursi,
					// bukan dijumlahkan dari inputnya sendiri.
					if (child.is_header || childrenMap.has(child.id)) {
						walk(child.id);
					} else {
						total += draftSignedOpening(child, drafts);
					}
				}
			};
			walk(headerId);
			return total;
		},
		[childrenMap, drafts],
	);

	const headerIds = useMemo(() => buildHeaderIds(accounts), [accounts]);

	const historyGroups = useMemo(() => {
		const map = new Map<string, JournalEntry[]>();
		for (const entry of history) {
			const g = (entry.group || '').trim();
			if (!g) continue;
			const list = map.get(g) ?? [];
			list.push(entry);
			map.set(g, list);
		}
		const groups = [...map.values()].map(lines => {
			const sorted = [...lines].sort((a, b) =>
				(a.number || '').localeCompare(b.number || ''),
			);
			const debit = sorted.reduce((sum, l) => sum + (l.debit || 0), 0);
			const credit = sorted.reduce((sum, l) => sum + (l.credit || 0), 0);
			const first = sorted[0];
			const last = sorted[sorted.length - 1];
			return {
				id: first.group || first.id,
				date: first.date,
				numbers:
					sorted.length > 1 && first.number && last.number
						? `${first.number} – ${last.number}`
						: (first.number || '—'),
				lines: sorted,
				debit,
				credit,
				total: debit,
			};
		});
		groups.sort((a, b) => b.date.localeCompare(a.date));
		return groups;
	}, [history]);

	const totals = useMemo(() => {
		let debit = 0;
		let credit = 0;
		for (const account of accounts) {
			// Akun header/induk dijumlahkan dari sub-akun, bukan input sendiri.
			if (headerIds.has(account.id)) continue;
			const d = drafts[account.id];
			if (!d) continue;
			debit += parseIdNumber(d.debit);
			credit += parseIdNumber(d.credit);
		}
		return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
	}, [accounts, drafts]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const updateDraft = (id: string, side: 'debit' | 'credit', value: string) => {
		setDrafts(previous => {
			const current = previous[id] ?? { debit: '', credit: '' };
			// Satu sisi saja — isi debit kosongkan kredit, dan sebaliknya
			if (side === 'debit') {
				return {
					...previous,
					[id]: { debit: value, credit: value.trim() ? '' : current.credit },
				};
			}
			return {
				...previous,
				[id]: { credit: value, debit: value.trim() ? '' : current.debit },
			};
		});
	};

	const persistOpening = async (account: Account) => {
		const d = drafts[account.id] ?? { debit: '', credit: '' };
		const debitVal = parseIdNumber(d.debit);
		const creditVal = parseIdNumber(d.credit);
		const side = normalSide(account.type);
		// Simpan sebagai saldo normal (positif di sisi normal)
		let opening = 0;
		if (debitVal > 0 && creditVal > 0) {
			opening = side === 'debit' ? debitVal - creditVal : creditVal - debitVal;
		} else if (debitVal > 0) {
			opening = side === 'debit' ? debitVal : -debitVal;
		} else if (creditVal > 0) {
			opening = side === 'credit' ? creditVal : -creditVal;
		}

		const openingDate = conversionDate
			? dayBeforeIso(conversionDate)
			: todayIso();

		setSavingId(account.id);
		setError('');
		try {
			const updated = await pb.collection('accounts').update<Account>(account.id, {
				opening_balance: opening,
				opening_balance_date: openingDate,
			});
			setAccounts(previous => previous.map(a => (a.id === account.id ? updated : a)));
		} catch {
			setError(`Gagal menyimpan saldo ${account.name}.`);
		} finally {
			setSavingId(null);
		}
	};

	const persistConversionDate = async (value: string) => {
		if (!activeCompany) return;
		setConversionDate(value);
		setSavingConversion(true);
		setError('');
		try {
			await pb.collection('companies').update<Company>(activeCompany.id, {
				conversion_date: value || null,
			});
			await refreshCompanies();
		} catch {
			setError('Gagal menyimpan tanggal konversi.');
		} finally {
			setSavingConversion(false);
		}
	};

	const handleDelete = async (account: Account) => {
		if (!window.confirm(`Hapus akun ${account.name}? Jurnal terkait ikut terhapus.`)) return;
		await pb.collection('accounts').delete(account.id);
		setAccounts(previous => previous.filter(item => item.id !== account.id));
		setDrafts(previous => {
			const next = { ...previous };
			delete next[account.id];
			return next;
		});
	};

	const saldoAwalDari = conversionDate ? dayBeforeIso(conversionDate) : null;
	const conversionNotice = saldoAwalDari
		? `Saldo awal Anda terhitung dari ${formatDate(saldoAwalDari)}`
		: 'Belum ada tanggal konversi — semua transaksi memengaruhi saldo.';

	const handlePublishOpening = async () => {
		if (!activeCompany) return;
		const toPublish = accounts.filter(
			account => !headerIds.has(account.id) && (account.opening_balance || 0) !== 0,
		);
		if (toPublish.length === 0) {
			setError('Tidak ada saldo awal untuk diterbitkan.');
			return;
		}
		let totalDebit = 0;
		let totalCredit = 0;
		const lines = toPublish.map(account => {
			const opening = account.opening_balance || 0;
			const side = normalSide(account.type);
			let debit = 0;
			let credit = 0;
			if (side === 'debit') {
				if (opening >= 0) debit = opening;
				else credit = -opening;
			} else if (opening >= 0) {
				credit = opening;
			} else {
				debit = -opening;
			}
			totalDebit += debit;
			totalCredit += credit;
			return { account, debit, credit };
		});
		if (Math.abs(totalDebit - totalCredit) > 0.005) {
			setError(
				`Saldo awal belum seimbang — Debit Rp ${formatInputNumber(totalDebit)} ≠ Kredit Rp ${formatInputNumber(totalCredit)}.`,
			);
			return;
		}
		if (
			!window.confirm(
				'Terbitkan saldo awal ke jurnal? Saldo awal akan menjadi transaksi jurnal dan kolom saldo awal dikosongkan.',
			)
		) {
			return;
		}
		setIsPublishing(true);
		setError('');
		const entryDate = conversionDate || todayIso();
		const ownerId = pb.authStore.record?.id ?? '';
		const year = new Date(entryDate).getFullYear();
		const groupId =
			typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
				? crypto.randomUUID()
				: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
		try {
			// Setiap baris entri butuh nomor unik per perusahaan (indeks unik
			// company+number). Hitung urutan tertinggi JU-YYYY-### yang sudah
			// tersimpan, lalu isi nomor berurutan agar tidak bentrok.
			const existing = await pb.collection('entries').getFullList<{ number?: string }>({
				filter: pb.filter('company = {:company}', { company: activeCompany.id }),
				fields: 'number',
			});
			const prefix = `JU-${year}-`;
			let maxSeq = 0;
			for (const entry of existing) {
				const value = entry.number || '';
				if (value.startsWith(prefix)) {
					const seq = Number.parseInt(value.slice(prefix.length), 10);
					if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
				}
			}
			await Promise.all(
				lines.map((line, index) => {
					const number = `${prefix}${String(maxSeq + index + 1).padStart(3, '0')}`;
					return pb.collection('entries').create(
						{
							company: activeCompany.id,
							account: line.account.id,
							date: entryDate,
							description: `Saldo awal — ${line.account.name}`,
							debit: line.debit,
							credit: line.credit,
							owner: ownerId,
							number,
							group: groupId,
						},
						{ requestKey: `publish-opening-${line.account.id}-${index}` },
					);
				}),
			);
			await Promise.all(
				toPublish.map((account, index) =>
					pb.collection('accounts').update(
						account.id,
						{ opening_balance: 0, opening_balance_date: null },
						{ requestKey: `publish-zero-${account.id}-${index}` },
					),
				),
			);
			setAccounts(previous =>
				previous.map(account => {
					const published = toPublish.find(item => item.id === account.id);
					if (!published) return account;
					return { ...account, opening_balance: 0, opening_balance_date: undefined };
				}),
			);
			setDrafts(previous => {
				const next = { ...previous };
				for (const account of toPublish) {
					next[account.id] = { debit: '', credit: '' };
				}
				return next;
			});
			toast.success('Saldo awal diterbitkan ke jurnal & laporan.');
			void loadHistory();
		} catch {
			setError('Gagal menerbitkan saldo awal. Coba lagi.');
		} finally {
			setIsPublishing(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<Link
				to="/app/akun"
				className="inline-flex w-fit min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
			>
				Kembali ke bagan akun
			</Link>
			<header className="flex flex-wrap items-end justify-between gap-4 px-5 py-5">
				<div>
					<p className="text-sm font-medium text-primary">Bagan akun</p>
					<h1 className="mt-0.5 text-2xl font-extrabold tracking-tight md:text-3xl">
						Atur saldo awal
					</h1>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => setShowTutupBuku(true)}
						className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-bold text-primary shadow-soft-sm transition-colors hover:bg-primary/10"
					>
						<BookCheck className="size-4" />
						Tutup buku
					</button>
					<Link
						to="/app/akun/buat"
						className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-soft-sm transition-colors hover:bg-muted"
					>
						<Plus className="size-4" />
						Tambah akun
					</Link>
				</div>
			</header>

			<section className="p-5">
				<div>
					<h2 className="text-base font-bold">Tanggal konversi</h2>
					<p className="mt-1 text-base font-medium text-muted-foreground">
						Silakan pilih tanggal konversi/tanggal mulai pencatatan di Jurnal
					</p>
				</div>
				<label htmlFor="conversion-date" className="sr-only">
					Tanggal konversi
				</label>
				<div className="relative mt-4 w-full max-w-xs">
					<input
						id="conversion-date"
						type="text"
						inputMode="numeric"
						autoComplete="off"
						placeholder="dd/mm/yyyy"
						value={typedDate ?? isoToDisplay(conversionDate)}
						disabled={savingConversion}
						onChange={event => {
							const next = event.target.value;
							setTypedDate(next);
							setDateError('');
							const parsed = parseTypedDate(next);
							if (parsed !== null && parsed !== conversionDate) {
								void persistConversionDate(parsed);
							}
						}}
						onBlur={() => {
							if (typedDate === null) return;
							const parsed = parseTypedDate(typedDate);
							if (parsed === null) {
								setDateError('Tanggal tidak valid. Ketik dd/mm/yyyy, misalnya 03/01/2026.');
								return;
							}
							setTypedDate(null);
							setDateError('');
							if (parsed !== conversionDate) void persistConversionDate(parsed);
						}}
						className="w-full rounded-xl border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none ring-primary/30 focus:ring-2 disabled:opacity-60"
					/>
					<input
						type="date"
						aria-label="Pilih tanggal dari kalender"
						value={conversionDate}
						disabled={savingConversion}
						onChange={event => {
							setTypedDate(null);
							setDateError('');
							void persistConversionDate(event.target.value);
						}}
						className="absolute inset-y-1 right-1 w-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
					/>
					<Calendar
						className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-foreground"
						aria-hidden
					/>
				</div>
				{dateError ? <p className="mt-2 text-sm font-semibold text-destructive">{dateError}</p> : null}
				<p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<span>{conversionNotice}</span>
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => setShowNotes(true)}
									aria-label="Hal yang perlu diperhatikan"
									title="Hal yang perlu diperhatikan"
									className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-violet-300 bg-violet-50 text-violet-800 transition-colors hover:bg-violet-100"
								>
									<Info className="size-3.5" strokeWidth={2.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="top" className="max-w-xs text-center !text-base !font-medium !leading-6">
								{conversionNotice}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</p>
			</section>

			<Dialog open={showNotes} onOpenChange={setShowNotes}>
				<DialogContent className="max-h-[min(85dvh,40rem)] max-w-lg overflow-y-auto rounded-2xl border-emerald-100 bg-[#f4faf6] p-6 text-sm text-[#3d5c4e] shadow-soft sm:rounded-2xl">
					<DialogTitle className="pr-8 text-base font-bold text-[#1f3d32]">
						Hal yang perlu diperhatikan:
					</DialogTitle>
					<ul className="mt-1 list-disc space-y-2 pl-5 leading-relaxed">
						<li>Pastikan daftar akun Anda lengkap.</li>
						<li>
							Siapkan saldo akun yang akan Anda gunakan sebagai saldo awal untuk
							pencatatan di Jurnal. Jika belum lengkap, Anda bisa simpan dulu sebagai
							draf.
						</li>
						<li>
							Setelah saldo awal lengkap & seimbang, klik <strong>Terbitkan saldo awal</strong>
							untuk memindahkannya menjadi transaksi jurnal — muncul di Jurnal, Buku Besar,
							Neraca, dan Laba Rugi. Kolom saldo awal lalu dikosongkan.
						</li>
						<li>
							Transaksi yang diinput sebelum tanggal konversi tidak akan memengaruhi
							saldo akun saat ini. Hanya transaksi pada atau setelah tanggal konversi
							yang menambah/mengurangi saldo.
						</li>
					</ul>
					<div className="flex justify-end">
						<DialogClose className="inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800">
							Tutup
						</DialogClose>
					</div>
				</DialogContent>
			</Dialog>

			<TutupBukuDialog
				open={showTutupBuku}
				onOpenChange={setShowTutupBuku}
				companyId={activeCompany.id}
				conversionDate={conversionDate || undefined}
			/>

			{error ? (
				<p className="text-sm font-semibold text-destructive">{error}</p>
			) : null}

			<div className="max-h-[70dvh] overflow-y-auto overscroll-y-contain text-[11px] leading-tight text-slate-700">
				{/* Header tabel */}
				<div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_7.25rem_7.25rem_1.5rem] items-center gap-1.5 border-b border-slate-200/80 bg-background px-3 py-3 text-sm font-medium text-slate-500 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_1.5rem] sm:px-4">
					<span>Akun</span>
					<span className="flex items-center justify-end gap-1">
						Debit
						<span
							className="inline-flex size-3.5 items-center justify-center rounded-full border border-slate-300 text-[8px] text-slate-400"
							title="Saldo normal di sisi debit untuk aset dan beban"
						>
							<Info className="size-2" />
						</span>
					</span>
					<span className="flex items-center justify-end gap-1">
						Kredit
						<span
							className="inline-flex size-3.5 items-center justify-center rounded-full border border-slate-300 text-[8px] text-slate-400"
							title="Saldo normal di sisi kredit untuk liabilitas, ekuitas, dan pendapatan"
						>
							<Info className="size-2" />
						</span>
					</span>
					<span />
				</div>

				{ACCOUNT_TYPES.map(accountType => {
					const group = accounts.filter(account => account.type === accountType);
					if (group.length === 0) return null;
					return (
						<section key={accountType}>
							<div className="border-b border-slate-200/70 bg-slate-100/80 px-3 py-1 text-[11px] font-semibold text-slate-800 sm:px-4">
								{ACCOUNT_TYPE_LABELS[accountType]}
							</div>
							<ul>
								{nestAccounts(group).map(({ account, depth }) => {
									const d = drafts[account.id] ?? { debit: '', credit: '' };
									const isSaving = savingId === account.id;
									const isHeader = headerIds.has(account.id);
									let headerDebit = 0;
									let headerCredit = 0;
									if (isHeader) {
										const acc = accumulatedOpening(account.id);
										const side = normalSide(account.type);
										if (side === 'debit') {
											if (acc >= 0) headerDebit = acc;
											else headerCredit = -acc;
										} else if (acc >= 0) {
											headerCredit = acc;
										} else {
											headerDebit = -acc;
										}
									}
									return (
										<li
											key={account.id}
											className="grid grid-cols-[minmax(0,1fr)_7.25rem_7.25rem_1.5rem] items-center gap-1.5 border-b border-slate-200/60 px-3 py-0.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_1.5rem] sm:px-4"
										>
											<div
												className="flex min-w-0 items-center gap-1.5 pr-1"
												style={{ paddingLeft: depth * 14 }}
											>
												<p
													className={cn(
														'min-w-0 flex-1 truncate text-sm leading-4',
														isHeader ? 'font-semibold text-slate-800' : 'text-slate-700',
													)}
												>
													<span className="mr-2 text-[11px] font-medium text-slate-500">
														{account.code}
													</span>
													<span>{account.name}</span>
												</p>
											</div>
											{isHeader ? (
												<>
													<ReadOnlyAmount value={headerDebit} />
													<ReadOnlyAmount value={headerCredit} />
												</>
											) : (
												<>
													<MoneyCell
														value={d.debit}
														disabled={isSaving}
														placeholder={normalSide(account.type) === 'debit' ? '0,00' : ''}
														onChange={value => updateDraft(account.id, 'debit', value)}
														onBlur={() => persistOpening(account)}
													/>
													<MoneyCell
														value={d.credit}
														disabled={isSaving}
														placeholder={normalSide(account.type) === 'credit' ? '0,00' : ''}
														onChange={value => updateDraft(account.id, 'credit', value)}
														onBlur={() => persistOpening(account)}
													/>
												</>
											)}
											<div className="flex items-center justify-end gap-0.5">
												<Link
													to={`/app/akun/ubah/${account.id}`}
													aria-label={`Ubah akun ${account.name}`}
													className="rounded p-0.5 text-slate-400 transition-colors hover:bg-[#8b5cf6]/10 hover:text-[#8b5cf6]"
												>
													<Pencil className="size-3" />
												</Link>
												<button
													type="button"
													onClick={() => handleDelete(account)}
													aria-label={`Hapus akun ${account.name}`}
													className="rounded p-0.5 text-slate-400 transition-colors hover:bg-destructive/10 hover:text-destructive"
												>
													<Trash2 className="size-3" />
												</button>
											</div>
										</li>
									);
								})}
							</ul>
						</section>
					);
				})}

				{accounts.length === 0 ? (
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">
						Belum ada akun. Tambahkan akun atau buat perusahaan baru agar bagan standar
						terisi otomatis.
					</p>
				) : null}

				{/* Footer total */}
				{accounts.length > 0 ? (
					<div className="grid grid-cols-[minmax(0,1fr)_7.25rem_7.25rem_1.5rem] items-center gap-1.5 border-t border-slate-300 px-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_1.5rem] sm:px-4">
						<span className="text-[11px] font-semibold text-slate-800">Total</span>
						<span className="text-right text-[11px] font-semibold tabular-nums text-slate-800">
							Rp {formatInputNumber(totals.debit) || '0'}
						</span>
						<span className="text-right text-[11px] font-semibold tabular-nums text-slate-800">
							Rp {formatInputNumber(totals.credit) || '0'}
						</span>
						<span />
						<p
							className={cn(
								'col-span-full mt-1 text-xs font-medium',
								totals.balanced ? 'text-primary' : 'text-amber-600',
							)}
						>
							{totals.balanced
								? 'Debit dan kredit seimbang.'
								: 'Debit dan kredit belum seimbang — periksa saldo awal.'}
						</p>
					</div>
				) : null}
			</div>

			<div className="flex justify-end">
				<button
					type="button"
					onClick={handlePublishOpening}
					disabled={isPublishing || accounts.length === 0 || !conversionDate}
					className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
				>
					<Send className="size-4" />
					{isPublishing ? 'Menerbitkan…' : 'Terbitkan saldo awal'}
				</button>
			</div>

			{historyGroups.length > 0 ? (
				<section className="flex flex-col gap-3">
					<div>
						<h2 className="text-base font-bold">Riwayat penerbitan saldo awal</h2>
						<p className="mt-0.5 text-sm text-muted-foreground">
							{historyGroups.length} kali penerbitan · {history.length} baris jurnal
						</p>
					</div>
					<div className="flex flex-col gap-3">
						{historyGroups.map(group => (
							<div
								key={group.id}
								className="overflow-hidden rounded-xl border border-border bg-card shadow-soft-sm"
							>
								<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
									<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
										<span className="text-sm font-semibold text-foreground">
											{formatDate(group.date.slice(0, 10))}
										</span>
										<span className="text-xs text-muted-foreground">{group.numbers}</span>
									</div>
									<span className="text-sm font-bold tabular-nums text-foreground">
										Rp {formatInputNumber(group.total) || '0'}
									</span>
								</div>
								<div className="grid grid-cols-[minmax(0,1fr)_7.25rem_7.25rem] items-center gap-1.5 border-b border-border/40 px-4 py-1 text-[10px] font-medium text-slate-400 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem]">
									<span>Akun</span>
									<span className="text-right">Debit</span>
									<span className="text-right">Kredit</span>
								</div>
								<ul>
									{group.lines.map(line => (
										<li
											key={line.id}
											className="grid grid-cols-[minmax(0,1fr)_7.25rem_7.25rem] items-center gap-1.5 border-b border-border/60 px-4 py-1.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem]"
										>
											<span className="truncate text-xs text-slate-700">
												<span className="mr-2 text-slate-500">
													{line.expand?.account?.code ?? ''}
												</span>
												{line.expand?.account?.name ?? line.description}
											</span>
											<span className="text-right text-xs tabular-nums text-slate-700">
												{line.debit ? formatInputNumber(line.debit) : ''}
											</span>
											<span className="text-right text-xs tabular-nums text-slate-700">
												{line.credit ? formatInputNumber(line.credit) : ''}
											</span>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</section>
			) : null}
		</div>
	);
}

function MoneyCell({
	value,
	disabled,
	placeholder = '0,00',
	onChange,
	onBlur,
}: {
	value: string;
	disabled?: boolean;
	placeholder?: string;
	onChange: (value: string) => void;
	onBlur: () => void;
}) {
	return (
		<div className="flex h-6 items-stretch overflow-hidden rounded border border-slate-200 bg-white focus-within:ring-1 focus-within:ring-primary/30">
			<span className="flex items-center border-r border-slate-200 bg-slate-50 px-1 text-[10px] font-medium text-slate-400">
				Rp
			</span>
			<input
				type="text"
				inputMode="decimal"
				disabled={disabled}
				value={value}
				placeholder={placeholder}
				onChange={event => onChange(event.target.value)}
				onBlur={onBlur}
				className="min-w-0 flex-1 bg-transparent px-1.5 text-right text-[11px] tabular-nums text-slate-700 outline-none placeholder:text-slate-300 disabled:opacity-60"
			/>
		</div>
	);
}

/** Tampilan saldo akun header (akumulasi sub-akun) — hanya baca. */
function ReadOnlyAmount({ value }: { value: number }) {
	return (
		<div className="flex h-6 items-center justify-end rounded border border-transparent bg-slate-50/60 px-1.5 text-right text-[11px] font-semibold tabular-nums text-slate-500">
			{value ? formatInputNumber(value) : ''}
		</div>
	);
}
