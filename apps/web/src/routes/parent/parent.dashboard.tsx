import { redirect } from 'react-router';
import type { Route } from './+types/parent.dashboard';
import { seo } from '@/lib/seo';
import { ParentDashboard } from '@/components/parent/parent-dashboard';
import pb from '@/lib/pocketbase-client';
import { requireParentFeatureEnabled } from '@/lib/feature-flags';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Dasbor Parent — Catet Pajak',
		description: 'Lihat tagihan invoice siswa dan riwayat pembayaran Anda.',
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

export default function ParentDashboardRoute() {
	return <ParentDashboard />;
}
