import { useCallback, useEffect, useRef, useState } from 'react';
import {
	Mic,
	MicOff,
	Phone,
	PhoneOff,
	Video,
	VideoOff,
} from 'lucide-react';
import type { ChatActor, ChatPeer } from '@/lib/chat';
import {
	type CallSignal,
	type CallType,
	deleteCallSignals,
	generateCallId,
	sendSignal,
	subscribeToCall,
	triggerCallPush,
} from '@/lib/calls';
import {
	closeIncomingCallNotification,
	showIncomingCallNotification,
	startCallRingtone,
	stopCallRingtone,
} from '@/lib/call-notifications';
import { cn } from '@/lib/utils';

export interface CallSession {
	callId: string;
	peer: ChatPeer;
	callType: CallType;
	direction: 'outgoing' | 'incoming';
	offerSignal?: CallSignal;
}

interface CallOverlayProps {
	session: CallSession;
	me: ChatActor;
	myName: string;
	companyId: string;
	onEnd: () => void;
}

type CallState = 'ringing' | 'connected' | 'ended';

const ICE_SERVERS: RTCIceServer[] = [
	{ urls: 'stun:stun.l.google.com:19302' },
	{ urls: 'stun:stun1.l.google.com:19302' },
];

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Overlay panggilan suara/video WebRTC. Menangani sinyal offer/answer/ice
 * melalui koleksi `call_signals`, serta kontrol bisukan, kamera, dan akhiri.
 */
