import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Heart } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
	listLikeCounts,
	listMyLikes,
	toggleLike,
	type LikeTarget,
} from '@/lib/accountant-likes';

/** Status like (jumlah dan milik pengguna login) untuk satu jenis target. */
export function useLikeState(target: LikeTarget, ids: string[] | null) {
	const { isAuthed, isLoading } = useAuth();
	const [counts, setCounts] = useState<Record<string, number>>({});
	const [liked, setLiked] = useState<Record<string, boolean>>({});
	const [busy, setBusy] = useState<Record<string, boolean>>({});
	const likedRef = useRef(liked);
	likedRef.current = liked;
	const idsKey = ids && ids.length > 0 ? ids.join(',') : '';

	useEffect(() => {
		let active = true;
		const idList = idsKey ? idsKey.split(',') : [];
		if (idList.length === 0) return;
		listLikeCounts(target, idList)
			.then(result => {
				if (active) setCounts(previous => ({ ...previous, ...result }));
			})
			.catch(() => {});
		if (!isLoading && isAuthed) {
			listMyLikes(target, idList)
				.then(result => {
					if (active) setLiked(previous => ({ ...previous, ...result }));
				})
				.catch(() => {});
		}
		return () => {
			active = false;
		};
	}, [target, idsKey, isAuthed, isLoading]);

	async function toggle(id: string) {
		if (busy[id]) return;
		const wasLiked = !!likedRef.current[id];
		setBusy(previous => ({ ...previous, [id]: true }));
		setLiked(previous => ({ ...previous, [id]: !wasLiked }));
		setCounts(previous => ({
			...previous,
			[id]: Math.max(0, (previous[id] ?? 0) + (wasLiked ? -1 : 1)),
		}));
		try {
			const nowLiked = await toggleLike(target, id);
			if (nowLiked !== !wasLiked) {
				setLiked(previous => ({ ...previous, [id]: nowLiked }));
				listLikeCounts(target, [id])
					.then(result => setCounts(previous => ({ ...previous, ...result })))
					.catch(() => {});
			}
		} catch {
			setLiked(previous => ({ ...previous, [id]: wasLiked }));
			setCounts(previous => ({
				...previous,
				[id]: Math.max(0, (previous[id] ?? 0) + (wasLiked ? 1 : -1)),
			}));
		} finally {
			setBusy(previous => ({ ...previous, [id]: false }));
		}
	}

	return { counts, liked, busy, toggle };
}

/** Tombol suka dengan jumlah; pengguna belum masuk diarahkan ke halaman masuk. */
export function LikeButton({
	count,
	liked,
	busy = false,
	onToggle,
	size = 'sm',
}: {
	count: number;
	liked: boolean;
	busy?: boolean;
	onToggle: () => void;
	size?: 'sm' | 'md';
}) {
	const navigate = useNavigate();
	const { isAuthed, isLoading } = useAuth();

	function handleClick() {
		if (isLoading || busy) return;
		if (!isAuthed) {
			navigate('/akuntan/masuk');
			return;
		}
		onToggle();
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={busy}
			aria-pressed={liked}
			aria-label={liked ? `Batalkan suka, ${count} suka` : `Beri suka, ${count} suka`}
			className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition ${
				size === 'md' ? 'h-10 px-3.5 text-sm' : 'h-8 px-2.5 text-xs'
			} ${
				liked
					? 'bg-rose-50 text-rose-600'
					: 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
			}`}
		>
			<Heart
				className={`${size === 'md' ? 'size-5' : 'size-4'} ${
					liked ? 'fill-rose-500 text-rose-500' : ''
				}`}
			/>
			{count > 0 ? <span>{count}</span> : null}
		</button>
	);
}
