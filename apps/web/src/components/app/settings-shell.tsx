import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
	BookOpen,
	Building2,
	Boxes,
	ChevronDown,
	Contact,
	CreditCard,
	FileText,
	Layers,
	Package,
	Percent,
	ShoppingCart,
	Truck,
	Users,
	Warehouse,
	type LucideIcon,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';
import type { AppPermission } from '@/data/user-roles';
import { BillingSettingsLauncher } from '@/components/app/billing-settings-launcher';
import { InventorySettingsCard } from '@/components/app/inventory-settings';
import { UserModule } from '@/components/app/user-module';
import { CompanyModule } from '@/components/app/company-module';
import { JobLevelsManager } from '@/components/app/job-levels-manager';
import { LanguageSettingsCard } from '@/components/app/language-settings-card';
import { useLanguage } from '@/hooks/use-language';
import { cn } from '@/lib/utils';

type SectionId =
	| 'perusahaan'
	| 'pengguna'
	| 'kontak'
	| 'penjualan'
	| 'pembelian'
	| 'barang'
	| 'persediaan'
	| 'gudang'
	| 'template'
	| 'akun'
	| 'pajak'
	| 'tagihan';

interface SettingsShellProps {
	company: Company;
	companies: Company[];
	refreshCompanies: () => Promise<void>;
	setActiveCompanyId: (id: string) => void;
	onCompanyNameUpdated: (id: string, name: string) => void;
	canAccessMenu: (permission: AppPermission) => boolean;
}

/**
 * Tata letak pengaturan: daftar bagian di kiri, isi di kanan.
 * Hanya menampilkan bagian yang memang ada di Catet Pajak.
 */
