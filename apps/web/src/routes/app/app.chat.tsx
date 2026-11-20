import { useOutletContext } from 'react-router';
import { ChatModule } from '@/components/app/chat-module';
import type { AppOutletContext } from '@/lib/app-context';

export default function AppChat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	return <ChatModule activeCompany={activeCompany} />;
}
