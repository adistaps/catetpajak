import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Pemilih tipe MIME audio yang didukung browser untuk MediaRecorder.
 * Mengembalikan string kosong bila tidak ada yang didukung (browser memakai default).
 */
function pickAudioMimeType(): string {
	if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return '';
	const candidates = [
		'audio/webm;codecs=opus',
		'audio/webm',
		'audio/ogg;codecs=opus',
		'audio/ogg',
		'audio/mp4',
	];
	for (const type of candidates) {
		try {
			if (MediaRecorder.isTypeSupported(type)) return type;
		} catch {
			// abaikan
		}
	}
	return '';
}

/** Ekstensi file untuk tipe MIME audio yang dipilih. */
function extForMimeType(mime: string): string {
	if (mime.startsWith('audio/webm')) return 'webm';
	if (mime.startsWith('audio/ogg')) return 'ogg';
	if (mime.startsWith('audio/mp4')) return 'mp4';
	if (mime.startsWith('audio/mpeg')) return 'mp3';
	if (mime.startsWith('audio/wav')) return 'wav';
	return 'webm';
}

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Bar perekam pesan suara. Meminta izin mikrofon, merekam audio, lalu
 * memanggil `onComplete(file)` dengan file audio siap kirim, atau
 * `onCancel()` bila pengguna membatalkan.
 */
export function VoiceRecorder({
	onComplete,
	onCancel,
}: {
	onComplete: (file: File) => void;
	onCancel: () => void;
}) {
	const [seconds, setSeconds] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const mimeRef = useRef<string>('');
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const completedRef = useRef(false);

	useEffect(() => {
		let cancelled = false;

		const start = async () => {
			if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
				setError('Perekaman suara tidak didukung perangkat ini.');
				return;
			}
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				if (cancelled) {
					stream.getTracks().forEach((t) => t.stop());
					return;
				}
				streamRef.current = stream;
				const mime = pickAudioMimeType();
				mimeRef.current = mime;
				const recorder = mime
					? new MediaRecorder(stream, { mimeType: mime })
					: new MediaRecorder(stream);
				recorderRef.current = recorder;
				chunksRef.current = [];

				recorder.ondataavailable = (e) => {
					if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
				};
				recorder.onstop = () => {
					if (completedRef.current) return;
					completedRef.current = true;
					const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
					const ext = extForMimeType(mime || 'audio/webm');
					const file = new File([blob], `pesan-suara-${Date.now()}.${ext}`, {
						type: mime || 'audio/webm',
					});
					stream.getTracks().forEach((t) => t.stop());
					streamRef.current = null;
					onComplete(file);
				};

				recorder.start();
				timerRef.current = setInterval(() => {
					setSeconds((s) => s + 1);
				}, 1000);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
					setError('Izin mikrofon ditolak. Aktifkan izin mikrofon di browser Anda.');
				} else {
					setError('Tidak dapat mengakses mikrofon. Periksa izin perangkat.');
				}
			}
		};

		void start();

		return () => {
			cancelled = true;
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleStop = () => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		const recorder = recorderRef.current;
		if (recorder && recorder.state !== 'inactive') {
			recorder.stop();
		}
	};

	const handleCancel = () => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		const recorder = recorderRef.current;
		completedRef.current = true;
		if (recorder && recorder.state !== 'inactive') {
			recorder.onstop = null;
			recorder.stop();
		}
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((t) => t.stop());
			streamRef.current = null;
		}
		onCancel();
	};

	useEffect(() => {
		if (error) toast.error(error);
	}, [error]);

	if (error) {
		return (
			<div className="flex w-full items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
				<span className="flex-1">{error}</span>
				<button
					type="button"
					onClick={handleCancel}
					className="flex size-6 items-center justify-center rounded text-rose-600 hover:bg-rose-100"
					aria-label="Tutup"
				>
					<X className="size-3.5" />
				</button>
			</div>
		);
	}

	return (
		<div className="flex w-full items-center gap-2 rounded-lg border border-[#e6ecea] bg-[#f8fbfa] px-3 py-2 text-sm">
			<span className="relative flex size-3 shrink-0">
				<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
				<span className="relative inline-flex size-3 rounded-full bg-rose-500" />
			</span>
			<span className="font-mono text-sm font-semibold text-rose-600">{formatDuration(seconds)}</span>
			<span className="text-xs text-muted-foreground">Merekam…</span>
			<div className="flex-1" />
			<button
				type="button"
				onClick={handleCancel}
				className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				aria-label="Batal rekam"
				title="Batal"
			>
				<X className="size-4" />
			</button>
			<button
				type="button"
				onClick={handleStop}
				className="flex items-center gap-1.5 rounded-lg bg-[#0f9d68] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
				aria-label="Hentikan dan kirim"
				title="Hentikan"
			>
				<Square className="size-3.5 fill-current" />
				Stop
			</button>
		</div>
	);
}

/** Tombol mikrofon untuk memulai perekaman dari kolom pesan. */
export function VoiceRecordButton({
	onClick,
	disabled,
}: {
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="flex size-9 shrink-0 items-center justify-center rounded-lg text-emerald-700 transition-colors hover:bg-[#e7f7ef] disabled:cursor-not-allowed disabled:opacity-40"
			aria-label="Rekam pesan suara"
			title="Rekam pesan suara"
		>
			<Mic className="size-4" />
		</button>
	);
}