export function SettingsShell({ company, companies, refreshCompanies, setActiveCompanyId, onCompanyNameUpdated, canAccessMenu }: SettingsShellProps) {
	const { t } = useLanguage();
	const [params, setParams] = useSearchParams();
	const requested = params.get('bagian');
	const canManageUsers = canAccessMenu('pengguna');
	const canManageCompany = canAccessMenu('perusahaan');
	const canManageKontak = canAccessMenu('kontak');
	const section: SectionId =
		isSection(requested) &&
		!(requested === 'pengguna' && !canManageUsers) &&
		!(requested === 'perusahaan' && !canManageCompany) &&
		!(requested === 'kontak' && !canManageKontak)
			? requested
			: 'tagihan';
	const [produkOpen, setProdukOpen] = useState(section === 'barang' || section === 'persediaan' || section === 'gudang');
	const ownerId = pb.authStore.record?.id ?? company.owner;

	const select = (id: SectionId) => {
		const next = new URLSearchParams(params);
		next.set('bagian', id);
		setParams(next, { replace: true });
		if (id === 'barang' || id === 'persediaan' || id === 'gudang') setProdukOpen(true);
	};

	const title = useMemo(() => t(`settings.section.${section}`), [section, t]);

	return (
		<div className="bg-[#f3f5f4] md:grid md:grid-cols-[260px_minmax(0,1fr)]">
			<aside className="border-b border-[#e4e9e6] md:border-b-0 md:border-r">
				<p className="px-4 pb-1 pt-5 text-[11px] font-bold uppercase tracking-wider text-primary">
					{t('settings.title')}
				</p>
				<nav aria-label={t('settings.title')} className="mt-1 flex flex-col pb-3">
					{canManageCompany ? (
						<NavButton icon={Building2} active={section === 'perusahaan'} onClick={() => select('perusahaan')}>
							{t('settings.nav.perusahaan')}
						</NavButton>
					) : null}
					{canManageUsers ? (
						<NavButton icon={Users} active={section === 'pengguna'} onClick={() => select('pengguna')}>
							{t('settings.nav.pengguna')}
						</NavButton>
					) : null}
					{canManageKontak ? (
						<NavButton icon={Contact} active={section === 'kontak'} onClick={() => select('kontak')}>
							{t('settings.nav.kontak')}
						</NavButton>
					) : null}
					<NavButton icon={ShoppingCart} active={section === 'penjualan'} onClick={() => select('penjualan')}>
						{t('settings.nav.penjualan')}
					</NavButton>
					<NavButton icon={Truck} active={section === 'pembelian'} onClick={() => select('pembelian')}>
						{t('settings.nav.pembelian')}
					</NavButton>
					<div>
						<button
							type="button"
							onClick={() => setProdukOpen(open => !open)}
							className={cn(
								'relative flex w-full items-center gap-3.5 border-l-[3px] py-3.5 pl-4 pr-4 text-left text-[15px] font-semibold leading-snug transition-colors',
								(section === 'barang' || section === 'persediaan' || section === 'gudang') && !produkOpen
									? 'border-emerald-600 bg-emerald-50 text-emerald-600'
									: section === 'barang' || section === 'persediaan' || section === 'gudang'
										? 'border-transparent text-emerald-700 hover:bg-emerald-50/60'
										: 'border-transparent text-[#5f7d72] hover:bg-emerald-50/60 hover:text-emerald-700',
							)}
						>
							<Package className="size-5 shrink-0" strokeWidth={1.75} />
							<span className="flex-1">{t('settings.nav.produk')}</span>
							<ChevronDown className={cn('size-4 shrink-0 transition-transform', produkOpen && 'rotate-180')} />
						</button>
						{produkOpen ? (
							<div className="flex flex-col">
								<NavButton
									icon={Package}
									active={section === 'barang'}
									onClick={() => select('barang')}
									nested
								>
									{t('settings.nav.barang')}
								</NavButton>
								<NavButton
									icon={Boxes}
									active={section === 'persediaan'}
									onClick={() => select('persediaan')}
									nested
								>
									{t('settings.nav.persediaan')}
								</NavButton>
								<NavButton
									icon={Warehouse}
									active={section === 'gudang'}
									onClick={() => select('gudang')}
									nested
								>
									{t('settings.nav.gudang')}
								</NavButton>
							</div>
						) : null}
					</div>
					<NavButton icon={FileText} active={section === 'template'} onClick={() => select('template')}>
						{t('settings.nav.template')}
					</NavButton>
					<NavButton icon={Layers} active={section === 'akun'} onClick={() => select('akun')}>
						{t('settings.nav.akun')}
					</NavButton>
					<NavButton icon={Percent} active={section === 'pajak'} onClick={() => select('pajak')}>
						{t('settings.nav.pajak')}
					</NavButton>
					<NavButton icon={CreditCard} active={section === 'tagihan'} onClick={() => select('tagihan')}>
						{t('settings.nav.tagihan')}
					</NavButton>
				</nav>
			</aside>

			<div className="min-w-0 px-4 py-5 sm:px-6 sm:py-6">
				<h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
				<div className="mt-5">
					{section === 'perusahaan' ? (
					<div className="space-y-5">
						<CompanyModule
							companies={companies}
							refreshCompanies={refreshCompanies}
							setActiveCompanyId={setActiveCompanyId}
							onCompanyNameUpdated={onCompanyNameUpdated}
						/>
						<LanguageSettingsCard />
					</div>
				) : null}
					{section === 'pengguna' ? <PenggunaPanel company={company} /> : null}
					{section === 'kontak' ? <KontakPanel company={company} /> : null}
					{section === 'penjualan' ? <PenjualanPanel onOpenTagihan={() => select('tagihan')} /> : null}
					{section === 'pembelian' ? <PembelianPanel /> : null}
					{section === 'barang' ? <BarangPanel /> : null}
					{section === 'persediaan' ? <PersediaanPanel company={company} ownerId={ownerId} /> : null}
					{section === 'gudang' ? <GudangPanel /> : null}
					{section === 'template' ? <TemplatePanel /> : null}
					{section === 'akun' ? <AkunPanel /> : null}
					{section === 'pajak' ? <PajakPanel /> : null}
					{section === 'tagihan' ? (
						<BillingSettingsLauncher company={company} ownerId={ownerId} />
					) : null}
				</div>
			</div>
		</div>
	);
}

