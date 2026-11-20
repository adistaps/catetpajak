import { useParams, useOutletContext } from 'react-router';
import { seo } from '@/lib/seo';
import type { Route } from './+types/app.penjualan.dokumen';
import { useEffect, useState } from 'react';
import { SalesInvoiceDetail } from '@/components/app/sales-invoice-detail';
import { SalesDeliveryDetail } from '@/components/app/sales-delivery-detail';
import type { AppOutletContext } from '@/lib/app-context';
import pb from '@/lib/pocketbase-client';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Detail Dokumen Penjualan',
		description: 'Lihat kembali rincian invoice atau pengiriman penjualan beserta jurnal terkait.',
	});
}

export default function AppPenjualanDokumen() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const { id } = useParams();
	const [stage, setStage] = useState<'invoice' | 'pengiriman' | 'other' | null>(null);

	useEffect(() => {
		if (!id) {
			setStage('other');
			return;
		}
		let cancelled = false;
		setStage(null);
		pb.collection('documents')
			.getOne<{ stage: string }>(id, { fields: 'stage', requestKey: `doc-stage-${id}` })
			.then(record => {
				if (cancelled) return;
				setStage(record.stage === 'pengiriman' ? 'pengiriman' : record.stage === 'invoice' ? 'invoice' : 'other');
			})
			.catch(() => {
				if (!cancelled) setStage('other');
			});
		return () => {
			cancelled = true;
		};
	}, [id]);

	if (stage === null) {
		return <p className="text-sm text-muted-foreground">Memuat dokumen…</p>;
	}
	if (stage === 'pengiriman') {
		return <SalesDeliveryDetail docId={id ?? ''} activeCompany={activeCompany} />;
	}
	return <SalesInvoiceDetail docId={id ?? ''} activeCompany={activeCompany} />;
}
