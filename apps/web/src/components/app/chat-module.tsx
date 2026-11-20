import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	Hash,
	Inbox,
	MessageCircle,
	Phone,
	Plus,
	Search,
	Send,
	Users,
	ArrowLeft,
	Paperclip,
	FileText,
	Mic,
	Video,
	X,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';
import {
	type ChatActor,
	type ChatGroupWithMeta,
	type ChatMessage,
	type ChatPeer,
	CHAT_ATTACHMENT_MAX_SIZE,
	CHAT_ATTACHMENT_MIME_TYPES,
	listChatPeers,
	listGroups,
	loadConversation,
	loadDirectPreviews,
	loadGroupMessages,
	loadUnreadCounts,
	previewLabel,
	type ChatPreview,
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
import { ChatMessageAttachment } from '@/components/app/chat-attachment';
import { VoiceRecordButton, VoiceRecorder } from '@/components/app/chat-voice-recorder';
import { GroupCreateDialog } from '@/components/app/group-create-dialog';
import { NoCompany } from '@/components/app/no-company';
import { useCall } from '@/components/app/call-provider';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

type Selection =
	| { kind: 'direct'; peer: ChatPeer }
	| { kind: 'group'; group: ChatGroupWithMeta };

type RailFilter = 'all' | 'unread' | 'groups' | 'direct';

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

function formatDay(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC',
		});
	} catch {
		return '';
	}
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_TONES = [
	'bg-[#e7f7ef] text-emerald-700',
	'bg-[#eef2f1] text-slate-600',
	'bg-[#e3f1ea] text-emerald-800',
	'bg-[#f1efe6] text-stone-600',
	'bg-[#eaeef5] text-slate-600',
	'bg-[#e9f4ee] text-emerald-700',
];

function avatarTone(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
	return AVATAR_TONES[hash];
}

