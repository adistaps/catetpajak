import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	buildJournalNumber,
	formatRupiah,
	todayIso,
	type Account,
	type JournalEntry,
} from '@/lib/accounting';
import { AmountInput } from '@/components/ui/amount-input';
import { useLanguage } from '@/hooks/use-language';

interface JournalLine {
	key: string;
	accountId: string;
	description: string;
	debit: string;
	credit: string;
	number?: string;
	persisted?: boolean;
}

const fieldClass =
	'w-full rounded-lg border border-[#d7dee6] bg-white px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-2';

function newLine(accountId = ''): JournalLine {
	return {
		key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		accountId,
		description: '',
		debit: '',
		credit: '',
	};
}

function lineFromEntry(entry: JournalEntry): JournalLine {
	return {
		key: entry.id,
		accountId: entry.account,
		description: entry.description || '',
		debit: entry.debit ? String(entry.debit) : '',
		credit: entry.credit ? String(entry.credit) : '',
		number: entry.number,
		persisted: true,
	};
}

function newGroupId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Nomor jurnal berikutnya berdasarkan urutan tertinggi tahun berjalan. */
export function computeNextJournalNumber(entries: JournalEntry[], year = new Date().getFullYear()): string {
	const prefix = `JU-${year}-`;
	let max = 0;
	for (const entry of entries) {
		const value = entry.number || '';
		if (value.startsWith(prefix)) {
			const seq = Number.parseInt(value.slice(prefix.length), 10);
			if (!Number.isNaN(seq) && seq > max) max = seq;
		}
	}
	return buildJournalNumber(max, year);
}

function bumpNumber(number: string): string {
	const match = number.match(/^(JU-(\d{4})-)(\d+)$/);
	if (!match) return number;
	const seq = Number.parseInt(match[3], 10) + 1;
	return `${match[1]}${String(seq).padStart(match[3].length, '0')}`;
}

