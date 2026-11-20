import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.pajak.unifikasi';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { PajakUnifikasi } from '@/components/app/pajak-unifikasi';
import { useAuth } from '@/hooks/use-auth';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Pajak Unifikasi — Catet Pajak',
			description:
				'Konsolidasi seluruh kewajiban pajak per masa pajak: PPN keluaran & masukan, PPh 21 dari penggajian, dan bukti potong PPh lain, lengkap dengan rekonsiliasi internal.',
		},
	);
}

export default function AppPajakUnifikasiPage() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { user, isLoading } = useAuth();

	if (!activeCompany) return <NoCompany />;
	if (isLoading || !user) {
		return (
			<div className="mx-auto max-w-[1400px] space-y-6">
				<div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
				<div className="h-10 animate-pulse rounded-2xl bg-muted" />
				<div className="h-64 animate-pulse rounded-2xl bg-muted" />
			</div>
		);
	}

	return <PajakUnifikasi company={activeCompany} ownerId={user.id} />;
}
