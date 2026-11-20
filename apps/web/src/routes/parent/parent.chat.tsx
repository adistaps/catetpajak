import { redirect } from 'react-router';
import type { Route } from './+types/parent.chat';
import { seo } from '@/lib/seo';
import { ParentChat } from '@/components/parent/parent-chat';
import pb from '@/lib/pocketbase-client';
import { requireParentFeatureEnabled } from '@/lib/feature-flags';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Chat — Portal Parent Catet Pajak',
		description: 'Berkirim pesan langsung dan grup dengan staf sekolah.',
	});
}

export async function clientLoader() {
	await requireParentFeatureEnabled();
	const record = pb.authStore.record;
	if (!pb.authStore.isValid || !record || record.collectionName !== 'parents') {
		throw redirect('/app/parent');
	}
	return {};
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-dvh bg-background" />;
}

export default function ParentChatRoute() {
	return <ParentChat />;
}
