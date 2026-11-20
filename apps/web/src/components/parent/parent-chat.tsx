import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, FileText, LogOut, MessageCircle, Paperclip, Plus, Search, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import {
	type ChatActor,
	type ChatGroupWithMeta,
	type ChatMessage,
	type ChatPeer,
	CHAT_ATTACHMENT_MAX_SIZE,
	CHAT_ATTACHMENT_MIME_TYPES,
	listParentChatPeers,
	listGroups,
	loadConversation,
	loadGroupMessages,
	loadUnreadCounts,
	markConversationRead,
	markGroupRead,
	messageSenderName,
	peerKey,
	sendGroupMessage,
	sendMessage,
	subscribeToGroupMessages,
	subscribeToMessages,
	createGroup,
} from '@/lib/chat';
import { GroupCreateDialog } from '@/components/app/group-create-dialog';
import { ChatMessageAttachment } from '@/components/app/chat-attachment';
import { currentParent, logoutParent } from '@/lib/parents';
import { cn } from '@/lib/utils';

type Selection =
	| { kind: 'direct'; peer: ChatPeer }
	| { kind: 'group'; group: ChatGroupWithMeta };

function formatTime(iso: string): string {
	try {
		return new Date(iso).toLocaleTimeString('id-ID', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'UTC',
		});
	} catch {
		return '';
	}
}

