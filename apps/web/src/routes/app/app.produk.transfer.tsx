import { useOutletContext } from 'react-router';
import { WarehouseTransferModule } from '@/components/app/warehouse-transfer-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppProdukTransfer() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <WarehouseTransferModule activeCompany={activeCompany} />;
}
