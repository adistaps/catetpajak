import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.pajak';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { PajakModule } from '@/components/app/pajak-module';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Pajak — Catet Pajak',
			description:
				'Simulasi dan perhitungan PPh 21 karyawan: potongan BPJS Ketenagakerjaan, BPJS Kesehatan, dan PPh 21 metode TER (PMK 168/2023) maupun Tahunan (Pasal 17).',
		},
	);
}

export default function AppPajakPage() {
	const { activeCompany } = useOutletContext<AppOutletContext>();

	if (!activeCompany) return <NoCompany />;

	return <PajakModule company={activeCompany} />;
}
