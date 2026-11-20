import { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, Loader2, Move, ZoomIn } from 'lucide-react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

/** Antrian berkas gambar yang akan disesuaikan satu per satu. */
export type ImageAdjustQueue = File[];

type LoadState =
	| { status: 'loading' }
	| { status: 'ready'; image: HTMLImageElement; url: string }
	| { status: 'error' };

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const MAX_OUTPUT = 1600;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

type Dimensions = {
	image: HTMLImageElement;
	iw: number;
	ih: number;
	scale: number;
	dw: number;
	dh: number;
	ox: number;
	oy: number;
};

/**
 * Pratinjau penyesuaian gambar: pengguna dapat menggeser posisi (drag), memperbesar
 * (zoom), dan memilih area crop sebelum gambar disimpan. Hasil akhir dirender ke
 * canvas pada resolusi asli (dibatasi 1600px sisi terpanjang) sehingga kualitas
 * tetap tajam. Hanya memproses gambar yang dipilih pengguna — tidak mengubah
 * gambar atau data lain yang sudah tersimpan.
 */
export function ImageAdjustDialog({
	queue,
	aspect = 1,
	title = 'Sesuaikan gambar',
	description = 'Geser untuk mengatur posisi, gunakan slider untuk memperbesar, lalu simpan.',
	applyLabel = 'Simpan',
	onApply,
	onClose,
}: {
	queue: ImageAdjustQueue;
	aspect?: number;
	title?: string;
	description?: string;
	applyLabel?: string;
	onApply: (file: File) => void;
	onClose: () => void;
}) {
	const file = queue[0] ?? null;
	const open = Boolean(file);
	const frameRef = useRef<HTMLDivElement>(null);
	const previewUrlRef = useRef<string | null>(null);
	const [frame, setFrame] = useState({ w: 0, h: 0 });
	const [load, setLoad] = useState<LoadState>({ status: 'loading' });
	const [zoom, setZoom] = useState(MIN_ZOOM);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [busy, setBusy] = useState(false);
	const pointerRef = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
	const offsetRef = useRef(offset);
	const draggedRef = useRef(false);
	offsetRef.current = offset;

	const releasePreviewUrl = useCallback(() => {
		if (!previewUrlRef.current) return;
		URL.revokeObjectURL(previewUrlRef.current);
		previewUrlRef.current = null;
	}, []);

	useEffect(() => releasePreviewUrl, [releasePreviewUrl]);

	// Dialog merender bingkai lewat portal setelah terbuka. Efek yang hanya
	// berjalan saat mount sering melewatkan elemen, sehingga frame tetap 0
	// dan gambar tidak pernah digambar.
	useEffect(() => {
		if (!open) {
			setFrame({ w: 0, h: 0 });
			return;
		}
		let cancelled = false;
		let observer: ResizeObserver | null = null;
		let raf = 0;

		const attach = () => {
			if (cancelled) return;
			const el = frameRef.current;
			if (!el) {
				raf = requestAnimationFrame(attach);
				return;
			}
			const update = () => {
				const w = el.clientWidth;
				if (w > 0) setFrame({ w, h: Math.round(w / aspect) });
			};
			update();
			observer = new ResizeObserver(update);
			observer.observe(el);
		};
		attach();
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			observer?.disconnect();
		};
	}, [open, aspect]);

	useEffect(() => {
		if (!file) {
			setLoad({ status: 'loading' });
			releasePreviewUrl();
			return;
		}
		let active = true;
		releasePreviewUrl();
		const url = URL.createObjectURL(file);
		previewUrlRef.current = url;
		const image = new Image();
		image.onload = () => {
			if (!active) return;
			setLoad({ status: 'ready', image, url });
			setZoom(MIN_ZOOM);
			draggedRef.current = false;
			const iw = image.naturalWidth || image.width;
			const ih = image.naturalHeight || image.height;
			const fw = frameRef.current?.clientWidth ?? 0;
			const fh = fw > 0 ? Math.round(fw / aspect) : 0;
			if (fw > 0 && iw > 0 && ih > 0) {
				const baseScale = Math.max(fw / iw, fh / ih);
				setOffset({ x: (fw - iw * baseScale) / 2, y: (fh - ih * baseScale) / 2 });
			} else {
				setOffset({ x: 0, y: 0 });
			}
		};
		image.onerror = () => {
			if (!active) return;
			setLoad({ status: 'error' });
		};
		image.src = url;
		return () => {
			active = false;
		};
	}, [file, aspect, releasePreviewUrl]);

	const compute = useCallback(
		(ox: number, oy: number): Dimensions | null => {
			if (load.status !== 'ready' || frame.w === 0) return null;
			const { image } = load;
			const iw = image.naturalWidth || image.width;
			const ih = image.naturalHeight || image.height;
			if (!iw || !ih) return null;
			const baseScale = Math.max(frame.w / iw, frame.h / ih);
			const scale = baseScale * zoom;
			const dw = iw * scale;
			const dh = ih * scale;
			return {
				image,
				iw,
				ih,
				scale,
				dw,
				dh,
				ox: clamp(ox, frame.w - dw, 0),
				oy: clamp(oy, frame.h - dh, 0),
			};
		},
		[load, frame, zoom],
	);

	// Saat ukuran bingkai atau zoom berubah, jepit offset agar gambar tetap menutupi bingkai.
	// Jika pengguna belum menggeser, pusatkan ulang setelah bingkai terukur.
	useEffect(() => {
		if (load.status !== 'ready' || frame.w === 0) return;
		const iw = load.image.naturalWidth || load.image.width;
		const ih = load.image.naturalHeight || load.image.height;
		if (!iw || !ih) return;
		const baseScale = Math.max(frame.w / iw, frame.h / ih);
		const dw = iw * baseScale * zoom;
		const dh = ih * baseScale * zoom;
		setOffset(prev => {
			if (!draggedRef.current) {
				return { x: (frame.w - dw) / 2, y: (frame.h - dh) / 2 };
			}
			return {
				x: clamp(prev.x, frame.w - dw, 0),
				y: clamp(prev.y, frame.h - dh, 0),
			};
		});
	}, [frame.w, frame.h, zoom, load]);

	function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (load.status !== 'ready') return;
		draggedRef.current = true;
		pointerRef.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			ox: offset.x,
			oy: offset.y,
		};
		(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
		const pointer = pointerRef.current;
		if (!pointer || pointer.id !== event.pointerId) return;
		const d = compute(pointer.ox, pointer.oy);
		if (!d) return;
		const dx = event.clientX - pointer.x;
		const dy = event.clientY - pointer.y;
		setOffset({
			x: clamp(pointer.ox + dx, frame.w - d.dw, 0),
			y: clamp(pointer.oy + dy, frame.h - d.dh, 0),
		});
	}

	function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
		if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
	}

	async function renderToFile(): Promise<File | null> {
		const d = compute(offset.x, offset.y);
		if (!d || !file) return null;
		const { image, scale, ox, oy } = d;
		const sx = -ox / scale;
		const sy = -oy / scale;
		const sw = frame.w / scale;
		const sh = frame.h / scale;
		const longest = Math.max(sw, sh);
		const outScale = longest > MAX_OUTPUT ? MAX_OUTPUT / longest : 1;
		const outW = Math.max(1, Math.round(sw * outScale));
		const outH = Math.max(1, Math.round(sh * outScale));
		const canvas = document.createElement('canvas');
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);
		const type =
			file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
		const blob = await new Promise<Blob | null>(resolve =>
			canvas.toBlob(resolve, type, type === 'image/png' ? undefined : 0.92),
		);
		if (!blob) return null;
		const baseName = file.name.replace(/\.[^.]+$/, '') || 'gambar';
		const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
		return new File([blob], `${baseName}.${ext}`, { type });
	}

	async function handleApply(useOriginal = false) {
		if (!file) return;
		setBusy(true);
		try {
			const result = useOriginal ? file : await renderToFile();
			if (result) onApply(result);
		} finally {
			setBusy(false);
		}
	}

	const d = compute(offset.x, offset.y);
	const previewStyle = d
		? { width: d.dw, height: d.dh, transform: `translate(${d.ox}px, ${d.oy}px)` }
		: undefined;

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				if (!next) onClose();
			}}
		>
			<DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
				<DialogHeader className="px-5 pt-5">
					<DialogTitle className="flex items-center gap-2 text-base font-bold tracking-tight text-[#102a4c]">
						<Crop className="size-4 text-emerald-600" strokeWidth={1.9} />
						{title}
					</DialogTitle>
					<DialogDescription className="text-xs leading-relaxed text-muted-foreground">
						{description}
					</DialogDescription>
				</DialogHeader>

				<div className="px-5 pb-3 pt-1">
					<div
						ref={frameRef}
						className="relative mx-auto w-full select-none overflow-hidden rounded-xl bg-[#0f172a] touch-none"
						style={{ aspectRatio: `${aspect}` }}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerUp}
					>
						{load.status === 'loading' ? (
							<div className="absolute inset-0 flex items-center justify-center text-emerald-200">
								<Loader2 className="size-6 animate-spin" />
							</div>
						) : null}
						{load.status === 'error' ? (
							<div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-emerald-100">
								Gambar tidak dapat dimuat. Coba gambar lain.
							</div>
						) : null}
						{load.status === 'ready' ? (
							<img
								src={load.url}
								alt="Pratinjau gambar"
								draggable={false}
								className={
									d
										? 'pointer-events-none absolute left-0 top-0 max-w-none'
										: 'pointer-events-none absolute inset-0 size-full object-cover'
								}
								style={previewStyle}
							/>
						) : null}
						{/* garis bantu grid kamera */}
						<div className="pointer-events-none absolute inset-0 border border-white/15">
							<div className="absolute inset-y-0 left-1/3 w-px bg-white/10" />
							<div className="absolute inset-y-0 left-2/3 w-px bg-white/10" />
							<div className="absolute inset-x-0 top-1/3 h-px bg-white/10" />
							<div className="absolute inset-x-0 top-2/3 h-px bg-white/10" />
						</div>
					</div>

					<div className="mt-4 flex items-center gap-3">
						<ZoomIn className="size-4 shrink-0 text-emerald-600" strokeWidth={1.9} />
						<Slider
							value={[zoom]}
							min={MIN_ZOOM}
							max={MAX_ZOOM}
							step={0.01}
							onValueChange={value => setZoom(value[0] ?? MIN_ZOOM)}
							className="flex-1"
							aria-label="Perbesar gambar"
						/>
						<span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
							{Math.round(zoom * 100)}%
						</span>
					</div>
					<p className="mt-2 flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
						<Move className="size-3" strokeWidth={1.9} />
						Seret gambar di dalam bingkai untuk mengatur posisi.
					</p>
				</div>

				<DialogFooter className="flex-row justify-between gap-2 border-t border-border/70 bg-muted/30 px-5 py-4">
					<Button
						type="button"
						variant="ghost"
						onClick={() => onClose()}
						disabled={busy}
						className="h-10 rounded-full px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
					>
						Batal
					</Button>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleApply(true)}
							disabled={busy || load.status !== 'ready'}
							className="h-10 rounded-full border-emerald-200 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
						>
							Lewati
						</Button>
						<Button
							type="button"
							onClick={() => handleApply(false)}
							disabled={busy || load.status !== 'ready'}
							className="h-10 rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-5 text-sm font-semibold text-white shadow-soft-sm hover:brightness-110"
						>
							{busy ? <Loader2 className="size-4 animate-spin" /> : null}
							{applyLabel}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
