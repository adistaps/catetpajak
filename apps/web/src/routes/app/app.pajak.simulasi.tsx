import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.pajak.simulasi';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { PajakSimulator } from '@/components/app/pajak-simulator';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Simulasi PPh 21 — Catet Pajak',
			description:
				'Simulasi perhitungan PPh 21 karyawan: potongan BPJS Ketenagakerjaan, BPJS Kesehatan, dan PPh 21 metode TER (PMK 168/2023) maupun Tahunan (Pasal 17).',
		},
	);
}

export default function AppPajakSimulasiPage() {
	const { activeCompany } = useOutletContext<AppOutletContext>();

	if (!activeCompany) return <NoCompany />;

	return <PajakSimulator company={activeCompany} />;
}