function isSection(value: string | null): value is SectionId {
	return (
		value === 'perusahaan' ||
		value === 'pengguna' ||
		value === 'kontak' ||
		value === 'penjualan' ||
		value === 'pembelian' ||
		value === 'barang' ||
		value === 'persediaan' ||
		value === 'gudang' ||
		value === 'template' ||
		value === 'akun' ||
		value === 'pajak' ||
		value === 'tagihan'
	);
}

const SECTION_TITLE: Record<SectionId, string> = {
	perusahaan: 'Perusahaan',
	pengguna: 'Pengaturan pengguna',
	kontak: 'Pengaturan Kontak',
	penjualan: 'Penjualan',
	pembelian: 'Pembelian',
	barang: 'Barang & jasa',
	persediaan: 'Persediaan',
	gudang: 'Gudang',
	template: 'Template dokumen',
	akun: 'Pemetaan akun',
	pajak: 'Pajak',
	tagihan: 'Tagihan',
};

function NavButton({
	active,
	onClick,
	icon: Icon,
	nested,
	children,
}: {
	active: boolean;
	onClick: () => void;
	icon: LucideIcon;
	nested?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'relative flex w-full items-center gap-3.5 border-l-[3px] py-3.5 pr-4 text-left font-semibold leading-snug transition-colors',
				nested ? 'pl-12 text-sm' : 'pl-4 text-[15px]',
				active
					? 'border-emerald-600 bg-emerald-50 text-emerald-600'
					: 'border-transparent text-[#5f7d72] hover:bg-emerald-50/60 hover:text-emerald-700',
			)}
		>
			<Icon className={cn('shrink-0', nested ? 'size-4' : 'size-5')} strokeWidth={1.75} />
			<span>{children}</span>
		</button>
	);
}

