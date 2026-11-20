import { useParams, useOutletContext } from 'react-router';
import { ContactHistory, type ContactHistoryType } from '@/components/app/contact-history';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppKontakRiwayat() {
	const { type, id } = useParams();
	const { activeCompany } = useOutletContext<AppOutletContext>();

	const historyType: ContactHistoryType = type === 'siswa' ? 'siswa' : 'kontak';
	const recordId = id ?? '';

	return (
		<ContactHistory type={historyType} id={recordId} company={activeCompany} />
	);
}
