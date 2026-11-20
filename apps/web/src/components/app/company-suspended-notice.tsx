import { Link } from 'react-router';
import { ShieldOff } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';

/**
 * Pesan jelas saat perusahaan aktif sedang ditangguhkan oleh admin pusat.
 * Seluruh data perusahaan tetap tersimpan dan terisolasi — hanya aksesnya
 * yang diblokir sampai diaktifkan kembali.
 */
export function CompanySuspendedNotice({ companyName }: { companyName: string }) {
	const { t } = useLanguage();
	return (
		<section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-soft">
			<span className="flex size-14 items-center justify-center rounded-full bg-red-50">
				<ShieldOff className="size-7 text-red-600" strokeWidth={2} />
			</span>
			<h2 className="text-2xl font-extrabold tracking-tight">
				{t('notice.suspended.title')}
			</h2>
			<p className="max-w-md text-sm text-muted-foreground">
				{t('notice.suspended.desc', { name: companyName })}
			</p>
			<Link
				to="/app/perusahaan"
				className="mt-1 rounded-full border border-border bg-secondary px-5 py-2.5 text-xs font-bold transition-colors hover:text-primary"
			>
				{t('notice.suspended.view_companies')}
			</Link>
		</section>
	);
}
