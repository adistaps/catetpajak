import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.payroll';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { PayrollModule } from '@/components/app/payroll-module';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Penggajian — Catet Pajak',
			description: 'Kelola karyawan, hitung gaji, dan terbitkan jurnal penggajian otomatis.',
		},
	);
}

export default function AppPayrollPage() {
	const { activeCompany } = useOutletContext<AppOutletContext>();

	if (!activeCompany) return <NoCompany />;

	return <PayrollModule company={activeCompany} />;
}
