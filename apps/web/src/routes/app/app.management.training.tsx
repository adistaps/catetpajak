import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.management.training';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { TrainingModule } from '@/components/app/training-module';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Training Development — Catet Pajak',
		description: 'Kelola program pelatihan dan pengembangan karyawan.',
	});
}

export default function AppManagementTrainingPage() {
	const { activeCompany } = useOutletContext<AppOutletContext>();

	if (!activeCompany) return <NoCompany />;

	return <TrainingModule company={activeCompany} />;
}
