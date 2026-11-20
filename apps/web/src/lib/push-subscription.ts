/**
 * Pendaftaran langganan Web Push di sisi klien.
 *
 * Mendaftarkan service worker `/sw.js`, membuat langganan Push API dengan kunci
 * publik VAPID, lalu menyimpannya ke koleksi `push_subscriptions` melalui
 * PocketBase (atururan koleksi memastikan pengguna hanya dapat mendaftarkan
 * langganan miliknya sendiri).
 *
 * Pada iOS, langganan ini hanya berguna jika situs sudah ditambahkan ke Layar
 * Utama (PWA) dan izin notifikasi sudah diberikan — lihat CallNotificationBanner.
 */
import pb from '@/lib/pocketbase-client';

const SW_PATH = '/sw.js';
const REGISTERED_KEY = 'bukubesar.pushRegisteredEndpoint';

function urlBase64ToUint8Array(base64String: string) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const array = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i += 1) {
		array[i] = raw.charCodeAt(i);
	}
	return array;
}

export function isPushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window
	);
}

export function isIOS(): boolean {
	if (typeof window === 'undefined' || !navigator) return false;
	const ua = navigator.userAgent || '';
	const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
	const isModernIPad =
		/Macintosh/.test(ua) && 'ontouchend' in document && navigator.maxTouchPoints > 1;
	return (isIOSDevice || isModernIPad) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	const nav = navigator as unknown as { standalone?: boolean };
	if (nav.standalone === true) return true;
	return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

/**
 * Mendaftarkan langganan push bila izin notifikasi sudah granted. Tidak meminta
 * izin — pemintaan izin harus dari gestur pengguna (lihat CallNotificationBanner).
 */
export async function ensurePushSubscription(): Promise<void> {
	if (!isPushSupported()) return;
	const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
	if (!publicKey) return;
	if (Notification.permission !== 'granted') return;
	const record = pb.authStore.record;
	if (!record) return;

	try {
		const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
		await navigator.serviceWorker.ready;
		let sub = await reg.pushManager.getSubscription();
		if (!sub) {
			sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(publicKey),
			});
		}
		await persistSubscription(sub);
	} catch {
		// abaikan — pengguna mungkin menolak, atau browser tidak mendukung
	}
}

async function persistSubscription(sub: PushSubscription): Promise<void> {
	const json = sub.toJSON();
	const endpoint = json.endpoint;
	const keys = json.keys || {};
	const p256dh = keys.p256dh || '';
	const auth = keys.auth || '';
	if (!endpoint || !p256dh || !auth) return;
	const record = pb.authStore.record;
	if (!record) return;

	// Hindari penulisan berulang: simpan endpoint yang sudah terdaftar.
	let lastEndpoint = '';
	try {
		lastEndpoint = window.localStorage.getItem(REGISTERED_KEY) || '';
	} catch {
		// abaikan
	}
	if (lastEndpoint === endpoint) return;

	try {
		await pb.collection('push_subscriptions').create({
			endpoint,
			p256dh,
			auth_key: auth,
			subscriber_id: record.id,
			subscriber_type: record.collectionName,
			device_label: navigator.userAgent,
		});
		try {
			window.localStorage.setItem(REGISTERED_KEY, endpoint);
		} catch {
			// abaikan
		}
	} catch {
		// Kemungkinan unique constraint (endpoint sudah terdaftar) — anggap sukses.
		try {
			window.localStorage.setItem(REGISTERED_KEY, endpoint);
		} catch {
			// abaikan
		}
	}
}
