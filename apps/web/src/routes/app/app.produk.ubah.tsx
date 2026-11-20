import { useOutletContext, useParams } from 'react-router';
import { ProductForm } from '@/components/app/product-form';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppProdukUbah() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { id } = useParams();
	return <ProductForm activeCompany={activeCompany} productId={id} />;
}
