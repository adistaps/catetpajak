import pb from '@/lib/pocketbase-client';
import type { ChatActor } from '@/lib/chat';

export type CallType = 'voice' | 'video';

export interface CallSignal {
	id: string;
	call_id: string;
	caller: string;
	recipient: string;
	caller_parent: string;
	recipient_parent: string;
	company: string;
	type: string;
	call_type: string;
	data: string;
	created: string;
	updated: string;
}

/** Hasilkan ID unik untuk sebuah sesi panggilan. */
export function generateCallId(): string {
	return `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Field dasar sebuah sinyal panggilan (konsisten antara caller & recipient). */
function signalFields(
	companyId: string,
	caller: ChatActor,
	recipient: ChatActor,
	callId: string,
	callType: CallType,
): Record<string, unknown> {
	const base: Record<string, unknown> = {
		call_id: callId,
		company: companyId,
		call_type: callType,
	};
	if (caller.type === 'user') {
		base.caller = caller.id;
	} else {
		base.caller_parent = caller.id;
	}
	if (recipient.type === 'user') {
		base.recipient = recipient.id;
	} else {
		base.recipient_parent = recipient.id;
	}
	return base;
}

/** Kirim sebuah sinyal panggilan (offer/answer/ice/end/reject/busy/cancel). */
export async function sendSignal(
	companyId: string,
	caller: ChatActor,
	recipient: ChatActor,
	callId: string,
	callType: CallType,
	type: string,
	data: string = '',
): Promise<void> {
	const fields = signalFields(companyId, caller, recipient, callId, callType);
	await pb.collection('call_signals').create<CallSignal>(
		{ ...fields, type, data },
		{ requestKey: null },
	);
}

/**
 * Memicu notifikasi Web Push panggilan masuk ke penerima. Dipanggil browser
 * penelepon setelah membuat sinyal offer. Fire-and-forget — kegagalan push
 * tidak memengaruhi sinyal panggilan yang sudah dibuat. Route /api/push-call
 * mengambil penerima dari rekam offer berdasarkan call_id yang acak.
 */
export async function triggerCallPush(
	callId: string,
	callerName: string,
	callType: CallType,
): Promise<void> {
	try {
		await fetch('/api/push-call', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${pb.authStore.token}`,
			},
			body: JSON.stringify({ callId, callerName, callType }),
		});
	} catch {
		// abaikan — push bersifat best-effort
	}
}

/**
 * Mengurai tanggal PocketBase yang mungkin menggunakan pemisah spasi
 * ("YYYY-MM-DD HH:MM:SS.sssZ") menjadi milidetik epoch. Mengembalikan 0 bila
 * tidak terurai agar pemanggil memperlakukannya sebagai segar (bukan kedaluwarsa).
 */
function parseCallDate(value: string): number {
	if (!value) return 0;
	try {
		const iso = value.includes('T') ? value : value.replace(' ', 'T');
		const ms = new Date(iso).getTime();
		return Number.isNaN(ms) ? 0 : ms;
	} catch {
		return 0;
	}
}

/**
 * Berlangganan sinyal offer (panggilan masuk) yang ditujukan untuk aktor ini.
 * Hanya sinyal type=offer dengan recipient = aktor ini yang memicu callback.
 *
 * Selain langganan realtime, polling berkala sebagai cadangan memastikan offer
 * tetap diterima meskipun SSE tidak terhubung/drop atau terhubung setelah offer
 * dibuat. Panggilan yang sudah berakhir (ada sinyal end/reject/cancel/busy) atau
 * offer kedaluwarsa (>60 detik) diabaikan agar tidak muncul kembali.
 *
 * Filter disederhanakan ke `recipient = me` saja (type diperiksa di klien) agar
 * tetap kompatibel lintas versi PocketBase, dan tanggal offer diurai secara
 * toleran sehingga offer tidak pernah terlewat hanya karena format tanggal.
 */
