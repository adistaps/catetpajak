import { useOutletContext } from 'react-router';
import { ExpenseForm } from '@/components/app/expense-form';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppBiayaBuat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <ExpenseForm activeCompany={activeCompany} />;
}
