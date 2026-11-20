import { useParams, useOutletContext } from 'react-router';
import { DocumentForm } from '@/components/app/document-form';
import type { AppOutletContext } from '@/lib/app-context';
import { STAGE_ORDER, type DocumentStage } from '@/lib/documents';

function parseDocRoute(splat: string) {
	const parts = splat.split('/').filter(Boolean);
	const stageParam = parts[0] as DocumentStage | undefined;
	const initialStage: DocumentStage =
		stageParam && STAGE_ORDER.includes(stageParam) ? stageParam : 'penawaran';
	let editId: string | undefined;
	let fromId: string | undefined;
	if (parts[1] === 'ubah' && parts[2]) editId = parts[2];
	if (parts[1] === 'konversi' && parts[2]) fromId = parts[2];
	return { initialStage, editId, fromId };
}

export default function AppPembelianDokumenBuat() {
	const { activeCompany } = useOutletContext<AppOutletContext>();
	const params = useParams();
	const { initialStage, editId, fromId } = parseDocRoute(params['*'] ?? '');
	return (
		<DocumentForm
			direction="pembelian"
			activeCompany={activeCompany}
			initialStage={initialStage}
			editId={editId}
			fromId={fromId}
		/>
	);
}
