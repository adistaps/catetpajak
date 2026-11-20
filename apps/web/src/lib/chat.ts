import pb from '@/lib/pocketbase-client';

export type ActorType = 'user' | 'parent';

export interface ChatActor {
	id: string;
	type: ActorType;
}

export interface ChatMessage {
	id: string;
	sender: string;
	recipient: string;
	sender_parent: string;
	recipient_parent: string;
	company: string;
	text: string;
	attachment: string;
	read: boolean;
	group: string;
	read_by: string[];
	created: string;
	updated: string;
}

/** Tipe MIME lampiran yang diizinkan pada chat (gambar, dokumen, dan pesan suara). */
export const CHAT_ATTACHMENT_MIME_TYPES = [
  'image/png',
  'application/pdf',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
] as const;
export const CHAT_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/** Ekstensi tipe MIME audio yang diizinkan. */
export const CHAT_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
] as const;

/** URL absolut untuk file lampiran sebuah pesan. */
export function chatAttachmentUrl(message: ChatMessage): string {
	if (!message.attachment) return '';
	return pb.files.getURL(message, message.attachment);
}

/** Nama file tampilan untuk lampiran. */
export function chatAttachmentName(message: ChatMessage): string {
	return message.attachment || 'lampiran';
}

/** Apakah lampiran adalah gambar PNG. */
export function isImageAttachment(message: ChatMessage): boolean {
	return Boolean(message.attachment) && message.attachment.toLowerCase().endsWith('.png');
}

/** Apakah lampiran adalah pesan suara (audio). */
export function isAudioAttachment(message: ChatMessage): boolean {
	if (!message.attachment) return false;
	const name = message.attachment.toLowerCase();
	return (
		name.endsWith('.webm') ||
		name.endsWith('.ogg') ||
		name.endsWith('.mp3') ||
		name.endsWith('.mpeg') ||
		name.endsWith('.mp4') ||
		name.endsWith('.m4a') ||
		name.endsWith('.wav')
	);
}

export interface ChatPeer {
	id: string;
	name: string;
	email: string;
	role?: string;
	/** Jabatan karyawan bila tersedia; kosong untuk Parent atau anggota tanpa data karyawan. */
	position?: string;
	type: ActorType;
}

export interface ChatGroup {
	id: string;
	name: string;
	company: string;
	owner: string;
	created: string;
	updated: string;
}

export interface ChatGroupMember {
	id: string;
	group: string;
	user: string;
	parent: string;
	name: string;
	type: ActorType;
}

export interface ChatGroupWithMeta extends ChatGroup {
	members: ChatGroupMember[];
	unread: number;
	lastMessage?: ChatMessage;
}

/** Kunci unik per aktor (membedakan user & parent walau id sama). */
export function peerKey(peer: { id: string; type: ActorType }): string {
	return `${peer.type}:${peer.id}`;
}

function actorKey(a: { type: string; id: string }): string {
	return `${a.type}:${a.id}`;
}

function isMine(m: ChatMessage, me: ChatActor): boolean {
	return (me.type === 'user' && m.sender === me.id) || (me.type === 'parent' && m.sender_parent === me.id);
}

// ---------------------------------------------------------------------------
// Direct (one-to-one) chat
// ---------------------------------------------------------------------------

/**
 * Anggota perusahaan (users) yang dapat diajak chat oleh pengguna perusahaan,
 * ditambah akun Parent yang terdaftar di perusahaan tersebut.
 */
export async function listChatPeers(companyId: string, _currentUserId: string): Promise<ChatPeer[]> {
	const token = pb.authStore.token;
	if (!token) return [];
	try {
		const res = await fetch(`/api/chat/peers?company=${encodeURIComponent(companyId)}`, {
			headers: { Authorization: `Bearer ${token}` },
			credentials: 'same-origin',
		});
		if (!res.ok) return [];
		const data = (await res.json()) as { peers?: ChatPeer[] };
		return data.peers ?? [];
	} catch {
		return [];
	}
}

