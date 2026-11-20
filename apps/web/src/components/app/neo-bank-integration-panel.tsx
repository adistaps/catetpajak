import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Landmark, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { useLanguage } from '@/hooks/use-language';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Company } from '@/lib/accounting';

export interface NeoBankStatus {
	platformConfigured: boolean;
	enabled: boolean;
	status: string;
	accountName: string;
	accountNumberMasked: string;
	companyReady: boolean;
}

interface Props {
	company: Company;
	onStatusChange?: (status: NeoBankStatus | null) => void;
}

interface SettingsRow {
	id: string;
	enabled?: boolean;
	account_name?: string;
	account_number?: string;
	status?: string;
}

export function NeoBankIntegrationPanel({ company, onStatusChange }: Props) {
	const { t } = useLanguage();
	const [status, setStatus] = useState<NeoBankStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState({ enabled: false, accountName: '', accountNumber: '' });
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(false);
		try {
			const res = await fetch('/api/neo-bank/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: pb.authStore.token, companyId: company.id }),
			});
			if (!res.ok) throw new Error('status failed');
			const data = (await res.json()) as NeoBankStatus;
			setStatus(data);
			onStatusChange?.(data);
			setForm({
				enabled: data.enabled,
				accountName: data.accountName,
				accountNumber: '',
			});
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [company.id, onStatusChange]);

	useEffect(() => {
		load().catch(() => {});
	}, [load]);

	const openConfigure = () => {
		setForm({
			enabled: status?.enabled ?? false,
			accountName: status?.accountName ?? '',
			accountNumber: '',
		});
		setOpen(true);
	};

	const save = async (event: React.FormEvent) => {
		event.preventDefault();
		if (saving) return;
		setSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const existing = await pb
				.collection('neo_bank_settings')
				.getFullList<SettingsRow>({
					filter: pb.filter('company = {:company}', { company: company.id }),
					requestKey: null,
				});

			const accountNumber = form.accountNumber.trim();
			const nextStatus = form.enabled && accountNumber ? 'active' : 'not_configured';
			const payload: Record<string, unknown> = {
				company: company.id,
				enabled: form.enabled,
				account_name: form.accountName.trim(),
				status: nextStatus,
				owner: ownerId,
			};
			// Only overwrite the stored account number when the user entered a new one.
			if (accountNumber) {
				payload.account_number = accountNumber;
			}

			if (existing[0]) {
				await pb.collection('neo_bank_settings').update(existing[0].id, payload);
			} else {
				// Creating requires account_number when enabling; fall back to stored value.
				if (!accountNumber) {
					payload.account_number = '';
				}
				await pb.collection('neo_bank_settings').create(payload);
			}

			toast.success(t('payroll.disbursement.neo_bank.saved'));
			setOpen(false);
			await load();
		} catch {
			toast.error(t('payroll.disbursement.neo_bank.save_failed'));
		} finally {
			setSaving(false);
		}
	};

	const statusLabel = (s: string) => {
		if (s === 'active') return t('payroll.disbursement.neo_bank.status_active');
		if (s === 'pending_verification') return t('payroll.disbursement.neo_bank.status_pending_verification');
		return t('payroll.disbursement.neo_bank.status_not_configured');
	};

	return (
		<section className="rounded-xl border border-slate-200 bg-white p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
						<Landmark className="size-5" />
					</div>
					<div>
						<h3 className="text-sm font-bold text-slate-900">{t('payroll.disbursement.neo_bank.title')}</h3>
						<p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-500">
							{t('payroll.disbursement.neo_bank.desc')}
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={openConfigure}
					disabled={loading}
					className="shrink-0 rounded-md border border-emerald-600 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
				>
					{t('payroll.disbursement.neo_bank.configure')}
				</button>
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
				{loading ? (
					<span className="inline-flex items-center gap-1.5 text-slate-500">
						<Loader2 className="size-3.5 animate-spin" /> Memuat…
					</span>
				) : error ? (
					<span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
						<AlertTriangle className="size-3.5" /> Gagal memuat status integrasi.
					</span>
				) : (
					<>
						<span
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold',
								status?.platformConfigured
									? 'bg-emerald-100 text-emerald-800'
									: 'bg-amber-100 text-amber-800',
							)}
						>
							{status?.platformConfigured ? (
								<ShieldCheck className="size-3.5" />
							) : (
								<AlertTriangle className="size-3.5" />
							)}
							{status?.platformConfigured
								? t('payroll.disbursement.neo_bank.platform_configured')
								: t('payroll.disbursement.neo_bank.platform_not_configured')}
						</span>
						<span
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold',
								status?.companyReady
									? 'bg-emerald-100 text-emerald-800'
									: 'bg-slate-100 text-slate-600',
							)}
						>
							{status?.companyReady
								? t('payroll.disbursement.neo_bank.company_enabled')
								: t('payroll.disbursement.neo_bank.company_not_enabled')}
						</span>
						{status?.accountNumberMasked ? (
							<span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
								{status.accountName || 'Neo Bank'} · {status.accountNumberMasked}
							</span>
						) : null}
					</>
				)}
			</div>

			{!loading && !error && status && !status.platformConfigured ? (
				<p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
					{t('payroll.disbursement.neo_bank.platform_not_configured')}
				</p>
			) : null}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t('payroll.disbursement.neo_bank.title')}</DialogTitle>
						<DialogDescription>{t('payroll.disbursement.neo_bank.desc')}</DialogDescription>
					</DialogHeader>
					<form onSubmit={save} className="space-y-4 py-2">
						<label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-800">
							<input
								type="checkbox"
								checked={form.enabled}
								onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
								className="size-4 rounded border-slate-300 accent-emerald-600"
							/>
							{t('payroll.disbursement.neo_bank.enable')}
						</label>
						<div className="space-y-1.5">
							<label htmlFor="neo-account-name" className="block text-sm font-semibold">
								{t('payroll.disbursement.neo_bank.account_name')}
							</label>
							<input
								id="neo-account-name"
								value={form.accountName}
								onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))}
								placeholder="PT Contoh Indonesia"
								className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="neo-account-number" className="block text-sm font-semibold">
								{t('payroll.disbursement.neo_bank.account_number')}
							</label>
							<input
								id="neo-account-number"
								value={form.accountNumber}
								onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
								placeholder={t('payroll.disbursement.neo_bank.account_number_placeholder')}
								className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
							/>
							{status?.accountNumberMasked ? (
								<p className="text-xs text-slate-500">
									{t('payroll.disbursement.neo_bank.account_current')}: {status.accountNumberMasked}
								</p>
							) : null}
						</div>
						{!status?.platformConfigured ? (
							<p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
								{t('payroll.disbursement.neo_bank.platform_not_configured')}
							</p>
						) : null}
						<DialogFooter className="gap-2">
							<button
								type="button"
								onClick={() => setOpen(false)}
								disabled={saving}
								className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-muted disabled:opacity-50"
							>
								Batal
							</button>
							<button
								type="submit"
								disabled={saving}
								className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
							>
								{saving ? t('payroll.disbursement.neo_bank.saving') : t('payroll.disbursement.neo_bank.save')}
							</button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</section>
	);
}
