import { useOutletContext } from 'react-router';
import { DocumentModule } from '@/components/app/document-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppPenjualan() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <DocumentModule direction="penjualan" activeCompany={activeCompany} />;
}