/**
 * Pengguna perusahaan yang dapat dihubungi Parent.
 */
export async function listParentChatPeers(): Promise<ChatPeer[]> {
	const token = pb.authStore.token;
	if (!token) return [];
	try {
		const res = await fetch('/api/chat/parent-peers', {
			headers: { Authorization: `Bearer ${token}` },
			credentials: 'same-origin',
		});
		if (!res.ok) return [];
		const data = (await res.json()) as { peers?: ChatPeer[] };
		return data.peers ?? [];
	} catch {
		return [];
	}
}

/** Percakapan langsung antara dua aktor, urut paling lama. */
export async function loadConversation(me: ChatActor, peer: ChatActor): Promise<ChatMessage[]> {
	const meField = me.type === 'parent' ? 'recipient_parent' : 'recipient';
	const peerSenderField = peer.type === 'parent' ? 'sender_parent' : 'sender';
	const meSenderField = me.type === 'parent' ? 'sender_parent' : 'sender';
	const peerRecipientField = peer.type === 'parent' ? 'recipient_parent' : 'recipient';

	const filter = pb.filter(
		`(((${meSenderField} = {:me} && ${peerRecipientField} = {:peer}) || (${peerSenderField} = {:peer} && ${meField} = {:me}))) && group = ''`,
		{ me: me.id, peer: peer.id },
	);
	const list = await pb.collection('chat_messages').getFullList<ChatMessage>({
		filter,
		sort: 'created',
		requestKey: null,
	});
	return list;
}

export async function sendMessage(
	companyId: string,
	sender: ChatActor,
	recipient: ChatActor,
	text: string,
	file?: File,
): Promise<ChatMessage> {
	const base: Record<string, unknown> = {
		company: companyId,
		text,
		read: false,
		group: '',
		read_by: [],
	};
	if (sender.type === 'parent') {
		base.sender_parent = sender.id;
	} else {
		base.sender = sender.id;
	}
	if (recipient.type === 'parent') {
		base.recipient_parent = recipient.id;
	} else {
		base.recipient = recipient.id;
	}

	if (file) {
		const fd = new FormData();
		for (const [key, value] of Object.entries(base)) {
			fd.append(key, String(value));
		}
		fd.append('attachment', file);
		return pb.collection('chat_messages').create<ChatMessage>(fd, { requestKey: null });
	}
	return pb.collection('chat_messages').create<ChatMessage>(base, { requestKey: null });
}

/** Tandai semua pesan belum dibaca dari peer sebagai sudah dibaca. */
export async function markConversationRead(me: ChatActor, peer: ChatActor): Promise<void> {
	const meField = me.type === 'parent' ? 'recipient_parent' : 'recipient';
	const peerSenderField = peer.type === 'parent' ? 'sender_parent' : 'sender';
	const filter = pb.filter(
		`${peerSenderField} = {:peer} && ${meField} = {:me} && read = false`,
		{ peer: peer.id, me: me.id },
	);
	const unread = await pb.collection('chat_messages').getFullList<ChatMessage>({
		filter,
		requestKey: null,
	});
	await Promise.all(
		unread.map((m, i) =>
			pb.collection('chat_messages').update(m.id, { read: true }, { requestKey: `read-${m.id}-${i}` }),
		),
	);
}

/** Jumlah pesan grup belum dibaca untuk aktor ini. */
export async function loadGroupUnreadCount(me: ChatActor): Promise<number> {
	const myKey = actorKey(me);
	const list = await pb.collection('chat_messages').getFullList<ChatMessage>({
		filter: pb.filter('group != ""'),
		requestKey: null,
	});
	return list.filter((m) => {
		if (isMine(m, me)) return false;
		const rb = Array.isArray(m.read_by) ? m.read_by : [];
		return !rb.includes(myKey);
	}).length;
}

/** Total pesan belum dibaca (langsung + grup) untuk aktor ini. */
export async function loadTotalUnreadCount(me: ChatActor): Promise<number> {
	const direct = await loadUnreadCounts(me);
	const directTotal = Object.values(direct).reduce((sum, n) => sum + n, 0);
	try {
		const groupTotal = await loadGroupUnreadCount(me);
		return directTotal + groupTotal;
	} catch {
		return directTotal;
	}
}

