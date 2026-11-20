import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.pengguna';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { UserModule } from '@/components/app/user-module';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Pengguna — Catet Pajak',
			description: 'Undang dan kelola pengguna serta hak akses perusahaan.',
		},
	);
}

export default function AppPenggunaPage() {
	const { activeCompany } = useOutletContext<AppOutletContext>();

	if (!activeCompany) return <NoCompany />;

	return <UserModule company={activeCompany} />;
}
