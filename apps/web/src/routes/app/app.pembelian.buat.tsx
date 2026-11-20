import { useOutletContext } from 'react-router';
import { TransactionForm } from '@/components/app/transaction-form';
import { TRANSACTION_MODULES } from '@/data/transaction-modules';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppPembelianBuat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return (
		<TransactionForm config={TRANSACTION_MODULES.pembelian} activeCompany={activeCompany} />
	);
}
