import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { companyLogoUrl } from '@/lib/company-logo';
import { DEFAULT_ACCOUNTS } from '@/data/default-accounts';
import { PLAN_OPTIONS, planLabel, type PlanKey } from '@/data/plan-options';
import { ROLE_OPTIONS, type MemberRole } from '@/data/user-roles';
import { cn } from '@/lib/utils';
import type { Company } from '@/lib/accounting';
import { listMyMemberships, type CompanyMember } from '@/lib/company-members';
import { CompanyNameDialog } from '@/components/app/company-name-dialog';
import { useLanguage } from '@/hooks/use-language';

/** Mengubah error PocketBase menjadi pesan yang jelas untuk pengguna. */
function describeCreateError(err: unknown, t: (k: string) => string): string {
	if (err instanceof ClientResponseError) {
		if (err.status === 403 || err.status === 400) {
			const data = err.response?.data as Record<string, unknown> | undefined;
			const fieldErrors = data
				? Object.entries(data).map(([field, value]) => {
					const message =
						typeof value === 'object' && value !== null && 'message' in value
							? String((value as { message?: string }).message)
							: String(value);
					return `${field}: ${message}`;
				})
				: [];
			if (fieldErrors.length > 0) return fieldErrors.join(' · ');
		}
		if (err.status === 403) {
			return t('company.no_permission');
		}
		if (err.status === 0) {
			return t('company.connection_lost');
		}
	}
	return t('company.save_failed');
}