export function subscribeToIncomingCalls(
	me: ChatActor,
	onSignal: (signal: CallSignal) => void,
): () => void {
	let stopped = false;
	let unsub: (() => void) | null = null;
	let wantUnsub = false;
	const recipientField = me.type === 'parent' ? 'recipient_parent' : 'recipient';
	const seenCallIds = new Set<string>();

	const handleOffer = (signal: CallSignal) => {
		if (stopped) return;
		if (signal.type !== 'offer') return;
		if (seenCallIds.has(signal.call_id)) return;
		seenCallIds.add(signal.call_id);
		onSignal(signal);
	};

	// Langganan realtime (utama). Filter hanya recipient; type divalidasi di klien.
	pb
		.collection('call_signals')
		.subscribe(
			'*',
			(e) => {
				if (e.action === 'create') handleOffer(e.record as unknown as CallSignal);
			},
			{ filter: pb.filter(`${recipientField} = {:me}`, { me: me.id }) },
		)
		.then((fn) => {
			if (wantUnsub || stopped) {
				try {
					fn();
				} catch {
					// abaikan
				}
				return;
			}
			unsub = fn;
		})
		.catch(() => {});

	// Polling cadangan — menangkap offer yang terlewat oleh realtime. Mengambil
	// seluruh sinyal untuk penerima lalu mengelompokkan per call_id di klien.
	const poll = async () => {
		if (stopped) return;
		try {
			const signals = await pb.collection('call_signals').getFullList<CallSignal>({
				filter: pb.filter(`${recipientField} = {:me}`, { me: me.id }),
				sort: '-created',
				requestKey: null,
			});
			const byCall = new Map<string, CallSignal[]>();
			for (const s of signals) {
				const arr = byCall.get(s.call_id);
				if (arr) arr.push(s);
				else byCall.set(s.call_id, [s]);
			}
			const now = Date.now();
			for (const [callId, sigs] of byCall) {
				if (seenCallIds.has(callId)) continue;
				const hasEnded = sigs.some(
					(s) =>
						s.type === 'end' ||
						s.type === 'reject' ||
						s.type === 'cancel' ||
						s.type === 'busy',
				);
				if (hasEnded) {
					seenCallIds.add(callId);
					continue;
				}
				const offer = sigs.find((s) => s.type === 'offer');
				if (!offer) continue;
				const createdMs = parseCallDate(offer.created);
				const age = createdMs ? now - createdMs : 0;
				if (age > 60000) {
					seenCallIds.add(callId);
					continue;
				}
				handleOffer(offer);
			}
		} catch {
			// abaikan
		}
	};
	void poll();
	const interval = setInterval(() => void poll(), 2000);

	return () => {
		stopped = true;
		wantUnsub = true;
		clearInterval(interval);
		if (unsub) {
			try {
				unsub();
			} catch {
				// abaikan
			}
			unsub = null;
		}
	};
}

/**
 * Berlangganan semua sinyal untuk sebuah sesi panggilan (berdasarkan call_id).
 * Memuat sinyal yang sudah ada lalu memperbarui setiap perubahan realtime.
 * Polling berkala sebagai cadangan memastikan sinyal answer/ice/end tetap
 * diterima meskipun realtime tidak mengirimkannya.
 */
export function subscribeToCall(
	callId: string,
	onSignal: (action: string, signal: CallSignal) => void,
): () => void {
	let stopped = false;
	let unsub: (() => void) | null = null;
	let wantUnsub = false;
	const filter = pb.filter('call_id = {:callId}', { callId });
	const seenIds = new Set<string>();

	const handle = (action: string, signal: CallSignal) => {
		if (stopped) return;
		if (action === 'delete') return;
		if (seenIds.has(signal.id)) return;
		seenIds.add(signal.id);
		onSignal(action, signal);
	};

	// Muat sinyal yang sudah ada (mis. offer yang sudah tersimpan sebelum langganan).
	pb
		.collection('call_signals')
		.getFullList<CallSignal>({ filter, requestKey: null })
		.then((list) => {
			for (const s of list) handle('create', s);
		})
		.catch(() => {});

	pb
		.collection('call_signals')
		.subscribe(
			'*',
			(e) => {
				handle(e.action, e.record as unknown as CallSignal);
			},
			{ filter },
		)
		.then((fn) => {
			if (wantUnsub || stopped) {
				try {
					fn();
				} catch {
					// abaikan
				}
				return;
			}
			unsub = fn;
		})
		.catch(() => {});

	// Polling cadangan — menangkap sinyal yang terlewat oleh realtime.
	const poll = async () => {
		if (stopped) return;
		try {
			const list = await pb.collection('call_signals').getFullList<CallSignal>({
				filter,
				sort: 'created',
				requestKey: null,
			});
			for (const s of list) handle('create', s);
		} catch {
			// abaikan
		}
	};
	const interval = setInterval(() => void poll(), 2000);

	return () => {
		stopped = true;
		wantUnsub = true;
		clearInterval(interval);
		if (unsub) {
			try {
				unsub();
			} catch {
				// abaikan
			}
			unsub = null;
		}
	};
}

/** Hapus semua sinyal untuk sebuah sesi panggilan (pembersihan pasca-panggilan). */
export async function deleteCallSignals(callId: string): Promise<void> {
	try {
		const list = await pb.collection('call_signals').getFullList<CallSignal>({
			filter: pb.filter('call_id = {:callId}', { callId }),
			requestKey: null,
		});
		await Promise.all(
			list.map((s, i) =>
				pb.collection('call_signals').delete(s.id, { requestKey: `del-${s.id}-${i}` }),
			),
		);
	} catch {
		// abaikan — pembersihan non-kritis
	}
}
