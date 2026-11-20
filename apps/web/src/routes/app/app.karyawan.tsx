import { useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.karyawan';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { KaryawanPortal } from '@/components/app/karyawan-portal';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Karyawan — Catet Pajak',
			description: 'Self-service karyawan: live attendance, pengajuan lembur, dan pengajuan pinjaman.',
		},
	);
}

export default function AppKaryawanPage() {
	const { activeCompany, memberRole } = useOutletContext<AppOutletContext>();

	if (!activeCompany) return <NoCompany />;

	return <KaryawanPortal company={activeCompany} memberRole={memberRole} />;
}
