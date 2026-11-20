import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import {
	ACCOUNT_TYPE_LABELS,
	ACCOUNT_TYPES,
	dayBeforeIso,
	formatDate,
	formatRupiah,
	todayIso,
	type Account,
	type AccountType,
	type Company,
	type JournalEntry,
} from '@/lib/accounting';
import {
	PSAK_CATEGORIES,
	PSAK_CATEGORY_LABELS,
} from '@/lib/psak118';

const PSAK_AUTO = '__auto__';

const ACCOUNT_TYPE_PREFIX: Record<AccountType, string> = {
	aset: '1',
	liabilitas: '2',
	ekuitas: '3',
	pendapatan: '4',
	beban: '5',
};

/**
 * Sarankan kode akun berikutnya berdasarkan urutan utama pada kategori yang sama.
 * Contoh: kode terakhir `1-1003` → `1-1004`, atau `106` → `107`.
 */
function suggestNextCode(accounts: Account[], type: AccountType): string {
	let best: { prefix: string; num: number; width: number; groupKey: string } | null = null;
	for (const account of accounts) {
		if (account.type !== type) continue;
		const match = /^(.*?)(\d+)$/.exec(account.code.trim());
		if (!match) continue;
		const prefix = match[1];
		const numStr = match[2];
		const num = Number.parseInt(numStr, 10);
		if (!Number.isFinite(num)) continue;
		const groupKey = `${prefix}${numStr.slice(0, 1)}`;
		if (
			!best ||
			groupKey < best.groupKey ||
			(groupKey === best.groupKey && num > best.num)
		) {
			best = { prefix, num, width: numStr.length, groupKey };
		}
	}
	if (!best) {
		return `${ACCOUNT_TYPE_PREFIX[type]}-1001`;
	}
	const next = best.num + 1;
	const padded = String(next).padStart(best.width, '0');
	return `${best.prefix}${padded}`;
}

/** Saldo normal: aset & beban di debit; liabilitas, ekuitas, pendapatan di kredit. */
function normalSide(type: AccountType): 'debit' | 'credit' {
	return type === 'aset' || type === 'beban' ? 'debit' : 'credit';
}

function parseIdNumber(raw: string): number {
	const cleaned = raw.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '');
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : 0;
}

function formatInputNumber(value: number): string {
	if (!value || Number.isNaN(value)) return '';
	return new Intl.NumberFormat('id-ID', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value);
}

export interface AccountFormProps {
	activeCompany: Company | null;
	/** Id akun yang akan diedit. Kosong = mode buat akun baru. */
	accountId?: string;
}

