import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Building2, MapPin, Play, UserRound } from 'lucide-react';
import {
	akuntanPhotoUrl,
	listAkuntanProfiles,
	type AkuntanProfile,
} from '@/lib/akuntan';
import {
	hlPostsByAccountant,
	latestHighlightByAccountant,
	listAllAccountantHighlights,
	postImageNames,
	postImageUrl,
	type AccountantPost,
} from '@/lib/accountant-posts';
import { CvRequestDialog } from '@/components/akuntan/cv-request-dialog';
import { HlStoryViewer, type HlStory } from '@/components/akuntan/hl-story-viewer';

function ProfileCard({
	profile,
	highlight,
	storyIndex,
	onOpenStory,
}: {
	profile: AkuntanProfile;
	highlight: AccountantPost | null;
	storyIndex: number | null;
	onOpenStory: (index: number) => void;
}) {
	const photo = akuntanPhotoUrl(profile);
	const highlightImage = highlight ? postImageNames(highlight)[0] : null;
	const badgeSrc = highlight && highlightImage
		? postImageUrl(highlight, highlightImage, '400x400f')
		: photo;
	const badgeClass = [
		'absolute left-3 top-3 z-10 flex size-16 items-center justify-center rounded-full bg-white p-[3px] shadow-soft-sm',
		storyIndex !== null ? 'ring-[5px] ring-emerald-500' : '',
	].filter(Boolean).join(' ');
	const badgeContent = badgeSrc ? (
		<img src={badgeSrc} alt="" className="size-full rounded-full object-cover" />
	) : (
		<span className="flex size-full items-center justify-center rounded-full bg-emerald-50 text-emerald-400">
			<UserRound className="size-5" strokeWidth={1.7} />
		</span>
	);
	return (
		<article className="relative overflow-hidden rounded-[1.4rem] border border-emerald-100 bg-white shadow-soft-sm">
			{storyIndex === null ? (
				<Link
					to={`/akuntan/profil/${profile.id}`}
					aria-label={`Lihat profil ${profile.name}`}
					className={badgeClass}
				>
					{badgeContent}
				</Link>
			) : (
				<button
					type="button"
					onClick={() => onOpenStory(storyIndex)}
					aria-label={`Buka Story HL Store ${profile.name}`}
					title="Buka Story HL Store"
					className={badgeClass}
				>
					{badgeContent}
					<span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
						<Play className="size-3 fill-white" strokeWidth={0} />
					</span>
				</button>
			)}
			<Link
				to={`/akuntan/profil/${profile.id}`}
				aria-label={`Lihat profil ${profile.name}`}
				className="block"
			>
				<div
					className={[
						'relative flex aspect-[4/5] items-end overflow-hidden bg-[#e7f3ec]',
						storyIndex !== null ? 'ring-[6px] ring-emerald-500 ring-inset' : '',
					]
						.filter(Boolean)
						.join(' ')}
				>
					{photo ? (
						<img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
					) : (
						<UserRound className="absolute left-1/2 top-1/3 size-16 -translate-x-1/2 text-emerald-300" strokeWidth={1.4} />
					)}
					<div className="relative w-full bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
						<h3 className="text-lg font-bold tracking-tight">{profile.name}</h3>
						<p className="mt-0.5 line-clamp-2 text-xs text-white/85">
							{profile.city ? profile.city : 'Indonesia'}
							{profile.cv_name ? ` · ${profile.cv_name}` : ''}
						</p>
					</div>
				</div>
			</Link>
			<div className="flex flex-col gap-2.5 p-4">
				{highlight ? (
					<p
						className="line-clamp-1 text-xs font-semibold text-emerald-700"
						title={highlight.body?.trim() || undefined}
					>
						<span className="mr-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
							HL Store
						</span>
						{highlight.body?.trim() || 'Highlight terbaru'}
					</p>
				) : null}
				<p className="flex items-start gap-1.5 text-sm font-semibold leading-snug text-emerald-800">
					<Building2 className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
					<span className="min-w-0 break-words">{profile.cv_name}</span>
				</p>
				<Link
					to={`/akuntan/profil/${profile.id}`}
					className="inline-flex w-fit items-center text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline"
				>
					Lihat profil
				</Link>
				<CvRequestDialog profile={profile} />
				{profile.description ? (
					<p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{profile.description}</p>
				) : (
					<p className="text-sm text-muted-foreground">Profil jasa akuntan.</p>
				)}
				{profile.city ? (
					<div className="flex flex-wrap gap-3 pt-0.5 text-xs text-muted-foreground">
						<span className="inline-flex items-center gap-1">
							<MapPin className="size-3.5 shrink-0 text-emerald-500" />
							<span className="break-words">{profile.city}</span>
						</span>
					</div>
				) : null}
			</div>
		</article>
	);
}

