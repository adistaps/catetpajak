import { useMemo, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import type { Account } from '@/lib/accounting';
import {
	classifyPsakHeuristic,
	PSAK_CATEGORIES,
	PSAK_CATEGORY_LABELS,
	type PsakCategory,
} from '@/lib/psak118';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';

const AUTO = '__auto__';

const CATEGORY_BADGE: Record<PsakCategory, string> = {
	operasi: 'bg-blue-50 text-blue-700',
	investasi: 'bg-violet-50 text-violet-700',
	pendanaan: 'bg-amber-50 text-amber-700',
	pajak: 'bg-rose-50 text-rose-700',
};

export interface Psak118MappingManagerProps {
	accounts: Account[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAccountUpdated?: (id: string, patch: Partial<Account>) => void;
}

export function Psak118MappingManager({
	accounts,
	open,
	onOpenChange,
	onAccountUpdated,
}: Psak118MappingManagerProps) {
	const { t } = useLanguage();
	const [pendingId, setPendingId] = useState<string | null>(null);

	const rows = useMemo(
		() =>
			accounts
				.filter(a => a.type === 'pendapatan' || a.type === 'beban')
				.sort((a, b) => a.code.localeCompare(b.code, 'id')),
		[accounts],
	);

	const handleChange = async (account: Account, value: string) => {
		const category: PsakCategory | null = value === AUTO ? null : (value as PsakCategory);
		setPendingId(account.id);
		try {
			await pb.collection('accounts').update(account.id, { psak118_category: category });
			onAccountUpdated?.(account.id, {
				psak118_category: category ?? undefined,
			});
			toast.success(t('report.psak118.updated'));
		} catch {
			toast.error(t('report.psak118.failed'));
		} finally {
			setPendingId(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
				<DialogHeader className="border-b border-border px-5 py-4">
					<DialogTitle>{t('report.psak118.title')}</DialogTitle>
					<DialogDescription>
						{t('report.psak118.desc')}
					</DialogDescription>
				</DialogHeader>

				<div className="overflow-y-auto px-5 py-3">
					{rows.length === 0 ? (
						<p className="py-8 text-center text-sm text-muted-foreground">
							{t('report.psak118.empty')}
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
								<thead>
									<tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
										<th className="py-2 pr-2 font-semibold">{t('report.psak118.col_code')}</th>
										<th className="py-2 pr-2 font-semibold">{t('report.psak118.col_name')}</th>
										<th className="py-2 pr-2 font-semibold">{t('report.psak118.col_type')}</th>
										<th className="py-2 font-semibold">{t('report.psak118.col_category')}</th>
									</tr>
								</thead>
								<tbody>
									{rows.map(account => {
										const explicit = account.psak118_category;
										const isExplicit =
											explicit === 'operasi' ||
											explicit === 'investasi' ||
											explicit === 'pendanaan' ||
											explicit === 'pajak';
										const auto = classifyPsakHeuristic(
											account.name,
											account.type as 'pendapatan' | 'beban',
										);
										const value = isExplicit ? (explicit as PsakCategory) : AUTO;
										return (
											<tr key={account.id} className="border-t border-border/60 align-middle">
												<td className="py-2 pr-2 tabular-nums text-muted-foreground">
													{account.code}
												</td>
												<td className="py-2 pr-2 font-medium text-foreground">
													{account.name}
												</td>
												<td className="py-2 pr-2">
													<span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
														{account.type}
													</span>
												</td>
												<td className="py-2">
													<div className="flex flex-wrap items-center gap-2">
														<div className="relative">
															<select
																aria-label={t('report.psak118.label_aria', { name: account.name })}
																value={value}
																onChange={event =>
																	handleChange(account, event.target.value)
																}
																disabled={pendingId === account.id}
																className="h-8 appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
															>
																<option value={AUTO}>{t('report.psak118.auto')}</option>
																{PSAK_CATEGORIES.map(cat => (
																	<option key={cat} value={cat}>
																		{PSAK_CATEGORY_LABELS[cat]}
																	</option>
																))}
															</select>
															<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
																▾
															</span>
														</div>
														{isExplicit ? (
															<span
																className={cn(
																	'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold',
																	CATEGORY_BADGE[explicit as PsakCategory],
																)}
															>
																{PSAK_CATEGORY_LABELS[explicit as PsakCategory]}
															</span>
														) : (
															<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
																<RotateCcw className="size-3" />
																{t('report.psak118.auto_prefix')} {PSAK_CATEGORY_LABELS[auto]}
															</span>
														)}
														{pendingId === account.id ? (
															<Loader2 className="size-3.5 animate-spin text-muted-foreground" />
														) : null}
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
