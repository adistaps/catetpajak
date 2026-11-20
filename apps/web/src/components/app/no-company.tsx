import { Link, useOutletContext } from 'react-router';
import { Building2 } from 'lucide-react';
import type { AppOutletContext } from '@/lib/app-context';
import { useLanguage } from '@/hooks/use-language';

export function NoCompany() {
	const ctx = useOutletContext<AppOutletContext | undefined>();
	const { t } = useLanguage();
	const isKaryawan = Boolean(ctx?.isKaryawan);

	if (isKaryawan) {
		return (
			<div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-soft-sm">
				<span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
					<Building2 className="size-7" strokeWidth={1.75} />
				</span>
				<h2 className="text-xl font-extrabold tracking-tight">{t('notice.no_company.ess_title')}</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					{t('notice.no_company.ess_desc')}
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-soft-sm">
			<span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
				<Building2 className="size-7" strokeWidth={1.75} />
			</span>
			<h2 className="text-xl font-extrabold tracking-tight">{t('notice.no_company.title')}</h2>
			<p className="max-w-sm text-sm text-muted-foreground">
				{t('notice.no_company.desc')}
			</p>
			<Link
				to="/app/perusahaan"
				className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
			>
				{t('notice.no_company.add')}
			</Link>
		</div>
	);
}
