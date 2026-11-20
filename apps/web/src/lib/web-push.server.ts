/**
 * Pengiriman Web Push di sisi server menggunakan kunci VAPID.
 *
 * Kunci privat hanya dibaca di sini (process.env), tidak pernah dikirim ke
 * klien. Digunakan oleh route /api/push-call untuk mengirim notifikasi
 * panggilan masuk ke langganan penerima.
 */
import webpush from 'web-push';

let configured = false;

function ensureConfigured(): void {
	if (configured) return;
	const publicKey = process.env.VAPID_PUBLIC_KEY;
	const privateKey = process.env.VAPID_PRIVATE_KEY;
	const subject = process.env.VAPID_SUBJECT || 'mailto:info@catetpajak.com';
	if (!publicKey || !privateKey) {
		throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY belum dikonfigurasi di .env');
	}
	webpush.setVapidDetails(subject, publicKey, privateKey);
	configured = true;
}

export interface PushSubscriptionRecord {
	endpoint: string;
	p256dh: string;
	auth_key: string;
}

/**
 * Mengirim payload push ke satu langganan. Melempar error bila gagal agar
 * pemanggil dapat menangani langganan yang expired secara individual.
 */
export async function sendCallPush(
	sub: PushSubscriptionRecord,
	payload: Record<string, unknown>,
): Promise<void> {
	ensureConfigured();
	await webpush.sendNotification(
		{
			endpoint: sub.endpoint,
			keys: { p256dh: sub.p256dh, auth: sub.auth_key },
		},
		JSON.stringify(payload),
	);
}
