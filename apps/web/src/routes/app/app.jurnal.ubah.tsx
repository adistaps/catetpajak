import { useParams } from 'react-router';
import { JournalEditor } from '@/components/app/journal-editor';

export default function AppJurnalUbah() {
	const { id } = useParams();
	return <JournalEditor entryId={id} />;
}
