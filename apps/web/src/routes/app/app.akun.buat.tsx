import { useOutletContext } from 'react-router';
import { AccountForm } from '@/components/app/account-form';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';

export default function AppAkunBuat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	if (!activeCompany) {
		return <NoCompany />;
	}
	return <AccountForm activeCompany={activeCompany} />;
}
