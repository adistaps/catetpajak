import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
	CentralAdminApiError,
	createCentralAdminBankAccount,
	deleteCentralAdminBankAccount,
	fetchCentralAdminBankAccounts,
	updateCentralAdminBankAccount,
	type CentralAdminBankAccount,
} from '@/lib/central-admin';

type Draft = {
	id: string | null;
	bank_name: string;
	account_holder: string;
	account_number: string;
	is_active: boolean;
	sort: string;
};

const EMPTY_DRAFT: Draft = {
	id: null,
	bank_name: '',
	account_holder: '',
	account_number: '',
	is_active: true,
	sort: '0',
};

const fieldClass =
	'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-2';
const labelClass = 'text-xs font-semibold text-muted-foreground';

/**
 * Panel pengelolaan rekening bank untuk pembayaran manual. Admin Pusat dapat
 * menambah, mengubah, menghapus, serta mengaktifkan/menonaktifkan rekening.
 * Hanya rekening aktif yang ditampilkan pada instruksi pembayaran manual.
 */
export function BankAccountsPanel() {
	const [accounts, setAccounts] = useState<CentralAdminBankAccount[] | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState('');
	const [draft, setDraft] = useState<Draft | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	const load = useCallback(async (isRefresh = false) => {
		if (isRefresh) setIsRefreshing(true);
		else setIsLoading(true);
		setError('');
		try {
			const data = await fetchCentralAdminBankAccounts();
			setAccounts(data);
		} catch (err) {
			if (err instanceof CentralAdminApiError) {
				if (err.status === 401) {
					window.location.href = '/login';
					return;
				}
				setError(err.message);
			} else {
				setError('Gagal memuat rekening bank. Periksa koneksi lalu coba lagi.');
			}
			setAccounts([]);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	function startCreate() {
		setDraft({ ...EMPTY_DRAFT });
	}

	function startEdit(account: CentralAdminBankAccount) {
		setDraft({
			id: account.id,
			bank_name: account.bank_name,
			account_holder: account.account_holder,
			account_number: account.account_number,
			is_active: account.is_active,
			sort: String(account.sort ?? 0),
		});
	}

	async function handleSave() {
		if (!draft) return;
		if (!draft.bank_name.trim() || !draft.account_holder.trim() || !draft.account_number.trim()) {
			toast.error('Nama bank, pemilik rekening, dan nomor rekening wajib diisi.');
			return;
		}
		setBusy(true);
		try {
			const payload = {
				bank_name: draft.bank_name.trim(),
				account_holder: draft.account_holder.trim(),
				account_number: draft.account_number.trim(),
				is_active: draft.is_active,
				sort: Number(draft.sort) || 0,
			};
			if (draft.id) {
				const { account } = await updateCentralAdminBankAccount(draft.id, payload);
				setAccounts(prev => prev?.map(item => (item.id === account.id ? account : item)) ?? null);
				toast.success('Rekening bank diperbarui.');
			} else {
				const { account } = await createCentralAdminBankAccount(payload);
				setAccounts(prev => [...(prev ?? []), account]);
				toast.success('Rekening bank ditambahkan.');
			}
			setDraft(null);
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal menyimpan rekening.');
		} finally {
			setBusy(false);
		}
	}

	async function handleToggleActive(account: CentralAdminBankAccount) {
		setBusy(true);
		try {
			const { account: updated } = await updateCentralAdminBankAccount(account.id, {
				is_active: !account.is_active,
			});
			setAccounts(prev => prev?.map(item => (item.id === updated.id ? updated : item)) ?? null);
			toast.success(updated.is_active ? 'Rekening diaktifkan.' : 'Rekening dinonaktifkan.');
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal mengubah status.');
		} finally {
			setBusy(false);
		}
	}

	async function handleDelete(id: string) {
		setBusy(true);
		try {
			await deleteCentralAdminBankAccount(id);
			setAccounts(prev => prev?.filter(item => item.id !== id) ?? null);
			toast.success('Rekening bank dihapus.');
			setConfirmDeleteId(null);
		} catch (err) {
			toast.error(err instanceof CentralAdminApiError ? err.message : 'Gagal menghapus rekening.');
		} finally {
			setBusy(false);
		}
	}

	const activeCount = accounts?.filter(item => item.is_active).length ?? 0;

	return (
		<section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
						<Building2 className="size-5 text-primary" strokeWidth={2} />
						Rekening Bank
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Atur rekening bank yang ditampilkan kepada pelanggan saat pembayaran manual.
						Hanya rekening aktif yang muncul pada instruksi pembayaran.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{accounts && accounts.length > 0 ? (
						<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
							{activeCount} aktif
						</span>
					) : null}
					<button
						type="button"
						onClick={() => void load(true)}
						disabled={isRefreshing}
						className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
					>
						{isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
						Muat ulang
					</button>
					<button
						type="button"
						onClick={startCreate}
						className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
					>
						<Plus className="size-4" strokeWidth={2} />
						Tambah
					</button>
				</div>
			</div>

			{error ? (
				<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
					{error}
				</p>
			) : null}

			{isLoading ? (
				<div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Memuat rekening bank…
				</div>
			) : !accounts || accounts.length === 0 ? (
				<p className="border border-dashed border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
					Belum ada rekening bank. Tekan "Tambah" untuk menambahkan rekening pertama.
				</p>
			) : (
				<div className="grid gap-3 md:grid-cols-2">
					{accounts.map(account => (
						<article
							key={account.id}
							className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
						>
							<div className="flex flex-wrap items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="truncate text-sm font-bold text-foreground">{account.bank_name}</p>
									<p className="truncate text-xs text-muted-foreground">a.n. {account.account_holder}</p>
									<p className="mt-1 font-mono text-base font-bold tracking-tight text-foreground">
										{account.account_number}
									</p>
								</div>
								<span
									className={cn(
										'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
										account.is_active
											? 'border-emerald-200 bg-emerald-50 text-emerald-700'
											: 'border-slate-200 bg-slate-50 text-slate-500',
									)}
								>
									{account.is_active ? 'Aktif' : 'Nonaktif'}
								</span>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={() => startEdit(account)}
									disabled={busy}
									className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-xs font-semibold transition hover:bg-secondary disabled:opacity-60"
								>
									<Pencil className="size-3.5" /> Ubah
								</button>
								<button
									type="button"
									onClick={() => void handleToggleActive(account)}
									disabled={busy}
									className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3.5 text-xs font-semibold transition hover:bg-secondary disabled:opacity-60"
								>
									{account.is_active ? 'Nonaktifkan' : 'Aktifkan'}
								</button>
								<button
									type="button"
									onClick={() => setConfirmDeleteId(account.id)}
									disabled={busy}
									className="inline-flex h-8 items-center gap-1.5 rounded-full border border-red-200 bg-white px-3.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
								>
									<Trash2 className="size-3.5" /> Hapus
								</button>
							</div>

							{confirmDeleteId === account.id ? (
								<div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
									<span className="text-xs font-medium text-red-700">Hapus rekening ini?</span>
									<button
										type="button"
										onClick={() => void handleDelete(account.id)}
										disabled={busy}
										className="inline-flex h-7 items-center rounded-full bg-red-600 px-3 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
									>
										{busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Hapus'}
									</button>
									<button
										type="button"
										onClick={() => setConfirmDeleteId(null)}
										className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-xs font-semibold"
									>
										Batal
									</button>
								</div>
							) : null}
						</article>
					))}
				</div>
			)}

			{draft ? (
				<div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4">
					<h3 className="text-sm font-bold text-foreground">
						{draft.id ? 'Ubah rekening' : 'Tambah rekening'}
					</h3>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Nama bank *</span>
							<input
								value={draft.bank_name}
								onChange={event => setDraft({ ...draft, bank_name: event.target.value })}
								placeholder="cth. Bank BCA"
								className={fieldClass}
								maxLength={120}
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Nama pemilik rekening *</span>
							<input
								value={draft.account_holder}
								onChange={event => setDraft({ ...draft, account_holder: event.target.value })}
								placeholder="cth. PT Catet Pajak Nusantara"
								className={fieldClass}
								maxLength={160}
							/>
						</label>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Nomor rekening *</span>
							<input
								value={draft.account_number}
								onChange={event => setDraft({ ...draft, account_number: event.target.value })}
								placeholder="Nomor rekening"
								className={fieldClass}
								maxLength={40}
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className={labelClass}>Urutan tampil</span>
							<input
								type="number"
								inputMode="numeric"
								value={draft.sort}
								onChange={event => setDraft({ ...draft, sort: event.target.value })}
								className={fieldClass}
							/>
						</label>
					</div>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={draft.is_active}
							onChange={event => setDraft({ ...draft, is_active: event.target.checked })}
							className="size-4 accent-primary"
						/>
						<span className="text-sm font-medium text-foreground">Aktif (tampilkan pada instruksi pembayaran)</span>
					</label>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void handleSave()}
							disabled={busy}
							className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
						>
							{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
							Simpan
						</button>
						<button
							type="button"
							onClick={() => setDraft(null)}
							disabled={busy}
							className="inline-flex h-9 items-center rounded-full border border-border bg-background px-4 text-xs font-semibold"
						>
							Batal
						</button>
					</div>
				</div>
			) : null}
		</section>
	);
}
