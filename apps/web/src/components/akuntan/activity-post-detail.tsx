import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { akuntanPhotoUrl } from '@/lib/akuntan';
import { LikeButton, useLikeState } from '@/components/akuntan/like-button';
import { MentionText } from '@/components/akuntan/mention-text';
import {
	getAccountantPost,
	postImageNames,
	postImageUrl,
	type AccountantFeedPost,
} from '@/lib/accountant-posts';
import { PostComments } from '@/components/akuntan/profile-posts';

function formatFeedTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString('id-ID', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Asia/Jakarta',
	});
}

export function ActivityPostDetail({ id }: { id: string }) {
	const navigate = useNavigate();
	const { user, isLoading } = useAuth();
	const [post, setPost] = useState<AccountantFeedPost | null | undefined>(undefined);
	const [index, setIndex] = useState(0);

	useEffect(() => {
		let active = true;
		setPost(undefined);
		setIndex(0);
		getAccountantPost(id).then(record => {
			if (active) setPost(record);
		});
		return () => {
			active = false;
		};
	}, [id]);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') navigate('/akuntan/activity');
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [navigate]);

	const postLikes = useLikeState('post', post ? [post.id] : null);

	if (post === undefined) {
		return <div className="min-h-dvh animate-pulse bg-slate-50" />;
	}

	if (!post) {
		return (
			<div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
				<p className="text-lg font-semibold text-[#102a4c]">Posting tidak ditemukan</p>
				<Link to="/akuntan/activity" className="text-sm font-semibold text-emerald-700 hover:underline">
					Kembali ke Activity
				</Link>
			</div>
		);
	}

	const profile = post.expand?.accountant;
	const photo = profile ? akuntanPhotoUrl(profile) : null;
	const images = postImageNames(post);
	const current = images[index] ?? images[0];
	const isOwner = !isLoading && !!user && user.id === post.owner;

	return (
		<div className="flex min-h-dvh flex-col bg-white lg:h-dvh lg:flex-row lg:overflow-hidden">
			<section className="relative flex min-h-[52dvh] flex-1 items-center justify-center bg-[#f3f4f6] px-4 py-14 lg:min-h-0 lg:px-16">
				<button
					type="button"
					onClick={() => navigate('/akuntan/activity')}
					className="absolute left-3 top-3 z-10 inline-flex size-11 items-center justify-center rounded-full text-slate-800 hover:bg-white/80"
					aria-label="Kembali ke Activity"
				>
					<ChevronLeft className="size-7" strokeWidth={1.75} />
				</button>
				{current ? (
					<img
						src={postImageUrl(post, current)}
						alt="Gambar aktivitas"
						className="max-h-[70dvh] w-auto max-w-full rounded-2xl object-contain shadow-[0_8px_30px_rgba(15,23,42,0.08)] lg:max-h-[88dvh]"
					/>
				) : (
					<div className="max-w-lg rounded-2xl bg-white px-8 py-12 shadow-sm">
						<p className="whitespace-pre-line text-lg leading-relaxed text-slate-800">{post.body}</p>
					</div>
				)}
				{images.length > 1 ? (
					<>
						<button
							type="button"
							onClick={() => setIndex(value => (value - 1 + images.length) % images.length)}
							className="absolute left-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm hover:bg-white"
							aria-label="Gambar sebelumnya"
						>
							<ChevronLeft className="size-5" />
						</button>
						<button
							type="button"
							onClick={() => setIndex(value => (value + 1) % images.length)}
							className="absolute right-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm hover:bg-white lg:right-6"
							aria-label="Gambar berikutnya"
						>
							<ChevronRight className="size-5" />
						</button>
						<div className="absolute bottom-4 flex max-w-[calc(100%-2rem)] gap-2 overflow-x-auto rounded-2xl bg-white/90 px-2.5 py-2 shadow-sm backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{images.map((name, dot) => (
								<button
									key={name}
									type="button"
									onClick={() => setIndex(dot)}
									aria-label={`Gambar ${dot + 1}`}
									className={`shrink-0 overflow-hidden rounded-lg bg-[#f4f6f5] transition ${
										dot === index
											? 'ring-2 ring-emerald-500'
											: 'opacity-70 hover:opacity-100'
									}`}
								>
									<img
										src={postImageUrl(post, name)}
										alt=""
										className="size-11 object-contain"
									/>
								</button>
							))}
						</div>
					</>
				) : null}
			</section>

			<aside className="flex w-full flex-col border-slate-100 bg-white lg:h-dvh lg:w-[400px] lg:shrink-0 lg:border-l xl:w-[440px]">
				<div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
					{profile ? (
						<Link to={`/akuntan/profil/${profile.id}`} className="shrink-0">
							{photo ? (
								<img src={photo} alt="" className="size-10 rounded-full bg-emerald-50 object-contain" />
							) : (
								<span className="flex size-10 items-center justify-center rounded-full bg-emerald-50">
									<UserRound className="size-5 text-emerald-600" />
								</span>
							)}
						</Link>
					) : (
						<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50">
							<UserRound className="size-5 text-emerald-600" />
						</span>
					)}
					<div className="min-w-0 flex-1">
						{profile ? (
							<Link to={`/akuntan/profil/${profile.id}`} className="block truncate text-sm font-bold text-[#111] hover:text-emerald-700">
								{profile.name}
							</Link>
						) : (
							<p className="text-sm font-bold text-[#111]">Akuntan</p>
						)}
						{profile?.city ? <p className="truncate text-xs text-slate-400">{profile.city}</p> : null}
					</div>
					{profile ? (
						<Link
							to={`/akuntan/profil/${profile.id}`}
							className="inline-flex h-8 items-center rounded-full border border-rose-200 px-3 text-xs font-semibold text-rose-500 hover:bg-rose-50"
						>
							Lihat profil
						</Link>
					) : null}
				</div>

				<div className="flex min-h-0 flex-1 flex-col px-4 py-4">
					{post.body?.trim() ? (
						<MentionText
							text={post.body}
							className="whitespace-pre-line text-[15px] font-medium leading-relaxed text-[#111]"
						/>
					) : null}
					<div className="mt-2 flex items-center gap-2">
						<p className="text-xs text-slate-400">{formatFeedTime(post.created)} WIB</p>
						<LikeButton
							count={postLikes.counts[post.id] ?? 0}
							liked={!!postLikes.liked[post.id]}
							busy={!!postLikes.busy[post.id]}
							onToggle={() => void postLikes.toggle(post.id)}
						/>
					</div>
					<div className="mt-4 flex min-h-[16rem] flex-1 flex-col lg:min-h-0">
						<p className="mb-1 text-sm font-semibold text-slate-700">Komentar</p>
						<PostComments
							postId={post.id}
							postOwner={isOwner}
							variant="panel"
							mentionCandidates={
								profile ? [{ id: profile.owner, name: profile.name }] : []
							}
						/>
					</div>
				</div>
			</aside>
		</div>
	);
}
