import { useEffect, useState } from 'react';
import { CalendarClock, FileWarning, X } from 'lucide-react';
import type { Company } from '@/lib/accounting';
import { PaymentTermsSettingsCard } from '@/components/app/payment-terms-settings';
import { LatePenaltySettingsCard } from '@/components/app/late-penalty-settings';
import { WarningLetterSettingsCard } from '@/components/app/warning-letter-settings';
import { useLanguage } from '@/hooks/use-language';

type DrawerId = 'terms' | 'penalty' | 'warning' | null;

interface BillingSettingsLauncherProps {
	company: Company;
	ownerId: string;
}

/**
 * Tampilan awal Tagihan hanya menampilkan tombol. Formulir syarat pembayaran,
 * denda keterlambatan, dan surat peringatan dibuka di panel geser kanan, dan
 * perubahan baru berlaku setelah disimpan.
 */
export function BillingSettingsLauncher({ company, ownerId }: BillingSettingsLauncherProps) {
	const { t } = useLanguage();
	const [open, setOpen] = useState<DrawerId>(null);
	const [session, setSession] = useState(0);

	const close = () => setOpen(null);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		document.addEventListener('keydown', onKey);
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = previous;
		};
	}, [open]);

	const title =
		open === 'penalty'
			? t('billing.launcher.title_penalty')
			: open === 'warning'
				? t('billing.launcher.title_warning')
				: t('billing.launcher.title_terms');

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				{t('billing.launcher.desc')}
			</p>
			<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				<button
					type="button"
					onClick={() => {
						setSession(value => value + 1);
						setOpen('terms');
					}}
					className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold text-foreground shadow-soft-sm transition-colors hover:bg-accent"
				>
					<CalendarClock className="size-4" />
					{t('billing.launcher.terms')}
				</button>
				<button
					type="button"
					onClick={() => {
						setSession(value => value + 1);
						setOpen('penalty');
					}}
					className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold text-foreground shadow-soft-sm transition-colors hover:bg-accent"
				>
					{t('billing.launcher.penalty')}
				</button>
				<button
					type="button"
					onClick={() => {
						setSession(value => value + 1);
						setOpen('warning');
					}}
					className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold text-foreground shadow-soft-sm transition-colors hover:bg-accent"
				>
					<FileWarning className="size-4" />
					{t('billing.launcher.warning')}
				</button>
			</div>

			{open ? (
				<div className="fixed inset-0 z-50" role="presentation">
					<button
						type="button"
						aria-label={t('billing.launcher.close_panel')}
						className="absolute inset-0 bg-foreground/50 backdrop-blur-[2px]"
						onClick={close}
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="billing-drawer-title"
						className="absolute bottom-2 right-2 top-auto flex h-[min(88dvh,760px)] w-[calc(100%-1rem)] max-w-[560px] flex-col rounded-2xl border border-border bg-background shadow-2xl animate-in slide-in-from-right duration-300 md:bottom-auto md:right-8 md:top-1/2 md:h-[min(88vh,760px)] md:w-[calc(100%-4rem)] md:-translate-y-1/2"
					>
						<header className="flex items-center justify-between border-b border-border px-5 py-4">
							<h2 id="billing-drawer-title" className="text-base font-bold tracking-tight">
								{title}
							</h2>
							<button
								type="button"
								onClick={close}
								aria-label={t('company.close')}
								className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
							>
								<X className="size-4" />
							</button>
						</header>
						<div className="flex min-h-0 flex-1 flex-col">
							{open === 'terms' ? (
								<PaymentTermsSettingsCard
									key={`terms-${session}`}
									company={company}
									ownerId={ownerId}
									layout="drawer"
									onClose={close}
								/>
							) : open === 'penalty' ? (
								<LatePenaltySettingsCard
									key={`penalty-${session}`}
									company={company}
									ownerId={ownerId}
									layout="drawer"
									onClose={close}
								/>
							) : (
								<WarningLetterSettingsCard
									key={`warning-${session}`}
									company={company}
									ownerId={ownerId}
									layout="drawer"
									onClose={close}
								/>
							)}
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
