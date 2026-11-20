import { useEffect, useState } from 'react';
import { Bell, ChevronDown, ChevronUp, Smartphone, X } from 'lucide-react';
import {
	getCallNotificationPermission,
	requestCallNotificationPermission,
	type CallNotificationState,
} from '@/lib/call-notifications';
import {
	ensurePushSubscription,
	isIOS,
	isPushSupported,
	isStandalone,
} from '@/lib/push-subscription';

const DISMISS_KEY = 'bukubesar.callNotifBannerDismissed';

/**
 * Banner yang menjelaskan kebutuhan izin notifikasi perangkat untuk panggilan
 * masuk saat aplikasi tidak aktif / browser ditutup.
 *
 * Pada iPhone, notifikasi panggilan hanya bisa masuk saat browser ditutup
 * apabila situs sudah ditambahkan ke Layar Utama (PWA) dan izin notifikasi
 * diizinkan. Banner ini memberikan langkah-langkah tersebut secara jelas dan
 * tidak mengasumsikan notifikasi latar belakang tersedia bila belum diizinkan
 * atau aplikasi belum dipasang.
 */
export function CallNotificationBanner() {
	const [permission, setPermission] = useState<CallNotificationState>('default');
	const [dismissed, setDismissed] = useState(false);
	const [ios, setIos] = useState(false);
	const [standalone, setStandalone] = useState(false);
	const [pushSupported, setPushSupported] = useState(false);
	const [showSteps, setShowSteps] = useState(false);

	useEffect(() => {
		setPermission(getCallNotificationPermission());
		setIos(isIOS());
		setStandalone(isStandalone());
		setPushSupported(isPushSupported());
		try {
			setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
		} catch {
			// abaikan
		}
	}, []);

	// Saat tab kembali aktif, cek ulang izin dan status pemasangan (pengguna
	// mungkin mengubahnya di luar aplikasi).
	useEffect(() => {
		const onVisibility = () => {
			if (!document.hidden) {
				setPermission(getCallNotificationPermission());
				setStandalone(isStandalone());
				setPushSupported(isPushSupported());
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, []);

	// Push sudah aktif: izin granted DAN (bukan iOS, atau sudah terpasang sebagai
	// PWA). Pada iOS non-PWA, Push API tidak tersedia meski izin diberikan.
	const pushActive =
		permission === 'granted' && pushSupported && (!ios || standalone);

	if (pushActive) return null;
	if (permission === 'unsupported' && !ios) return null;
	if (dismissed) return null;

	const isDenied = permission === 'denied';

	// iPhone yang belum ditambahkan ke Layar Utama: tampilkan langkah pemasangan.
	const needsInstall = ios && !standalone;

	const handleEnable = async () => {
		const result = await requestCallNotificationPermission();
		setPermission(result);
		setPushSupported(isPushSupported());
		if (result === 'granted') {
			await ensurePushSubscription();
			setStandalone(isStandalone());
		} else {
			try {
				window.localStorage.setItem(DISMISS_KEY, '1');
			} catch {
				// abaikan
			}
			setDismissed(true);
		}
	};

	const handleDismiss = () => {
		try {
			window.localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			// abaikan
		}
		setDismissed(true);
	};

	let description: string;
	if (needsInstall) {
		description =
			'Di iPhone, panggilan masuk hanya terlihat saat browser ditutup setelah aplikasi ditambahkan ke Layar Utama dan izin notifikasi diaktifkan.';
	} else if (isDenied) {
		description =
			'Notifikasi diblokir browser. Buka pengaturan izin situs dan izinkan notifikasi agar panggilan masuk terlihat saat Anda membuka aplikasi lain.';
	} else {
		description =
			'Anda akan diberi tahu saat ada panggilan masuk meski sedang membuka aplikasi atau tab lain, selama Anda masih login.';
	}

	return (
		<div className="fixed bottom-4 left-1/2 z-[150] flex w-[min(92vw,460px)] -translate-x-1/2 items-start gap-3 rounded-xl border border-emerald-200 bg-white p-3.5 shadow-lg">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
				{needsInstall ? <Smartphone className="size-4" /> : <Bell className="size-4" />}
			</span>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-semibold text-slate-800">
					{needsInstall ? 'Pasang aplikasi untuk notifikasi panggilan' : 'Aktifkan notifikasi panggilan'}
				</p>
				<p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>

				{needsInstall ? (
					<button
						type="button"
						onClick={() => setShowSteps(s => !s)}
						className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
					>
						{showSteps ? 'Sembunyikan langkah' : 'Lihat langkahnya'}
						{showSteps ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
					</button>
				) : null}

				{needsInstall && showSteps ? (
					<ol className="mt-2 space-y-1.5 rounded-lg bg-emerald-50/70 p-3 text-xs leading-relaxed text-slate-600">
						<li>
							<strong className="text-slate-800">1.</strong> Di Safari, ketuk tombol Bagikan
							(tombol kotak dengan panah ke atas) lalu pilih{' '}
							<strong className="text-slate-800">Tambahkan ke Layar Utama</strong>.
						</li>
						<li>
							<strong className="text-slate-800">2.</strong> Buka Catet Pajak dari ikon di Layar
							Utama (bukan dari Safari biasa).
						</li>
						<li>
							<strong className="text-slate-800">3.</strong> Masuk, lalu ketuk{' '}
							<strong className="text-slate-800">Aktifkan notifikasi</strong> di bawah dan izinkan
							notifikasi saat diminta.
						</li>
						<li>
							Setelah aktif, panggilan masuk akan muncul sebagai notifikasi meski browser ditutup,
							dan mengetuknya membuka aplikasi ke panggilan tersebut.
						</li>
					</ol>
				) : null}

				<div className="mt-2.5 flex items-center gap-2">
					{isDenied ? null : (
						<button
							type="button"
							onClick={() => void handleEnable()}
							className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
						>
							Aktifkan notifikasi
						</button>
					)}
					<button
						type="button"
						onClick={handleDismiss}
						className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
					>
						Nanti saja
					</button>
				</div>
			</div>
			<button
				type="button"
				onClick={handleDismiss}
				className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
				aria-label="Tutup"
			>
				<X className="size-4" />
			</button>
		</div>
	);
}
