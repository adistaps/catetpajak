import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Plus } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	todayIso,
	type Account,
	type AccountType,
	type Company,
} from '@/lib/accounting';
import { type FixedAsset } from '@/lib/depreciation';
import { NoCompany } from '@/components/app/no-company';
import { useLanguage } from '@/hooks/use-language';

const ACCOUNT_TYPE_KEYS: Record<AccountType, string> = {
	aset: 'account.type.aset',
	liabilitas: 'account.type.liabilitas',
	ekuitas: 'account.type.ekuitas',
	pendapatan: 'account.type.pendapatan',
	beban: 'account.type.beban',
};

function findAccountByName(accounts: Account[], pattern: RegExp): string {
	const found = accounts.find(a => pattern.test(a.name));
	return found?.id ?? '';
}

interface AssetFormProps {
	activeCompany: Company | null;
}

/**
 * Form pendaftaran aset tertunda. Hanya mencatat info dasar (nama, harga
 * perolehan, tanggal, nomor faktur, akun aset) dan menyimpan dengan status
 * "pending". Aktifkan aset dilakukan dari tab Aset Tertunda melalui fitur
 * "Buat Invoice".
 */
export function AssetForm({ activeCompany }: AssetFormProps) {
	const { t } = useLanguage();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const pendingId = searchParams.get('pending') || '';
	const [pendingAsset, setPendingAsset] = useState<FixedAsset | null>(null);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [assetAccount, setAssetAccount] = useState('');
	const [name, setName] = useState('');
	const [cost, setCost] = useState('');
	const [salvage, setSalvage] = useState('0');
	const [acquisitionDate, setAcquisitionDate] = useState(todayIso());
	const [invoiceNumber, setInvoiceNumber] = useState('');
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!activeCompany) {
			setAccounts([]);
			return;
		}
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		pb
			.collection('accounts')
			.getFullList<Account>({ filter: companyFilter, sort: 'code' })
			.then(accountList => {
				if (cancelled) return;
				setAccounts(accountList);
				setAssetAccount(prev =>
					prev && accountList.some(a => a.id === prev)
						? prev
						: findAccountByName(accountList, /peralatan|aset tetap/i),
				);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	useEffect(() => {
		if (!pendingId || !activeCompany) {
			setPendingAsset(null);
			return;
		}
		let cancelled = false;
		pb.collection('fixed_assets')
			.getOne<FixedAsset>(pendingId)
			.then(asset => {
				if (cancelled) return;
				if (asset.company !== activeCompany.id) return;
				setPendingAsset(asset);
				setName(asset.name || '');
				setCost(String(asset.acquisition_cost || 0));
				setSalvage(String(asset.salvage_value || 0));
				setAcquisitionDate((asset.acquisition_date || todayIso()).slice(0, 10));
				setInvoiceNumber(asset.invoice_number || '');
				if (asset.asset_account) setAssetAccount(asset.asset_account);
			})
			.catch(() => setPendingAsset(null));
		return () => {
			cancelled = true;
		};
	}, [pendingId, activeCompany]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	const accountsByType = (Object.keys(ACCOUNT_TYPE_KEYS) as AccountType[]).reduce(
		(groups, type) => {
			groups[type] = accounts.filter(a => a.type === type);
			return groups;
		},
		{} as Record<AccountType, Account[]>,
	);

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		if (!name) {
			setError(t('asset.form.name_required'));
			return;
		}
		const costNum = Number(cost) || 0;
		if (costNum <= 0) {
			setError(t('asset.form.cost_required'));
			return;
		}
		setIsSaving(true);
		try {
			const ownerId = pb.authStore.record?.id ?? '';
			const payload: Record<string, unknown> = {
				company: activeCompany.id,
				name,
				acquisition_cost: costNum,
				salvage_value: Number(salvage) || 0,
				acquisition_date: acquisitionDate,
				status: 'pending',
				invoice_number: invoiceNumber || undefined,
				asset_account: assetAccount || undefined,
				owner: ownerId,
			};

			if (pendingAsset) {
				await pb.collection('fixed_assets').update<FixedAsset>(pendingAsset.id, payload);
			} else {
				await pb.collection('fixed_assets').create<FixedAsset>(payload);
			}
			navigate('/app/aset?tab=pending');
		} catch {
			setError(t('asset.form.save_failed'));
		} finally {
			setIsSaving(false);
		}
	};

	const renderAccountSelect = (
		value: string,
		onChange: (v: string) => void,
		label: string,
		types: AccountType[],
	) => (
		<div className="flex flex-col gap-2">
			<label className="text-xs font-semibold">{label}</label>
			<select
				value={value}
				onChange={e => onChange(e.target.value)}
				className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
			>
				<option value="">{t('asset.form.pick_account')}</option>
				{types.map(type => (
					<optgroup key={type} label={t(ACCOUNT_TYPE_KEYS[type])}>
						{accountsByType[type].map(a => (
							<option key={a.id} value={a.id}>
								{a.code} — {a.name}
							</option>
						))}
					</optgroup>
				))}
			</select>
		</div>
	);

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-col gap-3">
				<Link
					to="/app/aset"
					className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> {t('asset.form.back')}
				</Link>
				<div>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
						{pendingAsset ? t('asset.form.edit_title') : t('asset.form.add_title')}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{pendingAsset ? t('asset.form.edit_desc') : t('asset.form.add_desc')}
					</p>
				</div>
			</header>

			<form
				onSubmit={handleSave}
				className="grid gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft md:grid-cols-6 md:items-end"
			>
				<div className="flex flex-col gap-2 md:col-span-2">
					<label className="text-xs font-semibold">{t('asset.form.name')}</label>
					<input
						value={name}
						onChange={e => setName(e.target.value)}
						placeholder={t('asset.form.name_placeholder')}
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<div className="flex flex-col gap-2 md:col-span-2">
					<label className="text-xs font-semibold">{t('asset.form.cost')}</label>
					<input
						type="number"
						min="0"
						required
						value={cost}
						onChange={e => setCost(e.target.value)}
						placeholder="0"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label className="text-xs font-semibold">{t('asset.form.salvage')}</label>
					<input
						type="number"
						min="0"
						value={salvage}
						onChange={e => setSalvage(e.target.value)}
						placeholder="0"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label className="text-xs font-semibold">{t('asset.form.acq_date')}</label>
					<input
						type="date"
						required
						value={acquisitionDate}
						onChange={e => setAcquisitionDate(e.target.value)}
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<div className="flex flex-col gap-2 md:col-span-3">
					<label className="text-xs font-semibold">{t('asset.form.invoice_optional')}</label>
					<input
						value={invoiceNumber}
						onChange={e => setInvoiceNumber(e.target.value)}
						placeholder={t('asset.form.invoice_placeholder')}
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				{renderAccountSelect(assetAccount, setAssetAccount, t('asset.form.asset_account'), ['aset'])}

				<div className="flex flex-wrap items-center gap-3 md:col-span-6">
					<button
						type="submit"
						disabled={isSaving}
						className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
					>
						<Plus className="size-4" />
						{isSaving
							? t('asset.form.saving')
							: pendingAsset
								? t('asset.form.update')
								: t('asset.form.save')}
					</button>
					<Link
						to="/app/aset?tab=pending"
						className="text-sm font-semibold text-muted-foreground hover:text-foreground"
					>
						{t('asset.form.view_pending')}
					</Link>
				</div>
				{error ? (
					<p className="text-sm font-semibold text-destructive md:col-span-6">{error}</p>
				) : null}
			</form>
		</div>
	);
}
