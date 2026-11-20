import { useParams, useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.pembelian.dokumen';
import { useEffect, useState } from 'react';
import { PurchaseInvoiceDetail } from '@/components/app/purchase-invoice-detail';
import type { AppOutletContext } from '@/lib/app-context';
import pb from '@/lib/pocketbase-client';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Detail Dokumen Pembelian',
		description: 'Lihat kembali rincian penawaran, pesanan, invoice atau pembayaran pembelian beserta jurnal terkait.',
	});
}

export default function AppPembelianDokumen() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { id } = useParams();
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if (!id) {
			setReady(true);
			return;
		}
		let cancelled = false;
		setReady(false);
		pb.collection('documents')
			.getOne<{ id: string }>(id, { fields: 'id', requestKey: `doc-exists-${id}` })
			.then(() => {
				if (!cancelled) setReady(true);
			})
			.catch(() => {
				if (!cancelled) setReady(true);
			});
	return () => {
			cancelled = true;
		};
	}, [id]);

	if (!ready) {
		return <p className="text-sm text-muted-foreground">Memuat dokumen…</p>;
	}
	return <PurchaseInvoiceDetail docId={id ?? ''} activeCompany={activeCompany} />;
}
