import { useOutletContext } from 'react-router';
import { StockOpnameModule } from '@/components/app/stock-opname-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppProdukOpname() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <StockOpnameModule activeCompany={activeCompany} />;
}
