import { useState } from 'react';
import { ClientResponseError } from 'pocketbase';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import pb from '@/lib/pocketbase-client';
import { companyLogoUrl } from '@/lib/company-logo';
import type { Company } from '@/lib/accounting';
import { useLanguage } from '@/hooks/use-language';

interface CompanyNameDialogProps {
	company: Company;
	onClose: () => void;
	onSaved: (companyId: string, name: string) => void;
}

export function CompanyNameDialog({ company, onClose, onSaved }: CompanyNameDialogProps) {
	const { t } = useLanguage();
	const [name, setName] = useState(company.name);
	const [bankName, setBankName] = useState(company.bank_name ?? '');
	const [accountHolder, setAccountHolder] = useState(company.account_holder ?? '');
	const [accountNumber, setAccountNumber] = useState(company.account_number ?? '');
	const [logoFile, setLogoFile] = useState<File | null>(null);
	const [logoRemoved, setLogoRemoved] = useState(false);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);

	const logoPreview = logoFile
		? URL.createObjectURL(logoFile)
		: !logoRemoved && company.logo
			? companyLogoUrl(company, '200x200')
			: '';

	const save = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (saving) return;
		const newName = name.trim();
		if (!newName) {
			setError(t('company.rename.name_required'));
			return;
		}
		if (newName.length > 120) {
			setError(t('company.rename.too_long'));
			return;
		}
		// Rekening: boleh kosong seluruhnya, tetapi bila salah satu diisi,
		// ketiganya wajib diisi bersamaan agar instruksi pembayaran lengkap.
		const trimmedBank = bankName.trim();
		const trimmedHolder = accountHolder.trim();
		const trimmedNumber = accountNumber.trim();
		const anyBankFilled = Boolean(trimmedBank || trimmedHolder || trimmedNumber);
		if (anyBankFilled && !(trimmedBank && trimmedHolder && trimmedNumber)) {
			setError(t('company.bank_required'));
			return;
		}
		if (!pb.authStore.isValid || pb.authStore.record?.id !== company.owner) {
			setError(t('company.rename.no_permission'));
			return;
		}

		const nameChanged = newName !== company.name;
		const bankChanged =
			trimmedBank !== (company.bank_name ?? '') ||
			trimmedHolder !== (company.account_holder ?? '') ||
			trimmedNumber !== (company.account_number ?? '');
		const logoChanged = Boolean(logoFile) || logoRemoved;
		if (!nameChanged && !bankChanged && !logoChanged) {
			onClose();
			return;
		}

		setError('');
		setSaving(true);
		try {
			const payload: Record<string, unknown> = {};
			if (nameChanged) payload.name = newName;
			if (bankChanged) {
				payload.bank_name = trimmedBank;
				payload.account_holder = trimmedHolder;
				payload.account_number = trimmedNumber;
			}
			if (Object.keys(payload).length > 0) {
				await pb.collection('companies').update<Company>(company.id, payload);
			}
			// Logo diperbarui terpisah lewat FormData agar unggahan file diproses
			// dengan benar oleh PocketBase.
			if (logoFile) {
				const fd = new FormData();
				fd.append('logo', logoFile);
				await pb.collection('companies').update<Company>(company.id, fd);
			} else if (logoRemoved) {
				await pb.collection('companies').update<Company>(company.id, { logo: null });
			}
			onSaved(company.id, newName);
			toast.success(t('company.rename.saved'));
			onClose();
		} catch (err) {
			if (err instanceof ClientResponseError && (err.status === 403 || err.status === 404)) {
				setError(t('company.rename.not_found'));
			} else if (err instanceof ClientResponseError && err.status === 0) {
				setError(t('company.rename.connection_lost'));
			} else {
				setError(t('company.rename.save_failed'));
			}
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
			<DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl border-border bg-card p-6">
				<DialogHeader>
					<DialogTitle>{t('company.rename.title')}</DialogTitle>
					<DialogDescription>{t('company.rename.desc')}</DialogDescription>
				</DialogHeader>
				<form onSubmit={save} className="flex flex-col gap-4">
					<label htmlFor="company-name-edit" className="flex flex-col gap-1.5 text-sm font-semibold">
						{t('company.name')}
						<input
							id="company-name-edit"
							required
							maxLength={120}
							value={name}
							onChange={event => { setName(event.target.value); setError(''); }}
							disabled={saving}
							aria-invalid={Boolean(error)}
							aria-describedby={error ? 'company-name-error' : undefined}
							className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2 disabled:opacity-60"
						/>
					</label>
					<fieldset className="flex flex-col gap-2">
						<legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							{t('company.logo_title')}
						</legend>
						<p className="text-[11px] text-muted-foreground">{t('company.logo_hint')}</p>
						<div className="flex items-center gap-3">
							{logoPreview ? (
								<img
									src={logoPreview}
									alt={t('company.logo_title')}
									className="size-14 rounded-lg border border-border bg-white object-contain p-1"
								/>
							) : (
								<div className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border bg-background text-[10px] text-muted-foreground">
									{t('company.logo_none')}
								</div>
							)}
							<div className="flex flex-col gap-1">
								<label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
									{logoPreview ? t('company.logo_replace') : t('company.logo_upload')}
									<input
										type="file"
										accept="image/png,image/jpeg,image/webp,image/svg+xml"
										className="sr-only"
										disabled={saving}
										onChange={event => {
											const file = event.target.files?.[0];
											if (!file) return;
											if (!file.type.startsWith('image/')) {
												setError(t('company.logo_not_image'));
												return;
											}
											if (file.size > 2 * 1024 * 1024) {
												setError(t('company.logo_too_big'));
												return;
											}
											setLogoFile(file);
											setLogoRemoved(false);
											setError('');
											event.target.value = '';
										}}
									/>
								</label>
								{logoPreview ? (
									<button
										type="button"
										onClick={() => { setLogoFile(null); setLogoRemoved(true); }}
										disabled={saving}
										className="text-[11px] font-semibold text-destructive hover:underline disabled:opacity-60"
									>
										{t('company.logo_remove')}
									</button>
								) : null}
							</div>
						</div>
					</fieldset>
					<fieldset className="flex flex-col gap-2">
						<legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							{t('company.bank_title')}
						</legend>
						<input
							value={bankName}
							onChange={event => { setBankName(event.target.value); setError(''); }}
							placeholder={t('company.bank_name_ph')}
							maxLength={80}
							disabled={saving}
							className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2 disabled:opacity-60"
						/>
						<input
							value={accountHolder}
							onChange={event => { setAccountHolder(event.target.value); setError(''); }}
							placeholder={t('company.bank_holder_ph')}
							maxLength={120}
							disabled={saving}
							className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2 disabled:opacity-60"
						/>
						<input
							value={accountNumber}
							onChange={event => { setAccountNumber(event.target.value); setError(''); }}
							placeholder={t('company.bank_number_ph')}
							maxLength={40}
							disabled={saving}
							className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2 disabled:opacity-60"
						/>
					</fieldset>
					{error ? <p id="company-name-error" role="alert" className="text-sm text-destructive">{error}</p> : null}
					<div className="flex justify-end gap-2">
						<button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60">{t('company.cancel')}</button>
						<button type="submit" disabled={saving} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{saving ? t('company.saving') : t('company.rename.save_changes')}</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
