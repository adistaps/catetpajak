/**
 * Notifikasi panggilan masuk tingkat perangkat. Memungkinkan penerima melihat
 * panggilan masuk meski tab/aplikasi tidak sedang aktif di layar, selama izin
 * notifikasi browser telah diberikan.
 *
 * Tidak boleh mengasumsikan notifikasi latar belakang tersedia — selalu cek
 * izin terlebih dahulu dan beri tahu pengguna bila izin belum diberikan.
 *
 * Catatan mobile: AudioContext pada browser mobile dibuat dalam keadaan
 * "suspended" dan hanya dapat di-resume melalui gestur pengguna. Karena
 * panggilan masuk bukan gestur pengguna, nada dering tidak akan terdengar
 * kecuali audio sudah di-"unlock" lebih dulu lewat interaksi pengguna
 * (lihat `unlockCallAudio`). Getaran (vibration) ditambahkan sebagai sinyal
 * cadangan khas perangkat mobile.
 */

export type CallNotificationState = 'granted' | 'denied' | 'default' | 'unsupported';

/** Status izin notifikasi perangkat saat ini. */
export function getCallNotificationPermission(): CallNotificationState {
	if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
	return Notification.permission as CallNotificationState;
}

/**
 * Meminta izin notifikasi. Harus dipanggil dari gestur pengguna (klik tombol).
 * Mengembalikan status akhir; bila ditolak, browser tidak dapat diminta lagi
 * lewat API — pengguna harus mengubahnya manual di pengaturan situs.
 */
export async function requestCallNotificationPermission(): Promise<CallNotificationState> {
	if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
	try {
		const result = await Notification.requestPermission();
		return result as CallNotificationState;
	} catch {
		return 'denied';
	}
}

let activeNotification: Notification | null = null;

/**
 * Menampilkan notifikasi panggilan masuk yang persisten (requireInteraction)
 * agar tetap terlihat sampai pengguna berinteraksi. Klik notifikasi akan
 * memfokuskan jendela aplikasi kembali. Hanya berjalan bila izin sudah granted.
 */
export function showIncomingCallNotification(
	peerName: string,
	callType: 'voice' | 'video',
): void {
	if (typeof window === 'undefined' || !('Notification' in window)) return;
	if (Notification.permission !== 'granted') return;
	try {
		closeIncomingCallNotification();
		const title =
			callType === 'video' ? 'Panggilan video masuk' : 'Panggilan suara masuk';
		activeNotification = new Notification(title, {
			body: `${peerName} menelepon Anda. Klik untuk membuka dan menjawab.`,
			tag: 'incoming-call',
			requireInteraction: true,
		});
		activeNotification.onclick = () => {
			try {
				window.focus();
			} catch {
				// abaikan
			}
			activeNotification?.close();
			activeNotification = null;
		};
	} catch {
		// abaikan — notifikasi tidak kritis, overlay tetap berjalan
	}
}

/** Menutup notifikasi panggilan masuk yang aktif (mis. saat dijawab/ditolak). */
export function closeIncomingCallNotification(): void {
	if (activeNotification) {
		try {
			activeNotification.close();
		} catch {
			// abaikan
		}
		activeNotification = null;
	}
}

// ---- AudioContext bersama (di-unlock lewat gestur) ----

let sharedCtx: AudioContext | null = null;
let ctxUnlocked = false;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	const AC =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!AC) return null;
	if (!sharedCtx) {
		try {
			sharedCtx = new AC();
		} catch {
			return null;
		}
	}
	return sharedCtx;
}

/**
 * Membuka kunci audio pada perangkat mobile. Wajib dipanggil dari gestur
 * pengguna (klik/sentuh) sekali setelah aplikasi dimuat, karena browser mobile
 * melarang AudioContext berjalan tanpa gestur. Setelah di-unlock, nada dering
 * panggilan masuk dapat diputar meski dipicu oleh event non-gestur.
 */
export function unlockCallAudio(): void {
	if (ctxUnlocked) return;
	const ctx = getAudioContext();
	if (!ctx) return;
	void ctx
		.resume()
		.then(() => {
			if (ctx.state === 'running') ctxUnlocked = true;
		})
		.catch(() => {
			// abaikan — akan dicoba lagi pada gestur berikutnya
		});
	// Putar buffer senyap untuk membuka kunci audio di iOS.
	try {
		const buffer = ctx.createBuffer(1, 1, 22050);
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		source.start(0);
	} catch {
		// abaikan
	}
}

// ---- Getaran (vibration) untuk panggilan masuk ----

let vibrateTimer: ReturnType<typeof setInterval> | null = null;

function startVibrate(): void {
	if (typeof window === 'undefined' || !('vibrate' in navigator)) return;
	try {
		navigator.vibrate([400, 200, 400, 200, 400]);
		vibrateTimer = setInterval(() => {
			try {
				navigator.vibrate([400, 200, 400, 200, 400]);
			} catch {
				// abaikan
			}
		}, 1200);
	} catch {
		// abaikan
	}
}

function stopVibrate(): void {
	if (vibrateTimer) {
		clearInterval(vibrateTimer);
		vibrateTimer = null;
	}
	if (typeof window !== 'undefined' && 'vibrate' in navigator) {
		try {
			navigator.vibrate(0);
		} catch {
			// abaikan
		}
	}
}

// ---- Nada dering panggilan masuk (Web Audio API) ----

let ringtoneTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Memulai nada dering berulang untuk panggilan masuk. Mengembalikan fungsi
 * penghenti (juga tersedia via stopCallRingtone). Aman dipanggil ulang —
 * memanggilnya lagi akan menghentikan nada sebelumnya terlebih dahulu.
 *
 * Pada perangkat mobile, AudioContext harus sudah di-unlock lewat gestur
 * pengguna (lihat `unlockCallAudio`); bila belum, nada mungkin tidak terdengar
 * namun getaran tetap berjalan sebagai sinyal cadangan.
 */
export function startCallRingtone(): () => void {
	if (typeof window === 'undefined') return () => stopCallRingtone();
	stopCallRingtone();
	const ctx = getAudioContext();
	if (!ctx) {
		// Tidak ada AudioContext — setidaknya beri getaran pada perangkat mobile.
		startVibrate();
		return stopCallRingtone;
	}
	// Coba resume (berhasil bila sudah di-unlock lewat gestur sebelumnya).
	void ctx.resume().catch(() => {
		// abaikan
	});

	const playBurst = () => {
		const c = sharedCtx;
		if (!c) return;
		const now = c.currentTime;
		// Dua nada berurutan menyerupai dering telepon.
		[880, 660].forEach((freq, i) => {
			const osc = c.createOscillator();
			const gain = c.createGain();
			osc.connect(gain);
			gain.connect(c.destination);
			osc.type = 'sine';
			osc.frequency.value = freq;
			const start = now + i * 0.18;
			gain.gain.setValueAtTime(0, start);
			gain.gain.linearRampToValueAtTime(0.22, start + 0.04);
			gain.gain.linearRampToValueAtTime(0, start + 0.16);
			osc.start(start);
			osc.stop(start + 0.18);
		});
	};

	playBurst();
	ringtoneTimer = setInterval(playBurst, 1400);
	startVibrate();
	return stopCallRingtone;
}

/** Menghentikan nada dering panggilan masuk. */
export function stopCallRingtone(): void {
	if (ringtoneTimer) {
		clearInterval(ringtoneTimer);
		ringtoneTimer = null;
	}
	stopVibrate();
	// Pertahankan sharedCtx agar dapat dipakai ulang; jangan ditutup.
}
