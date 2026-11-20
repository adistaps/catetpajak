import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { GraduationCap, HandCoins, Loader2, Megaphone, Pencil, Plus, Trash2, Users, UserCog, UserRound } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { formatDate, type Company } from '@/lib/accounting';
import {
	CONTACT_TYPE_LABELS,
	type Contact,
	type ContactType,
} from '@/lib/contacts';
import { NoCompany } from '@/components/app/no-company';
import { ImportExportBar } from '@/components/app/import-export-bar';
import { EmployeeManager } from '@/components/app/employee-manager';
import { LoanManager } from '@/components/app/loan-manager';
import { StudentManager } from '@/components/app/student-manager';
import { ParentManager } from '@/components/app/parent-manager';
import { AnnouncementManager } from '@/components/app/announcement-manager';
import { exportCsv, timestampedFilename } from '@/lib/import-export';
import { cn } from '@/lib/utils';
import type { AppOutletContext } from '@/lib/app-context';
import { kontakDirectoryOnly } from '@/data/user-roles';
import { toast } from 'sonner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useLanguage } from '@/hooks/use-language';

type ContactTab = 'kontak' | 'karyawan' | 'pinjaman' | 'student' | 'parent' | 'pengumuman';

const CONTACT_EXPORT_HEADERS = ['Nama', 'Tipe', 'Kode', 'Telepon', 'Email', 'Alamat'];

interface ContactModuleProps {
	activeCompany: Company | null;
}

const FILTERS: { key: 'all' | ContactType; labelKey: string }[] = [
	{ key: 'all', labelKey: 'kasbank.all' },
	{ key: 'customer', labelKey: 'contact.customer' },
	{ key: 'supplier', labelKey: 'contact.supplier' },
];

