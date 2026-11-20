import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import pb from '@/lib/pocketbase-client';
import { type Account, type JournalEntry } from '@/lib/accounting';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { DashboardReceivables } from '@/components/app/dashboard-receivables';
import { DashboardLabaRugiChart } from '@/components/app/dashboard-laba-rugi-chart';
import { DashboardPromo } from '@/components/app/dashboard-promo';
import { DashboardRingkasan30 } from '@/components/app/dashboard-ringkasan-30';
import { useLanguage } from '@/hooks/use-language';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.dasbor';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Dasbor',
		description: 'Ringkasan piutang, tagihan, dan posisi keuangan perusahaan aktif.',
	});
}

export default function AppDasbor() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { t } = useLanguage();
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [entries, setEntries] = useState<JournalEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setAccounts([]);
			setEntries([]);
			return;
		}
		let cancelled = false;
		setIsLoading(true);
		const filter = pb.filter('company = {:company}', { company: activeCompany.id });
		Promise.all([
			pb.collection('accounts').getFullList<Account>({ filter, sort: 'code', requestKey: null }),
			pb
				.collection('entries')
				.getFullList<JournalEntry>({
					filter,
					sort: '-date,-created',
					expand: 'account',
					requestKey: null,
				}),
		])
			.then(([accountList, entryList]) => {
				if (cancelled) return;
				setAccounts(accountList);
				setEntries(entryList);
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const labaRugi = (
		<DashboardLabaRugiChart
			accounts={accounts}
			entries={entries}
			conversionDate={activeCompany.conversion_date}
		/>
	);

	return (
		<div className="-mx-5 -my-8 flex flex-col gap-6 bg-[#eef6fb] px-5 py-6 md:-mx-10 md:-my-10 md:px-8 md:py-8">
			<header>
				<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					{t('dash.label')}
				</p>
				<h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
					{activeCompany.name}
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					{t('dash.summary')}
				</p>
			</header>

			<div className="flex min-w-0 flex-col gap-8">
				{isLoading ? (
					<p className="text-sm font-semibold text-muted-foreground">{t('dash.loading')}</p>
				) : (
					<>
						<div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(17.5rem,0.82fr)]">
							<DashboardReceivables companyId={activeCompany.id} />
							<div className="min-w-0">
								<DashboardPromo />
							</div>
						</div>
						{labaRugi}

						<DashboardRingkasan30
							accounts={accounts}
							entries={entries}
							conversionDate={activeCompany.conversion_date}
						/>
					</>
				)}
			</div>
		</div>
	);
}
