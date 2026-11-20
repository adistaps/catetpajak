import { redirect } from 'react-router';
import type { Route } from './+types/parent.pengumuman';
import { seo } from '@/lib/seo';
import { ParentAnnouncements } from '@/components/parent/parent-announcements';
import pb from '@/lib/pocketbase-client';
import { requireParentFeatureEnabled } from '@/lib/feature-flags';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Pengumuman — Portal Parent Catet Pajak',
		description: 'Lihat pengumuman terbaru dari sekolah untuk Anda dan siswa yang terhubung.',
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

export default function ParentPengumumanRoute() {
	return <ParentAnnouncements />;
}