export function JournalForm({
	companyId,
	accounts,
	entries,
	editing,
	onCancel,
	onCreated,
	onUpdated,
}: {
	companyId: string;
	accounts: Account[];
	entries: JournalEntry[];
	editing: JournalEntry[] | null;
	onCancel: () => void;
	onCreated: (created: JournalEntry[]) => void;
	onUpdated: (entries: JournalEntry[]) => void;
}) {
	const { t } = useLanguage();
	const editingLines = editing && editing.length > 0 ? editing : null;
	const [date, setDate] = useState(editingLines?.[0]?.date || todayIso());
	const [lines, setLines] = useState<JournalLine[]>(() =>
		editingLines ? editingLines.map(lineFromEntry) : [newLine(accounts[0]?.id ?? ''), newLine()],
	);
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	const startNumber =
		editingLines?.[0]?.number || computeNextJournalNumber(entries, Number(date.slice(0, 4)) || undefined);

	const numbered = useMemo(() => {
		let cursor = startNumber;
		return lines.map((line, index) => {
			if (line.number) {
				cursor = line.number;
				return line;
			}
			const number = index === 0 ? cursor : bumpNumber(cursor);
			cursor = number;
			return { ...line, number };
		});
	}, [lines, startNumber]);

	const totals = useMemo(() => {
		const debit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
		const credit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
		return { debit, credit, diff: debit - credit };
	}, [lines]);

	const updateLine = (key: string, patch: Partial<JournalLine>) => {
		setLines(current => current.map(line => (line.key === key ? { ...line, ...patch } : line)));
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		const filled = numbered.filter(
			line => line.accountId || line.description || Number(line.debit) || Number(line.credit),
		);
		if (filled.length === 0) {
			setError(t('journal.form.empty'));
			return;
		}
		for (const line of filled) {
			const debitValue = Number(line.debit) || 0;
			const creditValue = Number(line.credit) || 0;
			if (!line.accountId) {
				setError(t('journal.form.account_required'));
				return;
			}
			if ((debitValue > 0 && creditValue > 0) || (debitValue === 0 && creditValue === 0)) {
				setError(t('journal.form.one_side'));
				return;
			}
		}
		const debitTotal = filled.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
		const creditTotal = filled.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
		if (filled.length > 1 && debitTotal !== creditTotal) {
			setError(t('journal.form.unbalanced'));
			return;
		}

		setIsSaving(true);
		try {
			if (editingLines) {
				const groupId = editingLines.find(item => item.group)?.group || newGroupId();
				const kept = new Set(filled.filter(line => line.persisted).map(line => line.key));
				const removed = editingLines.filter(item => !kept.has(item.id));
				for (const item of removed) {
					await pb.collection('entries').delete(item.id);
				}
				const saved: JournalEntry[] = [];
				const createdDuringEdit: JournalEntry[] = [];
				for (const line of filled) {
					const payload = {
						company: companyId,
						account: line.accountId,
						date,
						description: line.description,
						debit: Number(line.debit) || 0,
						credit: Number(line.credit) || 0,
						group: groupId,
					};
					if (line.persisted) {
						const entry = await pb.collection('entries').update<JournalEntry>(line.key, payload, {
							expand: 'account',
						});
						saved.push(entry);
						continue;
					}
					const number =
						line.number || computeNextJournalNumber([...entries, ...createdDuringEdit]);
					const entry = await pb.collection('entries').create<JournalEntry>(
						{
							...payload,
							number,
							owner: pb.authStore.record?.id ?? '',
						},
						{ expand: 'account', requestKey: `journal-edit-create-${line.key}` },
					);
					createdDuringEdit.push(entry);
					saved.push(entry);
				}
				onUpdated(saved);
				return;
			}

			const created: JournalEntry[] = [];
			const groupId = newGroupId();
			for (const line of filled) {
				const payload = {
					company: companyId,
					account: line.accountId,
					date,
					description: line.description,
					debit: Number(line.debit) || 0,
					credit: Number(line.credit) || 0,
					owner: pb.authStore.record?.id ?? '',
					group: groupId,
				};
				const createEntry = (number: string) =>
					pb.collection('entries').create<JournalEntry>(
						{ ...payload, number },
						{ expand: 'account', requestKey: `journal-create-${line.key}-${number}` },
					);
				let entry: JournalEntry;
				const lineNumber = line.number || computeNextJournalNumber([...entries, ...created]);
				try {
					entry = await createEntry(lineNumber);
				} catch (err) {
					const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
					if (!data || !('number' in data)) throw err;
					const next = computeNextJournalNumber([...entries, ...created]);
					entry = await createEntry(next);
				}
				created.push(entry);
			}
			onCreated(created);
		} catch {
			setError(t('journal.form.save_failed'));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-5">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[220px_minmax(0,1fr)]">
				<div className="flex flex-col gap-2">
					<label htmlFor="journal-date" className="text-xs font-semibold">
						{t('journal.form.date')}
					</label>
					<input
						id="journal-date"
						type="date"
						required
						value={date}
						onChange={event => setDate(event.target.value)}
						className={fieldClass}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="journal-number" className="text-xs font-semibold">
						{t('journal.form.number')}
					</label>
					<input
						id="journal-number"
						readOnly
						value={
							numbered.length > 1
								? `${numbered[0]?.number} – ${numbered[numbered.length - 1]?.number}`
								: (numbered[0]?.number ?? startNumber)
						}
						className={`${fieldClass} bg-[#f7fbf9] font-medium text-foreground`}
					/>
				</div>
			</div>

			<div className="overflow-x-auto rounded-lg border border-[#e3ebe6]">
				<div className="min-w-[760px]">
					<div className="grid grid-cols-[8.5rem_1.5fr_1.4fr_9rem_9rem_2.5rem] bg-[#e7f6ee] px-2 py-2.5 text-xs font-bold text-foreground">
						<span className="px-1">{t('journal.form.col_number')}</span>
						<span className="px-1">{t('journal.form.account')}</span>
						<span className="px-1">{t('journal.form.description')}</span>
						<span className="px-1 text-right">{t('journal.form.debit')}</span>
						<span className="px-1 text-right">{t('journal.form.credit')}</span>
						<span />
					</div>
					{numbered.map(line => (
						<div
							key={line.key}
							className="grid grid-cols-[8.5rem_1.5fr_1.4fr_9rem_9rem_2.5rem] items-center gap-2 border-t border-[#e8eeea] px-2 py-2"
						>
							<span className="truncate px-1 text-xs font-semibold text-muted-foreground">{line.number}</span>
							<select
								aria-label={t('journal.form.pick_account')}
								value={line.accountId}
								onChange={event => updateLine(line.key, { accountId: event.target.value })}
								className={fieldClass}
							>
								<option value="">{t('journal.form.pick_account')}</option>
								{accounts.map(account => (
									<option key={account.id} value={account.id}>
										{account.code} — {account.name}
									</option>
								))}
							</select>
							<input
								aria-label={t('journal.form.description')}
								value={line.description}
								onChange={event => updateLine(line.key, { description: event.target.value })}
								placeholder={t('journal.form.desc_placeholder')}
								className={fieldClass}
							/>
							<div className="flex items-center rounded-lg border border-[#d7dee6] bg-white ring-primary/30 focus-within:ring-2">
								<span className="pl-3 text-sm text-muted-foreground">Rp</span>
								<AmountInput
									aria-label={t('journal.form.debit')}
									value={line.debit}
									onValueChange={value =>
										updateLine(line.key, { debit: value ? String(value) : '', credit: value ? '' : line.credit })
									}
									placeholder="0"
									className="w-full bg-transparent px-2 py-2.5 text-right text-sm outline-none"
								/>
							</div>
							<div className="flex items-center rounded-lg border border-[#d7dee6] bg-white ring-primary/30 focus-within:ring-2">
								<span className="pl-3 text-sm text-muted-foreground">Rp</span>
								<AmountInput
									aria-label={t('journal.form.credit')}
									value={line.credit}
									onValueChange={value =>
										updateLine(line.key, { credit: value ? String(value) : '', debit: value ? '' : line.debit })
									}
									placeholder="0"
									className="w-full bg-transparent px-2 py-2.5 text-right text-sm outline-none"
								/>
							</div>
							<button
								type="button"
								aria-label={t('journal.form.remove_row')}
								disabled={lines.length === 1}
								onClick={() => setLines(current => current.filter(item => item.key !== line.key))}
								className="inline-flex size-9 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:opacity-30"
							>
								<Minus className="size-4" strokeWidth={2.5} />
							</button>
						</div>
					))}
				</div>
			</div>

			{(
				<button
					type="button"
					onClick={() => setLines(current => [...current, newLine()])}
					className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
				>
					<Plus className="size-4" /> {t('journal.form.add_row')}
				</button>
			)}

			<div className="ml-auto flex w-full max-w-[420px] flex-col gap-3 text-sm">
				<div className="flex items-center justify-between gap-4">
					<span>{t('journal.form.total_debit')}</span>
					<span className="font-semibold tabular-nums">{formatRupiah(totals.debit)}</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span>{t('journal.form.total_credit')}</span>
					<span className="font-semibold tabular-nums">{formatRupiah(totals.credit)}</span>
				</div>
				<div className="flex items-center justify-between gap-4 border-t border-border pt-3 text-base font-extrabold">
					<span>{t('journal.form.diff')}</span>
					<span className={`tabular-nums ${totals.diff === 0 ? '' : 'text-destructive'}`}>
						{formatRupiah(Math.abs(totals.diff))}
					</span>
				</div>
				<div className="mt-1 flex flex-wrap items-center justify-end gap-3">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
					>
						{t('journal.form.cancel')}
					</button>
					<button
						type="submit"
						disabled={isSaving || accounts.length === 0}
						className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
					>
						{isSaving ? t('journal.form.saving') : editing ? t('journal.form.save_edit') : t('journal.form.save')}
					</button>
				</div>
				{error ? <p className="text-right text-sm font-semibold text-destructive">{error}</p> : null}
			</div>
		</form>
	);
}
