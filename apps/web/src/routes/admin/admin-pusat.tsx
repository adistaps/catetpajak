import { useState } from 'react';
import type { Route } from './+types/admin-pusat';
import { requireAuth } from '@/lib/require-auth';
import { seo } from '@/lib/seo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompaniesPanel } from '@/components/admin-pusat/companies-panel';
import { UsersPanel } from '@/components/admin-pusat/users-panel';
import { SubscriptionsPanel } from '@/components/admin-pusat/subscriptions-panel';
import { ManualPaymentsPanel } from '@/components/admin-pusat/manual-payments-panel';
import { TransactionsPanel } from '@/components/admin-pusat/transactions-panel';
import { PlanPricesPanel } from '@/components/admin-pusat/plan-prices-panel';
import { BankAccountsPanel } from '@/components/admin-pusat/bank-accounts-panel';
import { ParentPaymentsPanel } from '@/components/admin-pusat/parent-payments-panel';
import { SmtpSettingsPanel } from '@/components/admin-pusat/smtp-settings-panel';
import { EmailBrandingPanel } from '@/components/admin-pusat/email-branding-panel';
import { FeatureFlagsPanel } from '@/components/admin-pusat/feature-flags-panel';
import { EventsPanel } from '@/components/admin-pusat/events-panel';
import { PromosPanel } from '@/components/admin-pusat/promos-panel';
import { AkuntanUsersPanel } from '@/components/admin-pusat/akuntan-users-panel';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Admin Pusat — Catet Pajak',
			description:
				'Panel admin pusat Catet Pajak untuk mengelola perusahaan, pengguna, langganan Pencari Akuntan, dan verifikasi pembayaran manual.',
		},
	);
}

export function clientLoader() {
	return { user: requireAuth() };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-dvh bg-background" />;
}

type TabKey =
	| 'companies'
	| 'users'
	| 'subscriptions'
	| 'payments'
	| 'parent_payments'
	| 'transactions'
	| 'prices'
	| 'banks'
	| 'smtp'
	| 'branding'
	| 'features'
	| 'events'
	| 'promos'
	| 'akuntan_users';

const NAV: { value: TabKey; label: string }[] = [
	{ value: 'companies', label: 'Perusahaan' },
	{ value: 'users', label: 'Pengguna' },
	{ value: 'subscriptions', label: 'Langganan' },
	{ value: 'payments', label: 'Pembayaran Manual' },
	{ value: 'parent_payments', label: 'Pembayaran Parent' },
	{ value: 'transactions', label: 'Transaksi' },
	{ value: 'prices', label: 'Harga Paket' },
	{ value: 'banks', label: 'Rekening Bank' },
	{ value: 'smtp', label: 'Pengaturan SMTP' },
	{ value: 'branding', label: 'Gambar Profil Email' },
	{ value: 'features', label: 'Pengaturan Fitur' },
	{ value: 'events', label: 'Event' },
	{ value: 'promos', label: 'Promo Terbaru' },
	{ value: 'akuntan_users', label: 'Akuntan & Pencari' },
];

export default function AdminPusat() {
	const [tab, setTab] = useState<TabKey>('companies');

	return (
		<div className="min-h-dvh bg-background text-foreground">
			<div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
				<Tabs
					value={tab}
					onValueChange={value => setTab(value as TabKey)}
					className="flex flex-col gap-5 lg:flex-row lg:items-start"
				>
					<TabsList className="flex h-auto w-full shrink-0 flex-col items-stretch justify-start gap-1 rounded-2xl border border-border bg-card p-2 shadow-soft-sm lg:sticky lg:top-6 lg:w-60">
						{NAV.map(item => (
							<TabsTrigger
								key={item.value}
								value={item.value}
								className="w-full justify-start rounded-xl px-3 py-2.5 text-left text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
							>
								{item.label}
							</TabsTrigger>
						))}
					</TabsList>
					<div className="min-w-0 flex-1">
						<TabsContent value="companies" className="mt-0 focus-visible:outline-none">
							<CompaniesPanel />
						</TabsContent>
						<TabsContent value="users" className="mt-0 focus-visible:outline-none">
							<UsersPanel />
						</TabsContent>
						<TabsContent value="subscriptions" className="mt-0 focus-visible:outline-none">
							<SubscriptionsPanel />
						</TabsContent>
						<TabsContent value="payments" className="mt-0 focus-visible:outline-none">
							<ManualPaymentsPanel />
						</TabsContent>
						<TabsContent value="parent_payments" className="mt-0 focus-visible:outline-none">
							<ParentPaymentsPanel />
						</TabsContent>
						<TabsContent value="transactions" className="mt-0 focus-visible:outline-none">
							<TransactionsPanel />
						</TabsContent>
						<TabsContent value="prices" className="mt-0 focus-visible:outline-none">
							<PlanPricesPanel />
						</TabsContent>
						<TabsContent value="banks" className="mt-0 focus-visible:outline-none">
							<BankAccountsPanel />
						</TabsContent>
						<TabsContent value="smtp" className="mt-0 focus-visible:outline-none">
							<SmtpSettingsPanel />
						</TabsContent>
						<TabsContent value="branding" className="mt-0 focus-visible:outline-none">
							<EmailBrandingPanel />
						</TabsContent>
						<TabsContent value="features" className="mt-0 focus-visible:outline-none">
							<FeatureFlagsPanel />
						</TabsContent>
						<TabsContent value="events" className="mt-0 focus-visible:outline-none">
							<EventsPanel />
						</TabsContent>
						<TabsContent value="promos" className="mt-0 focus-visible:outline-none">
							<PromosPanel />
						</TabsContent>
						<TabsContent value="akuntan_users" className="mt-0 focus-visible:outline-none">
							<AkuntanUsersPanel />
						</TabsContent>
					</div>
				</Tabs>
			</div>
		</div>
	);
}
