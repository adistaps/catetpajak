import { Wallet } from 'lucide-react';
import { formatRupiah } from '@/lib/accounting';
import type { EligibilityResult, ReimbursementSaldo, ReimbursementSetting } from '@/lib/reimbursement-settings';

export function ReimbursementBalance({
	loading, unavailable, hasSettings, eligibleSettings, saldos, onRetry,
}: {
	loading: boolean;
	unavailable: boolean;
	hasSettings: boolean;
	eligibleSettings: { setting: ReimbursementSetting; result: EligibilityResult }[];
	saldos: Record<string, ReimbursementSaldo>;
	onRetry: () => void;
}) {
	const tracked = eligibleSettings.filter(({ setting }) => saldos[setting.id] && saldos[setting.id].budget > 0);

	return (
		<section aria-label="Sisa saldo reimbursement" className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-slate-800">
			<div className="flex items-center gap-2 text-emerald-800">
				<Wallet className="size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
				<h2 className="text-sm font-bold">Saldo reimbursement</h2>
			</div>
			{loading ? (
				<p className="mt-3 text-sm text-slate-600" role="status">Memuat informasi saldo…</p>
			) : unavailable ? (
				<div role="alert" className="mt-3 text-sm text-slate-700">
					<p>Informasi saldo reimbursement belum dapat dimuat.</p>
					<button type="button" onClick={onRetry} className="mt-2 min-h-10 font-semibold text-emerald-700 underline">Coba lagi</button>
				</div>
			) : tracked.length > 0 ? (
				<div className="mt-3 divide-y divide-emerald-200/70">
					{tracked.map(({ setting, result }) => {
						const saldo = saldos[setting.id];
						return (
							<div key={setting.id} className="py-2.5">
								<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
									<span className="min-w-0 break-words text-sm font-semibold text-slate-900">{setting.name}</span>
									<span className="text-sm font-bold text-emerald-800">Sisa {formatRupiah(saldo.remaining)}</span>
								</div>
								<p className="mt-0.5 text-xs leading-relaxed text-slate-600">
									Total saldo {formatRupiah(saldo.budget)} · terpakai {formatRupiah(saldo.used)}
									{result.amountLimit && result.amountLimit > 0 ? ` · maks per pengajuan ${formatRupiah(result.amountLimit)}` : ''}
								</p>
							</div>
						);
					})}
				</div>
			) : (
				<>
					<p className="mt-3 text-base font-bold text-slate-900">Saldo belum diatur</p>
					<p className="mt-1 text-xs leading-relaxed text-slate-600">
						Belum ada jenis reimbursement yang memiliki total saldo (alokasi benefit) untuk perusahaan ini.
						Pengajuan tetap dibatasi oleh batas nominal per pengajuan bila ditetapkan.
					</p>
					{eligibleSettings.length > 0 ? (
						<div className="mt-4 border-t border-emerald-200/70 pt-3">
							<h3 className="text-xs font-semibold text-slate-600">Batas per pengajuan yang berlaku untuk Anda</h3>
							<ul className="mt-2 divide-y divide-emerald-100">
								{eligibleSettings.map(({ setting, result }) => (
									<li key={setting.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2 text-sm">
										<span className="min-w-0 break-words font-medium">{setting.name}</span>
										<span className="font-semibold text-emerald-800">{result.amountLimit && result.amountLimit > 0 ? formatRupiah(result.amountLimit) : 'Tanpa batas nominal'}</span>
									</li>
								))}
							</ul>
						</div>
					) : (
						<p className="mt-3 text-xs leading-relaxed text-slate-600">{hasSettings ? 'Belum ada jenis reimbursement yang berlaku untuk Anda saat ini.' : 'Belum ada aturan reimbursement yang tersedia untuk perusahaan ini.'}</p>
					)}
				</>
			)}
		</section>
	);
}
