import { useOutletContext } from 'react-router';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';
import { SettingsShell } from '@/components/app/settings-shell';

export default function AppPengaturan() {
	const { activeCompany, companies, refreshCompanies, setActiveCompanyId, updateCompanyName, canAccessMenu } =
		useOutletContext<AppOutletContext>();

	if (!activeCompany) {
		return <NoCompany />;
	}

	return <SettingsShell company={activeCompany} companies={companies} refreshCompanies={refreshCompanies} setActiveCompanyId={setActiveCompanyId} onCompanyNameUpdated={updateCompanyName} canAccessMenu={canAccessMenu} />;
}
