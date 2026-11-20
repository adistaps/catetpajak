import { useOutletContext } from 'react-router';
import { ProductModule } from '@/components/app/product-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppProduk() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <ProductModule activeCompany={activeCompany} />;
}
