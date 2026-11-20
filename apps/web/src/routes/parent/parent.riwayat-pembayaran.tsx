import { redirect } from 'react-router';
import type { Route } from './+types/parent.riwayat-pembayaran';
import { seo } from '@/lib/seo';
import { ParentPaymentHistory } from '@/components/parent/parent-payment-history';
import pb from '@/lib/pocketbase-client';
import { requireParentFeatureEnabled } from '@/lib/feature-flags';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Riwayat Pembayaran — Portal Parent Catet Pajak',
		description: 'Lihat riwayat pembayaran invoice dan status verifikasinya.',
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

export default function ParentRiwayatPembayaranRoute() {
	return <ParentPaymentHistory />;
}
