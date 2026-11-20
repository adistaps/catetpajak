import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Heart, Loader2, MapPin, Plus, Search, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
	akuntanPhotoUrl,
	getMyAkuntanProfile,
	highestEducationLevel,
	parseEducationEntries,
	parseStrengths,
	SERVICE_MODE_LABELS,
	type AkuntanProfile,
} from '@/lib/akuntan';
import {
	listAccountantPosts,
	listCommentCounts,
	postImageNames,
	postImageUrl,
	type AccountantPost,
} from '@/lib/accountant-posts';
import { listLikeCounts } from '@/lib/accountant-likes';
import { MentionText } from '@/components/akuntan/mention-text';
import { ProfileManager } from '@/components/akuntan/profile-manager';
import { PencariNotice } from '@/components/akuntan/pencari-notice';

type TabId = 'aktivitas' | 'profil';

function relativeTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
	if (days <= 0) return 'hari ini';
	if (days === 1) return '1 hari lalu';
	if (days < 30) return `${days} hari lalu`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months} bln lalu`;
	return `${Math.floor(months / 12)} thn lalu`;
}

function shortBio(profile: AkuntanProfile): string {
	const text = profile.highlight?.trim() || profile.headline?.trim() || profile.description?.trim();
	return text || 'Lengkapi ringkasan layanan agar pencari lebih mudah mengenal jasa Anda.';
}

export function ProfileDetailStudio() {
	const { user, isLoading } = useAuth();
	const [profile, setProfile] = useState<AkuntanProfile | null>(null);
	const [ready, setReady] = useState(false);
	const [tab, setTab] = useState<TabId>('aktivitas');
	const [posts, setPosts] = useState<AccountantPost[]>([]);
	const [likes, setLikes] = useState<Record<string, number>>({});
	const [comments, setComments] = useState<Record<string, number>>({});
	const [query, setQuery] = useState('');
	const [searchOpen, setSearchOpen] = useState(false);

	useEffect(() => {
		if (isLoading) return;
		if (!user) {
			setReady(true);
			return;
		}
		let active = true;
		getMyAkuntanProfile(user.id)
			.then(async record => {
				if (!active) return;
				setProfile(record);
				if (!record) {
					setTab('profil');
					return;
				}
				const records = await listAccountantPosts(record.id);
				if (!active) return;
				setPosts(records);
				const ids = records.map(post => post.id);
				const [likeMap, commentMap] = await Promise.all([
					listLikeCounts('post', ids).catch(() => ({})),
					listCommentCounts(ids).catch(() => ({})),
				]);
				if (!active) return;
				setLikes(likeMap);
				setComments(commentMap);
			})
			.finally(() => {
				if (active) setReady(true);
			});
		return () => {
			active = false;
		};
	}, [isLoading, user]);

	const strengths = profile ? parseStrengths(profile.strengths) : [];
	const education = profile
		? highestEducationLevel(parseEducationEntries(profile.education_entries)) || profile.education
		: '';
	const likeTotal = useMemo(() => Object.values(likes).reduce((sum, n) => sum + n, 0), [likes]);
	const commentTotal = useMemo(
		() => Object.values(comments).reduce((sum, n) => sum + n, 0),
		[comments],
	);
	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return posts;
		return posts.filter(post => (post.body ?? '').toLowerCase().includes(needle));
	}, [posts, query]);
	const photo = profile ? akuntanPhotoUrl(profile) : null;

	if (!ready) {
		return (
			<div className="flex min-h-[50dvh] items-center justify-center text-emerald-700">
				<Loader2 className="size-6 animate-spin" />
			</div>
		);
	}

	return (
		<div className="bg-white">
			<section className="relative overflow-hidden border-b border-slate-200 bg-white">
				<div className="relative mx-auto max-w-6xl px-4 pb-5 pt-6 sm:px-6 md:pb-6 md:pt-8">
					<div className="flex items-start gap-3 sm:gap-4">
						<div className="size-16 shrink-0 overflow-hidden rounded-full border-2 border-slate-200 bg-emerald-950 sm:size-[4.5rem]">
							{photo ? (
								<img src={photo} alt="" className="size-full object-contain" />
							) : (
								<span className="flex size-full items-center justify-center">
									<UserRound className="size-7 text-emerald-200" />
								</span>
							)}
						</div>
						<div className="min-w-0 pt-1 text-slate-900">
							<h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
								{profile?.name || 'Profil Akuntan'}
							</h1>
							<p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
								{profile?.city ? <span>Kota layanan: {profile.city}</span> : <span>Catet Akuntan</span>}
								{profile?.domicile ? (
									<span className="inline-flex items-center gap-1">
										<MapPin className="size-3" />
										{profile.domicile}
									</span>
								) : null}
							</p>
						</div>
					</div>

					{profile ? (
						<div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-slate-700">
							<Stat value={posts.length} label="Posting" />
							<Stat value={likeTotal} label="Suka" />
							<Stat value={commentTotal} label="Komentar" />
						</div>
					) : null}

					<p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-700">
						{profile ? shortBio(profile) : 'Buat profil agar jasa Anda tampil di direktori Catet Akuntan.'}
					</p>

					{profile && (strengths.length > 0 || education || profile.service_mode) ? (
						<div className="mt-3 flex flex-wrap gap-1.5">
							{profile.service_mode ? (
								<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-200">
									{SERVICE_MODE_LABELS[profile.service_mode] ?? profile.service_mode}
								</span>
							) : null}
							{education ? (
								<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-200">
									{education}
								</span>
							) : null}
							{strengths.slice(0, 4).map(item => (
								<span
									key={item}
									className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-200"
								>
									{item}
								</span>
							))}
						</div>
					) : null}

					<div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-xl">
						<button
							type="button"
							onClick={() => setTab('profil')}
							className="inline-flex h-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 transition hover:bg-slate-200"
						>
							Ubah profil
						</button>
						{profile ? (
							<Link
								to="/akuntan/posting"
								className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-400"
							>
								<Plus className="size-4" />
								Posting
							</Link>
						) : (
							<Link
								to="/akuntan"
								className="inline-flex h-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-200"
							>
								Ke direktori
							</Link>
						)}
					</div>
				</div>
			</section>

			<div className="sticky top-16 z-20 border-b border-slate-200 bg-white">
				<div className="mx-auto flex max-w-6xl items-center gap-2 px-4 sm:px-6">
					<div className="flex min-w-0 flex-1 gap-6">
						<TabButton active={tab === 'aktivitas'} onClick={() => setTab('aktivitas')}>
							Aktivitas
						</TabButton>
						<TabButton active={tab === 'profil'} onClick={() => setTab('profil')}>
							Data profil
						</TabButton>
					</div>
					<button
						type="button"
						onClick={() => setSearchOpen(open => !open)}
						className="inline-flex size-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
						aria-label="Cari posting"
					>
						<Search className="size-4" />
					</button>
				</div>
				{searchOpen && tab === 'aktivitas' ? (
					<div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
						<input
							value={query}
							onChange={event => setQuery(event.target.value)}
							placeholder="Cari caption aktivitas…"
							className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-500 focus:bg-white"
						/>
					</div>
				) : null}
			</div>

			{tab === 'aktivitas' ? (
				<section className="mx-auto max-w-6xl px-3 py-4 sm:px-6">
					{!profile ? (
						<div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 px-5 py-10 text-center">
							<p className="text-sm text-slate-600">Belum ada profil. Lengkapi data profil untuk mulai memposting.</p>
							<button
								type="button"
								onClick={() => setTab('profil')}
								className="mt-4 inline-flex h-11 items-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white"
							>
								Isi data profil
							</button>
						</div>
					) : visible.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-slate-200 px-5 py-12 text-center">
							<p className="text-sm text-slate-500">
								{query ? 'Tidak ada posting yang cocok.' : 'Belum ada aktivitas. Bagikan kegiatan harian Anda.'}
							</p>
							<Link
								to="/akuntan/posting"
								className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white"
							>
								<Plus className="size-4" />
								Buat posting
							</Link>
						</div>
					) : (
						<ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
							{visible.map(post => (
								<PostTile
									key={post.id}
									post={post}
									name={profile.name}
									photo={photo}
									likes={likes[post.id] ?? 0}
								/>
							))}
						</ul>
					)}
					{profile ? (
						<p className="mt-6 text-center text-sm text-slate-500">
							<Link to={`/akuntan/profil/${profile.id}`} className="font-semibold text-emerald-700 hover:underline">
								Lihat halaman publik
							</Link>
						</p>
					) : null}
				</section>
			) : (
				<main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
					<PencariNotice />
					<ProfileManager
						embedded
						onSaved={() => {
							if (!user) return;
							void getMyAkuntanProfile(user.id).then(record => {
								setProfile(record);
								if (record) {
									void listAccountantPosts(record.id).then(setPosts);
								}
							});
						}}
					/>
				</main>
			)}
		</div>
	);
}

function Stat({ value, label }: { value: number; label: string }) {
	return (
		<p className="text-sm">
			<span className="text-base font-bold text-slate-900">{value.toLocaleString('id-ID')}</span>{' '}
			<span className="text-slate-600">{label}</span>
		</p>
	);
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`relative h-12 text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
		>
			{children}
			{active ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-emerald-600" /> : null}
		</button>
	);
}

