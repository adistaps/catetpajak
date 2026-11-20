import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { type Company } from '@/lib/accounting';
import { type Contact, type ContactType } from '@/lib/contacts';
import { NoCompany } from '@/components/app/no-company';
import { useLanguage } from '@/hooks/use-language';

interface ContactFormProps {
	activeCompany: Company | null;
	/** Bila diisi, formulir memuat kontak tersebut dan menyimpan perubahan ke catatan yang sama. */
	contactId?: string;
}

export function ContactForm({ activeCompany, contactId }: ContactFormProps) {
	const { t } = useLanguage();
	const navigate = useNavigate();
	const isEditing = Boolean(contactId);
	const [name, setName] = useState('');
	const [type, setType] = useState<ContactType>('customer');
	const [code, setCode] = useState('');
	const [phone, setPhone] = useState('');
	const [email, setEmail] = useState('');
	const [address, setAddress] = useState('');
	const [error, setError] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [isLoading, setIsLoading] = useState(isEditing);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		if (!contactId || !activeCompany) return;
		let cancelled = false;
		setIsLoading(true);
		setNotFound(false);
		pb
			.collection('contacts')
			.getOne<Contact>(contactId)
			.then(record => {
				if (cancelled) return;
				// Pastikan kontak benar-benar milik perusahaan aktif — jangan
				// menyentuh data perusahaan lain.
				if (record.company !== activeCompany.id) {
					setNotFound(true);
					return;
				}
				setName(record.name ?? '');
				setType(record.type ?? 'customer');
				setCode(record.code ?? '');
				setPhone(record.phone ?? '');
				setEmail(record.email ?? '');
				setAddress(record.address ?? '');
			})
			.catch(() => {
				if (!cancelled) setNotFound(true);
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [contactId, activeCompany]);

	if (!activeCompany) {
		return <NoCompany />;
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" /> {t('contact.form.loading')}
			</div>
		);
	}

	if (notFound) {
		return (
			<div className="flex flex-col gap-4">
				<Link
					to="/app/kontak"
					className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> {t('contact.form.back')}
				</Link>
				<p className="text-sm font-semibold text-destructive">{t('contact.form.not_found')}</p>
			</div>
		);
	}

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		if (!name.trim()) {
			setError(t('contact.form.name_required'));
			return;
		}
		setIsSaving(true);
		try {
			const payload = { name, type, code, phone, email, address };
			if (isEditing && contactId) {
				await pb.collection('contacts').update<Contact>(contactId, payload);
			} else {
				await pb.collection('contacts').create<Contact>({
					...payload,
					company: activeCompany.id,
					owner: pb.authStore.record?.id ?? '',
				});
			}
			navigate('/app/kontak');
		} catch {
			setError(t('contact.form.save_failed'));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-col gap-3">
				<Link
					to="/app/kontak"
					className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> {t('contact.form.back')}
				</Link>
				<div>
					<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
						{isEditing ? t('contact.form.edit_title') : t('contact.form.title')}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{isEditing ? t('contact.form.edit_desc') : t('contact.form.desc')}
					</p>
				</div>
			</header>

			<form
				onSubmit={handleSubmit}
				className="grid gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft md:grid-cols-4 md:items-end"
			>
				<div className="flex flex-col gap-2">
					<label htmlFor="contact-name" className="text-xs font-semibold">
						{t('contact.form.name')}
					</label>
					<input
						id="contact-name"
						required
						value={name}
						onChange={event => setName(event.target.value)}
						placeholder="PT Sumber Rezeki"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="contact-type" className="text-xs font-semibold">
						{t('contact.form.type')}
					</label>
					<select
						id="contact-type"
						value={type}
						onChange={event => setType(event.target.value as ContactType)}
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					>
						<option value="customer">{t('contact.form.customer')}</option>
						<option value="supplier">{t('contact.form.supplier')}</option>
					</select>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="contact-code" className="text-xs font-semibold">
						{t('contact.form.code')}
					</label>
					<input
						id="contact-code"
						value={code}
						onChange={event => setCode(event.target.value)}
						placeholder="C001"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor="contact-phone" className="text-xs font-semibold">
						{t('contact.form.phone')}
					</label>
					<input
						id="contact-phone"
						value={phone}
						onChange={event => setPhone(event.target.value)}
						placeholder="0812xxxx"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<div className="flex flex-col gap-2 md:col-span-2">
					<label htmlFor="contact-email" className="text-xs font-semibold">
						{t('contact.form.email')}
					</label>
					<input
						id="contact-email"
						value={email}
						onChange={event => setEmail(event.target.value)}
						placeholder="email@perusahaan.com"
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<div className="flex flex-col gap-2 md:col-span-2">
					<label htmlFor="contact-address" className="text-xs font-semibold">
						{t('contact.form.address')}
					</label>
					<input
						id="contact-address"
						value={address}
						onChange={event => setAddress(event.target.value)}
						placeholder={t('contact.form.address')}
						className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
					/>
				</div>
				<button
					type="submit"
					disabled={isSaving}
					className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 md:col-span-4"
				>
					{isSaving
						? t('contact.form.saving')
						: isEditing
							? t('contact.form.update')
							: t('contact.form.save')}
				</button>
				{error ? (
					<p className="text-sm font-semibold text-destructive md:col-span-4">{error}</p>
				) : null}
			</form>
		</div>
	);
}
