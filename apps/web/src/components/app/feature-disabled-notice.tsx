import { Link } from 'react-router';
import { ArrowLeft, Ban } from 'lucide-react';
import { PERMISSION_LABELS, type AppPermission } from '@/data/user-roles';
import { useLanguage } from '@/hooks/use-language';

interface FeatureDisabledNoticeProps {
	permission: AppPermission;
}

/**
 * Pesan jelas saat pengguna membuka URL fitur yang dinonaktifkan Admin Pusat.
 * Fitur inti (dasbor, perusahaan, pengaturan, pengguna) tidak pernah memunculkan
 * pesan ini.
 */
export function FeatureDisabledNotice({ permission }: FeatureDisabledNoticeProps) {
	const { t } = useLanguage();
	return (
		<div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-border bg-card px-8 py-12 text-center shadow-soft-sm">
			<span className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
				<Ban className="size-6 text-muted-foreground" strokeWidth={2} />
			</span>
			<h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
				{t('notice.feature_disabled.title')}
			</h1>
			<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
				{t('notice.feature_disabled.desc', { menu: PERMISSION_LABELS[permission] })}
			</p>
			<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
				<Link
					to="/app"
					className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
				>
					<ArrowLeft className="size-4" strokeWidth={2} /> {t('notice.back_dashboard')}
				</Link>
			</div>
		</div>
	);
}
