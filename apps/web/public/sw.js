/* Service worker untuk Web Push (notifikasi panggilan masuk).
 *
 * Pada iOS, push hanya sampai ke perangkat saat browser ditutup jika situs
 * sudah ditambahkan ke Layar Utama (PWA) dan izin notifikasi diberikan.
 * Klik notifikasi membuka kembali aplikasi agar panggilan dapat dijawab.
 */
self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	let payload = {};
	try {
		payload = event.data ? event.data.json() : {};
	} catch (_) {
		payload = {};
	}
	const callType = payload.callType;
	const title =
		callType === 'video' ? 'Panggilan video masuk' : 'Panggilan suara masuk';
	const body = payload.callerName
		? `${payload.callerName} menelepon Anda. Ketuk untuk menjawab.`
		: 'Ada panggilan masuk. Ketuk untuk menjawab.';
	const options = {
		body,
		tag: payload.callId || 'incoming-call',
		requireInteraction: true,
		data: payload,
		icon: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/0f8b2f91-be6a-4b1f-a18f-14cc0d046713.png',
		badge: 'https://images.hostinger.com/e004d724-5412-4405-a84c-c90ca3307fb3/0f8b2f91-be6a-4b1f-a18f-14cc0d046713.png',
		vibrate: [400, 200, 400, 200, 400],
	};
	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const data = event.notification.data || {};
	const targetUrl = data.targetPath || '/app';
	event.waitUntil(
		(async () => {
			const allClients = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true,
			});
			for (const client of allClients) {
				if ('focus' in client) {
					try {
						await client.focus();
					} catch (_) {
						// abaikan
					}
				}
			}
			if (allClients.length === 0) {
				try {
					await self.clients.openWindow(targetUrl);
				} catch (_) {
					// abaikan
				}
			}
		})(),
	);
});
