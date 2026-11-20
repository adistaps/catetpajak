import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.management.performance';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { PerformanceModule } from '@/components/app/performance-module';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Performance Management — Catet Pajak',
		description: 'Kelola penilaian kinerja karyawan per periode.',
	});
}

export default function AppManagementPerformancePage() {
	const { activeCompany } = useOutletContext<AppOutletContext>();

	if (!activeCompany) return <NoCompany />;

	return <PerformanceModule company={activeCompany} />;
}
