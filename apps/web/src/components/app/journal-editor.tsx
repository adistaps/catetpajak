import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { groupJournalEntries, type Account, type JournalEntry } from '@/lib/accounting';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { JournalForm } from '@/components/app/journal-form';
import { useLanguage } from '@/hooks/use-language';

export function JournalEditor({ entryId }: { entryId?: string }) {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { t } = useLanguage();
	const navigate = useNavigate();
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [entries, setEntries] = useState<JournalEntry[]>([]);
	const [ready, setReady] = useState(false);
	const [missing, setMissing] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setAccounts([]);
			setEntries([]);
			setReady(false);
			return;
		}
		let cancelled = false;
		setReady(false);
		const filter = pb.filter('company = {:company}', { company: activeCompany.id });
		Promise.all([
			pb.collection('accounts').getFullList<Account>({ filter, sort: 'code' }),
			pb
				.collection('entries')
				.getFullList<JournalEntry>({ filter, sort: '-date,-created', expand: 'account' }),
		])
			.then(([accountList, entryList]) => {
				if (cancelled) return;
				setAccounts(accountList);
				setEntries(entryList);
				if (entryId) {
					const found = groupJournalEntries(entryList).some(transaction =>
						transaction.lines.some(line => line.id === entryId),
					);
					setMissing(!found);
				} else {
					setMissing(false);
				}
				setReady(true);
			})
			.catch(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, entryId]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const back = () => navigate('/app/jurnal');
	const editing = entryId
		? (groupJournalEntries(entries).find(transaction => transaction.lines.some(line => line.id === entryId))
				?.lines ?? null)
		: null;

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
						{entryId ? t('journal.editor.edit_title') : t('journal.editor.create_title')}
					</h1>
				</div>
				<Link
					to="/app/jurnal"
					className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
				>
					<ArrowLeft className="size-4" />
					{t('journal.editor.back')}
				</Link>
			</header>

			{!ready ? (
				<p className="text-sm text-muted-foreground">{t('journal.editor.loading')}</p>
			) : missing || (entryId && !editing) ? (
				<p className="text-sm text-muted-foreground">{t('journal.editor.not_found')}</p>
			) : editing?.some(line => line.payroll_run) ? (
				<p className="text-sm text-muted-foreground">{t('journal.editor.payroll_locked')}</p>
			) : (
				<JournalForm
					key={editing?.[0]?.id ?? 'new'}
					companyId={activeCompany.id}
					accounts={accounts}
					entries={entries}
					editing={editing}
					onCancel={back}
					onCreated={() => back()}
					onUpdated={() => back()}
				/>
			)}
		</div>
	);
}
