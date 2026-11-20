import { useOutletContext } from 'react-router';
import { ContactModule } from '@/components/app/contact-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppKontak() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <ContactModule activeCompany={activeCompany} />;
}
