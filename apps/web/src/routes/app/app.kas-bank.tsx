import { useOutletContext } from 'react-router';
import { KasBankModule } from '@/components/app/kas-bank-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppKasBank() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <KasBankModule activeCompany={activeCompany} />;
}
