import { useOutletContext, useParams } from 'react-router';
import { ContactForm } from '@/components/app/contact-form';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppKontakUbah() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { id } = useParams();
	return <ContactForm activeCompany={activeCompany} contactId={id} />;
}
