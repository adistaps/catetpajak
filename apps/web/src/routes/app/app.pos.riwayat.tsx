import { useOutletContext } from 'react-router';
import { PosInvoiceHistory } from '@/components/app/pos-invoice-history';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppPosRiwayat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <PosInvoiceHistory activeCompany={activeCompany} />;
}
