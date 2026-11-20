import { useOutletContext, useParams } from 'react-router';
import { ExpenseForm } from '@/components/app/expense-form';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppBiayaUbah() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { id } = useParams();
	return <ExpenseForm activeCompany={activeCompany} transactionId={id} />;
}
