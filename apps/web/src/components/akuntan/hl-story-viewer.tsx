import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/** Durasi tiap gambar story, selaras dengan animasi `.hl-story-bar` di index.css. */
export const HL_STORY_DURATION_MS = 5000;

/** Satu story HL Store milik seorang akuntan: rangkaian gambar utuh tanpa crop. */
export type HlStory = {
	accountantId: string;
	name: string;
	subtitle?: string;
	images: string[];
};

/**
 * Penampil story layar penuh gaya WhatsApp untuk posting HL Store: gambar besar
 * utuh, bilah progres per gambar, navigasi ke gambar/story berikutnya dan
 * sebelumnya (klik zona kiri/kanan, tombol panah, atau tombol keyboard), tombol
 * tutup, dan maju otomatis setiap 5 detik.
 */
export function HlStoryViewer({
	stories,
	startIndex,
	onClose,
}: {
	stories: HlStory[];
	startIndex: number;
	onClose: () => void;
}) {
	const [storyIndex, setStoryIndex] = useState(() =>
		Math.min(Math.max(startIndex, 0), Math.max(stories.length - 1, 0)),
	);
	const [imageIndex, setImageIndex] = useState(0);

	const story = stories[storyIndex];
	const total = story?.images.length ?? 0;

	const goNext = useCallback(() => {
		if (!story) return;
		if (imageIndex + 1 < total) {
			setImageIndex(imageIndex + 1);
		} else if (storyIndex + 1 < stories.length) {
			setStoryIndex(storyIndex + 1);
			setImageIndex(0);
		} else {
			onClose();
		}
	}, [story, imageIndex, total, storyIndex, stories.length, onClose]);

	const goPrev = useCallback(() => {
		if (imageIndex > 0) {
			setImageIndex(imageIndex - 1);
		} else if (storyIndex > 0) {
			const prevStory = stories[storyIndex - 1];
			setStoryIndex(storyIndex - 1);
			setImageIndex(Math.max((prevStory?.images.length ?? 1) - 1, 0));
		}
	}, [imageIndex, storyIndex, stories]);

	// Maju otomatis seperti story WhatsApp; timer di-reset tiap gambar/story.
	useEffect(() => {
		if (!story) return;
		const timer = window.setTimeout(goNext, HL_STORY_DURATION_MS);
		return () => window.clearTimeout(timer);
	}, [goNext, story]);

	// Navigasi keyboard: panah kiri/kanan dan Escape untuk menutup.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
			else if (event.key === 'ArrowRight') goNext();
			else if (event.key === 'ArrowLeft') goPrev();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose, goNext, goPrev]);

	// Kunci gulir latar selama penampil story terbuka.
	useEffect(() => {
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	}, []);

	if (!story || total === 0) return null;

	const canPrev = imageIndex > 0 || storyIndex > 0;
	const canNext = imageIndex + 1 < total || storyIndex + 1 < stories.length;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`Story HL Store ${story.name}`}
			className="fixed inset-0 z-50 flex flex-col bg-black/95"
		>
			<div className="mx-auto flex h-full w-full max-w-2xl flex-col">
				<div className="flex gap-1.5 px-4 pt-4" aria-hidden="true">
					{story.images.map((_, index) => (
						<div
							key={index}
							className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"
						>
							{index < imageIndex ? (
								<div className="h-full w-full bg-white" />
							) : index === imageIndex ? (
								<div
									key={`${storyIndex}-${imageIndex}`}
									className="hl-story-bar h-full w-0 bg-white"
								/>
							) : null}
						</div>
					))}
				</div>
				<div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
					<div className="min-w-0">
						<p className="truncate text-sm font-bold tracking-tight">{story.name}</p>
						{story.subtitle ? (
							<p className="truncate text-xs text-white/70">{story.subtitle}</p>
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-3">
						<span className="text-xs tabular-nums text-white/70">
							{imageIndex + 1}/{total}
						</span>
						<button
							type="button"
							onClick={onClose}
							aria-label="Tutup story"
							className="flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10"
						>
							<X className="size-6" strokeWidth={1.8} />
						</button>
					</div>
				</div>
				<div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
					<img
						src={story.images[imageIndex]}
						alt={`Story HL Store ${story.name} — gambar ${imageIndex + 1} dari ${total}`}
						className="max-h-full max-w-full rounded-lg object-contain"
					/>
					<button
						type="button"
						onClick={goPrev}
						disabled={!canPrev}
						aria-label="Gambar atau story sebelumnya"
						className="absolute inset-y-0 left-0 w-1/4 cursor-default"
						tabIndex={-1}
					/>
					<button
						type="button"
						onClick={goNext}
						aria-label="Gambar atau story berikutnya"
						className="absolute inset-y-0 right-0 w-1/4 cursor-default"
						tabIndex={-1}
					/>
					{canPrev ? (
						<button
							type="button"
							onClick={goPrev}
							aria-label="Sebelumnya"
							className="absolute left-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
						>
							<ChevronLeft className="size-6" strokeWidth={1.8} />
						</button>
					) : null}
					{canNext ? (
						<button
							type="button"
							onClick={goNext}
							aria-label="Berikutnya"
							className="absolute right-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
						>
							<ChevronRight className="size-6" strokeWidth={1.8} />
						</button>
					) : null}
				</div>
				<p className="pb-4 text-center text-[11px] text-white/50">
					Ketuk sisi kiri/kanan atau gunakan tombol panah untuk berpindah gambar
				</p>
			</div>
		</div>
	);
}
