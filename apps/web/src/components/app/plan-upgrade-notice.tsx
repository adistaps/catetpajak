import { Link } from 'react-router';
import { ArrowLeft, Crown } from 'lucide-react';
import { PERMISSION_LABELS, type AppPermission } from '@/data/user-roles';
import { planLabel } from '@/data/plan-options';
import type { CompanyPlan } from '@/lib/plan-access';
import { useLanguage } from '@/hooks/use-language';

interface PlanUpgradeNoticeProps {
	permission: AppPermission;
	plan: CompanyPlan;
}

/** Pesan jelas saat pengguna membuka URL fitur yang tidak termasuk paket perusahaan. */
export function PlanUpgradeNotice({ permission, plan }: PlanUpgradeNoticeProps) {
	const { t } = useLanguage();
	return (
		<div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-border bg-card px-8 py-12 text-center shadow-soft-sm">
			<span className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent">
				<Crown className="size-6 text-accent-foreground" strokeWidth={2} />
			</span>
			<h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
				{t('notice.plan_upgrade.title')}
			</h1>
			<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
				{t('notice.plan_upgrade.desc', { menu: PERMISSION_LABELS[permission], plan: planLabel(plan) })}
			</p>
			<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
				<Link
					to="/plans"
					className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
				>
					{t('notice.plan_upgrade.view_plans')}
				</Link>
				<Link
					to="/app"
					className="flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
				>
					<ArrowLeft className="size-4" strokeWidth={2} /> {t('notice.back_dashboard')}
				</Link>
			</div>
		</div>
	);
}
