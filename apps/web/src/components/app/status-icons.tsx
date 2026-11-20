import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import { loadAccessState } from '@/lib/subscription-access';
import {
	loadTotalUnreadCount,
	subscribeToChatChanges,
	type ChatActor,
} from '@/lib/chat';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
	dismissImportFailure,
	listImportFailures,
	NOTICES_EVENT,
	type ImportFailureNotice,
} from '@/lib/app-notices';
import { periodLabel } from '@/lib/depreciation';
import { cn } from '@/lib/utils';

type Notice = {
	id: string;
	title: string;
	body: string;
	href?: string;
	tone: 'info' | 'warn' | 'promo';
	onDismiss?: () => void;
};

function daysUntil(iso: string): number | null {
	if (!iso) return null;
	// PocketBase mengembalikan tanggal sebagai "YYYY-MM-DD HH:MM:SS.sssZ";
	// ambil bagian tanggal saja agar parsing akhir hari selalu valid.
	const day = iso.slice(0, 10);
	const end = new Date(`${day}T23:59:59.000Z`);
	if (Number.isNaN(end.getTime())) return null;
	return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}

function ClockGlyph() {
	return (
		<svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
			<path
				d="M12 7.6V12.2L15.1 14"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function BellGlyph() {
	return (
		<svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
			<path
				d="M6.2 16.2h11.6c-.7-1.1-1.3-2.2-1.3-4.4V10a4.5 4.5 0 0 0-9 0v1.8c0 2.2-.6 3.3-1.3 4.4Z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
			<path
				d="M10.2 16.6a1.8 1.8 0 0 0 3.6 0"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
		</svg>
	);
}

interface AppStatusIconsProps {
	companyId: string | null;
	companyName?: string | null;
	/** Penyusutan hanya untuk peran yang boleh membuka menu Aset. */
	showDepreciation: boolean;
	/** Panel terbuka ke atas saat ikon berada di tepi bawah layar. */
	placement?: 'down' | 'up';
	/** Warna titik indikator notifikasi. */
	badgeClassName?: string;
}

export function AppStatusIcons({
	companyId,
	companyName,
	showDepreciation,
	placement = 'down',
	badgeClassName = 'bg-violet-500',
}: AppStatusIconsProps) {
	const { user } = useAuth();
	const { t } = useLanguage();
	const panelId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const [ready, setReady] = useState(false);
	const [clockOpen, setClockOpen] = useState(false);
	const [bellOpen, setBellOpen] = useState(false);
	const [accessLabel, setAccessLabel] = useState('header.loading_active');
	const [notices, setNotices] = useState<Notice[]>([]);
	const [chatUnread, setChatUnread] = useState(0);

	useEffect(() => {
		let cancelled = false;
		loadAccessState(user?.created, user?.id)
			.then(state => {
				if (cancelled) return;
				if (state.active?.current_period_end) {
					const days = daysUntil(state.active.current_period_end);
					const plan = state.active.product_title || 'langganan';
					setAccessLabel(
						days === null
							? t('active.running', { plan })
							: days === 0
								? t('active.ends_today', { plan })
								: t('active.days_left', { plan, days }),
					);
					return;
				}
				if (state.activeManualPayment) {
					const days = daysUntil(state.activeManualPayment.period_end);
					const plan = state.activeManualPayment.plan_title || 'langganan';
					if (!state.activeManualPayment.period_end || days === null) {
						setAccessLabel(t('active.unlimited', { plan }));
						return;
					}
					setAccessLabel(
						days === 0
							? t('active.ends_today', { plan })
							: t('active.days_left', { plan, days }),
					);
					return;
				}
				if (state.activeCompanySubscriptionEnd) {
					const days = daysUntil(state.activeCompanySubscriptionEnd);
					setAccessLabel(
						days === null
							? t('active.company_running')
							: days === 0
								? t('active.company_ends_today')
								: t('active.company_days_left', { days }),
					);
					return;
				}
				if (state.trial.isTrialActive) {
					const days = state.trial.daysRemaining;
					setAccessLabel(
						days === 0
							? t('active.trial_ends_today')
							: t('active.trial_days_left', { days }),
					);
					return;
				}
				setAccessLabel(t('active.expired'));
			})
			.catch(() => {
				if (!cancelled) setAccessLabel(t('active.load_failed'));
			})
			.finally(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [user?.created, user?.id, t]);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			const next: Notice[] = [];
			const failures = companyId ? listImportFailures(companyId) : [];
			for (const failure of failures) {
				next.push({
					id: `import-${failure.id}`,
					title: `Impor gagal · ${failure.label}`,
					body: failure.message,
					tone: 'warn',
					onDismiss: () => dismissImportFailure(failure.id),
				});
			}

			if (companyId && showDepreciation) {
				try {
					const companyFilter = pb.filter('company = {:company}', { company: companyId });
					const period = periodLabel(new Date().toISOString());
					const [assets, deps] = await Promise.all([
						pb.collection('fixed_assets').getFullList<{ id: string; status: string }>({
							filter: companyFilter,
							requestKey: null,
						}),
						pb.collection('depreciations').getFullList<{
							id: string;
							fixed_asset: string;
							period_label: string;
						}>({
							filter: pb.filter('company = {:company} && period_label = {:period}', {
								company: companyId,
								period,
							}),
							requestKey: null,
						}),
					]);
					if (cancelled) return;
					const posted = new Set(deps.map(item => item.fixed_asset));
					const active = assets.filter(asset => asset.status === 'active');
					const due = active.filter(asset => !posted.has(asset.id)).length;
					const pending = assets.filter(asset => asset.status === 'pending').length;
					if (due > 0) {
						next.push({
							id: `dep-${period}`,
							title: 'Proses penyusutan',
							body: `${due} aset aktif belum disusutkan untuk periode ${period}.`,
							href: '/app/aset?tab=depreciation',
							tone: 'warn',
						});
					} else if (active.length > 0) {
						next.push({
							id: `dep-done-${period}`,
							title: 'Penyusutan periode ini',
							body: `Penyusutan ${period} sudah tercatat untuk ${active.length} aset aktif.`,
							href: '/app/aset?tab=depreciation',
							tone: 'info',
						});
					}
					if (pending > 0) {
						next.push({
							id: 'assets-pending',
							title: 'Aset tertunda',
							body: `${pending} aset masih menunggu invoice agar penyusutan bisa dimulai.`,
							href: '/app/aset?tab=pending',
							tone: 'info',
						});
					}
				} catch {
					/* koleksi tidak tersedia — jangan bocorkan detail */
				}
			}

			try {
				const promos = await pb.collection('promos').getList(1, 3, {
					filter: 'published = true',
					sort: '-created',
					requestKey: null,
				});
				if (!cancelled && promos.totalItems > 0) {
					next.push({
						id: 'promos',
						title: 'Promo terbaru',
						body:
							promos.totalItems === 1
								? 'Ada 1 promo yang sedang terbit di dasbor.'
								: `Ada ${promos.totalItems} promo yang sedang terbit di dasbor.`,
						href: '/app',
						tone: 'promo',
					});
				}
			} catch {
				/* promo bersifat publik; abaikan jika gagal */
			}

			if (!cancelled) setNotices(next);
		};

		load().catch(() => {});
		const onChange = () => {
			load().catch(() => {});
		};
		window.addEventListener(NOTICES_EVENT, onChange);
		return () => {
			cancelled = true;
			window.removeEventListener(NOTICES_EVENT, onChange);
		};
	}, [companyId, showDepreciation]);

	// Hitung pesan chat belum dibaca (langsung + grup) dan perbarui realtime
	// setiap ada pesan baru atau pesan ditandai sudah dibaca. Hanya untuk
	// pengguna perusahaan (bukan Parent) dan saat fitur chat aktif.
	useEffect(() => {
		const userId = user?.id ?? pb.authStore.record?.id ?? '';
		if (!userId || !isFeatureEnabled('chat')) {
			setChatUnread(0);
			return;
		}
		const me: ChatActor = { id: userId, type: 'user' };
		let cancelled = false;
		const load = () => {
			loadTotalUnreadCount(me)
				.then((count) => {
					if (!cancelled) setChatUnread(count);
				})
				.catch(() => {});
		};
		load();
		const unsub = subscribeToChatChanges(load);
		return () => {
			cancelled = true;
			unsub();
		};
	}, [user?.id]);

	useEffect(() => {
		if (!bellOpen && !clockOpen) return;
		const onPointer = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) {
				setBellOpen(false);
				setClockOpen(false);
			}
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setBellOpen(false);
				setClockOpen(false);
			}
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [bellOpen, clockOpen]);

	const chatNotice: Notice | null =
		chatUnread > 0 && isFeatureEnabled('chat')
			? {
					id: 'chat-unread',
					title: 'Pesan belum dibaca',
					body:
						chatUnread === 1
							? 'Ada 1 pesan baru yang belum dibaca.'
							: `Ada ${chatUnread} pesan baru yang belum dibaca.`,
					href: '/app/chat',
					tone: 'warn',
			  }
			: null;
	const displayNotices = chatNotice ? [chatNotice, ...notices] : notices;
	const badge = displayNotices.filter(item => item.tone === 'warn' || item.tone === 'promo').length;

	return (
		<div ref={rootRef} className="relative flex items-center gap-1 text-[#8aa0b4]">
			{companyName ? (
				<span
					className="max-w-[35vw] truncate text-xs font-semibold text-muted-foreground sm:max-w-48"
					title={companyName}
				>
					{companyName}
				</span>
			) : null}
			<div
				className="relative"
				onMouseEnter={() => setClockOpen(true)}
				onMouseLeave={() => setClockOpen(false)}
			>
				<button
					type="button"
					className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-secondary hover:text-[#5f7890] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
					aria-label={t('header.active_info')}
					aria-describedby={clockOpen ? `${panelId}-clock` : undefined}
					onClick={() => setClockOpen(open => !open)}
				>
					<ClockGlyph />
				</button>
				{clockOpen ? (
					<div
						id={`${panelId}-clock`}
						role="tooltip"
						className={cn(
							'absolute right-0 z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-card px-3 py-2.5 text-left text-xs font-semibold leading-relaxed text-foreground shadow-soft',
							placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
						)}
					>
						{ready ? accessLabel : t('header.loading_active')}
					</div>
				) : null}
			</div>

			<div className="relative">
				<button
					type="button"
					className="relative flex size-11 items-center justify-center rounded-full transition-colors hover:bg-secondary hover:text-[#5f7890] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
					aria-label={t('header.notifications')}
					aria-expanded={bellOpen}
					aria-controls={panelId}
					onClick={() => {
						setClockOpen(false);
						setBellOpen(open => !open);
					}}
				>
					<BellGlyph />
					{badge > 0 ? (
						<span className={cn('absolute right-2 top-2 size-2 rounded-full', badgeClassName)} />
					) : null}
				</button>
				{bellOpen ? (
					<div
						id={panelId}
						role="dialog"
						aria-label={t('header.notifications_label')}
						className={cn(
							'absolute right-0 z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-2 text-left text-foreground shadow-soft',
							placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
						)}
					>
						<p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
							{t('header.notifications_label')}
						</p>
						{displayNotices.length === 0 ? (
							<p className="px-2 py-4 text-xs text-muted-foreground">
								{t('header.no_notifications')}
							</p>
						) : (
							<ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
								{displayNotices.map(notice => (
									<li key={notice.id}>
										<div
											className={cn(
												'rounded-xl px-2.5 py-2',
												notice.tone === 'warn' && 'bg-amber-50',
												notice.tone === 'promo' && 'bg-emerald-50',
											)}
										>
											{notice.href ? (
												<Link
													to={notice.href}
													onClick={() => setBellOpen(false)}
													className="block text-xs font-bold text-foreground hover:text-primary"
												>
													{notice.title}
												</Link>
											) : (
												<p className="text-xs font-bold">{notice.title}</p>
											)}
											<p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
												{notice.body}
											</p>
											{notice.onDismiss ? (
												<button
													type="button"
													onClick={notice.onDismiss}
													className="mt-1 text-[11px] font-semibold text-primary"
												>
													Tutup
												</button>
											) : null}
										</div>
									</li>
								))}
							</ul>
						)}
					</div>
				) : null}
			</div>
		</div>
	);
}