/** Berlangganan setiap perubahan pesan chat yang dapat dibaca aktor (langsung + grup). */
export function subscribeToChatChanges(onChange: () => void): () => void {
	let unsub: (() => void) | null = null;
	let wantUnsub = false;
	pb
		.collection('chat_messages')
		.subscribe('*', () => onChange())
		.then((fn) => {
			if (wantUnsub) {
				try {
					fn();
				} catch {}
				return;
			}
			unsub = fn;
		})
		.catch(() => {});
	return () => {
		wantUnsub = true;
		if (unsub) {
			try {
				unsub();
			} catch {}
			unsub = null;
		}
	};
}

export interface ChatPreview {
	text: string;
	created: string;
	mine: boolean;
	attachment: '' | 'audio' | 'image' | 'file';
}

/** Cuplikan pesan langsung terbaru per lawan bicara (key = `${type}:${id}`). */
export async function loadDirectPreviews(me: ChatActor): Promise<Record<string, ChatPreview>> {
	const meSender = me.type === 'parent' ? 'sender_parent' : 'sender';
	const meRecipient = me.type === 'parent' ? 'recipient_parent' : 'recipient';
	const filter = pb.filter(`(${meSender} = {:me} || ${meRecipient} = {:me}) && group = ''`, { me: me.id });
	const list = await pb.collection('chat_messages').getFullList<ChatMessage>({
		filter,
		sort: '-created',
		requestKey: null,
	});
	const map: Record<string, ChatPreview> = {};
	for (const m of list) {
		const mine = isMine(m, me);
		const otherIsParent = mine ? Boolean(m.recipient_parent) : Boolean(m.sender_parent);
		const otherId = mine ? m.recipient_parent || m.recipient : m.sender_parent || m.sender;
		if (!otherId) continue;
		const key = `${otherIsParent ? 'parent' : 'user'}:${otherId}`;
		if (map[key]) continue;
		const name = (m.attachment || '').toLowerCase();
		const attachment: ChatPreview['attachment'] = !m.attachment
			? ''
			: isAudioAttachment(m)
				? 'audio'
				: name.endsWith('.png')
					? 'image'
					: 'file';
		map[key] = {
			text: (m.text || '').replace(/\s+/g, ' ').trim(),
			created: m.created,
			mine,
			attachment,
		};
	}
	return map;
}

/** Teks singkat untuk cuplikan pesan terakhir. */
export function previewLabel(preview: ChatPreview | undefined): string {
	if (!preview) return '';
	const body =
		preview.text ||
		(preview.attachment === 'audio'
			? 'Pesan suara'
			: preview.attachment === 'image'
				? 'Foto'
				: preview.attachment === 'file'
					? 'Lampiran'
					: '');
	if (!body) return '';
	return preview.mine ? `Anda: ${body}` : body;
}

