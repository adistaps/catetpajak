import { useOutletContext } from 'react-router';
import { TransactionModule } from '@/components/app/transaction-module';
import { TRANSACTION_MODULES } from '@/data/transaction-modules';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppBiaya() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <TransactionModule config={TRANSACTION_MODULES.biaya} activeCompany={activeCompany} />;
}
