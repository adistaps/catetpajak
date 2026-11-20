import { useOutletContext } from 'react-router';
import { AssetForm } from '@/components/app/asset-form';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppAsetDaftar() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <AssetForm activeCompany={activeCompany} />;
}
