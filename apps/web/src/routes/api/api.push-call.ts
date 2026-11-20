import { withApi, readJsonBody, json } from '@/lib/api.server';
import pocketbaseAdmin from '@/lib/pocketbase-client.server';
import { sendCallPush } from '@/lib/web-push.server';

interface CallSignalRecord {
	id: string;
	recipient?: string;
	recipient_parent?: string;
}

interface PushSubRecord {
	id: string;
	endpoint: string;
	p256dh: string;
	auth_key: string;
	subscriber_id: string;
	subscriber_type: string;
}

/**
 * Mengirim notifikasi Web Push panggilan masuk ke semua langganan penerima.
 *
 * Pemanggil (browser penelepon) memanggil endpoint ini setelah membuat sinyal
 * offer. call_id bersifat acak dan tidak dapat ditebak, sehingga hanya pemanggil
 * asli yang dapat memicu push untuk panggilannya; penerima diambil dari rekam
 * offer itu sendiri agar tidak dapat dipalsukan.
 */
export const action = withApi(async ({ request }) => {
	const body = await readJsonBody<{
		callId?: unknown;
		callerName?: unknown;
		callType?: unknown;
	}>(request);

	const callId = typeof body.callId === 'string' ? body.callId.trim() : '';
	const callerName = typeof body.callerName === 'string' ? body.callerName.trim() : '';
	const callType = body.callType === 'video' ? 'video' : 'voice';

	if (!callId) {
		return json({ ok: false, reason: 'no-call-id' });
	}

	// Cari sinyal offer untuk call_id ini (superuser). call_id acak menjadi
	// kunci yang mengikat push ke panggilan yang benar-benar dibuat.
	let recipientId = '';
	let recipientType = 'users';
	try {
		const result = await pocketbaseAdmin.listRecords<CallSignalRecord>('call_signals', {
			filter: pocketbaseAdmin.filter('call_id = {:callId} && type = "offer"', { callId }),
			perPage: 1,
		});
		const offer = result.items[0];
		if (!offer) {
			return json({ ok: false, reason: 'no-offer' });
		}
		if (offer.recipient_parent) {
			recipientId = offer.recipient_parent;
			recipientType = 'parents';
		} else if (offer.recipient) {
			recipientId = offer.recipient;
			recipientType = 'users';
		}
	} catch {
		return json({ ok: false, reason: 'lookup-failed' });
	}

	if (!recipientId) {
		return json({ ok: false, reason: 'no-recipient' });
	}

	let subs: PushSubRecord[] = [];
	try {
		const result = await pocketbaseAdmin.listRecords<PushSubRecord>('push_subscriptions', {
			filter: pocketbaseAdmin.filter('subscriber_id = {:recipientId} && subscriber_type = {:recipientType}', { recipientId, recipientType }),
			perPage: 100,
		});
		subs = result.items;
	} catch {
		return json({ ok: false, reason: 'subs-failed' });
	}

	if (subs.length === 0) {
		return json({ ok: false, reason: 'no-subs' });
	}

	const payload = {
		callId,
		callerName,
		callType,
		targetPath: recipientType === 'parents' ? '/app/parent/dashboard' : '/app',
	};

	await Promise.all(
		subs.map(async (sub) => {
			try {
				await sendCallPush(sub, payload);
			} catch {
				// abaikan langganan yang gagal/expired — yang lain tetap dikirim
			}
		}),
	);

	return json({ ok: true, sent: subs.length });
});
