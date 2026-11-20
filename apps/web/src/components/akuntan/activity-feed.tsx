import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MessageCircle, Search, UserRound } from 'lucide-react';
import { akuntanPhotoUrl } from '@/lib/akuntan';
import { LikeButton, useLikeState } from '@/components/akuntan/like-button';
import { MentionText } from '@/components/akuntan/mention-text';
import {
	listAllAccountantPosts,
	listCommentCounts,
	postImageNames,
	postImageUrl,
	type AccountantFeedPost,
} from '@/lib/accountant-posts';

const TABS = [
	{ id: 'jelajah', label: 'Jelajah' },
	{ id: 'terbaru', label: 'Terbaru' },
	{ id: 'gambar', label: 'Gambar' },
] as const;

const CATEGORIES = [
	{ id: 'semua', label: 'Untuk Anda' },
	{ id: 'pajak', label: 'Pajak' },
	{ id: 'laporan', label: 'Laporan' },
	{ id: 'audit', label: 'Audit' },
	{ id: 'konsultasi', label: 'Konsultasi' },
	{ id: 'pelatihan', label: 'Pelatihan' },
	{ id: 'klien', label: 'Klien' },
	{ id: 'kantor', label: 'Kantor' },
	{ id: 'teks', label: 'Teks' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type CategoryId = (typeof CATEGORIES)[number]['id'];

function matchesCategory(post: AccountantFeedPost, category: CategoryId): boolean {
	if (category === 'semua') return true;
	const images = postImageNames(post);
	if (category === 'teks') return images.length === 0 && !!post.body?.trim();
	const text = `${post.body ?? ''} ${post.expand?.accountant?.name ?? ''}`.toLowerCase();
	return text.includes(category);
}

function FeedCard({
	post,
	commentCount,
	likeCount,
	liked,
	onToggleLike,
}: {
	post: AccountantFeedPost;
	commentCount: number;
	likeCount: number;
	liked: boolean;
	onToggleLike: () => void;
}) {
	const profile = post.expand?.accountant;
	const photo = profile ? akuntanPhotoUrl(profile) : null;
	const images = postImageNames(post);

	return (
		<article className="mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
			<Link to={`/akuntan/activity/${post.id}`} className="block w-full text-left">
				{images.length > 0 ? (
					<div className="relative bg-[#f4f6f5]">
						{images.length === 1 ? (
							<img
								src={postImageUrl(post, images[0])}
								alt=""
								className="mx-auto max-h-[28rem] w-full object-contain"
							/>
						) : (
							<div className="grid grid-cols-2 gap-0.5">
								{images.slice(0, 4).map((name, position) => {
									const spanFull = images.length === 3 && position === 0;
									const hiddenCount = images.length - 4;
									return (
										<div
											key={name}
											className={`relative aspect-[4/3] bg-white ${spanFull ? 'col-span-2' : ''}`}
										>
											<img
												src={postImageUrl(post, name)}
												alt=""
												className="size-full object-contain"
											/>
											{position === 3 && hiddenCount > 0 ? (
												<span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
													+{hiddenCount} gambar
												</span>
											) : null}
										</div>
									);
								})}
							</div>
						)}
					</div>
				) : (
					<div className="bg-gradient-to-br from-emerald-50 to-white px-4 py-8">
						<MentionText
							text={post.body}
							className="line-clamp-6 text-[15px] font-medium leading-relaxed text-slate-800"
						/>
					</div>
				)}
				{images.length > 0 && post.body?.trim() ? (
					<MentionText
						text={post.body}
						className="line-clamp-2 px-3 pt-2.5 text-[13.5px] font-medium leading-snug text-slate-900"
					/>
				) : null}
			</Link>
			<div className="flex items-center gap-2 px-3 py-2.5">
				{profile ? (
					<Link to={`/akuntan/profil/${profile.id}`} className="shrink-0" aria-label={`Profil ${profile.name}`}>
						{photo ? (
							<img src={photo} alt="" className="size-6 rounded-full bg-emerald-50 object-contain" />
						) : (
							<span className="flex size-6 items-center justify-center rounded-full bg-emerald-50">
								<UserRound className="size-3.5 text-emerald-600" />
							</span>
						)}
					</Link>
				) : (
					<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50">
						<UserRound className="size-3.5 text-emerald-600" />
					</span>
				)}
				{profile ? (
					<Link
						to={`/akuntan/profil/${profile.id}`}
						className="min-w-0 flex-1 truncate text-xs text-slate-600 hover:text-emerald-700"
					>
						{profile.name}
					</Link>
				) : (
					<span className="min-w-0 flex-1 truncate text-xs text-slate-600">Akuntan</span>
				)}
				<LikeButton count={likeCount} liked={liked} onToggle={onToggleLike} />
				<Link
					to={`/akuntan/activity/${post.id}#komentar`}
					className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500 hover:text-emerald-700"
					aria-label={`${commentCount} komentar`}
				>
					<MessageCircle className="size-3.5" />
					{commentCount}
				</Link>
			</div>
		</article>
	);
}

export function ActivityFeed() {
	const [posts, setPosts] = useState<AccountantFeedPost[] | null>(null);
	const [counts, setCounts] = useState<Record<string, number>>({});
	const [loadError, setLoadError] = useState(false);
	const [reloadKey, setReloadKey] = useState(0);
	const [tab, setTab] = useState<TabId>('jelajah');
	const [category, setCategory] = useState<CategoryId>('semua');
	const [query, setQuery] = useState('');
	const postIds = useMemo(
		() => (posts && posts.length > 0 ? posts.map(post => post.id) : null),
		[posts],
	);
	const likes = useLikeState('post', postIds);

	useEffect(() => {
		let active = true;
		setLoadError(false);
		setPosts(null);
		setCounts({});
		listAllAccountantPosts()
			.then(records => {
				if (!active) return;
				setPosts(records);
				// Jumlah komentar hanya pelengkap: kegagalannya tidak boleh
				// menyembunyikan posting yang sudah berhasil dimuat.
				listCommentCounts(records.map(post => post.id))
					.then(next => {
						if (active) setCounts(next);
					})
					.catch(() => {
						/* posting tetap tampil meski jumlah komentar gagal dimuat */
					});
			})
			.catch(() => {
				if (active) setLoadError(true);
			});
		return () => {
			active = false;
		};
	}, [reloadKey]);

	const visible = useMemo(() => {
		if (!posts) return [];
		const needle = query.trim().toLowerCase();
		return posts.filter(post => {
			if (tab === 'gambar' && postImageNames(post).length === 0) return false;
			if (!matchesCategory(post, category)) return false;
			if (!needle) return true;
			const profile = post.expand?.accountant;
			const haystack = `${post.body ?? ''} ${profile?.name ?? ''} ${profile?.city ?? ''} ${profile?.cv_name ?? ''}`.toLowerCase();
			return haystack.includes(needle);
		});
	}, [posts, tab, category, query]);

	return (
		<section>
			<div className="sticky top-16 z-20 -mx-4 border-b border-slate-100 bg-white/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
				<div className="flex items-center justify-between gap-3 py-3">
					<div className="flex items-center gap-5">
						{TABS.map(item => (
							<button
								key={item.id}
								type="button"
								onClick={() => setTab(item.id)}
								className={`relative pb-1 text-[15px] font-semibold ${
									tab === item.id ? 'text-[#102a4c]' : 'text-slate-400 hover:text-slate-600'
								}`}
							>
								{item.label}
								{tab === item.id ? (
									<span className="absolute inset-x-1 -bottom-3 h-0.5 rounded-full bg-emerald-500" />
								) : null}
							</button>
						))}
					</div>
					<label className="relative hidden w-56 sm:block">
						<span className="sr-only">Cari aktivitas</span>
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
						<input
							value={query}
							onChange={event => setQuery(event.target.value)}
							placeholder="Cari aktivitas"
							className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:bg-white"
						/>
					</label>
				</div>
				<div className="flex gap-1 overflow-x-auto pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{CATEGORIES.map(item => (
						<button
							key={item.id}
							type="button"
							onClick={() => setCategory(item.id)}
							className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
								category === item.id
									? 'bg-[#102a4c] text-white'
									: 'text-slate-600 hover:bg-slate-100'
							}`}
						>
							{item.label}
						</button>
					))}
				</div>
			</div>

			<label className="relative mt-3 block sm:hidden">
				<span className="sr-only">Cari aktivitas</span>
				<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
				<input
					value={query}
					onChange={event => setQuery(event.target.value)}
					placeholder="Cari aktivitas"
					className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-400"
				/>
			</label>

			{loadError ? (
				<div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-center">
					<p className="text-sm font-medium text-red-600">
						Gagal memuat aktivitas. Periksa koneksi, lalu coba lagi.
					</p>
					<button
						type="button"
						onClick={() => setReloadKey(key => key + 1)}
						className="mt-3 inline-flex h-10 items-center rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
					>
						Coba lagi
					</button>
				</div>
			) : posts === null ? (
				<div className="mt-4 columns-2 gap-3 md:columns-3 xl:columns-4">
					{[0, 1, 2, 3, 4, 5].map(index => (
						<div key={index} className="mb-3 h-64 break-inside-avoid animate-pulse rounded-2xl bg-slate-100" />
					))}
				</div>
			) : visible.length === 0 ? (
				<div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
					<p className="text-sm font-semibold text-[#102a4c]">Belum ada aktivitas di kategori ini</p>
					<p className="mt-1 text-sm text-slate-500">Coba kategori lain atau kata kunci yang berbeda.</p>
				</div>
			) : (
				<div className="mt-4 columns-2 gap-3 md:columns-3 xl:columns-4">
					{visible.map(post => (
						<FeedCard
							key={post.id}
							post={post}
							commentCount={counts[post.id] ?? 0}
							likeCount={likes.counts[post.id] ?? 0}
							liked={!!likes.liked[post.id]}
							onToggleLike={() => void likes.toggle(post.id)}
						/>
					))}
				</div>
			)}

		</section>
	);
}
