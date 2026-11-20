import { useOutletContext } from 'react-router';
import { ContactForm } from '@/components/app/contact-form';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppKontakBuat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <ContactForm activeCompany={activeCompany} />;
}