export function AkuntanDirectory({
	refreshToken,
	query,
}: {
	refreshToken: number;
	query: string;
}) {
	const [profiles, setProfiles] = useState<AkuntanProfile[] | null>(null);
	const [hlPosts, setHlPosts] = useState<AccountantPost[] | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [openStory, setOpenStory] = useState<number | null>(null);

	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		const refresh = () => setReloadKey(key => key + 1);
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) refresh();
		};
		window.addEventListener('pageshow', onPageShow);
		return () => {
			window.removeEventListener('pageshow', onPageShow);
		};
	}, []);

	useEffect(() => {
		let active = true;
		setLoadError(false);
		setProfiles(null);
		Promise.all([
			listAkuntanProfiles(),
			listAllAccountantHighlights().catch(() => [] as AccountantPost[]),
		])
			.then(([items, highlightPosts]) => {
				if (!active) return;
				setProfiles(items.filter(profile => Boolean(profile.owner)));
				setHlPosts(highlightPosts);
			})
			.catch(() => {
				if (active) setLoadError(true);
			});
		return () => {
			active = false;
		};
	}, [refreshToken, reloadKey]);

	const filtered = useMemo(() => {
		if (!profiles) return null;
		const needle = query.trim().toLowerCase();
		if (!needle) return profiles;
		return profiles.filter(profile =>
			[profile.name, profile.cv_name, profile.city, profile.description]
				.join(' ')
				.toLowerCase()
				.includes(needle),
		);
	}, [profiles, query]);

	const highlights = useMemo(
		() => latestHighlightByAccountant(hlPosts ?? []),
		[hlPosts],
	);

	/** Story HL Store per akuntan: seluruh gambar dari seluruh posting HL Store-nya. */
	const stories = useMemo<HlStory[]>(() => {
		if (!filtered || !hlPosts) return [];
		const grouped = hlPostsByAccountant(hlPosts);
		const result: HlStory[] = [];
		for (const profile of filtered) {
			const images = (grouped.get(profile.id) ?? []).flatMap(post =>
				postImageNames(post).map(name => postImageUrl(post, name)),
			);
			if (images.length === 0) continue;
			result.push({
				accountantId: profile.id,
				name: profile.name,
				subtitle: profile.cv_name || profile.city || undefined,
				images,
			});
		}
		return result;
	}, [filtered, hlPosts]);

	const storyIndexByAccountant = useMemo(() => {
		const map = new Map<string, number>();
		stories.forEach((story, index) => map.set(story.accountantId, index));
		return map;
	}, [stories]);

	// Sembunyikan seluruh bagian direktori bila tidak ada profil valid
	// (semua akun pemilik sudah dihapus). Pencarian tanpa hasil tetap
	// memakai state kosong di bawah.
	if (!loadError && profiles !== null && profiles.length === 0) {
		return null;
	}

	return (
		<section id="direktori" className="mx-auto max-w-6xl px-5 pb-16 md:px-8">
			<div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="text-xl font-bold tracking-tight text-[#102a4c]">Akuntan tersedia</h2>
				{filtered && filtered.length > 0 ? (
					<p className="text-sm text-muted-foreground">{filtered.length} profil</p>
				) : null}
			</div>
			{loadError ? (
				<p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
					Gagal memuat direktori. Muat ulang halaman untuk mencoba lagi.
				</p>
			) : filtered === null ? (
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2].map(index => (
						<div key={index} className="h-96 animate-pulse rounded-[1.4rem] bg-emerald-50" />
					))}
				</div>
			) : filtered.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-6 py-14 text-center">
					<UserRound className="mx-auto size-10 text-emerald-300" />
					<p className="mt-3 text-sm font-semibold text-foreground">
						{query.trim() ? 'Tidak ada akuntan yang cocok' : 'Belum ada akuntan terdaftar'}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{query.trim()
							? 'Coba kata kunci lain, atau kosongkan pencarian.'
							: 'Daftar di aplikasi Catet Akuntan untuk menayangkan profil Anda.'}
					</p>
				</div>
			) : (
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{filtered.map(profile => (
						<ProfileCard
							key={profile.id}
							profile={profile}
							highlight={highlights.get(profile.id) ?? null}
							storyIndex={storyIndexByAccountant.get(profile.id) ?? null}
							onOpenStory={setOpenStory}
						/>
					))}
				</div>
			)}
			{openStory !== null && stories.length > 0 ? (
				<HlStoryViewer
					stories={stories}
					startIndex={Math.min(openStory, stories.length - 1)}
					onClose={() => setOpenStory(null)}
				/>
			) : null}
		</section>
	);
}
