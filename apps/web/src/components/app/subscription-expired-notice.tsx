import { Link } from 'react-router';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';

interface SubscriptionExpiredNoticeProps {
	companyName?: string;
}

/**
 * Ditampilkan ketika langganan perusahaan telah berakhir. Pengguna tetap dapat
 * masuk dan melihat aplikasi, tetapi tidak dapat menggunakan fitur bisnis
 * sampai langganan aktif kembali. Pembatasan diterapkan di tingkat layout
 * (`app.tsx`) sehingga tidak dapat dilewati melalui jalur rute lain.
 */
export function SubscriptionExpiredNotice({ companyName }: SubscriptionExpiredNoticeProps) {
	const { t } = useLanguage();
	return (
		<section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-soft">
			<span className="flex size-14 items-center justify-center rounded-full bg-amber-50">
				<CalendarClock className="size-7 text-amber-600" strokeWidth={2} />
			</span>
			<h2 className="text-2xl font-extrabold tracking-tight">
				{t('notice.expired.title')}
			</h2>
			<p className="max-w-md text-sm text-muted-foreground">
				{companyName
					? t('notice.expired.desc_company', { name: companyName })
					: t('notice.expired.desc')}{' '}
				{t('notice.expired.data_safe')}
			</p>
			<div className="mt-1 flex flex-wrap items-center justify-center gap-3">
				<Link
					to="/plans"
					className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
				>
					<RefreshCw className="size-4" strokeWidth={2} /> {t('notice.expired.renew')}
				</Link>
			</div>
		</section>
	);
}
