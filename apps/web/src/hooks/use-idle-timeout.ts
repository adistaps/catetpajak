import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import pb from '@/lib/pocketbase-client';

/**
 * Batas waktu idle sebelum sesi otomatis diakhiri: 90 menit.
 */
const DEFAULT_IDLE_LIMIT_MS = 90 * 60 * 1000;

/**
 * Peristiwa yang dianggap sebagai aktivitas pengguna. Setiap peristiwa ini
 * memulai ulang hitung mundur idle.
 */
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
	'mousemove',
	'mousedown',
	'keydown',
	'scroll',
	'touchstart',
	'click',
];

/**
 * Mengakhiri sesi pengguna secara otomatis setelah tidak ada aktivitas selama
 * `limitMs` (default 90 menit). Aktivitas apa pun (gerak kursor, ketik, gulir,
 * klik, sentuh) memulai ulang hitung mundur. Saat batas tercapai, sesi
 * PocketBase dibersihkan dan pengguna diarahkan ke halaman masuk yang sesuai
 * (portal parent untuk sesi parent, halaman masuk untuk pengguna lain).
 *
 * Dipasang sekali di root layout sehingga mencakup seluruh area terautentikasi
 * (/app, /app/parent/*, /admin-pusat). Tidak ada keluaran visual, jadi aman
 * untuk hydration — hook hanya menjalankan efek di sisi klien.
 */
export function useIdleTimeout(limitMs = DEFAULT_IDLE_LIMIT_MS) {
	const navigate = useNavigate();
	const [authed, setAuthed] = useState(false);

	// Pantau perubahan status autentikasi agar timer hanya berjalan saat sesi
	// aktif, dan mulai/berhenti otomatis saat pengguna masuk/keluar.
	useEffect(() => {
		setAuthed(pb.authStore.isValid);
		return pb.authStore.onChange(() => setAuthed(pb.authStore.isValid));
	}, []);

	useEffect(() => {
		if (!authed) return;

		let timer: ReturnType<typeof setTimeout> | undefined;

		const endSession = () => {
			const wasParent = pb.authStore.record?.collectionName === 'parents';
			pb.authStore.clear();
			navigate(wasParent ? '/app/parent' : '/login', { replace: true });
		};

		const reset = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(endSession, limitMs);
		};

		ACTIVITY_EVENTS.forEach((event) => {
			window.addEventListener(event, reset, { passive: true });
		});
		reset();

		return () => {
			if (timer) clearTimeout(timer);
			ACTIVITY_EVENTS.forEach((event) => {
				window.removeEventListener(event, reset);
			});
		};
	}, [authed, limitMs, navigate]);
}

export default useIdleTimeout;