/** Hitung pesan langsung belum dibaca per peer (key = `${type}:${id}`). */
export async function loadUnreadCounts(me: ChatActor): Promise<Record<string, number>> {
	const meField = me.type === 'parent' ? 'recipient_parent' : 'recipient';
	const filter = pb.filter(`${meField} = {:me} && read = false && group = ''`, { me: me.id });
	const list = await pb.collection('chat_messages').getFullList<ChatMessage>({
		filter,
		requestKey: null,
	});
	const counts: Record<string, number> = {};
	for (const m of list) {
		const isFromParent = Boolean(m.sender_parent);
		const key = isFromParent ? `parent:${m.sender_parent}` : `user:${m.sender}`;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

/** Berlangganan pesan baru yang melibatkan aktor ini (langsung saja). */
export function subscribeToMessages(
	me: ChatActor,
	onChange: (action: string, record: ChatMessage) => void,
): () => void {
	let unsub: (() => void) | null = null;
	let wantUnsub = false;
	const senderField = me.type === 'parent' ? 'sender_parent' : 'sender';
	const recipientField = me.type === 'parent' ? 'recipient_parent' : 'recipient';
	const filter = pb.filter(`(${recipientField} = {:me} || ${senderField} = {:me}) && group = ''`, {
		me: me.id,
	});
	pb
		.collection('chat_messages')
		.subscribe<ChatMessage>('*', (e) => onChange(e.action, e.record), { filter })
		.then((fn) => {
			if (wantUnsub) {
				try {
					fn();
				} catch {}
				return;
			}
			unsub = fn;
		})
		.catch(() => {});
	return () => {
		wantUnsub = true;
		if (unsub) {
			try {
				unsub();
			} catch {}
			unsub = null;
		}
	};
}

// ---------------------------------------------------------------------------
// Group chat
// ---------------------------------------------------------------------------

/** Daftar grup tempat aktor ini menjadi anggota, beserta metadata. */
export async function listGroups(me: ChatActor): Promise<ChatGroupWithMeta[]> {
	const groups = await pb.collection('chat_groups').getFullList<ChatGroup>({
		sort: '-updated',
		requestKey: null,
	});
	if (groups.length === 0) return [];
	const myKey = actorKey(me);

	const withMeta = await Promise.all(
		groups.map(async (g) => {
			const members = await pb.collection('chat_group_members').getFullList<ChatGroupMember>({
				filter: pb.filter('group = {:gid}', { gid: g.id }),
				requestKey: null,
			});
			const msgs = await pb.collection('chat_messages').getFullList<ChatMessage>({
				filter: pb.filter('group = {:gid}', { gid: g.id }),
				sort: '-created',
				requestKey: null,
			});
			const lastMessage = msgs[0];
			const unread = msgs.filter((m) => {
				if (isMine(m, me)) return false;
				const rb = Array.isArray(m.read_by) ? m.read_by : [];
				return !rb.includes(myKey);
			}).length;
			return { ...g, members, unread, lastMessage } as ChatGroupWithMeta;
		}),
	);
	return withMeta;
}

/** Membuat grup baru beserta seluruh anggota (termasuk pembuat). */
export async function createGroup(
	companyId: string,
	owner: ChatActor,
	ownerName: string,
	name: string,
	participants: ChatPeer[],
): Promise<ChatGroupWithMeta> {
	const group = await pb.collection('chat_groups').create<ChatGroup>(
		{
			name,
			company: companyId,
			owner: owner.id,
			members: [],
		},
		{ requestKey: null },
	);

	const allParticipants: Array<{ id: string; type: ActorType; name: string }> = [
		{ id: owner.id, type: owner.type, name: ownerName },
		...participants.map((p) => ({ id: p.id, type: p.type, name: p.name })),
	];

	const memberRecords = await Promise.all(
		allParticipants.map((p, i) =>
			pb.collection('chat_group_members').create<ChatGroupMember>(
				{
					group: group.id,
					user: p.type === 'user' ? p.id : '',
					parent: p.type === 'parent' ? p.id : '',
					name: p.name,
					type: p.type,
				},
				{ requestKey: `gm-${group.id}-${i}` },
			),
		),
	);

	const updated = await pb.collection('chat_groups').update<ChatGroup>(
		group.id,
		{ members: memberRecords.map((m) => m.id) },
		{ requestKey: null },
	);

	return { ...updated, members: memberRecords, unread: 0, lastMessage: undefined };
}

/** Riwayat pesan grup, urut paling lama. */
export async function loadGroupMessages(groupId: string): Promise<ChatMessage[]> {
	const list = await pb.collection('chat_messages').getFullList<ChatMessage>({
		filter: pb.filter('group = {:gid}', { gid: groupId }),
		sort: 'created',
		requestKey: null,
	});
	return list;
}

/** Kirim pesan ke grup. */
export async function sendGroupMessage(
	groupId: string,
	companyId: string,
	sender: ChatActor,
	text: string,
	file?: File,
): Promise<ChatMessage> {
	const base: Record<string, unknown> = {
		company: companyId,
		text,
		read: false,
		group: groupId,
		read_by: [],
	};
	if (sender.type === 'parent') {
		base.sender_parent = sender.id;
	} else {
		base.sender = sender.id;
	}

	if (file) {
		const fd = new FormData();
		for (const [key, value] of Object.entries(base)) {
			fd.append(key, String(value));
		}
		fd.append('attachment', file);
		return pb.collection('chat_messages').create<ChatMessage>(fd, { requestKey: null });
	}
	return pb.collection('chat_messages').create<ChatMessage>(base, { requestKey: null });
}

/** Tandai pesan grup yang belum dibaca aktor ini sebagai sudah dibaca. */
export async function markGroupRead(groupId: string, me: ChatActor): Promise<void> {
	const myKey = actorKey(me);
	const msgs = await pb.collection('chat_messages').getFullList<ChatMessage>({
		filter: pb.filter('group = {:gid}', { gid: groupId }),
		requestKey: null,
	});
	const toUpdate = msgs.filter((m) => {
		if (isMine(m, me)) return false;
		const rb = Array.isArray(m.read_by) ? m.read_by : [];
		return !rb.includes(myKey);
	});
	await Promise.all(
		toUpdate.map((m, i) =>
			pb.collection('chat_messages').update(
				m.id,
				{ read_by: [...(Array.isArray(m.read_by) ? m.read_by : []), myKey] },
				{ requestKey: `gr-${m.id}-${i}` },
			),
		),
	);
}

/** Berlangganan pesan baru pada sebuah grup. */
export function subscribeToGroupMessages(
	groupId: string,
	onChange: (action: string, record: ChatMessage) => void,
): () => void {
	let unsub: (() => void) | null = null;
	let wantUnsub = false;
	const filter = pb.filter('group = {:gid}', { gid: groupId });
	pb
		.collection('chat_messages')
		.subscribe<ChatMessage>('*', (e) => onChange(e.action, e.record), { filter })
		.then((fn) => {
			if (wantUnsub) {
				try {
					fn();
				} catch {}
				return;
			}
			unsub = fn;
		})
		.catch(() => {});
	return () => {
		wantUnsub = true;
		if (unsub) {
			try {
				unsub();
			} catch {}
			unsub = null;
		}
	};
}

// ---------------------------------------------------------------------------
// Typing indicator (employee chat only)
// ---------------------------------------------------------------------------

export interface ChatTyping {
	id: string;
	sender: string;
	sender_parent: string;
	sender_name: string;
	actor_key: string;
	company: string;
	recipient: string;
	recipient_parent: string;
	group: string;
	scope: string;
	created: string;
	updated: string;
}

/** Batas waktu status pengetikan dianggap aktif (ms). */
export const TYPING_FRESH_MS = 4000;

/** Kunci cakupan percakapan langsung antara dua aktor (stabil, terurut). */
export function directTypingScope(a: ChatActor, b: ChatActor): string {
	const ka = actorKey(a);
	const kb = actorKey(b);
	return `direct:${[ka, kb].sort().join('|')}`;
}

/** Kunci cakupan percakapan grup. */
export function groupTypingScope(groupId: string): string {
	return `group:${groupId}`;
}

/** Apakah record pengetikan ini dimiliki oleh aktor ini. */
export function isOwnTyping(record: ChatTyping, me: ChatActor): boolean {
	return (me.type === 'user' && record.sender === me.id) ||
		(me.type === 'parent' && record.sender_parent === me.id);
}

/** Apakah record pengetikan masih segar (belum kedaluwarsa). */
export function isTypingFresh(record: ChatTyping, now = Date.now()): boolean {
	try {
		return now - new Date(record.updated).getTime() < TYPING_FRESH_MS;
	} catch {
		return false;
	}
}

/**
 * Menandai bahwa aktor sedang mengetik pada sebuah percakapan.
 * Membuat record bila belum ada, atau menyentuh `updated` bila sudah ada.
 * `peer` wajib untuk percakapan langsung; `groupId` wajib untuk grup.
 */
export async function setTyping(
	companyId: string,
	me: ChatActor,
	name: string,
	peer: ChatActor | null,
	groupId: string | null,
): Promise<void> {
	const scope = peer ? directTypingScope(me, peer) : groupTypingScope(groupId ?? '');
	const key = actorKey(me);
	const base: Record<string, unknown> = {
		company: companyId,
		scope,
		actor_key: key,
		sender_name: name,
	};
	if (me.type === 'parent') {
		base.sender_parent = me.id;
	} else {
		base.sender = me.id;
	}
	if (peer) {
		if (peer.type === 'parent') {
			base.recipient_parent = peer.id;
		} else {
			base.recipient = peer.id;
		}
	}
	if (groupId) {
		base.group = groupId;
	}

	try {
		const existing = await pb.collection('chat_typing').getFirstListItem<ChatTyping>(
			pb.filter('scope = {:scope} && actor_key = {:key}', { scope, key }),
			{ requestKey: null },
		);
		await pb.collection('chat_typing').update(existing.id, { sender_name: name }, { requestKey: null });
		return;
	} catch {
		// belum ada record, lanjut buat
	}

	try {
		await pb.collection('chat_typing').create<ChatTyping>(base, { requestKey: null });
	} catch {
		// mungkin dibuat bersamaan; sentuh saja
		try {
			const existing = await pb.collection('chat_typing').getFirstListItem<ChatTyping>(
				pb.filter('scope = {:scope} && actor_key = {:key}', { scope, key }),
				{ requestKey: null },
			);
			await pb.collection('chat_typing').update(existing.id, { sender_name: name }, { requestKey: null });
		} catch {
			// abaikan — indikator non-kritis
		}
	}
}

/** Menghapus status pengetikan aktor pada sebuah percakapan. */
export async function clearTyping(
	me: ChatActor,
	peer: ChatActor | null,
	groupId: string | null,
): Promise<void> {
	const scope = peer ? directTypingScope(me, peer) : groupTypingScope(groupId ?? '');
	const key = actorKey(me);
	try {
		const existing = await pb.collection('chat_typing').getFirstListItem<ChatTyping>(
			pb.filter('scope = {:scope} && actor_key = {:key}', { scope, key }),
			{ requestKey: null },
		);
		await pb.collection('chat_typing').delete(existing.id, { requestKey: null });
	} catch {
		// tidak ada record, tidak perlu dihapus
	}
}

/**
 * Berlangganan perubahan status pengetikan pada sebuah cakupan percakapan.
 * Memuat daftar awal lalu memperbarui setiap perubahan realtime.
 */
export function subscribeToTyping(
	scope: string,
	onChange: (records: ChatTyping[]) => void,
): () => void {
	let unsub: (() => void) | null = null;
	let wantUnsub = false;
	const filter = pb.filter('scope = {:scope}', { scope });

	const load = () => {
		pb.collection('chat_typing')
			.getFullList<ChatTyping>({ filter, requestKey: null })
			.then(onChange)
			.catch(() => {});
	};

	load();

	pb
		.collection('chat_typing')
		.subscribe('*', () => load(), { filter })
		.then((fn) => {
			if (wantUnsub) {
				try {
					fn();
				} catch {}
				return;
			}
			unsub = fn;
		})
		.catch(() => {});

	return () => {
		wantUnsub = true;
		if (unsub) {
			try {
				unsub();
			} catch {}
			unsub = null;
		}
	};
}

/** Nama tampilan pengirim sebuah pesan (untuk grup). */
export function messageSenderName(m: ChatMessage, members: ChatGroupMember[], fallback: string): string {
	if (m.sender_parent) {
		const mem = members.find((x) => x.parent === m.sender_parent);
		return mem?.name ?? 'Parent';
	}
	if (m.sender) {
		const mem = members.find((x) => x.user === m.sender);
		return mem?.name ?? fallback;
	}
	return fallback;
}
