import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.pajak.pengaturan';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { PajakSettings } from '@/components/app/pajak-settings';
import { useAuth } from '@/hooks/use-auth';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Pengaturan Pajak — Catet Pajak',
			description:
				'Pengaturan pajak perusahaan: PPN keluaran, PPN masukan, bukti potong (bupot) PPh, tarif PPN, dan akun pajak.',
		},
	);
}

export default function AppPajakPengaturanPage() {
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

	return <PajakSettings company={activeCompany} ownerId={user.id} />;
}