function Row({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1 border-b border-border/70 py-3.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-center sm:gap-6">
			<div>
				<p className="text-sm text-foreground">{label}</p>
				{hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
			</div>
			<div className="text-sm font-medium text-foreground">{children}</div>
		</div>
	);
}

function ActionLink({ to, children }: { to: string; children: React.ReactNode }) {
	return (
		<Link to={to} className="font-semibold text-primary underline-offset-2 hover:underline">
			{children}
		</Link>
	);
}

function PenggunaPanel({ company }: { company: Company }) {
	return <UserModule company={company} />;
}

function KontakPanel({ company }: { company: Company }) {
	const { t } = useLanguage();
	return (
		<div className="space-y-6">
			<div>
				<Row label={t('settings.kontak.list')} hint={t('settings.kontak.list_hint')}>
					<ActionLink to="/app/kontak">{t('settings.kontak.manage')}</ActionLink>
				</Row>
				<Row label={t('settings.kontak.employees')} hint={t('settings.kontak.employees_hint')}>
					<ActionLink to="/app/karyawan">{t('settings.kontak.open_employees')}</ActionLink>
				</Row>
			</div>
			<div className="flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
				<Users className="mt-0.5 size-4 shrink-0 text-primary" />
				{t('settings.kontak.joblevel_hint')}
			</div>
			<JobLevelsManager company={company} />
		</div>
	);
}

function PenjualanPanel({ onOpenTagihan }: { onOpenTagihan: () => void }) {
	const { t } = useLanguage();
	return (
		<div>
			<Row label={t('settings.penjualan.docs')} hint={t('settings.penjualan.docs_hint')}>
				<ActionLink to="/app/penjualan">{t('settings.penjualan.open')}</ActionLink>
			</Row>
			<Row label={t('settings.penjualan.terms')} hint={t('settings.penjualan.terms_hint')}>
				<button type="button" onClick={onOpenTagihan} className="font-semibold text-primary underline-offset-2 hover:underline">
					{t('settings.penjualan.set_billing')}
				</button>
			</Row>
			<Row label={t('settings.penjualan.payments')} hint={t('settings.penjualan.payments_hint')}>
				<ActionLink to="/app/penjualan">{t('settings.penjualan.view_invoices')}</ActionLink>
			</Row>
		</div>
	);
}

function PembelianPanel() {
	const { t } = useLanguage();
	return (
		<div>
			<Row label={t('settings.pembelian.docs')} hint={t('settings.pembelian.docs_hint')}>
				<ActionLink to="/app/pembelian">{t('settings.pembelian.open')}</ActionLink>
			</Row>
			<Row label={t('settings.pembelian.suppliers')}>
				<ActionLink to="/app/kontak">{t('settings.kontak.manage')}</ActionLink>
			</Row>
		</div>
	);
}

function BarangPanel() {
	const { t } = useLanguage();
	return (
		<div>
			<Row label={t('settings.barang.list')} hint={t('settings.barang.list_hint')}>
				<ActionLink to="/app/produk">{t('settings.barang.manage')}</ActionLink>
			</Row>
			<Row label={t('settings.barang.stock')} hint={t('settings.barang.stock_hint')}>
				<ActionLink to="/app/produk/gudang">{t('settings.barang.manage_warehouse')}</ActionLink>
			</Row>
			<Row label={t('settings.barang.units')} hint={t('settings.barang.units_hint')}>
				{t('settings.barang.on_form')}
			</Row>
		</div>
	);
}

function PersediaanPanel({ company, ownerId }: { company: Company; ownerId: string }) {
	return <InventorySettingsCard company={company} ownerId={ownerId} />;
}

function GudangPanel() {
	const { t } = useLanguage();
	return (
		<div>
			<Row label={t('settings.gudang.master')}>
				<ActionLink to="/app/produk/gudang">{t('settings.gudang.manage')}</ActionLink>
			</Row>
			<Row label={t('settings.gudang.opname')}>
				<ActionLink to="/app/produk/opname">{t('settings.gudang.open_opname')}</ActionLink>
			</Row>
			<Row label={t('settings.gudang.transfer')}>
				<ActionLink to="/app/produk/transfer">{t('settings.gudang.open_transfer')}</ActionLink>
			</Row>
		</div>
	);
}

function TemplatePanel() {
	const { t } = useLanguage();
	return (
		<div>
			<p className="mb-2 text-sm text-muted-foreground">
				{t('settings.template.desc')}
			</p>
			<Row label={t('settings.template.preview')}>
				<ActionLink to="/app/penjualan">{t('settings.penjualan.open')}</ActionLink>
			</Row>
			<div className="mt-4 flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
				<FileText className="mt-0.5 size-4 shrink-0 text-primary" />
				{t('settings.template.logo_note')}
			</div>
		</div>
	);
}

function AkunPanel() {
	const { t } = useLanguage();
	return (
		<div>
			<Row label={t('settings.akun.chart')} hint={t('settings.akun.chart_hint')}>
				<ActionLink to="/app/akun">{t('settings.akun.manage')}</ActionLink>
			</Row>
			<Row label={t('settings.akun.journal')}>
				<ActionLink to="/app/jurnal">{t('settings.akun.open_journal')}</ActionLink>
			</Row>
			<div className="mt-4 flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
				<BookOpen className="mt-0.5 size-4 shrink-0 text-primary" />
				{t('settings.akun.mapping_note')}
			</div>
		</div>
	);
}

function PajakPanel() {
	const { t } = useLanguage();
	return (
		<div>
			<Row label={t('settings.pajak.config')} hint={t('settings.pajak.config_hint')}>
				<ActionLink to="/app/pajak/pengaturan">{t('settings.pajak.open')}</ActionLink>
			</Row>
			<Row label={t('settings.pajak.simulation')}>
				<ActionLink to="/app/pajak/simulasi">{t('settings.pajak.open_sim')}</ActionLink>
			</Row>
			<div className="mt-4 flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
				<Percent className="mt-0.5 size-4 shrink-0 text-primary" />
				{t('settings.pajak.note')}
			</div>
		</div>
	);
}

