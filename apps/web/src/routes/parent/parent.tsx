import { redirect } from 'react-router';
import type { Route } from './+types/parent';
import { seo } from '@/lib/seo';
import { ParentLogin } from '@/components/parent/parent-login';
import pb from '@/lib/pocketbase-client';
import { requireParentFeatureEnabled } from '@/lib/feature-flags';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Portal Parent — Catet Pajak',
		description: 'Masuk sebagai parent untuk melihat tagihan dan membayar invoice siswa Anda.',
	});
}

export async function clientLoader() {
	await requireParentFeatureEnabled();
	const record = pb.authStore.record;
	if (pb.authStore.isValid && record && record.collectionName === 'parents') {
		throw redirect('/app/parent/dashboard');
	}
	return {};
}
clientLoader.hydrate = true as const;

export default function ParentRoute() {
	return <ParentLogin />;
}
