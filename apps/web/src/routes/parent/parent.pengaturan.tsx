import { Link, redirect } from 'react-router';
import { ArrowLeft, LogOut } from 'lucide-react';
import type { Route } from './+types/parent.pengaturan';
import { seo } from '@/lib/seo';
import { ParentAccountSettings } from '@/components/parent/parent-account-settings';
import { currentParent, logoutParent } from '@/lib/parents';
import pb from '@/lib/pocketbase-client';
import { requireParentFeatureEnabled } from '@/lib/feature-flags';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Pengaturan Akun Parent — Catet Pajak',
		description: 'Lihat email login dan ubah kata sandi akun Portal Parent.',
	});
}

export async function clientLoader() {
	await requireParentFeatureEnabled();
	const record = pb.authStore.record;
	if (!pb.authStore.isValid || !record || record.collectionName !== 'parents') {
		throw redirect('/app/parent');
	}
	return {};
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-dvh bg-background" />;
}

export default function ParentPengaturanRoute() {
	const parent = currentParent();
	const parentName = parent?.name || parent?.email || 'Parent';

	return (
		<div className="min-h-dvh bg-gradient-to-br from-emerald-50/60 via-background to-background">
			<header className="border-b border-border bg-card/80 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
					<div className="min-w-0">
						<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							Portal Parent
						</p>
						<h1 className="truncate text-lg font-extrabold tracking-tight">{parentName}</h1>
					</div>
					<button
						type="button"
						onClick={() => {
							logoutParent();
							window.location.href = '/app/parent';
						}}
						className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
					>
						<LogOut className="size-3.5" /> Keluar
					</button>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-5 py-8">
				<Link
					to="/app/parent/dashboard"
					className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Kembali ke Dasbor
				</Link>
				<h2 className="mt-4 text-xl font-extrabold tracking-tight">Pengaturan Akun</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Kelola email login dan kata sandi Portal Parent.
				</p>
				<div className="mt-5">
					<ParentAccountSettings />
				</div>
			</main>
		</div>
	);
}
