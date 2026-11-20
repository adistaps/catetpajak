import { useOutletContext } from 'react-router';
import { TransactionForm } from '@/components/app/transaction-form';
import { TRANSACTION_MODULES } from '@/data/transaction-modules';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppAsetBuat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <TransactionForm config={TRANSACTION_MODULES.aset} activeCompany={activeCompany} />;
}
