import { useOutletContext } from 'react-router';
import { WarehouseModule } from '@/components/app/warehouse-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppProdukGudang() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <WarehouseModule activeCompany={activeCompany} />;
}