function PostTile({
	post,
	name,
	photo,
	likes,
}: {
	post: AccountantPost;
	name: string;
	photo: string | null;
	likes: number;
}) {
	const images = postImageNames(post);
	return (
		<li className="overflow-hidden rounded-xl border border-slate-100 bg-white">
			<Link to={`/akuntan/activity/${post.id}`} className="block">
				<div className="flex min-h-40 items-center justify-center bg-[#f3f5f4] sm:min-h-52">
					{images.length > 0 ? (
						<img
							src={postImageUrl(post, images[0])}
							alt=""
							className="max-h-72 w-full object-contain"
						/>
					) : (
						<MentionText
							text={post.body}
							className="line-clamp-6 px-3 py-6 text-sm font-medium leading-relaxed text-slate-700"
						/>
					)}
				</div>
				{images.length > 0 && post.body?.trim() ? (
					<MentionText
						text={post.body}
						className="line-clamp-2 px-2.5 pt-2 text-[13px] font-medium leading-snug text-slate-900"
					/>
				) : null}
			</Link>
			<div className="flex items-center gap-1.5 px-2.5 py-2">
				{photo ? (
					<img src={photo} alt="" className="size-5 rounded-full object-contain" />
				) : (
					<span className="flex size-5 items-center justify-center rounded-full bg-emerald-50">
						<UserRound className="size-3 text-emerald-700" />
					</span>
				)}
				<span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
					{name}
					<span className="text-slate-400"> · {relativeTime(post.created)}</span>
				</span>
				<span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
					<Heart className="size-3" />
					{likes}
				</span>
			</div>
		</li>
	);
}
