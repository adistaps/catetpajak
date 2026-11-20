import { useOutletContext } from 'react-router';
import { PosTables } from '@/components/app/pos-tables';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppPosMeja() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <PosTables activeCompany={activeCompany} />;
}
