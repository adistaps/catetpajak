import { useOutletContext } from 'react-router';
import { AssetManagement } from '@/components/app/asset-management';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppAset() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <AssetManagement activeCompany={activeCompany} />;
}
