import { useParams, useOutletContext } from 'react-router';
import { AccountForm } from '@/components/app/account-form';
import type { AppOutletContext } from '@/lib/app-context';
import { NoCompany } from '@/components/app/no-company';

export default function AppAkunUbah() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { id } = useParams();
	if (!activeCompany) {
		return <NoCompany />;
	}
	return <AccountForm activeCompany={activeCompany} accountId={id} />;
}
