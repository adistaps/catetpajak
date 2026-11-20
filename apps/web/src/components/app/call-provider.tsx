import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import type { ChatActor, ChatPeer } from '@/lib/chat';
import {
	type CallSignal,
	type CallType,
	generateCallId,
	sendSignal,
	subscribeToIncomingCalls,
} from '@/lib/calls';
import { CallOverlay, type CallSession } from '@/components/app/call-overlay';
import { CallNotificationBanner } from '@/components/app/call-notification-banner';
import { unlockCallAudio } from '@/lib/call-notifications';
import { ensurePushSubscription } from '@/lib/push-subscription';

interface CallContextValue {
	callSession: CallSession | null;
	startCall: (peer: ChatPeer, callType: CallType) => void;
	endCall: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

const NOOP: CallContextValue = {
	callSession: null,
	startCall: () => {},
	endCall: () => {},
};

/** Akses manajer panggilan global. Boleh dipanggil di luar <CallProvider>. */
export function useCall(): CallContextValue {
	const ctx = useContext(CallContext);
	return ctx ?? NOOP;
}

/**
 * Selesaikan data peer dari sinyal panggilan masuk. Nama diambil dari rekam
 * pengguna/parent; jabatan karyawan diambil bila tersedia agar header overlay
 * menampilkan informasi yang sama dengan daftar percakapan.
 */
async function resolvePeer(signal: CallSignal, companyId: string): Promise<ChatPeer> {
	const isParent = Boolean(signal.caller_parent);
	const callerId = signal.caller_parent || signal.caller;
	try {
		if (isParent) {
			const rec = await pb.collection('parents').getOne(callerId, { requestKey: null });
			return {
				id: callerId,
				type: 'parent',
				name: rec.name || rec.email || 'Parent',
				email: rec.email || '',
			};
		}
		const rec = await pb.collection('users').getOne(callerId, { requestKey: null });
		const peer: ChatPeer = {
			id: callerId,
			type: 'user',
			name: rec.name || rec.email || 'Anggota',
			email: rec.email || '',
		};
		try {
			const emp = await pb.collection('employees').getFirstListItem(
				pb.filter('user = {:user} && company = {:company}', { user: callerId, company: companyId }),
				{ requestKey: null },
			);
			if (emp.position) peer.position = emp.position;
		} catch {
			// jabatan tidak wajib
		}
		return peer;
	} catch {
		return {
			id: callerId,
			type: isParent ? 'parent' : 'user',
			name: isParent ? 'Parent' : 'Anggota',
			email: '',
		};
	}
}

interface CallProviderProps {
	companyId: string | null;
	children: ReactNode;
}

/**
 * Manajer panggilan suara/video tingkat aplikasi. Berlangganan undangan
 * panggilan masuk sekali per sesi (bukan per halaman Chat) sehingga pengguna
 * tetap dapat menerima panggilan meski sedang berada di halaman lain.
 * CallOverlay dirender secara global dan menutupi seluruh aplikasi.
 */
export function CallProvider({ companyId, children }: CallProviderProps) {
	const { user } = useAuth();
	const myId = user?.id ?? pb.authStore.record?.id ?? '';
	const me: ChatActor = useMemo(() => ({ id: myId, type: 'user' }), [myId]);
	const myName = user?.name || user?.email || 'Saya';

	const [callSession, setCallSession] = useState<CallSession | null>(null);
	const callSessionRef = useRef<CallSession | null>(null);
	callSessionRef.current = callSession;

	// Buka kunci audio pada gestur pertama pengguna. Browser mobile
	// melarang AudioContext berjalan tanpa gestur, sehingga nada dering
	// panggilan masuk tidak akan terdengar tanpa langkah ini. Dipasang sekali
	// dan dihapus saat unmount.
	useEffect(() => {
		const handler = () => unlockCallAudio();
		window.addEventListener('pointerdown', handler, { once: true });
		window.addEventListener('touchend', handler, { once: true });
		window.addEventListener('keydown', handler, { once: true });
		return () => {
			window.removeEventListener('pointerdown', handler);
			window.removeEventListener('touchend', handler);
			window.removeEventListener('keydown', handler);
		};
	}, []);

	// Daftarkan langganan Web Push sekali per sesi login agar panggilan masuk
	// dapat sampai ke perangkat meski browser ditutup (iOS PWA / desktop).
	// Tidak meminta izin — pemintaan izin dilakukan dari gestur pengguna di
	// CallNotificationBanner; di sini hanya mendaftar bila izin sudah granted.
	useEffect(() => {
		if (!myId) return;
		void ensurePushSubscription();
	}, [myId]);

	const startCall = useCallback((peer: ChatPeer, callType: CallType) => {
		setCallSession({
			callId: generateCallId(),
			peer,
			callType,
			direction: 'outgoing',
		});
	}, []);

	const endCall = useCallback(() => {
		setCallSession(null);
	}, []);

	// Simpan aktor & companyId terbaru di ref agar callback langganan (yang
	// dibuat sekali) selalu melihat nilai terkini tanpa perlu berlangganan ulang.
	const meRef = useRef(me);
	meRef.current = me;
	const companyIdRef = useRef(companyId);
	companyIdRef.current = companyId;

	// Berlangganan panggilan masuk selama ada perusahaan aktif. Langganan ini
	// aktif di seluruh halaman /app, bukan hanya saat menu Chat terbuka.
	useEffect(() => {
		if (!myId || !companyId) return;
		return subscribeToIncomingCalls(me, (signal) => {
			const activeCompanyId = companyIdRef.current;
			const actor = meRef.current;
			if (!activeCompanyId || !actor) return;
			// Panggilan sudah aktif → tolak otomatis sebagai sibuk.
			if (callSessionRef.current) {
				const callerActor: ChatActor = signal.caller_parent
					? { id: signal.caller_parent, type: 'parent' }
					: { id: signal.caller, type: 'user' };
				void sendSignal(
					activeCompanyId,
					callerActor,
					actor,
					signal.call_id,
					signal.call_type as CallType,
					'busy',
				);
				return;
			}
			void (async () => {
				const peer = await resolvePeer(signal, activeCompanyId);
				// Sebuah panggilan bisa saja sudah aktif sementara nama peer
				// sedang diambil; jangan menimpa sesi yang sudah berjalan.
				if (callSessionRef.current) return;
				setCallSession({
					callId: signal.call_id,
					peer,
					callType: signal.call_type as CallType,
					direction: 'incoming',
					offerSignal: signal,
				});
			})();
		});
	}, [me, myId, companyId]);

	// Notifikasi singkat saat panggilan masuk diterima (tambahan visibilitas).
	useEffect(() => {
		if (callSession?.direction === 'incoming') {
			toast.info(`Panggilan masuk dari ${callSession.peer.name}`, {
				duration: 4000,
			});
		}
	}, [callSession]);

	const value = useMemo<CallContextValue>(
		() => ({ callSession, startCall, endCall }),
		[callSession, startCall, endCall],
	);

	return (
		<CallContext.Provider value={value}>
			{children}
			<CallNotificationBanner />
			{callSession && companyId ? (
				<CallOverlay
					session={callSession}
					me={me}
					myName={myName}
					companyId={companyId}
					onEnd={endCall}
				/>
			) : null}
		</CallContext.Provider>
	);
}