export function AccountForm({ activeCompany, accountId }: AccountFormProps) {
	const navigate = useNavigate();
	const isEdit = Boolean(accountId);

	const [accounts, setAccounts] = useState<Account[]>([]);
	const [code, setCode] = useState('');
	const [codeTouched, setCodeTouched] = useState(isEdit);
	const [name, setName] = useState('');
	const [type, setType] = useState<AccountType>('aset');
	const [isSaving, setIsSaving] = useState(false);
	const [partOfOther, setPartOfOther] = useState(false);
	const [linkMode, setLinkMode] = useState<'sub' | 'header'>('sub');
	const [parentId, setParentId] = useState('');
	const [error, setError] = useState('');
	const [openingEnabled, setOpeningEnabled] = useState(false);
	const [openingDebit, setOpeningDebit] = useState('');
	const [openingCredit, setOpeningCredit] = useState('');
	const [psak118Category, setPsak118Category] = useState<string>(PSAK_AUTO);
	const [loading, setLoading] = useState(isEdit);
	const [history, setHistory] = useState<JournalEntry[]>([]);
	const [historyLoading, setHistoryLoading] = useState(isEdit);
	const [historyError, setHistoryError] = useState('');

	const loadAccounts = useCallback(async () => {
		if (!activeCompany) {
			setAccounts([]);
			return;
		}
		const list = await pb.collection('accounts').getFullList<Account>({
			filter: pb.filter('company = {:company}', { company: activeCompany.id }),
			sort: 'code',
		});
		setAccounts(list);
		return list;
	}, [activeCompany]);

	// Muat akun yang akan diedit, lalu isi formulir.
	useEffect(() => {
		if (!accountId || !activeCompany) {
			setLoading(false);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const list = await loadAccounts();
				const account = (list ?? []).find(item => item.id === accountId);
				if (!account || cancelled) return;
				setCode(account.code);
				setName(account.name);
				setType(account.type);
				if (account.parent) {
					setPartOfOther(true);
					setLinkMode('sub');
					setParentId(account.parent);
				} else if (account.is_header) {
					setPartOfOther(true);
					setLinkMode('header');
				}
				setPsak118Category(account.psak118_category ?? PSAK_AUTO);
				const opening = account.opening_balance || 0;
				if (opening) {
					setOpeningEnabled(true);
					const side = normalSide(account.type);
					if (side === 'debit') {
						setOpeningDebit(opening > 0 ? formatInputNumber(opening) : '');
						setOpeningCredit(opening < 0 ? formatInputNumber(-opening) : '');
					} else {
						setOpeningCredit(opening > 0 ? formatInputNumber(opening) : '');
						setOpeningDebit(opening < 0 ? formatInputNumber(-opening) : '');
					}
				}
			} catch {
				if (!cancelled) setError('Gagal memuat data akun.');
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [accountId, activeCompany, loadAccounts]);

	useEffect(() => {
		if (!accountId || !activeCompany) {
			setHistory([]);
			setHistoryLoading(false);
			return;
		}
		let cancelled = false;
		setHistoryLoading(true);
		setHistoryError('');
		pb.collection('entries')
			.getFullList<JournalEntry>({
				filter: pb.filter('company = {:company} && account = {:account}', {
					company: activeCompany.id,
					account: accountId,
				}),
				sort: '-date,-created',
				requestKey: `account-history-${accountId}`,
			})
			.then(rows => {
				if (!cancelled) setHistory(rows);
			})
			.catch((err: { status?: number }) => {
				if (cancelled || err?.status === 0) return;
				setHistoryError('Gagal memuat riwayat transaksi akun.');
			})
			.finally(() => {
				if (!cancelled) setHistoryLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [accountId, activeCompany]);

	// Mode buat: muat daftar akun untuk saran kode & pilihan induk.
	useEffect(() => {
		if (isEdit) return;
		let cancelled = false;
		loadAccounts().catch(() => {
			if (!cancelled) setError('Gagal memuat daftar akun.');
		});
		return () => {
			cancelled = true;
		};
	}, [isEdit, loadAccounts]);

	// Sarankan kode otomatis hanya pada mode buat.
	useEffect(() => {
		if (isEdit) return;
		if (codeTouched) return;
		setCode(suggestNextCode(accounts, type));
	}, [accounts, type, codeTouched, isEdit]);

	if (!activeCompany) {
		return null;
	}

	if (loading) {
		return (
			<div className="flex flex-col gap-4">
				<div className="h-4 w-40 animate-pulse rounded bg-muted" />
				<div className="h-10 w-full animate-pulse rounded-md bg-muted" />
			</div>
		);
	}

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		setIsSaving(true);
		try {
			const trimmedCode = code.trim();
			const trimmedName = name.trim();
			if (!trimmedCode || !trimmedName) {
				setError('Kode dan nama akun wajib diisi.');
				setIsSaving(false);
				return;
			}
			if (partOfOther && linkMode === 'sub' && !parentId) {
				setError('Pilih akun induk untuk sub-akun.');
				setIsSaving(false);
				return;
			}

			let opening = 0;
			if (openingEnabled) {
				const debitVal = parseIdNumber(openingDebit);
				const creditVal = parseIdNumber(openingCredit);
				const side = normalSide(type);
				if (debitVal > 0 && creditVal > 0) {
					opening = side === 'debit' ? debitVal - creditVal : creditVal - debitVal;
				} else if (debitVal > 0) {
					opening = side === 'debit' ? debitVal : -debitVal;
				} else if (creditVal > 0) {
					opening = side === 'credit' ? creditVal : -creditVal;
				}
			}
			const openingDate = activeCompany.conversion_date
				? dayBeforeIso(activeCompany.conversion_date)
				: todayIso();

			const psakValue =
				(type === 'pendapatan' || type === 'beban') && psak118Category !== PSAK_AUTO
					? psak118Category
					: null;

			const payload: Record<string, unknown> = {
				code: trimmedCode,
				name: trimmedName,
				type,
				is_header: partOfOther && linkMode === 'header',
				parent: partOfOther && linkMode === 'sub' ? parentId : null,
				psak118_category: psakValue,
			};

			if (isEdit && accountId) {
				// Mode ubah: perbarui akun yang ada. Jangan sentuh relasi
				// company/owner agar hierarki dan kepemilikan tetap utuh.
				if (openingEnabled) {
					payload.opening_balance = opening;
					payload.opening_balance_date = openingDate;
				}
				await pb.collection('accounts').update(accountId, payload);
				toast.success('Akun berhasil diperbarui.');
				navigate('/app/akun');
				return;
			}

			// Mode buat.
			const account = await pb.collection('accounts').create<Account>({
				company: activeCompany.id,
				code: trimmedCode,
				name: trimmedName,
				type,
				opening_balance: opening,
				opening_balance_date: opening ? openingDate : null,
				owner: pb.authStore.record?.id ?? '',
				is_header: partOfOther && linkMode === 'header',
				psak118_category: psakValue,
				...(partOfOther && linkMode === 'sub' ? { parent: parentId } : {}),
			});
			if (!account || !account.id) {
				throw new Error('Akun gagal dibuat.');
			}
			if (partOfOther && linkMode === 'header' && parentId) {
				try {
					await pb.collection('accounts').update(parentId, { parent: account.id });
				} catch {
					toast.success('Akun header berhasil ditambahkan.');
					toast.error('Gagal menautkan akun terpilih ke header ini.');
					navigate('/app/akun');
					return;
				}
			}
			toast.success(opening ? 'Akun & saldo awal berhasil ditambahkan.' : 'Akun berhasil ditambahkan.');
			navigate('/app/akun');
		} catch {
			setError(
				isEdit
					? 'Gagal memperbarui akun. Periksa kode dan nama, lalu coba lagi.'
					: 'Gagal menambah akun. Periksa kode dan nama, lalu coba lagi.',
			);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<button
				type="button"
				onClick={() => navigate('/app/akun')}
				className="inline-flex w-fit min-h-11 items-center gap-2 text-sm font-semibold text-[#334155] transition-colors hover:text-[#1e293b]"
			>
				<ArrowLeft className="size-4" />
				Kembali ke daftar akun
			</button>

			<form onSubmit={handleSave} className="px-1 py-2 sm:px-2">
				<div className="mb-6 flex items-center gap-2.5 text-[#1e293b]">
					<ClipboardList className="size-[18px] text-[#334155]" strokeWidth={1.75} />
					<h1 className="text-[17px] font-bold tracking-tight">
						{isEdit ? 'Ubah akun' : 'Informasi akun'}
					</h1>
				</div>

				<div className="grid items-start gap-x-8 gap-y-5 lg:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<div className="flex items-baseline justify-between gap-3">
							<label htmlFor="account-name" className="text-[13px] font-semibold text-[#1e293b]">
								Nama akun <span className="text-[#e11d48]">*</span>
							</label>
							<span className="text-xs tabular-nums text-[#94a3b8]">{name.length} / 255</span>
						</div>
						<input
							id="account-name"
							required
							value={name}
							onChange={event => setName(event.target.value)}
							maxLength={255}
							className="h-10 w-full rounded-md border border-[#d7dee8] bg-white px-3 text-sm text-[#0f172a] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<div className="flex items-baseline justify-between gap-3">
							<label htmlFor="account-code" className="text-[13px] font-semibold text-[#1e293b]">
								Kode akun
							</label>
							<span className="text-xs tabular-nums text-[#94a3b8]">{code.length} / 255</span>
						</div>
						<input
							id="account-code"
							required
							value={code}
							onChange={event => {
								setCode(event.target.value);
								setCodeTouched(true);
							}}
							maxLength={255}
							placeholder="1-10102"
							className="h-10 w-full rounded-md border border-[#d7dee8] bg-white px-3 text-sm text-[#0f172a] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
						/>
						<p className="text-xs text-[#94a3b8]">
							{isEdit
								? 'Ubah kode akun bila perlu.'
								: 'Otomatis dari kode terakhir kategori ini, bisa diubah manual.'}
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<label htmlFor="account-type" className="text-[13px] font-semibold text-[#1e293b]">
							Kategori akun
						</label>
						<div className="relative">
							<select
								id="account-type"
								value={type}
								onChange={event => {
									setType(event.target.value as AccountType);
									setParentId('');
									if (!isEdit) setCodeTouched(false);
								}}
								className="h-10 w-full appearance-none rounded-md border border-[#d7dee8] bg-white px-3 pr-9 text-sm text-[#0f172a] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
							>
								{ACCOUNT_TYPES.map(value => (
									<option key={value} value={value}>
										{ACCOUNT_TYPE_LABELS[value]}
									</option>
								))}
							</select>
							<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b]">
								▾
							</span>
						</div>
					</div>
				</div>

				{type === 'pendapatan' || type === 'beban' ? (
					<div className="mt-5">
						<label htmlFor="account-psak118" className="text-[13px] font-semibold text-[#1e293b]">
							Kategori laporan PSAK 118
						</label>
						<div className="relative mt-1.5 max-w-md">
							<select
								id="account-psak118"
								value={psak118Category}
								onChange={event => setPsak118Category(event.target.value)}
								className="h-10 w-full appearance-none rounded-md border border-[#d7dee8] bg-white px-3 pr-9 text-sm text-[#0f172a] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
							>
								<option value={PSAK_AUTO}>Otomatis (berdasarkan nama akun)</option>
								{PSAK_CATEGORIES.map(cat => (
									<option key={cat} value={cat}>
										{PSAK_CATEGORY_LABELS[cat]}
									</option>
								))}
							</select>
							<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b]">
								▾
							</span>
						</div>
						<p className="mt-1.5 text-xs text-[#94a3b8]">
							Menentukan kelompok penyajian akun pada laporan laba rugi PSAK 118.
							Pilih “Otomatis” untuk memakai klasifikasi berdasarkan nama akun.
						</p>
					</div>
				) : null}

				<div className="mt-5">
					<label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-[#1e293b]">
						<input
							type="checkbox"
							checked={partOfOther}
							onChange={event => {
								setPartOfOther(event.target.checked);
								if (!event.target.checked) setParentId('');
							}}
							className="size-4 rounded border-[#cbd5e1] accent-[#7c3aed]"
						/>
						Buat akun ini bagian dari akun lain
						<span
							className="inline-flex size-4 items-center justify-center rounded-full border border-[#94a3b8] text-[10px] font-semibold text-[#64748b]"
							title="Sub-akun berada di bawah akun lain. Header akun dipakai sebagai pengelompokan."
						>
							i
						</span>
					</label>

					{partOfOther ? (
						<div className="mt-3 flex max-w-xl flex-col gap-3 pl-1">
							<label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-[#1e293b]">
								<input
									type="radio"
									name="account-link-mode"
									checked={linkMode === 'sub'}
									onChange={() => setLinkMode('sub')}
									className="size-4 accent-[#7c3aed]"
								/>
								Jadikan sub-akun dari
							</label>
							{linkMode === 'sub' ? (
								<div className="relative ml-6 max-w-md">
									<select
										aria-label="Pilih akun induk"
										value={parentId}
										onChange={event => setParentId(event.target.value)}
										className="h-10 w-full appearance-none rounded-md border border-[#d7dee8] bg-white px-3 pr-9 text-sm outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
									>
										<option value="">Pilih akun</option>
										{accounts
											.filter(
												account =>
													account.type === type &&
													!account.parent &&
													account.id !== accountId,
											)
											.map(account => (
												<option key={account.id} value={account.id}>
													{account.code} — {account.name}
												</option>
											))}
									</select>
									<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b]">
										▾
									</span>
								</div>
							) : null}
							<label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-[#94a3b8] has-[:checked]:text-[#1e293b]">
								<input
									type="radio"
									name="account-link-mode"
									checked={linkMode === 'header'}
									onChange={() => {
										setLinkMode('header');
										setParentId('');
									}}
									className="size-4 accent-[#7c3aed]"
								/>
								Jadikan header akun dari
							</label>
							{linkMode === 'header' ? (
								<div className="relative ml-6 max-w-md">
									<select
										aria-label="Pilih akun yang dikelompokkan"
										value={parentId}
										onChange={event => setParentId(event.target.value)}
										className="h-10 w-full appearance-none rounded-md border border-[#d7dee8] bg-white px-3 pr-9 text-sm outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
									>
										<option value="">Pilih akun (opsional)</option>
										{accounts
											.filter(
												account =>
													account.type === type &&
													!account.parent &&
													!account.is_header &&
													account.id !== accountId,
											)
											.map(account => (
												<option key={account.id} value={account.id}>
													{account.code} — {account.name}
												</option>
											))}
									</select>
									<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b]">
										▾
									</span>
								</div>
							) : null}
						</div>
					) : null}
				</div>

				{!(partOfOther && linkMode === 'header') ? (
					<div className="mt-5">
						<label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-[#1e293b]">
							<input
								type="checkbox"
								checked={openingEnabled}
								onChange={event => {
									setOpeningEnabled(event.target.checked);
									if (!event.target.checked) {
										setOpeningDebit('');
										setOpeningCredit('');
									}
								}}
								className="size-4 rounded border-[#cbd5e1] accent-[#7c3aed]"
							/>
							{isEdit ? 'Ubah saldo awal' : 'Atur saldo awal'}
						</label>
						{openingEnabled ? (
							<div className="mt-3 flex max-w-xl flex-col gap-3 pl-1">
								<p className="text-xs text-[#94a3b8]">
									Saldo normal kategori {ACCOUNT_TYPE_LABELS[type]} berada di sisi{' '}
									{normalSide(type) === 'debit' ? 'debit' : 'kredit'}.
								</p>
								<div className="grid max-w-md grid-cols-2 gap-3">
									<OpeningMoneyCell
										label="Debit"
										value={openingDebit}
										onChange={value => {
											setOpeningDebit(value);
											if (value.trim()) setOpeningCredit('');
										}}
									/>
									<OpeningMoneyCell
										label="Kredit"
										value={openingCredit}
										onChange={value => {
											setOpeningCredit(value);
											if (value.trim()) setOpeningDebit('');
										}}
									/>
								</div>
							</div>
						) : null}
					</div>
				) : null}

				{error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}

				<div className="mt-6 flex justify-end">
					<button
						type="submit"
						disabled={isSaving}
						className="inline-flex min-h-10 items-center rounded-md bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:opacity-60"
					>
						{isSaving
							? isEdit
								? 'Menyimpan…'
								: 'Menyimpan…'
							: isEdit
								? 'Simpan perubahan'
								: 'Simpan akun'}
					</button>
				</div>
			</form>

			{isEdit ? (
				<AccountHistory
					entries={history}
					loading={historyLoading}
					error={historyError}
					openingBalance={accounts.find(item => item.id === accountId)?.opening_balance || 0}
					openingDate={accounts.find(item => item.id === accountId)?.opening_balance_date}
					type={type}
				/>
			) : null}
		</div>
	);
}

function AccountHistory({
	entries,
	loading,
	error,
	openingBalance,
	openingDate,
	type,
}: {
	entries: JournalEntry[];
	loading: boolean;
	error: string;
	openingBalance: number;
	openingDate?: string;
	type: AccountType;
}) {
	const debitTotal = entries.reduce((sum, entry) => sum + (Number(entry.debit) || 0), 0);
	const creditTotal = entries.reduce((sum, entry) => sum + (Number(entry.credit) || 0), 0);
	const side = normalSide(type);
	const openingDebit = openingBalance > 0 && side === 'debit' ? openingBalance : openingBalance < 0 && side === 'credit' ? -openingBalance : 0;
	const openingCredit = openingBalance > 0 && side === 'credit' ? openingBalance : openingBalance < 0 && side === 'debit' ? -openingBalance : 0;

	/** Peta entry.id → jalur formulir transaksi terkait (bila tersedia). */
	const [links, setLinks] = useState<Record<string, string>>({});

	useEffect(() => {
		const txIds = Array.from(
			new Set(entries.map(entry => (entry.transaction || '').trim()).filter(Boolean)),
		);
		if (txIds.length === 0) {
			// Tidak ada transaksi sumber: entri jurnal mandiri → editor jurnal.
			const map: Record<string, string> = {};
			for (const entry of entries) {
				if (!entry.transaction) map[entry.id] = entry.payroll_run ? '/app/biaya' : `/app/jurnal/ubah/${entry.id}`;
			}
			setLinks(map);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const txParams: Record<string, string> = {};
				const txFilter = txIds
					.map((id, index) => {
						txParams[`t${index}`] = id;
						return `id = {:t${index}}`;
					})
					.join(' || ');
				const txList = await pb.collection('transactions').getFullList<{ id: string; category: string }>({
					filter: pb.filter(txFilter, txParams),
					fields: 'id,category',
					requestKey: null,
				});
				const txCategory = new Map(txList.map(tx => [tx.id, tx.category]));
				const docTxIds = txList
					.filter(tx => tx.category === 'penjualan' || tx.category === 'pembelian')
					.map(tx => tx.id);
				const docByTx = new Map<string, { id: string; direction: string }>();
				if (docTxIds.length > 0) {
					const docParams: Record<string, string> = {};
					const docFilter = docTxIds
						.map((id, index) => {
							docParams[`d${index}`] = id;
							return `transaction = {:d${index}}`;
						})
						.join(' || ');
					const docs = await pb
						.collection('documents')
						.getFullList<{ id: string; direction: string; transaction: string }>({
							filter: pb.filter(docFilter, docParams),
							fields: 'id,direction,transaction',
							requestKey: null,
						});
					for (const doc of docs) docByTx.set(doc.transaction, doc);
				}
				const map: Record<string, string> = {};
				for (const entry of entries) {
					if (entry.payroll_run) { map[entry.id] = '/app/biaya'; continue; }
					const txId = (entry.transaction || '').trim();
					if (!txId) {
						map[entry.id] = `/app/jurnal/ubah/${entry.id}`;
						continue;
					}
					const category = txCategory.get(txId);
					if (category === 'penjualan' || category === 'pembelian') {
						const doc = docByTx.get(txId);
						if (doc) map[entry.id] = `/app/${category}/dokumen/lihat/${doc.id}`;
					} else if (category === 'biaya') {
						map[entry.id] = `/app/biaya/ubah/${txId}`;
					} else if (category === 'kas_bank') {
						map[entry.id] = `/app/kas-bank`;
					} else if (category === 'aset') {
						map[entry.id] = `/app/aset`;
					}
				}
				if (!cancelled) setLinks(map);
			} catch {
				if (!cancelled) setLinks({});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [entries]);

	return (
		<section className="mt-8 border-t border-[#e2e8f0] pt-6">
			<div className="mb-3 flex flex-wrap items-end justify-between gap-2">
				<div>
					<h2 className="text-[15px] font-bold text-[#1e293b]">Riwayat transaksi</h2>
					<p className="mt-0.5 text-xs text-[#94a3b8]">
						Jurnal yang sudah tercatat pada akun ini. Klik nomor untuk membuka transaksi terkait.
					</p>
				</div>
				{!loading && entries.length > 0 ? (
					<p className="text-xs tabular-nums text-[#64748b]">{entries.length} baris</p>
				) : null}
			</div>

			{loading ? (
				<div className="flex flex-col gap-2">
					<div className="h-8 animate-pulse rounded bg-[#f1f5f9]" />
					<div className="h-8 animate-pulse rounded bg-[#f1f5f9]" />
					<div className="h-8 w-2/3 animate-pulse rounded bg-[#f1f5f9]" />
				</div>
			) : error ? (
				<p className="text-sm font-semibold text-destructive">{error}</p>
			) : entries.length === 0 && !openingBalance ? (
				<p className="py-6 text-sm text-[#64748b]">Belum ada transaksi pada akun ini.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] border-collapse text-[13px] text-[#1e293b]">
						<thead>
							<tr className="border-b border-[#e2e8f0] text-left text-xs font-semibold text-[#64748b]">
								<th className="py-2 pr-3 font-semibold">Tanggal</th>
								<th className="py-2 pr-3 font-semibold">Nomor</th>
								<th className="py-2 pr-3 font-semibold">Keterangan</th>
								<th className="py-2 pr-3 text-right font-semibold">Debit</th>
								<th className="py-2 text-right font-semibold">Kredit</th>
							</tr>
						</thead>
						<tbody>
							{openingBalance ? (
								<tr className="border-b border-[#f1f5f9]">
									<td className="py-2 pr-3 tabular-nums text-[#475569]">
										{openingDate ? formatDate(openingDate) : '—'}
									</td>
									<td className="py-2 pr-3 text-[#64748b]">Saldo awal</td>
									<td className="py-2 pr-3 text-[#334155]">Saldo awal akun</td>
									<td className="py-2 pr-3 text-right tabular-nums">
										{openingDebit ? formatRupiah(openingDebit) : '—'}
									</td>
									<td className="py-2 text-right tabular-nums">
										{openingCredit ? formatRupiah(openingCredit) : '—'}
									</td>
								</tr>
							) : null}
							{entries.map(entry => {
								const href = links[entry.id];
								return (
								<tr key={entry.id} className="border-b border-[#f1f5f9]">
									<td className="py-2 pr-3 tabular-nums text-[#475569]">{formatDate(entry.date)}</td>
									<td className="py-2 pr-3 font-medium text-[#7c3aed]">
										{href ? (
											<Link to={href} className="hover:underline" title="Buka transaksi">
												{entry.number || '—'}
											</Link>
										) : (
											entry.number || '—'
										)}
									</td>
									<td className="max-w-[280px] truncate py-2 pr-3 text-[#334155]">
										{entry.description || '—'}
									</td>
									<td className="py-2 pr-3 text-right tabular-nums">
										{entry.debit ? formatRupiah(entry.debit) : '—'}
									</td>
									<td className="py-2 text-right tabular-nums">
										{entry.credit ? formatRupiah(entry.credit) : '—'}
									</td>
								</tr>
								);
							})}
						</tbody>
						<tfoot>
							<tr className="text-[13px] font-semibold text-[#0f172a]">
								<td className="py-2.5 pr-3" colSpan={3}>
									Total jurnal
								</td>
								<td className="py-2.5 pr-3 text-right tabular-nums">{formatRupiah(debitTotal)}</td>
								<td className="py-2.5 text-right tabular-nums">{formatRupiah(creditTotal)}</td>
							</tr>
						</tfoot>
					</table>
				</div>
			)}
		</section>
	);
}

function OpeningMoneyCell({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-[13px] font-semibold text-[#1e293b]">{label}</span>
			<div className="flex h-10 items-stretch overflow-hidden rounded-md border border-[#d7dee8] bg-white focus-within:ring-2 focus-within:ring-[#8b5cf6]/20">
				<span className="flex items-center border-r border-[#d7dee8] bg-[#f8fafc] px-2.5 text-xs font-semibold text-[#64748b]">
					Rp
				</span>
				<input
					type="text"
					inputMode="decimal"
					value={value}
					placeholder="0,00"
					onChange={event => onChange(event.target.value)}
					className="min-w-0 flex-1 bg-transparent px-2.5 text-right text-sm tabular-nums outline-none placeholder:text-[#94a3b8]"
				/>
			</div>
		</div>
	);
}
