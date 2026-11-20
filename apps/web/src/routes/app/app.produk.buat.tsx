import { useOutletContext } from 'react-router';
import { ProductForm } from '@/components/app/product-form';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppProdukBuat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <ProductForm activeCompany={activeCompany} />;
}