export function CallOverlay({ session, me, myName, companyId, onEnd }: CallOverlayProps) {
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const localVideoRef = useRef<HTMLVideoElement | null>(null);
	const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
	const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
	const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
	const earlySignalsRef = useRef<CallSignal[]>([]);
	const remoteDescSetRef = useRef(false);
	const endedRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const [state, setState] = useState<CallState>('ringing');
	const [muted, setMuted] = useState(false);
	const [videoOff, setVideoOff] = useState(false);
	const [duration, setDuration] = useState(0);
	const [accepted, setAccepted] = useState(session.direction === 'outgoing');
	const [error, setError] = useState<string | null>(null);

	const peerActor: ChatActor = { id: session.peer.id, type: session.peer.type };
	const callCaller = session.direction === 'outgoing' ? me : peerActor;
	const callRecipient = session.direction === 'outgoing' ? peerActor : me;

	const cleanup = useCallback(() => {
		if (endedRef.current) return;
		endedRef.current = true;
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		const pc = pcRef.current;
		if (pc) {
			pc.ontrack = null;
			pc.onicecandidate = null;
			pc.onconnectionstatechange = null;
			try {
				pc.close();
			} catch {
				// abaikan
			}
			pcRef.current = null;
		}
		localStreamRef.current?.getTracks().forEach((t) => t.stop());
		localStreamRef.current = null;
		setState('ended');
		setTimeout(() => {
			onEnd();
			void deleteCallSignals(session.callId);
		}, 900);
	}, [onEnd, session.callId]);

	const endCall = useCallback(async () => {
		try {
			await sendSignal(
				companyId,
				callCaller,
				callRecipient,
				session.callId,
				session.callType,
				'end',
			);
		} catch {
			// abaikan
		}
		cleanup();
	}, [companyId, callCaller, callRecipient, session.callId, session.callType, cleanup]);

	const createPeerConnection = useCallback(() => {
		const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
		pc.onicecandidate = (e) => {
			if (e.candidate) {
				void sendSignal(
					companyId,
					callCaller,
					callRecipient,
					session.callId,
					session.callType,
					'ice',
					JSON.stringify(e.candidate.toJSON()),
				);
			}
		};
		pc.onconnectionstatechange = () => {
			const st = pc.connectionState;
			if (st === 'connected') {
				setState('connected');
			} else if (st === 'failed' && !endedRef.current) {
				cleanup();
			}
		};
		pc.ontrack = (e) => {
			const stream = e.streams[0];
			if (!stream) return;
			if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
			if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
		};
		pcRef.current = pc;
		return pc;
	}, [companyId, callCaller, callRecipient, session.callId, session.callType, cleanup]);

	// Siapkan panggilan keluar (offer) saat mount.
	useEffect(() => {
		if (session.direction !== 'outgoing') return;
		let cancelled = false;

		const setup = async () => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: true,
					video: session.callType === 'video',
				});
				if (cancelled) {
					stream.getTracks().forEach((t) => t.stop());
					return;
				}
				localStreamRef.current = stream;
				if (localVideoRef.current && session.callType === 'video') {
					localVideoRef.current.srcObject = stream;
				}
				const pc = createPeerConnection();
				stream.getTracks().forEach((t) => pc.addTrack(t, stream));
				const offer = await pc.createOffer();
				await pc.setLocalDescription(offer);
				await sendSignal(
					companyId,
					callCaller,
					callRecipient,
					session.callId,
					session.callType,
					'offer',
					JSON.stringify(offer),
				);
				// Kirim notifikasi Web Push agar penerima melihat panggilan masuk meski
				// browser ditutup (iOS PWA / desktop). Fire-and-forget.
				void triggerCallPush(session.callId, myName, session.callType);
			} catch {
				setError('Tidak dapat mengakses kamera/mikrofon. Periksa izin perangkat.');
				setTimeout(() => cleanup(), 1500);
			}
		};
		void setup();

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Berlangganan sinyal untuk sesi panggilan ini.
	useEffect(() => {
		const unsub = subscribeToCall(session.callId, (action, signal) => {
			if (action === 'delete') return;
			const pc = pcRef.current;

			if (signal.type === 'answer') {
				if (!pc) {
					earlySignalsRef.current.push(signal);
					return;
				}
				void (async () => {
					try {
						await pc.setRemoteDescription(JSON.parse(signal.data));
						remoteDescSetRef.current = true;
						for (const c of pendingCandidatesRef.current) {
							await pc.addIceCandidate(c);
						}
						pendingCandidatesRef.current = [];
					} catch {
						// abaikan
					}
				})();
			} else if (signal.type === 'ice') {
				if (!pc) {
					earlySignalsRef.current.push(signal);
					return;
				}
				try {
					const candidate = new RTCIceCandidate(JSON.parse(signal.data));
					if (remoteDescSetRef.current) {
						void pc.addIceCandidate(candidate);
					} else {
						pendingCandidatesRef.current.push(candidate);
					}
				} catch {
					// abaikan
				}
			} else if (
				signal.type === 'reject' ||
				signal.type === 'end' ||
				signal.type === 'busy' ||
				signal.type === 'cancel'
			) {
				cleanup();
			}
		});
		return unsub;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session.callId]);

	// Timer durasi saat terhubung.
	useEffect(() => {
		if (state !== 'connected') return;
		timerRef.current = setInterval(() => {
			setDuration((d) => d + 1);
		}, 1000);
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [state]);

	// Notifikasi perangkat + nada dering untuk panggilan masuk. Berjalan meski
	// tab tidak aktif di layar (pengguna membuka aplikasi lain), selama izin
	// notifikasi sudah diberikan. Berhenti saat dijawab, ditolak, atau berakhir.
	useEffect(() => {
		if (session.direction !== 'incoming') return;
		if (state === 'ringing' && !accepted) {
			startCallRingtone();
			showIncomingCallNotification(session.peer.name, session.callType);
		} else {
			stopCallRingtone();
			closeIncomingCallNotification();
		}
		return () => {
			stopCallRingtone();
			closeIncomingCallNotification();
		};
	}, [state, accepted, session.direction, session.peer.name, session.callType]);

	// Hentikan stream saat unmount.
	useEffect(() => {
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
			const pc = pcRef.current;
			if (pc) {
				try {
					pc.close();
				} catch {
					// abaikan
				}
			}
			localStreamRef.current?.getTracks().forEach((t) => t.stop());
		};
	}, []);

	const acceptCall = useCallback(async () => {
		if (!session.offerSignal) return;
		setAccepted(true);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: session.callType === 'video',
			});
			localStreamRef.current = stream;
			if (localVideoRef.current && session.callType === 'video') {
				localVideoRef.current.srcObject = stream;
			}
			const pc = createPeerConnection();
			stream.getTracks().forEach((t) => pc.addTrack(t, stream));

			// Terapkan sinyal yang diterima sebelum PC dibuat.
			for (const s of earlySignalsRef.current) {
				if (s.type === 'ice') {
					try {
						pendingCandidatesRef.current.push(new RTCIceCandidate(JSON.parse(s.data)));
					} catch {
						// abaikan
					}
				}
			}
			earlySignalsRef.current = [];

			await pc.setRemoteDescription(JSON.parse(session.offerSignal.data));
			remoteDescSetRef.current = true;
			for (const c of pendingCandidatesRef.current) {
				void pc.addIceCandidate(c);
			}
			pendingCandidatesRef.current = [];

			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			await sendSignal(
				companyId,
				callCaller,
				callRecipient,
				session.callId,
				session.callType,
				'answer',
				JSON.stringify(answer),
			);
		} catch {
			setError('Tidak dapat mengakses kamera/mikrofon. Periksa izin perangkat.');
			setTimeout(() => cleanup(), 1500);
		}
	}, [
		session.offerSignal,
		session.callType,
		createPeerConnection,
		companyId,
		callCaller,
		callRecipient,
		session.callId,
		cleanup,
	]);

	const rejectCall = useCallback(async () => {
		try {
			await sendSignal(
				companyId,
				callCaller,
				callRecipient,
				session.callId,
				session.callType,
				'reject',
			);
		} catch {
			// abaikan
		}
		cleanup();
	}, [companyId, callCaller, callRecipient, session.callId, session.callType, cleanup]);

	const toggleMute = () => {
		const stream = localStreamRef.current;
		if (!stream) return;
		const track = stream.getAudioTracks()[0];
		if (!track) return;
		track.enabled = !track.enabled;
		setMuted(!track.enabled);
	};

	const toggleVideo = () => {
		const stream = localStreamRef.current;
		if (!stream) return;
		const track = stream.getVideoTracks()[0];
		if (!track) return;
		track.enabled = !track.enabled;
		setVideoOff(!track.enabled);
	};

	const statusText =
		state === 'ended'
			? 'Panggilan berakhir'
			: state === 'connected'
				? formatDuration(duration)
				: session.direction === 'outgoing'
					? 'Memanggil…'
					: 'Panggilan masuk';

	const isVideo = session.callType === 'video';
	const showRemoteVideo = isVideo && state === 'connected';

	return (
		<div className="fixed inset-0 z-[200] flex flex-col bg-slate-900/95 backdrop-blur-sm">
			<audio ref={remoteAudioRef} autoPlay className="hidden" />

			{/* Video remote (panggilan video yang terhubung) */}
			{isVideo ? (
				<video
					ref={remoteVideoRef}
					autoPlay
					playsInline
					className={cn(
					'absolute inset-0 h-full w-full object-cover',
					!showRemoteVideo && 'hidden',
				)}
				/>
			) : null}

			{/* Area utama */}
			<div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-6">
				{showRemoteVideo ? null : (
					<div className="flex flex-col items-center gap-4">
						<div
							className={cn(
							'flex size-24 items-center justify-center rounded-full bg-emerald-600 text-3xl font-bold text-white shadow-lg',
							state === 'ringing' && 'animate-pulse',
						)}
						>
							{initials(session.peer.name)}
						</div>
						<div className="text-center">
							<p className="text-xl font-bold text-white">{session.peer.name}</p>
							{session.peer.position ? (
								<p className="mt-0.5 text-sm text-white/50">{session.peer.position}</p>
							) : null}
							<p className="mt-2 text-sm font-medium text-white/70">{statusText}</p>
							{error ? (
								<p className="mt-2 text-sm font-medium text-rose-300">{error}</p>
							) : null}
						</div>
					</div>
				)}
			</div>

			{/* Video lokal (PiP) untuk panggilan video */}
			{isVideo ? (
				<video
					ref={localVideoRef}
					autoPlay
					playsInline
					muted
					className={cn(
					'absolute bottom-28 right-4 z-10 h-32 w-44 rounded-xl border-2 border-white/20 object-cover shadow-lg sm:h-40 sm:w-56',
					videoOff && 'bg-slate-800',
				)}
				/>
			) : null}

			{/* Kontrol */}
			<div className="relative z-20 flex items-center justify-center gap-4 px-6 py-8">
				{accepted ? (
					<>
						<button
							type="button"
							onClick={toggleMute}
							className={cn(
							'flex size-14 items-center justify-center rounded-full transition-colors',
							muted
								? 'bg-white text-slate-900'
								: 'bg-white/10 text-white hover:bg-white/20',
						)}
							aria-label={muted ? 'Aktifkan mikrofon' : 'Bisukan mikrofon'}
							title={muted ? 'Aktifkan mikrofon' : 'Bisukan'}
						>
							{muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
						</button>
						{isVideo ? (
							<button
								type="button"
								onClick={toggleVideo}
								className={cn(
								'flex size-14 items-center justify-center rounded-full transition-colors',
								videoOff
									? 'bg-white text-slate-900'
									: 'bg-white/10 text-white hover:bg-white/20',
							)}
								aria-label={videoOff ? 'Aktifkan kamera' : 'Matikan kamera'}
								title={videoOff ? 'Aktifkan kamera' : 'Matikan kamera'}
							>
								{videoOff ? <VideoOff className="size-6" /> : <Video className="size-6" />}
							</button>
						) : null}
						<button
							type="button"
							onClick={() => void endCall()}
							className="flex size-14 items-center justify-center rounded-full bg-rose-600 text-white transition-colors hover:bg-rose-700"
							aria-label="Akhiri panggilan"
							title="Akhiri"
						>
							<PhoneOff className="size-6" />
						</button>
					</>
				) : (
					<>
						<button
							type="button"
							onClick={() => void rejectCall()}
							className="flex size-14 items-center justify-center rounded-full bg-rose-600 text-white transition-colors hover:bg-rose-700"
							aria-label="Tolak panggilan"
							title="Tolak"
						>
							<PhoneOff className="size-6" />
						</button>
						<button
							type="button"
							onClick={() => void acceptCall()}
							className="flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
							aria-label="Terima panggilan"
							title="Terima"
						>
							<Phone className="size-6" />
						</button>
					</>
				)}
			</div>
		</div>
	);
}
