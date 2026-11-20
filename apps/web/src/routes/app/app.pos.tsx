import { useOutletContext } from 'react-router';
import { PosModule } from '@/components/app/pos-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppPos() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <PosModule activeCompany={activeCompany} />;
}