function formatCreated(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

function roleLabel(role: MemberRole | 'pemilik', t: (k: string) => string): string {
	return ROLE_OPTIONS.find(option => option.value === role)?.label ?? t('company.role_owner');
}

interface CompanyModuleProps {
	companies: Company[];
	refreshCompanies: () => Promise<void>;
	setActiveCompanyId: (id: string) => void;
	onCompanyNameUpdated: (id: string, name: string) => void;
}

type SortKey = 'name' | 'role' | 'created';

/**
 * Pengelolaan perusahaan: membuat perusahaan baru (dengan bagan akun standar),
 * menghapus, mengaktifkan, serta mengatur rekening bank per perusahaan.
 * Dipakai di rute `/app/perusahaan` dan di bagian Perusahaan pada Pengaturan.
 */
export function CompanyModule({ companies, refreshCompanies, setActiveCompanyId, onCompanyNameUpdated }: CompanyModuleProps) {
	const { t } = useLanguage();
	const [name, setName] = useState('');
	const [code, setCode] = useState('');
	const [address, setAddress] = useState('');
	const [phone, setPhone] = useState('');
	const [email, setEmail] = useState('');
	const [plan, setPlan] = useState<PlanKey>('starter');
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [editingBankId, setEditingBankId] = useState<string | null>(null);
	const [bankName, setBankName] = useState('');
	const [accountHolder, setAccountHolder] = useState('');
	const [accountNumber, setAccountNumber] = useState('');
	const [bankSaving, setBankSaving] = useState(false);
	const [bankError, setBankError] = useState('');
	const [editingContactId, setEditingContactId] = useState<string | null>(null);
	const [contactAddress, setContactAddress] = useState('');
	const [contactPhone, setContactPhone] = useState('');
	const [contactEmail, setContactEmail] = useState('');
	const [contactSaving, setContactSaving] = useState(false);
	const [contactError, setContactError] = useState('');
	const [logoSaving, setLogoSaving] = useState(false);
	const [logoError, setLogoError] = useState('');
	const [showCreate, setShowCreate] = useState(false);
	const [showProfile, setShowProfile] = useState(false);
	const [detailId, setDetailId] = useState<string | null>(null);
	const [editingCompany, setEditingCompany] = useState<Company | null>(null);
	const [memberships, setMemberships] = useState<CompanyMember[]>([]);
	const [sortKey, setSortKey] = useState<SortKey>('name');
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

	const userId = pb.authStore.record?.id ?? '';
	const user = pb.authStore.record;

	useEffect(() => {
		if (!userId) return;
		let cancelled = false;
		listMyMemberships(userId)
			.then(list => {
				if (!cancelled) setMemberships(list);
			})
			.catch(() => {
				if (!cancelled) setMemberships([]);
			});
		return () => {
			cancelled = true;
		};
	}, [userId, companies.length]);

	const roleFor = (company: Company): string => {
		if (company.owner === userId) return t('company.role_owner');
		const member = memberships.find(item => item.company === company.id);
		if (!member) return '—';
		return roleLabel(member.role, t);
	};

	const canArchive = (company: Company) => company.owner === userId;
	const canEditBank = (company: Company) => company.owner === userId;

	const sorted = useMemo(() => {
		const list = [...companies];
		const dir = sortDir === 'asc' ? 1 : -1;
		list.sort((a, b) => {
			if (sortKey === 'created') {
				return (new Date(a.created).getTime() - new Date(b.created).getTime()) * dir;
			}
			const left = sortKey === 'name' ? a.name : roleFor(a);
			const right = sortKey === 'name' ? b.name : roleFor(b);
			return left.localeCompare(right, 'id') * dir;
		});
		return list;
		// roleFor depends on memberships and userId, both listed.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [companies, sortKey, sortDir, memberships, userId]);

	const detail = companies.find(company => company.id === detailId) ?? null;

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'));
			return;
		}
		setSortKey(key);
		setSortDir('asc');
	};

	const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');

		const trimmedName = name.trim();
		if (!trimmedName) {
			setError(t('company.name_required'));
			return;
		}
		if (!PLAN_OPTIONS.some(option => option.key === plan)) {
			setError(t('company.plan_required'));
			return;
		}

		setIsSaving(true);
		const ownerId = pb.authStore.record?.id ?? '';
		try {
			const trimmedEmail = email.trim();
			if (trimmedEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
				setError(t('company.email_invalid'));
				setIsSaving(false);
				return;
			}
			const company = await pb.collection('companies').create<Company>({
				name: trimmedName,
				code: code.trim(),
				address: address.trim(),
				phone: phone.trim(),
				email: trimmedEmail,
				owner: ownerId,
				plan,
			});
			await Promise.all(
				DEFAULT_ACCOUNTS.map((account, index) =>
					pb
						.collection('accounts')
						.create(
							{ ...account, company: company.id, owner: ownerId },
							{ requestKey: `seed-account-${company.id}-${index}` },
						),
				),
			);
			setName('');
			setCode('');
			setAddress('');
			setPhone('');
			setEmail('');
			setPlan('starter');
			await refreshCompanies();
			setActiveCompanyId(company.id);
			setShowCreate(false);
			toast.success(
				t('company.created_toast', { name: company.name, plan: planLabel(plan) }),
				plan === 'starter'
					? undefined
					: {
							description: t('company.pay_hint'),
							action: {
								label: t('company.pay'),
								onClick: () => {
									window.location.href = '/plans';
								},
							},
						},
			);
		} catch (err) {
			setError(describeCreateError(err, t));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (company: Company) => {
		if (!canArchive(company)) return;
		if (
			!window.confirm(
				t('company.archive_confirm', { name: company.name }),
			)
		) {
			return;
		}
		await pb.collection('companies').delete(company.id);
		if (detailId === company.id) setDetailId(null);
		await refreshCompanies();
		toast.success(t('company.archived', { name: company.name }));
	};

	const startEditBank = (company: Company) => {
		setEditingBankId(company.id);
		setBankName(company.bank_name ?? '');
		setAccountHolder(company.account_holder ?? '');
		setAccountNumber(company.account_number ?? '');
		setBankError('');
	};

	const cancelEditBank = () => {
		setEditingBankId(null);
		setBankName('');
		setAccountHolder('');
		setAccountNumber('');
		setBankError('');
	};

	const handleSaveBank = async (company: Company) => {
		if (!canEditBank(company)) return;
		setBankError('');
		const trimmedBank = bankName.trim();
		const trimmedHolder = accountHolder.trim();
		const trimmedNumber = accountNumber.trim();
		if (trimmedBank || trimmedHolder || trimmedNumber) {
			if (!trimmedBank || !trimmedHolder || !trimmedNumber) {
				setBankError(t('company.bank_required'));
				return;
			}
		}
		setBankSaving(true);
		try {
			await pb.collection('companies').update(company.id, {
				bank_name: trimmedBank,
				account_holder: trimmedHolder,
				account_number: trimmedNumber,
			});
			await refreshCompanies();
			toast.success(t('company.bank_saved'));
			cancelEditBank();
		} catch (err) {
			setBankError(describeCreateError(err, t));
		} finally {
			setBankSaving(false);
		}
	};

	const startEditContact = (company: Company) => {
		setEditingContactId(company.id);
		setContactAddress(company.address ?? '');
		setContactPhone(company.phone ?? '');
		setContactEmail(company.email ?? '');
		setContactError('');
	};

	const cancelEditContact = () => {
		setEditingContactId(null);
		setContactAddress('');
		setContactPhone('');
		setContactEmail('');
		setContactError('');
	};

	const handleSaveContact = async (company: Company) => {
		if (!canEditBank(company)) return;
		setContactError('');
		const trimmedEmail = contactEmail.trim();
		if (trimmedEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
			setContactError(t('company.email_invalid'));
			return;
		}
		setContactSaving(true);
		try {
			await pb.collection('companies').update(company.id, {
				address: contactAddress.trim(),
				phone: contactPhone.trim(),
				email: trimmedEmail,
			});
			await refreshCompanies();
			toast.success(t('company.contact_saved'));
			cancelEditContact();
		} catch (err) {
			setContactError(describeCreateError(err, t));
		} finally {
			setContactSaving(false);
		}
	};

	const handleUploadLogo = async (company: Company, file: File) => {
		if (!canEditBank(company)) return;
		setLogoError('');
		if (!file.type.startsWith('image/')) {
			setLogoError(t('company.logo_not_image'));
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			setLogoError(t('company.logo_too_big'));
			return;
		}
		setLogoSaving(true);
		try {
			const fd = new FormData();
			fd.append('logo', file);
			await pb.collection('companies').update(company.id, fd);
			await refreshCompanies();
			toast.success(t('company.logo_updated'));
		} catch (err) {
			setLogoError(describeCreateError(err, t));
		} finally {
			setLogoSaving(false);
		}
	};

	const handleRemoveLogo = async (company: Company) => {
		if (!canEditBank(company)) return;
		if (!window.confirm(t('company.logo_remove_confirm'))) return;
		setLogoSaving(true);
		try {
			await pb.collection('companies').update(company.id, { logo: null });
			await refreshCompanies();
			toast.success(t('company.logo_removed'));
		} catch (err) {
			setLogoError(describeCreateError(err, t));
		} finally {
			setLogoSaving(false);
		}
	};

	const readUser = (field: string) => {
		const value = user && typeof user.get === 'function' ? user.get(field) : '';
		return String(value ?? '').trim() || '—';
	};
	const profileName = String(user?.name ?? '').trim() || '—';
	const profileEmail = String(user?.email ?? '').trim() || '—';
	const profilePhone = readUser('phone');
	const profileTitle = readUser('job_title');

	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="flex flex-col gap-3 border-b border-border bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
				<h2 className="text-lg font-bold tracking-tight text-foreground">{t('company.list_title')}</h2>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => setShowProfile(true)}
						className="rounded-lg border border-primary bg-background px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-accent"
					>
						{t('company.profile_info')}
					</button>
					<button
						type="button"
						onClick={() => {
							setError('');
							setShowCreate(true);
						}}
						className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{t('company.create_new')}
					</button>
				</div>
			</div>

			{companies.length === 0 ? (
				<p className="px-5 py-10 text-center text-sm text-muted-foreground">
					{t('company.empty')}
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] border-collapse text-sm">
						<thead>
							<tr className="border-b border-border bg-muted/30 text-left">
								<SortHeader label={t('company.col_name')} active={sortKey === 'name'} onClick={() => toggleSort('name')} />
								<SortHeader label={t('company.col_role')} active={sortKey === 'role'} onClick={() => toggleSort('role')} />
								<SortHeader
									label={t('company.col_created')}
									active={sortKey === 'created'}
									onClick={() => toggleSort('created')}
								/>
								<th className="w-28 px-4 py-3" />
							</tr>
						</thead>
						<tbody>
							{sorted.map(company => (
								<tr key={company.id} className="border-b border-border last:border-0">
									<td className="px-4 py-3.5">
										<button
											type="button"
											onClick={() => setDetailId(company.id)}
											className="text-left text-sm font-medium text-primary hover:underline"
										>
											{company.name}
										</button>
									</td>
									<td className="px-4 py-3.5">
										<span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
											{roleFor(company)}
										</span>
									</td>
									<td className="px-4 py-3.5 text-foreground/80">{formatCreated(company.created)}</td>
									<td className="px-4 py-3.5 text-right">
										{canArchive(company) ? (
											<div className="flex justify-end gap-2 whitespace-nowrap">
												<button
													type="button"
													onClick={() => setEditingCompany(company)}
													aria-label={t('company.edit_name_aria', { name: company.name })}
													className="rounded-lg border border-primary bg-background px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent"
												>
													{t('company.edit_name')}
												</button>
												<button
													type="button"
													onClick={() => void handleDelete(company)}
													className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
												>
													{t('company.archive')}
												</button>
											</div>
										) : (
											<span className="text-xs text-muted-foreground">—</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{editingCompany ? (
				<CompanyNameDialog
					key={editingCompany.id}
					company={editingCompany}
					onClose={() => setEditingCompany(null)}
					onSaved={(companyId, name) => {
						onCompanyNameUpdated(companyId, name);
						// Segarkan daftar perusahaan agar perubahan rekening bank
						// tersimpan pada data perusahaan dan tampil pada invoice.
						void refreshCompanies();
					}}
				/>
			) : null}

			{showCreate ? (
				<Overlay title={t('company.create_title')} onClose={() => setShowCreate(false)}>
					<form onSubmit={handleCreate} className="flex flex-col gap-4">
						<label className="flex flex-col gap-1.5 text-xs font-semibold">
							{t('company.name')}
							<input
								required
								value={name}
								onChange={event => setName(event.target.value)}
								placeholder="PT Maju Bersama"
								className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2"
							/>
						</label>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="flex flex-col gap-1.5 text-xs font-semibold">
								{t('company.code')}
								<input
									value={code}
									onChange={event => setCode(event.target.value)}
									placeholder="MB"
									className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2"
								/>
							</label>
							<label className="flex flex-col gap-1.5 text-xs font-semibold">
								{t('company.address')}
								<input
									value={address}
									onChange={event => setAddress(event.target.value)}
									placeholder="Jakarta"
									className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2"
								/>
							</label>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="flex flex-col gap-1.5 text-xs font-semibold">
								{t('company.phone')}
								<input
									value={phone}
									onChange={event => setPhone(event.target.value)}
									placeholder="0812xxxxxxx"
									maxLength={40}
									className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2"
								/>
							</label>
							<label className="flex flex-col gap-1.5 text-xs font-semibold">
								{t('company.email')}
								<input
									type="email"
									value={email}
									onChange={event => setEmail(event.target.value)}
									placeholder="admin@perusahaan.com"
									className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none ring-primary/30 focus:ring-2"
								/>
							</label>
						</div>
						<fieldset className="flex flex-col gap-2">
							<legend className="text-xs font-semibold">{t('company.plan')}</legend>
							<div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('company.plan')}>
								{PLAN_OPTIONS.map(option => {
									const isSelected = plan === option.key;
									return (
										<button
											key={option.key}
											type="button"
											role="radio"
											aria-checked={isSelected}
											onClick={() => setPlan(option.key)}
											className={cn(
												'rounded-xl border p-3 text-left',
												isSelected
													? 'border-primary bg-accent/50 ring-1 ring-primary/30'
													: 'border-border bg-background hover:border-primary/40',
											)}
										>
											<span className="flex items-center justify-between gap-2 text-sm font-bold">
												{option.title}
												{isSelected ? <Check className="size-3.5 text-primary" strokeWidth={3} /> : null}
											</span>
											<span className="mt-1 block text-xs text-muted-foreground">
												{option.price} {option.period}
											</span>
										</button>
									);
								})}
							</div>
						</fieldset>
						{error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setShowCreate(false)}
								className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold"
							>
								{t('company.cancel')}
							</button>
							<button
								type="submit"
								disabled={isSaving}
								className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
							>
								{isSaving ? t('company.saving') : t('company.create_button')}
							</button>
						</div>
					</form>
				</Overlay>
			) : null}

			{showProfile ? (
				<Overlay title={t('company.profile_info')} onClose={() => setShowProfile(false)}>
					<dl className="grid gap-3 text-sm">
						<ProfileRow label={t('company.profile_name')} value={profileName} />
						<ProfileRow label={t('company.profile_email')} value={profileEmail} />
						<ProfileRow label={t('company.profile_phone')} value={profilePhone} />
						<ProfileRow label={t('company.profile_title')} value={profileTitle} />
					</dl>
				</Overlay>
			) : null}

			{detail ? (
				<Overlay title={detail.name} onClose={() => setDetailId(null)}>
					{canArchive(detail) ? (
						<button
							type="button"
							onClick={() => { setDetailId(null); setEditingCompany(detail); }}
							className="mb-2 rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-accent"
						>
							{t('company.edit_company_name')}
						</button>
					) : null}
					<dl className="grid gap-2 text-sm">
						<ProfileRow label={t('company.detail_role')} value={roleFor(detail)} />
						<ProfileRow label={t('company.detail_code')} value={detail.code || '—'} />
						<ProfileRow label={t('company.detail_plan')} value={planLabel(detail.plan)} />
						<ProfileRow label={t('company.detail_created')} value={formatCreated(detail.created)} />
					</dl>
					<div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-xs">
						<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							{t('company.logo_title')}
						</p>
						<p className="mt-1 text-muted-foreground">
							{t('company.logo_hint')}
						</p>
						<div className="mt-2 flex items-center gap-3">
							{detail.logo ? (
								<img
									src={companyLogoUrl(detail, '200x200')}
									alt={`Logo ${detail.name}`}
									className="size-14 rounded-lg border border-border bg-white object-contain p-1"
								/>
							) : (
								<div className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border bg-background text-[10px] text-muted-foreground">
									{t('company.logo_none')}
								</div>
							)}
							{canEditBank(detail) ? (
								<div className="flex flex-col gap-1">
									<label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
										{logoSaving ? t('company.saving') : detail.logo ? t('company.logo_replace') : t('company.logo_upload')}
										<input
											type="file"
											accept="image/png,image/jpeg,image/webp,image/svg+xml"
											className="sr-only"
											disabled={logoSaving}
											onChange={event => {
												const file = event.target.files?.[0];
												if (file) void handleUploadLogo(detail, file);
												event.target.value = '';
											}}
										/>
									</label>
									{detail.logo ? (
										<button
											type="button"
											onClick={() => void handleRemoveLogo(detail)}
											disabled={logoSaving}
											className="text-[11px] font-semibold text-destructive hover:underline disabled:opacity-60"
										>
											{t('company.logo_remove')}
										</button>
									) : null}
								</div>
							) : null}
						</div>
						{logoError ? <p className="mt-2 text-[11px] font-semibold text-destructive">{logoError}</p> : null}
					</div>
					<div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-xs">
						<div className="flex items-center justify-between gap-2">
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								{t('company.contact_title')}
							</p>
							{editingContactId !== detail.id && canEditBank(detail) ? (
								<button
									type="button"
									onClick={() => startEditContact(detail)}
									className="text-[11px] font-bold text-primary hover:underline"
								>
									{t('company.contact_edit')}
								</button>
							) : null}
						</div>
						{editingContactId === detail.id ? (
							<div className="mt-2 flex flex-col gap-2">
								<input
									value={contactAddress}
									onChange={event => setContactAddress(event.target.value)}
									placeholder={t('company.contact_address_ph')}
									maxLength={300}
									className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
								/>
								<input
									value={contactPhone}
									onChange={event => setContactPhone(event.target.value)}
									placeholder={t('company.contact_phone_ph')}
									maxLength={40}
									className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
								/>
								<input
									type="email"
									value={contactEmail}
									onChange={event => setContactEmail(event.target.value)}
									placeholder={t('company.contact_email_ph')}
									maxLength={120}
									className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
								/>
								{contactError ? <p className="text-[11px] font-semibold text-destructive">{contactError}</p> : null}
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => void handleSaveContact(detail)}
										disabled={contactSaving}
										className="rounded-lg bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-60"
									>
										{contactSaving ? t('company.saving') : t('common.save')}
									</button>
									<button
										type="button"
										onClick={cancelEditContact}
										disabled={contactSaving}
										className="rounded-lg border border-border px-3 py-1 text-[11px] font-semibold"
									>
										{t('company.cancel')}
									</button>
								</div>
							</div>
						) : (
							<dl className="mt-1.5">
								<dd className="text-muted-foreground">{t('company.contact_address_label')}: <span className="font-semibold text-foreground">{detail.address || '—'}</span></dd>
								<dd className="text-muted-foreground">{t('company.contact_phone_label')}: <span className="font-semibold text-foreground">{detail.phone || '—'}</span></dd>
								<dd className="text-muted-foreground">{t('company.contact_email_label')}: <span className="font-semibold text-foreground">{detail.email || '—'}</span></dd>
							</dl>
						)}
					</div>
					<div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-xs">
						<div className="flex items-center justify-between gap-2">
							<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								{t('company.bank_title')}
							</p>
							{editingBankId !== detail.id && canEditBank(detail) ? (
								<button
									type="button"
									onClick={() => startEditBank(detail)}
									className="text-[11px] font-bold text-primary hover:underline"
								>
									{detail.bank_name ? t('company.bank_edit') : t('company.bank_add')}
								</button>
							) : null}
						</div>
						{editingBankId === detail.id ? (
							<div className="mt-2 flex flex-col gap-2">
								<input
									value={bankName}
									onChange={event => setBankName(event.target.value)}
									placeholder={t('company.bank_name_ph')}
									maxLength={80}
									className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
								/>
								<input
									value={accountHolder}
									onChange={event => setAccountHolder(event.target.value)}
									placeholder={t('company.bank_holder_ph')}
									maxLength={120}
									className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
								/>
								<input
									value={accountNumber}
									onChange={event => setAccountNumber(event.target.value)}
									placeholder={t('company.bank_number_ph')}
									maxLength={40}
									className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
								/>
								{bankError ? <p className="text-[11px] font-semibold text-destructive">{bankError}</p> : null}
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => void handleSaveBank(detail)}
										disabled={bankSaving}
										className="rounded-lg bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-60"
									>
										{bankSaving ? t('company.saving') : t('common.save')}
									</button>
									<button
										type="button"
										onClick={cancelEditBank}
										disabled={bankSaving}
										className="rounded-lg border border-border px-3 py-1 text-[11px] font-semibold"
									>
										{t('company.cancel')}
									</button>
								</div>
							</div>
						) : detail.bank_name && detail.account_number ? (
							<dl className="mt-1.5">
								<dd className="font-bold text-foreground">{detail.bank_name}</dd>
								<dd className="font-semibold tracking-tight">{detail.account_number}</dd>
								<dd className="text-muted-foreground">{t('company.bank_holder_prefix')} {detail.account_holder || '—'}</dd>
							</dl>
						) : (
							<p className="mt-1.5 text-muted-foreground">{t('company.bank_none')}</p>
						)}
					</div>
					<div className="mt-4 flex flex-wrap justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								setActiveCompanyId(detail.id);
								toast.success(t('company.made_active', { name: detail.name }));
							}}
							className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
						>
							{t('company.make_active')}
						</button>
						{canArchive(detail) ? (
							<button
								type="button"
								onClick={() => void handleDelete(detail)}
								className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted"
							>
								{t('company.archive')}
							</button>
						) : null}
					</div>
				</Overlay>
			) : null}
		</div>
	);
}

function SortHeader({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<th className="px-4 py-3">
			<button
				type="button"
				onClick={onClick}
				className={cn(
					'inline-flex items-center gap-1 text-sm font-semibold text-foreground',
					active && 'text-primary',
				)}
			>
				{label}
				<ChevronsUpDown className="size-3.5 text-muted-foreground" />
			</button>
		</th>
	);
}

function Overlay({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-3 sm:items-center">
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-soft"
			>
				<div className="mb-4 flex items-start justify-between gap-3">
					<h3 className="text-base font-bold tracking-tight">{title}</h3>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<X className="size-4" />
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}

function ProfileRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 border-b border-border/70 py-2 last:border-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-medium text-foreground">{value}</dd>
		</div>
	);
}
