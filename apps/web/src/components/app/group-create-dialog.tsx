import { useMemo, useState } from 'react';
import { Users, X, Check } from 'lucide-react';
import type { ChatPeer } from '@/lib/chat';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';

interface GroupCreateDialogProps {
	peers: ChatPeer[];
	open: boolean;
	onClose: () => void;
	onCreate: (name: string, selected: ChatPeer[]) => void;
}

export function GroupCreateDialog({ peers, open, onClose, onCreate }: GroupCreateDialogProps) {
	const { t } = useLanguage();
	const [name, setName] = useState('');
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const sortedPeers = useMemo(
		() => [...peers].sort((a, b) => a.name.localeCompare(b.name)),
		[peers],
	);

	if (!open) return null;

	const toggle = (key: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const handleCreate = () => {
		const trimmed = name.trim();
		if (!trimmed || selected.size === 0) return;
		const chosen = sortedPeers.filter((p) => selected.has(`${p.type}:${p.id}`));
		onCreate(trimmed, chosen);
		setName('');
		setSelected(new Set());
	};

	const handleClose = () => {
		setName('');
		setSelected(new Set());
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
			<div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-xl">
				<header className="flex items-center justify-between border-b border-border px-5 py-4">
					<div className="flex items-center gap-2">
						<Users className="size-5 text-primary" />
						<h2 className="text-base font-bold">{t('chat.group.title')}</h2>
					</div>
					<button
						type="button"
						onClick={handleClose}
						className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
						aria-label={t('company.close')}
					>
						<X className="size-4" />
					</button>
				</header>

				<div className="border-b border-border px-5 py-4">
					<label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
						{t('chat.group.name')}
					</label>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={t('chat.group.name_ph')}
						maxLength={120}
						className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none ring-primary/20 focus:ring-2"
					/>
				</div>

				<p className="px-5 pt-3 text-xs text-muted-foreground">
					{t('chat.group.pick')}
				</p>

				<div className="flex-1 overflow-y-auto p-3">
					{sortedPeers.length === 0 ? (
						<p className="px-2 py-8 text-center text-sm text-muted-foreground">
							{t('chat.group.empty')}
						</p>
					) : (
						<ul className="space-y-1">
							{sortedPeers.map((peer) => {
								const key = `${peer.type}:${peer.id}`;
								const active = selected.has(key);
								return (
									<li key={key}>
										<button
											type="button"
											onClick={() => toggle(key)}
											className={cn(
												'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
												active ? 'bg-accent' : 'hover:bg-secondary/70',
											)}
										>
											<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
												{peer.name.charAt(0).toUpperCase()}
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-semibold text-foreground">
													{peer.name}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{peer.type === 'parent' ? 'Parent' : peer.email}
												</p>
											</div>
											<span
												className={cn(
													'flex size-5 items-center justify-center rounded-md border transition-colors',
													active
														? 'border-primary bg-primary text-primary-foreground'
														: 'border-border',
												)}
											>
												{active ? <Check className="size-3.5" /> : null}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				<footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
					<span className="text-xs text-muted-foreground">{t('chat.group.selected', { count: selected.size })}</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleClose}
							className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
						>
							{t('company.cancel')}
						</button>
						<button
							type="button"
							onClick={handleCreate}
							disabled={!name.trim() || selected.size === 0}
							className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{t('chat.group.create')}
						</button>
					</div>
				</footer>
			</div>
		</div>
	);
}