export function ParentChat() {
	const parent = currentParent();
	const myId = parent?.id ?? '';
	const companyId = parent?.company ?? '';
	const me: ChatActor = useMemo(() => ({ id: myId, type: 'parent' }), [myId]);
	const parentName = parent?.name || parent?.email || 'Parent';

	const [peers, setPeers] = useState<ChatPeer[]>([]);
	const [groups, setGroups] = useState<ChatGroupWithMeta[]>([]);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState('');
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [unread, setUnread] = useState<Record<string, number>>({});
	const [search, setSearch] = useState('');
	const [createOpen, setCreateOpen] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!myId) {
			setPeers([]);
			return;
		}
		let cancelled = false;
		listParentChatPeers().then((list) => {
			if (!cancelled) setPeers(list);
		});
		return () => {
			cancelled = true;
		};
	}, [myId]);

	const refreshGroups = useCallback(() => {
		if (!myId) {
			setGroups([]);
			return;
		}
		listGroups(me)
			.then(setGroups)
			.catch(() => {});
	}, [me, myId]);

	useEffect(() => {
		refreshGroups();
	}, [refreshGroups]);

	const refreshUnread = useCallback(() => {
		if (!myId) return;
		loadUnreadCounts(me)
			.then(setUnread)
			.catch(() => {});
	}, [me, myId]);

	useEffect(() => {
		refreshUnread();
	}, [refreshUnread]);

	useEffect(() => {
		if (!myId) return;
		const unsub = subscribeToMessages(me, (action, record) => {
			if (action === 'create') {
				setMessages((prev) => {
					if (prev.some((m) => m.id === record.id)) return prev;
					if (selection?.kind === 'direct' && record.group === '') {
						const sel = selection.peer;
						const involves =
							(record.sender_parent === myId && record.recipient === sel.id) ||
							(record.sender === sel.id && record.recipient_parent === myId);
						if (!involves) return prev;
					}
					return [...prev, record];
				});
				if (record.recipient_parent === myId) refreshUnread();
			} else if (action === 'update') {
				setMessages((prev) => prev.map((m) => (m.id === record.id ? record : m)));
			} else if (action === 'delete') {
				setMessages((prev) => prev.filter((m) => m.id !== record.id));
			}
		});
		return unsub;
	}, [me, myId, selection, refreshUnread]);

	useEffect(() => {
		if (selection?.kind !== 'group') return;
		const groupId = selection.group.id;
		const unsub = subscribeToGroupMessages(groupId, (action, record) => {
			if (action === 'create') {
				setMessages((prev) => {
					if (prev.some((m) => m.id === record.id)) return prev;
					return [...prev, record];
				});
			} else if (action === 'update') {
				setMessages((prev) => prev.map((m) => (m.id === record.id ? record : m)));
			} else if (action === 'delete') {
				setMessages((prev) => prev.filter((m) => m.id !== record.id));
			}
		});
		return unsub;
	}, [selection]);

	useEffect(() => {
		if (!selection || !myId) {
			setMessages([]);
			return;
		}
		let cancelled = false;
		if (selection.kind === 'direct') {
			const peerActor: ChatActor = { id: selection.peer.id, type: selection.peer.type };
			loadConversation(me, peerActor)
				.then((list) => {
					if (!cancelled) setMessages(list);
				})
				.catch(() => {});
			markConversationRead(me, peerActor)
				.then(() => refreshUnread())
				.catch(() => {});
		} else {
			loadGroupMessages(selection.group.id)
				.then((list) => {
					if (!cancelled) setMessages(list);
				})
				.catch(() => {});
			markGroupRead(selection.group.id, me)
				.then(() => refreshGroups())
				.catch(() => {});
		}
		return () => {
			cancelled = true;
		};
	}, [selection, me, myId, refreshUnread, refreshGroups]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	const handleSend = async () => {
		const text = draft.trim();
		if ((!text && !pendingFile) || !selection || !companyId || !myId) return;
		const file = pendingFile;
		setDraft('');
		setPendingFile(null);
		try {
			if (selection.kind === 'direct') {
				const peerActor: ChatActor = { id: selection.peer.id, type: selection.peer.type };
				const msg = await sendMessage(companyId, me, peerActor, text, file ?? undefined);
				setMessages((prev) => [...prev, msg]);
			} else {
				const msg = await sendGroupMessage(selection.group.id, companyId, me, text, file ?? undefined);
				setMessages((prev) => [...prev, msg]);
				refreshGroups();
			}
		} catch {
			setDraft(text);
			setPendingFile(file);
		}
	};

	const handlePickFile = (file: File | null) => {
		if (!file) {
			setPendingFile(null);
			return;
		}
		if (!CHAT_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof CHAT_ATTACHMENT_MIME_TYPES)[number])) {
			toast.error('Hanya file PNG atau PDF yang diizinkan.');
			return;
		}
		if (file.size > CHAT_ATTACHMENT_MAX_SIZE) {
			toast.error('Ukuran file maksimal 5 MB.');
			return;
		}
		setPendingFile(file);
	};

	const handleCreateGroup = async (name: string, selected: ChatPeer[]) => {
		if (!companyId || !myId) return;
		try {
			const group = await createGroup(companyId, me, parentName, name, selected);
			setGroups((prev) => [group, ...prev]);
			setSelection({ kind: 'group', group });
		} catch {
			// abaikan
		}
		setCreateOpen(false);
	};

	const q = search.trim().toLowerCase();
	const filteredPeers = q
		? peers.filter((p) => (p.name + p.email).toLowerCase().includes(q))
		: peers;
	const filteredGroups = q
		? groups.filter((g) => g.name.toLowerCase().includes(q))
		: groups;

	const headerTitle =
		selection?.kind === 'group'
			? selection.group.name
			: selection?.kind === 'direct'
				? selection.peer.name
				: '';
	const headerSubtitle =
		selection?.kind === 'group'
			? `${selection.group.members.length} anggota`
			: selection?.kind === 'direct'
				? selection.peer.email
				: '';

	return (
		<div className="min-h-dvh bg-[#f4f7f6]">
			<header className="border-b border-[#e6ecea] bg-white">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
					<div className="min-w-0">
						<p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
							Portal Parent
						</p>
						<h1 className="truncate text-lg font-extrabold tracking-tight text-emerald-950">{parentName}</h1>
					</div>
					<button
						type="button"
						onClick={() => {
							logoutParent();
							window.location.href = '/app/parent';
						}}
						className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e6ecea] px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-[#f4f7f6] hover:text-emerald-800"
					>
						<LogOut className="size-3.5" /> Keluar
					</button>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-5 py-6">
				<Link
					to="/app/parent/dashboard"
					className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-emerald-800"
				>
					<ArrowLeft className="size-4" /> Kembali ke Dasbor
				</Link>
				<div className="mt-3 flex items-center justify-between gap-3">
					<div>
						<h2 className="text-2xl font-extrabold tracking-tight text-emerald-950">Chat</h2>
						<p className="mt-1 text-[13px] text-muted-foreground">
							Berkirim pesan langsung dan grup dengan staf sekolah.
						</p>
					</div>
					<button
						type="button"
						onClick={() => setCreateOpen(true)}
						disabled={peers.length === 0}
						className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#0f9d68] px-4 py-2 text-xs font-bold text-white transition-transform hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Plus className="size-4" /> Buat Grup
					</button>
				</div>

				<div className="mt-5 grid h-[calc(100dvh-16rem)] grid-cols-1 overflow-hidden rounded-2xl border border-[#e6ecea] bg-white shadow-soft-sm md:grid-cols-[300px_1fr]">
					<aside className="flex flex-col border-b border-[#e6ecea] bg-white md:border-b-0 md:border-r">
						<div className="border-b border-[#e6ecea] p-4">
							<div className="relative">
								<Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Cari percakapan..."
									className="w-full rounded-lg border border-[#e6ecea] bg-[#f8fbfa] py-2.5 pl-10 pr-3 text-sm outline-none transition-colors focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
								/>
							</div>
						</div>
						<div className="flex-1 overflow-y-auto">
							{filteredGroups.length > 0 ? (
								<>
									<p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
										Grup
									</p>
									{filteredGroups.map((g) => {
										const active = selection?.kind === 'group' && selection.group.id === g.id;
										const count = g.unread;
										return (
											<button
												key={g.id}
												type="button"
												onClick={() => setSelection({ kind: 'group', group: g })}
												className={cn(
													'flex w-full items-center gap-3 border-b border-[#e6ecea]/70 px-4 py-3 text-left transition-colors',
													active ? 'bg-[#e7f7ef]' : 'hover:bg-[#f4f7f6]',
												)}
											>
												<span
													className={cn(
														'flex size-10 shrink-0 items-center justify-center rounded-xl',
														active ? 'bg-white text-emerald-700' : 'bg-[#e7f7ef] text-emerald-700',
													)}
												>
													<Users className="size-5" />
												</span>
												<span className="min-w-0 flex-1">
													<span className={cn('block truncate text-sm', active ? 'font-bold text-emerald-900' : 'font-semibold text-foreground')}>
														{g.name}
													</span>
													<span className="block truncate text-xs text-muted-foreground">
														{g.lastMessage?.text ?? `${g.members.length} anggota`}
													</span>
												</span>
												{count > 0 ? (
													<span className="flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
														{count > 9 ? '9+' : count}
													</span>
												) : null}
											</button>
										);
									})}
								</>
							) : null}

							<p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
								Langsung
							</p>
							{filteredPeers.length === 0 && filteredGroups.length === 0 ? (
								<p className="px-4 py-8 text-center text-sm text-muted-foreground">
									Belum ada staf sekolah yang dapat dihubungi.
								</p>
							) : (
								filteredPeers.map((peer) => {
									const count = unread[peerKey(peer)] ?? 0;
									const active = selection?.kind === 'direct' && selection.peer.id === peer.id;
									return (
										<button
											key={`${peer.type}-${peer.id}`}
											type="button"
											onClick={() => setSelection({ kind: 'direct', peer })}
											className={cn(
												'flex w-full items-center gap-3 border-b border-[#e6ecea]/70 px-4 py-3 text-left transition-colors',
												active ? 'bg-[#e7f7ef]' : 'hover:bg-[#f4f7f6]',
											)}
										>
											<span
												className={cn(
													'flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
													active ? 'bg-white text-emerald-700' : 'bg-[#e7f7ef] text-emerald-700',
												)}
											>
												{peer.name.charAt(0).toUpperCase()}
											</span>
											<span className="min-w-0 flex-1">
												<span className={cn('block truncate text-sm', active ? 'font-bold text-emerald-900' : 'font-semibold text-foreground')}>
													{peer.name}
												</span>
												{peer.position ? (
													<span className="block truncate text-xs text-muted-foreground">{peer.position}</span>
												) : (
													<span className="block truncate text-xs text-muted-foreground">{peer.email}</span>
												)}
											</span>
											{count > 0 ? (
												<span className="flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
													{count > 9 ? '9+' : count}
												</span>
											) : null}
										</button>
									);
								})
							)}
						</div>
					</aside>

					<section className="flex min-w-0 flex-col">
						{selection ? (
							<>
								<header className="flex items-center gap-3 border-b border-[#e6ecea] bg-white px-5 py-3.5">
									{selection.kind === 'group' ? (
										<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e7f7ef] text-emerald-700">
											<Users className="size-5" />
										</span>
									) : (
										<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e7f7ef] text-sm font-bold text-emerald-700">
											{selection.peer.name.charAt(0).toUpperCase()}
										</span>
									)}
									<div className="min-w-0">
										<p className="truncate text-sm font-extrabold text-emerald-950">{headerTitle}</p>
										<div className="flex min-w-0 items-center gap-2">
											{selection.kind === 'direct' && selection.peer.type === 'user' && selection.peer.position ? (
												<span className="shrink-0 rounded-full bg-[#e7f7ef] px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
													{selection.peer.position}
												</span>
											) : null}
											<p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
										</div>
									</div>
								</header>

								<div className="flex-1 space-y-2 overflow-y-auto bg-[#fbfcfc] p-4">
									{messages.length === 0 ? (
										<div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
											<span className="flex size-14 items-center justify-center rounded-2xl border border-[#e6ecea] bg-white text-emerald-700">
												<MessageCircle className="size-6" strokeWidth={1.6} />
											</span>
											<p className="text-sm">
												{selection.kind === 'group'
													? 'Mulai percakapan di grup ini'
													: `Mulai percakapan dengan ${selection.peer.name}`}
											</p>
										</div>
									) : (
										messages.map((m) => {
											const mine = m.sender_parent === myId || m.sender === myId;
											const showSender =
												selection.kind === 'group' && !mine
													? messageSenderName(m, selection.group.members, 'Anggota')
													: null;
											return (
												<div
													key={m.id}
													className={cn('flex', mine ? 'justify-end' : 'justify-start')}
												>
													<div
														className={cn(
															'max-w-[75%] rounded-2xl border px-3.5 py-2 text-sm shadow-soft-sm',
															mine
																? 'rounded-br-sm border-emerald-200/80 bg-[#e7f7ef] text-emerald-950'
																: 'rounded-bl-sm border-[#e6ecea] bg-white text-foreground',
														)}
													>
														{showSender ? (
															<p className="mb-0.5 text-[11px] font-bold text-emerald-700">{showSender}</p>
														) : null}
														{m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null}
														<ChatMessageAttachment message={m} mine={mine} />
														<p className="mt-1 text-[10px] text-muted-foreground">
															{formatTime(m.created)}
														</p>
													</div>
												</div>
											);
										})
									)}
									<div ref={messagesEndRef} />
								</div>

								<form
									onSubmit={(e) => {
										e.preventDefault();
										void handleSend();
									}}
									className="border-t border-[#e6ecea] bg-white p-3"
								>
									{pendingFile ? (
										<div className="mb-2 flex items-center gap-2 rounded-lg border border-[#e6ecea] bg-[#f8fbfa] px-3 py-2 text-sm">
											<FileText className="size-4 shrink-0 text-rose-600" />
											<span className="min-w-0 flex-1 truncate text-foreground">{pendingFile.name}</span>
											<span className="text-xs text-muted-foreground">{(pendingFile.size / 1024).toFixed(0)} KB</span>
											<button type="button" onClick={() => setPendingFile(null)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Hapus lampiran">
												<X className="size-3.5" />
											</button>
										</div>
									) : null}
									<div className="flex items-center gap-2">
										<input ref={fileInputRef} type="file" accept=".png,.pdf,image/png,application/pdf" className="hidden" onChange={(e) => { handlePickFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
										<button type="button" onClick={() => fileInputRef.current?.click()} className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e6ecea] text-emerald-700 transition-colors hover:bg-[#e7f7ef]" aria-label="Lampirkan file">
											<Paperclip className="size-4" />
										</button>
										<input
											value={draft}
											onChange={(e) => setDraft(e.target.value)}
											placeholder="Tulis pesan..."
											className="flex-1 rounded-xl border border-[#e6ecea] bg-[#f8fbfa] px-4 py-2.5 text-sm outline-none transition-colors focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
										/>
										<button
											type="submit"
											disabled={(!draft.trim() && !pendingFile)}
											className="flex size-10 items-center justify-center rounded-xl bg-[#0f9d68] text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
											aria-label="Kirim pesan"
										>
											<Send className="size-4" />
										</button>
									</div>
								</form>
							</>
						) : (
							<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
								<span className="flex size-14 items-center justify-center rounded-2xl border border-[#e6ecea] bg-white text-emerald-700">
									<MessageCircle className="size-6" strokeWidth={1.6} />
								</span>
								<p className="text-sm">Pilih percakapan atau buat grup untuk mulai mengobrol</p>
							</div>
						)}
					</section>
				</div>
			</main>

			<GroupCreateDialog
				peers={peers}
				open={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreate={(name, selected) => void handleCreateGroup(name, selected)}
			/>
		</div>
	);
}