export function ChatModule({ activeCompany }: { activeCompany: Company | null }) {
	const { user } = useAuth();
	const myId = user?.id ?? pb.authStore.record?.id ?? '';
	const me: ChatActor = useMemo(() => ({ id: myId, type: 'user' }), [myId]);
	const myName = user?.name || user?.email || 'Saya';

	const [peers, setPeers] = useState<ChatPeer[]>([]);
	const [groups, setGroups] = useState<ChatGroupWithMeta[]>([]);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState('');
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [pendingAudio, setPendingAudio] = useState<File | null>(null);
	const [recording, setRecording] = useState(false);
	const pendingAudioUrl = useMemo(
		() => (pendingAudio ? URL.createObjectURL(pendingAudio) : null),
		[pendingAudio],
	);
	useEffect(() => {
		return () => {
			if (pendingAudioUrl) URL.revokeObjectURL(pendingAudioUrl);
		};
	}, [pendingAudioUrl]);
	const [unread, setUnread] = useState<Record<string, number>>({});
	const [previews, setPreviews] = useState<Record<string, ChatPreview>>({});
	const [search, setSearch] = useState('');
	const [createOpen, setCreateOpen] = useState(false);
	const [rail, setRail] = useState<RailFilter>('all');
	const [menuOpen, setMenuOpen] = useState(true);
	const { startCall } = useCall();
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const peersRef = useRef<ChatPeer[]>([]);
	peersRef.current = peers;

	useEffect(() => {
		if (!activeCompany || !myId) {
			setPeers([]);
			return;
		}
		let cancelled = false;
		listChatPeers(activeCompany.id, myId).then((list) => {
			if (!cancelled) setPeers(list);
		});
		return () => {
			cancelled = true;
		};
	}, [activeCompany, myId]);

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
		loadDirectPreviews(me)
			.then(setPreviews)
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
							(record.sender === myId && record.recipient === sel.id) ||
							(record.sender === sel.id && record.recipient === myId) ||
							(record.sender_parent === myId && record.recipient_parent === sel.id) ||
							(record.sender === sel.id && record.recipient_parent === myId);
						if (!involves) return prev;
					}
					return [...prev, record];
				});
				refreshUnread();
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
		if (messages.length > 0) {
			const timer = setTimeout(() => {
				messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [messages]);

	const handleSend = async () => {
		const text = draft.trim();
		if ((!text && !pendingFile && !pendingAudio) || !selection || !activeCompany || !myId) return;
		const file = pendingFile;
		const audio = pendingAudio;
		setDraft('');
		setPendingFile(null);
		setPendingAudio(null);
		try {
			if (selection.kind === 'direct') {
				const peerActor: ChatActor = { id: selection.peer.id, type: selection.peer.type };
				const msg = await sendMessage(activeCompany.id, me, peerActor, text, file ?? audio ?? undefined);
				setMessages((prev) => [...prev, msg]);
			} else {
				const msg = await sendGroupMessage(selection.group.id, activeCompany.id, me, text, file ?? audio ?? undefined);
				setMessages((prev) => [...prev, msg]);
				refreshGroups();
			}
		} catch {
			setDraft(text);
			setPendingFile(file);
			setPendingAudio(audio);
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
		if (!activeCompany || !myId) return;
		try {
			const group = await createGroup(activeCompany.id, me, myName, name, selected);
			setGroups((prev) => [group, ...prev]);
			setSelection({ kind: 'group', group });
			setRail('groups');
		} catch {
			// abaikan
		}
		setCreateOpen(false);
	};

	if (!activeCompany) {
		return <NoCompany />;
	}

	const q = search.trim().toLowerCase();
	const totalUnread =
		Object.values(unread).reduce((sum, n) => sum + n, 0) +
		groups.reduce((sum, g) => sum + g.unread, 0);

	const filteredPeers = peers.filter((p) => {
		if (q && !(p.name + p.email).toLowerCase().includes(q)) return false;
		if (rail === 'groups') return false;
		if (rail === 'unread') return (unread[peerKey(p)] ?? 0) > 0;
		return true;
	});
	const filteredGroups = groups.filter((g) => {
		if (q && !g.name.toLowerCase().includes(q)) return false;
		if (rail === 'direct') return false;
		if (rail === 'unread') return g.unread > 0;
		return true;
	});

	const navItems: { key: RailFilter; label: string; icon: typeof MessageCircle; badge?: number }[] = [
		{ key: 'all', label: 'Semua percakapan', icon: MessageCircle },
		{ key: 'unread', label: 'Belum dibaca', icon: Inbox, badge: totalUnread },
		{ key: 'groups', label: 'Grup', icon: Users },
		{ key: 'direct', label: 'Langsung', icon: Hash },
	];

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
				? selection.peer.type === 'parent'
					? 'Parent siswa'
					: selection.peer.email
				: '';

	const parentCount = peers.filter((p) => p.type === 'parent').length;
	const showThread = Boolean(selection);
	const showGroupsInRail = rail !== 'direct';
	const showPeersInRail = rail !== 'groups';
	const railEmpty = filteredGroups.length === 0 && (!showPeersInRail || filteredPeers.length === 0);

	const toggleRail = (key: RailFilter) => {
		if (rail === key) {
			setMenuOpen((open) => !open);
			return;
		}
		setRail(key);
		setMenuOpen(true);
	};

	return (
		<div className="flex h-[calc(100dvh-130px)] min-h-[500px] flex-col text-foreground">
			<header className="shrink-0 pb-4">
				<h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">Chat</h1>
				<p className="mt-1 max-w-2xl text-xs text-slate-500 md:text-sm">
					Pesan langsung dan grup dengan anggota {activeCompany.name}, termasuk label jabatan dan lampiran.
				</p>
			</header>

			<div className="grid min-h-0 flex-1 items-stretch gap-4 md:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
			<nav
				aria-label="Filter chat"
				className={cn(
					'min-h-0 min-w-0 flex-col overflow-y-auto border-slate-200/70 md:border-r md:pr-3',
					showThread ? 'hidden md:flex' : 'flex',
				)}
			>
				<div className="relative mb-3">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Cari percakapan"
						className="w-full rounded-lg border border-[#e6ecea] bg-white py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
					/>
				</div>
				{navItems.map(item => {
					const open = menuOpen && rail === item.key;
					return (
						<div key={item.key}>
							<button
								type="button"
								aria-expanded={open}
								onClick={() => toggleRail(item.key)}
								className={cn(
									'flex min-h-11 w-full items-center gap-3 border-l-[3px] px-3 py-2.5 text-left text-sm font-semibold leading-snug transition-colors',
									rail === item.key
										? 'border-emerald-600 bg-[#e7f8ef] text-emerald-700'
										: 'border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900',
								)}
							>
								<item.icon className="size-4" />
								<span className="flex-1">{item.label}</span>
								{item.badge && item.badge > 0 ? <UnreadPill count={item.badge} /> : null}
							</button>
							{open ? (
								<div className="space-y-0.5 py-1 pl-3">
									{showGroupsInRail
										? filteredGroups.map((g) => {
												const active = selection?.kind === 'group' && selection.group.id === g.id;
												return (
													<button
														key={g.id}
														type="button"
														onClick={() => setSelection({ kind: 'group', group: g })}
														className={cn(
															'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
															active ? 'bg-[#e7f7ef] font-semibold text-emerald-800' : 'text-foreground hover:bg-white/80',
														)}
													>
														<span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', active ? 'bg-white text-emerald-700' : 'bg-[#eef2f1] text-slate-500')}>
															<Users className="size-4" />
														</span>
														<span className="min-w-0 flex-1 truncate">{g.name}</span>
														{g.unread > 0 ? <UnreadPill count={g.unread} /> : null}
													</button>
												);
											})
										: null}
									{showPeersInRail
										? filteredPeers.map((peer) => {
												const count = unread[peerKey(peer)] ?? 0;
												const active = selection?.kind === 'direct' && selection.peer.id === peer.id && selection.peer.type === peer.type;
												const last = previewLabel(previews[peerKey(peer)]);
												return (
													<button
														key={`${peer.type}-${peer.id}`}
														type="button"
														onClick={() => setSelection({ kind: 'direct', peer })}
														className={cn(
															'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
															active ? 'bg-[#e7f7ef]' : 'hover:bg-white/80',
														)}
													>
														<span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold', active ? 'bg-white text-emerald-700' : avatarTone(peer.name))}>
															{initials(peer.name)}
														</span>
														<span className="min-w-0 flex-1">
															<span className={cn('block truncate text-sm leading-tight', active ? 'font-bold text-emerald-900' : 'font-semibold text-foreground')}>{peer.name}</span>
															{last ? (
																<span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">{last}</span>
															) : peer.position ? (
																<span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{peer.position}</span>
															) : peer.type === 'parent' ? (
																<span className="mt-0.5 block truncate text-[11px] text-muted-foreground">Parent</span>
															) : null}
														</span>
														{count > 0 ? <UnreadPill count={count} /> : null}
													</button>
												);
											})
										: null}
									{railEmpty ? (
										<p className="px-2 py-3 text-xs text-muted-foreground">
											{rail === 'unread'
												? 'Tidak ada pesan belum dibaca.'
												: rail === 'groups'
													? 'Belum ada grup.'
													: 'Belum ada percakapan.'}
										</p>
									) : null}
								</div>
							) : null}
						</div>
					);
				})}
				<button
					type="button"
					onClick={() => setCreateOpen(true)}
					disabled={peers.length === 0}
					className="flex min-h-11 w-full items-center gap-3 border-l-[3px] border-transparent px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-900 disabled:opacity-40"
				>
					<Plus className="size-4" /> Buat grup
				</button>
			</nav>

			<div
				className={cn(
					'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e7ebf0] bg-[#f4f6f9] shadow-sm',
					showThread ? 'flex' : 'hidden md:flex',
				)}
			>
			<section className="flex h-full min-h-0 flex-col bg-[#fbfcfc] text-foreground">
				{selection ? (
					<>
						<header className="flex shrink-0 items-center gap-3 border-b border-[#e6ecea] bg-white px-4 py-3.5 sm:px-6">
							<button
								type="button"
								onClick={() => setSelection(null)}
								className="flex size-9 items-center justify-center rounded-lg border border-[#e6ecea] text-emerald-700 hover:bg-[#e7f7ef] md:hidden"
								aria-label="Kembali ke daftar"
							>
								<ArrowLeft className="size-4" />
							</button>
							{selection.kind === 'group' ? (
								<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e7f7ef] text-emerald-700">
									<Users className="size-5" />
								</div>
							) : (
								<div
									className={cn(
										'flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
										avatarTone(selection.peer.name),
									)}
								>
									{initials(selection.peer.name)}
								</div>
							)}
							<div className="min-w-0 flex-1">
								<p className="truncate text-base font-extrabold tracking-tight text-emerald-950">
									{selection.kind === 'group' ? `# ${headerTitle}` : headerTitle}
								</p>
								<div className="flex min-w-0 items-center gap-2">
									{selection.kind === 'direct' && selection.peer.type === 'user' && selection.peer.position ? (
										<span className="shrink-0 rounded-full bg-[#e7f7ef] px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
											{selection.peer.position}
										</span>
									) : null}
									<p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
								</div>
							</div>
							{selection.kind === 'direct' ? (
								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={() => startCall(selection.peer, 'voice')}
										className="flex size-9 items-center justify-center rounded-lg border border-[#e6ecea] text-emerald-700 transition-colors hover:bg-[#e7f7ef]"
										aria-label="Panggilan suara"
										title="Panggilan suara"
									>
										<Phone className="size-4" />
									</button>
									<button
										type="button"
										onClick={() => startCall(selection.peer, 'video')}
										className="flex size-9 items-center justify-center rounded-lg border border-[#e6ecea] text-emerald-700 transition-colors hover:bg-[#e7f7ef]"
										aria-label="Panggilan video"
										title="Panggilan video"
									>
										<Video className="size-4" />
									</button>
								</div>
							) : null}
							{selection.kind === 'group' ? (
								<span className="hidden rounded-full border border-[#e6ecea] px-3 py-1 text-xs font-semibold text-emerald-800 sm:inline">
									{selection.group.members.length} anggota
								</span>
							) : null}
						</header>

						<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
							{messages.length === 0 ? (
								<div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
									<div className="flex size-14 items-center justify-center rounded-2xl border border-[#e6ecea] bg-white text-emerald-700">
										<MessageCircle className="size-6" strokeWidth={1.6} />
									</div>
									<p className="text-sm">
										{selection.kind === 'group'
											? 'Mulai percakapan di grup ini'
											: `Mulai percakapan dengan ${selection.peer.name}`}
									</p>
								</div>
							) : (
								messages.map((m, index) => {
									const mine = m.sender === myId || m.sender_parent === myId;
									const senderName = mine
										? myName
										: selection.kind === 'group'
											? messageSenderName(m, selection.group.members, 'Anggota')
											: selection.peer.name;
									const previous = messages[index - 1];
									const sameSender =
										previous &&
										previous.sender === m.sender &&
										previous.sender_parent === m.sender_parent;
									return (
										<article key={m.id} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
											{sameSender ? (
												<div className="w-9 shrink-0" />
											) : (
												<div
													className={cn(
														'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
														avatarTone(senderName),
													)}
												>
													{initials(senderName)}
												</div>
											)}
											<div className={cn('flex min-w-0 max-w-[min(660px,80%)] flex-col', mine && 'items-end')}>
												{sameSender ? null : (
													<p className={cn('mb-1 flex items-center gap-2 text-sm', mine && 'flex-row-reverse')}>
														<span className={cn('font-bold', mine ? 'text-emerald-800' : 'text-emerald-950')}>{senderName}</span>
														<span className="text-[11px] font-medium text-muted-foreground">
															{formatDay(m.created)} {formatTime(m.created)}
														</span>
													</p>
												)}
												<div
													className={cn(
														'w-fit max-w-full rounded-2xl border px-3.5 py-2 text-left text-[15px] leading-relaxed shadow-soft-sm',
														mine
															? 'rounded-tr-md border-emerald-200/80 bg-[#e7f7ef] text-emerald-950'
															: 'rounded-tl-md border-[#e6ecea] bg-white text-foreground',
													)}
												>
													{m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null}
													<ChatMessageAttachment message={m} mine={mine} />
												</div>
											</div>
										</article>
									);
								})
							)}
							<div ref={messagesEndRef} />
						</div>

						{selection.kind === 'direct' && selection.peer.type === 'parent' ? (
							<div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:mx-6">
								<span className="font-bold text-emerald-800">Parent siswa</span> — percakapan ini hanya
								dengan akun Parent yang terhubung ke {activeCompany.name}.
							</div>
						) : parentCount > 0 && selection.kind === 'group' ? (
							<div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:mx-6">
								<span className="font-bold text-emerald-800">{parentCount} Parent</span> terdaftar di{' '}
								{activeCompany.name} dan dapat diundang ke grup.
							</div>
						) : null}

						<form
							onSubmit={(e) => {
								e.preventDefault();
								void handleSend();
							}}
							className="shrink-0 border-t border-[#e6ecea] bg-white px-4 py-4 sm:px-5"
						>
							<div className="flex items-end gap-2 rounded-xl border border-[#e6ecea] bg-white px-3 py-2 shadow-soft-sm focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/20">
							{recording ? (
								<VoiceRecorder
									onComplete={(file) => {
										setPendingAudio(file);
										setRecording(false);
									}}
									onCancel={() => setRecording(false)}
								/>
							) : (
								<>
							{pendingFile ? (
								<div className="flex w-full items-center gap-2 rounded-lg border border-[#e6ecea] bg-[#f8fbfa] px-3 py-2 text-sm">
									<FileText className="size-4 shrink-0 text-rose-600" />
									<span className="min-w-0 flex-1 truncate text-foreground">{pendingFile.name}</span>
									<span className="text-xs text-muted-foreground">{(pendingFile.size / 1024).toFixed(0)} KB</span>
									<button type="button" onClick={() => setPendingFile(null)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Hapus lampiran">
										<X className="size-3.5" />
									</button>
								</div>
							) : null}
							{pendingAudio ? (
								<div className="flex w-full items-center gap-2 rounded-lg border border-[#e6ecea] bg-[#f8fbfa] px-3 py-2 text-sm">
									<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
										<Mic className="size-4" />
									</span>
									<audio controls preload="metadata" className="min-w-0 max-w-[220px] flex-1">
										{pendingAudioUrl ? <source src={pendingAudioUrl} /> : null}
									</audio>
									<button type="button" onClick={() => setPendingAudio(null)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Hapus pesan suara">
										<X className="size-3.5" />
									</button>
								</div>
							) : null}
							<input ref={fileInputRef} type="file" accept=".png,.pdf,image/png,application/pdf" className="hidden" onChange={(e) => { handlePickFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
							{!pendingFile && !pendingAudio ? (
								<button type="button" onClick={() => fileInputRef.current?.click()} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-emerald-700 transition-colors hover:bg-[#e7f7ef]" aria-label="Lampirkan file">
									<Paperclip className="size-4" />
								</button>
							) : null}
							{!pendingFile && !pendingAudio ? (
								<VoiceRecordButton onClick={() => setRecording(true)} />
							) : null}
								<textarea
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											void handleSend();
										}
									}}
									rows={1}
									placeholder={
										selection.kind === 'group'
											? `Pesan ke #${selection.group.name}`
											: `Pesan ke ${selection.peer.name}`
									}
									className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
								/>
								<button
									type="submit"
									disabled={(!draft.trim() && !pendingFile && !pendingAudio)}
									className="mb-1 flex size-9 items-center justify-center rounded-lg bg-[#0f9d68] text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
									aria-label="Kirim pesan"
								>
									<Send className="size-4" />
								</button>
								</>
							)}
							</div>
						</form>
					</>
				) : (
					<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
						<div className="flex size-16 items-center justify-center rounded-2xl border border-[#e6ecea] bg-white text-emerald-700">
							<MessageCircle className="size-7" strokeWidth={1.5} />
						</div>
						<p className="text-base font-semibold text-emerald-950">Pilih percakapan</p>
						<p className="max-w-sm text-sm">
							Kirim pesan langsung atau buat grup dengan anggota {activeCompany.name} dan Parent siswa.
						</p>
					</div>
				)}
			</section>
			</div>
			</div>

			<GroupCreateDialog
				peers={peers}
				open={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreate={(name, selected) => void handleCreateGroup(name, selected)}
			/>
		</div>
	);
}

function UnreadPill({ count }: { count: number }) {
	return (
		<span className="flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
			{count > 9 ? '9+' : count}
		</span>
	);
}