export function ContactModule({ activeCompany }: ContactModuleProps) {
	const { t } = useLanguage();
	const { memberRole } = useOutletContext<AppOutletContext>();
	const directoryOnly = kontakDirectoryOnly(memberRole);
	const [tab, setTab] = useState<ContactTab>('kontak');
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [filter, setFilter] = useState<'all' | ContactType>('all');

	// Finance & HR hanya boleh membuka tab employee directory.
	useEffect(() => {
		if (directoryOnly && tab !== 'karyawan') setTab('karyawan');
	}, [directoryOnly, tab]);

	useEffect(() => {
		if (!activeCompany) {
			setContacts([]);
			return;
		}
		let cancelled = false;
		const companyFilter = pb.filter('company = {:company}', { company: activeCompany.id });
		pb
			.collection('contacts')
			.getFullList<Contact>({ filter: companyFilter, sort: 'name', requestKey: null })
			.then(list => {
				if (!cancelled) setContacts(list);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeCompany]);

	const { run: runDelete, isPending: isDeleting } = usePendingAction();

	if (!activeCompany) {
		return <NoCompany />;
	}

	const handleExport = () => {
		const rows = [CONTACT_EXPORT_HEADERS, ...filtered.map(c => [
			c.name,
			CONTACT_TYPE_LABELS[c.type] ?? c.type,
			c.code ?? '',
			c.phone ?? '',
			c.email ?? '',
			c.address ?? '',
		])];
		exportCsv(timestampedFilename('kontak'), rows);
	};

	const handleImport = async (rows: string[][]) => {
		const ownerId = pb.authStore.record?.id ?? '';
		let created = 0;
		let skipped = 0;
		for (const row of rows) {
			const [rawName, rawType, rawCode, rawPhone, rawEmail, rawAddress] = row;
			const name = (rawName ?? '').trim();
			if (!name) { skipped += 1; continue; }
			const type: ContactType =
				rawType?.toLowerCase().includes('pemasok') || rawType?.toLowerCase().includes('supplier')
					? 'supplier'
					: 'customer';
			try {
				const rec = await pb.collection('contacts').create<Contact>(
					{
						company: activeCompany.id,
						name,
						type,
						code: (rawCode ?? '').trim(),
						phone: (rawPhone ?? '').trim(),
						email: (rawEmail ?? '').trim(),
						address: (rawAddress ?? '').trim(),
						owner: ownerId,
					},
					{ requestKey: `import-contact-${created}-${name}` },
				);
				setContacts(previous =>
					[...previous, rec].sort((a, b) => a.name.localeCompare(b.name)),
				);
				created += 1;
			} catch {
				skipped += 1;
			}
		}
		if (created === 0) throw new Error('Tidak ada kontak baru yang berhasil diimpor.');
		return { created, skipped };
	};

	const handleDelete = (contact: Contact) => {
		if (!window.confirm(t('contact.delete_confirm', { name: contact.name }))) return;
		void runDelete(contact.id, async () => {
			try {
				await pb.collection('contacts').delete(contact.id, { requestKey: `del-contact-${contact.id}` });
				setContacts(previous => previous.filter(item => item.id !== contact.id));
				toast.success(t('contact.deleted'));
			} catch {
				toast.error(t('contact.delete_failed'));
			}
		});
	};

	const filtered = filter === 'all' ? contacts : contacts.filter(c => c.type === filter);

	return (
		<div className="flex flex-col gap-8">
			<header>
				<h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">{t('contact.title')}</h1>
				<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
					{t('contact.subtitle2')}
				</p>
			</header>

			<div className="grid items-start gap-4 lg:grid-cols-[196px_minmax(0,1fr)] lg:gap-6">
			<div className="flex gap-1 overflow-x-auto border-b border-slate-200/80 pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-b-0 lg:border-r lg:border-slate-200/70 lg:pb-2 lg:pr-3">
				{(directoryOnly
					? ([
							{ key: 'karyawan' as const, label: t('contact.tab.employees'), icon: UserCog },
						])
					: ([
							{ key: 'kontak' as const, label: t('contact.tab.directory'), icon: Users },
							{ key: 'karyawan' as const, label: t('contact.tab.employees'), icon: UserCog },
							{ key: 'student' as const, label: t('contact.tab.students'), icon: GraduationCap },
							{ key: 'parent' as const, label: t('contact.tab.parents'), icon: UserRound },
							{ key: 'pengumuman' as const, label: t('contact.tab.announcements'), icon: Megaphone },
							{ key: 'pinjaman' as const, label: t('contact.tab.loans'), icon: HandCoins },
						])
				).map(item => (
					<button
						key={item.key}
						type="button"
						onClick={() => setTab(item.key)}
						className={cn(
							'flex min-h-11 shrink-0 items-center gap-3 border-l-[3px] px-3 py-2.5 text-left text-sm font-semibold leading-snug transition-colors lg:w-full',
							tab === item.key
								? 'border-emerald-600 bg-[#e7f8ef] text-emerald-700'
								: 'border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900',
						)}
					>
						<item.icon className="size-4" /> {item.label}
					</button>
				))}
			</div>

			<div className="min-w-0">
			{tab === 'karyawan' ? (
				<EmployeeManager company={activeCompany} />
			) : tab === 'student' ? (
				<StudentManager company={activeCompany} />
			) : tab === 'parent' ? (
				<ParentManager company={activeCompany} />
			) : tab === 'pengumuman' ? (
				<AnnouncementManager company={activeCompany} />
			) : tab === 'pinjaman' ? (
				<LoanManager company={activeCompany} />
			) : (
				<div className="flex flex-col gap-5">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<ImportExportBar
							importLabel={t('contact.title') === 'Kontak' ? 'Import Kontak' : 'Import Contacts'}
							showImportIcon={false}
							exportLabel={t('contact.title') === 'Kontak' ? 'Export Kontak' : 'Export Contacts'}
							controlVariant="sales"
							onExport={() => handleExport()}
							onImport={async (_headers, rows) => { await handleImport(rows); }}
						/>
						<Link
							to="/app/kontak/buat"
							className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
						>
							<Plus className="size-4" /> {t('contact.create')}
						</Link>
					</div>

			<nav
				aria-label="Saring kontak"
				className="flex w-full max-w-xl overflow-x-auto rounded-full border border-emerald-100 bg-[#eef1f6] shadow-soft-sm"
			>
				{FILTERS.map((item, index) => {
					const active = filter === item.key;
					const edge = index === 0 ? 'rounded-l-full' : index === FILTERS.length - 1 ? 'rounded-r-full' : '';
					return (
						<button
							key={item.key}
							type="button"
							onClick={() => setFilter(item.key)}
							aria-current={active ? 'page' : undefined}
							className={cn(
								'inline-flex min-h-11 min-w-max flex-1 items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors',
								edge,
								active
									? 'bg-[#d8f5e4] text-emerald-800'
									: 'text-slate-700 hover:bg-[#eadcf8] hover:text-[#6b21a8]',
							)}
						>
							{t(item.labelKey)}
						</button>
					);
				})}
			</nav>

			<section className="overflow-hidden rounded-2xl border border-emerald-100/80 bg-transparent shadow-soft-sm">
				{filtered.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">
						{t('contact.empty')}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[720px] text-sm">
							<thead>
								<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide">
									<th className="px-5 py-2.5">{t('contact.col.name')}</th>
									<th className="px-5 py-2.5">{t('contact.col.type')}</th>
									<th className="px-5 py-2.5">{t('product.col.code')}</th>
									<th className="px-5 py-2.5">{t('contact.col.phone')}</th>
									<th className="px-5 py-2.5">{t('contact.col.created')}</th>
									<th className="px-5 py-2.5" aria-label="Aksi" />
								</tr>
							</thead>
							<tbody>
								{filtered.map(contact => (
									<tr key={contact.id} className="border-b border-foreground/15 last:border-0">
										<td className="px-5 py-2.5">
										<Link
											to={`/app/kontak/riwayat/kontak/${contact.id}`}
											className="font-semibold text-primary underline-offset-4 hover:underline"
										>
											{contact.name}
										</Link>
									</td>
										<td className="px-5 py-2.5">
											<span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">
												{CONTACT_TYPE_LABELS[contact.type]}
											</span>
										</td>
										<td className="px-5 py-2.5 text-muted-foreground">{contact.code || '—'}</td>
										<td className="px-5 py-2.5 text-muted-foreground">{contact.phone || '—'}</td>
										<td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">
											{formatDate(contact.created)}
										</td>
										<td className="px-5 py-2.5 text-right">
											<div className="flex items-center justify-end gap-1">
												<Link
													to={`/app/kontak/ubah/${contact.id}`}
													aria-label={`${t('contact.edit')} ${contact.name}`}
													title={t('contact.edit')}
													className="border border-border p-1 text-foreground transition-colors hover:bg-secondary"
												>
													<Pencil className="size-3.5" />
												</Link>
												<button
													type="button"
													onClick={() => handleDelete(contact)}
													aria-label={`Hapus ${contact.name}`}
													className="border border-border p-1 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
												>
													{isDeleting(contact.id) ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

				<p className="text-xs text-muted-foreground">
					{t('contact.total', { total: contacts.length, customer: contacts.filter(c => c.type === 'customer').length, supplier: contacts.filter(c => c.type === 'supplier').length })}
				</p>
				</div>
			)}
			</div>
			</div>
		</div>
	);
}
