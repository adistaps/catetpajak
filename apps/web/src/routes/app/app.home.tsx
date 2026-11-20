import { useOutletContext } from 'react-router';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { AppLauncher, LAUNCHER_ITEMS } from '@/components/app/app-launcher';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.home';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Menu',
		description: 'Menu modul Catet Pajak untuk perusahaan aktif.',
	});
}

export default function AppHome() {
	const { activeCompany, canAccessMenu, isKaryawan } = useOutletContext<AppOutletContext>();

	if (!activeCompany) {
		return <NoCompany />;
	}

	const items = LAUNCHER_ITEMS.filter(item => {
		if (isKaryawan) return item.to === '/app/karyawan';
		return canAccessMenu(item.permission);
	});

	return <AppLauncher items={items} />;
}
