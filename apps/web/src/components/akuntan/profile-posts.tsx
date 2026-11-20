import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ImagePlus, Loader2, MessageCircle, Pencil, Plus, Reply, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { LikeButton, useLikeState } from '@/components/akuntan/like-button';
import { MentionText } from '@/components/akuntan/mention-text';
import { MentionTextarea } from '@/components/akuntan/mention-textarea';
import { ImageAdjustDialog } from '@/components/akuntan/image-adjust-dialog';
import { toast } from 'sonner';
import { dedupeCandidates, type MentionCandidate } from '@/lib/mentions';
import {
	COMMENT_BODY_MAX,
	commentAuthorName,
	createAccountantPost,
	createCommentReply,
	createPostComment,
	deleteAccountantPost,
	deleteCommentReply,
	deletePostComment,
	listAccountantPosts,
	listCommentReplies,
	listPostComments,
	POST_BODY_MAX,
	POST_IMAGE_LIMIT,
	postImageNames,
	postImageUrl,
	REPLY_BODY_MAX,
	REPLY_IMAGE_LIMIT,
	replyImageNames,
	replyImageUrl,
	updateAccountantPost,
	validateComment,
	validatePostDraft,
	validateReplyDraft,
	type AccountantPost,
	type PostComment,
	type PostReply,
} from '@/lib/accountant-posts';
import type { AkuntanProfile } from '@/lib/akuntan';

type ActivityContextValue = {
	profile: AkuntanProfile;
	isOwner: boolean;
	posts: AccountantPost[];
	loading: boolean;
	error: string;
	openComposer: (post?: AccountantPost) => void;
	removePost: (post: AccountantPost) => Promise<void>;
};

const ActivityContext = createContext<ActivityContextValue | null>(null);

function useActivity() {
	const value = useContext(ActivityContext);
	if (!value) throw new Error('ActivityProvider missing');
	return value;
}

function formatPostDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

export function Composer({
	profileId,
	ownerId,
	editing,
	candidates,
	onClose,
	onSaved,
}: {
	profileId: string;
	ownerId: string;
	editing: AccountantPost | null;
	candidates: MentionCandidate[];
	onClose: () => void;
	onSaved: (post: AccountantPost, mode: 'create' | 'update') => void;
}) {
	const [body, setBody] = useState(editing?.body ?? '');
	const [files, setFiles] = useState<File[]>([]);
	const [removed, setRemoved] = useState<string[]>([]);
	const [previews, setPreviews] = useState<string[]>([]);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const [adjustQueue, setAdjustQueue] = useState<File[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const existing = (editing ? postImageNames(editing) : []).filter(name => !removed.includes(name));

	useEffect(() => {
		const urls = files.map(file => URL.createObjectURL(file));
		setPreviews(urls);
		return () => urls.forEach(url => URL.revokeObjectURL(url));
	}, [files]);

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const message = validatePostDraft(body, existing.length + files.length, files);
		setError(message ?? '');
		if (message) return;
		setSaving(true);
		try {
			const saved = editing
				? await updateAccountantPost(editing.id, { body, files, remove: removed })
				: await createAccountantPost({ accountantId: profileId, ownerId, body, files });
			onSaved(saved, editing ? 'update' : 'create');
		} catch {
			setError('Gagal menyimpan posting. Periksa gambar dan teks, lalu coba lagi.');
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="posting-title">
			<form onSubmit={submit} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[1.4rem] bg-white p-5 shadow-2xl sm:p-6">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 id="posting-title" className="text-lg font-extrabold tracking-tight text-[#111]">
							{editing ? 'Ubah posting' : 'Posting aktivitas'}
						</h2>
						<p className="mt-1 text-sm text-slate-500">Bagikan kegiatan harian. Bisa berupa teks, gambar, atau keduanya.</p>
					</div>
					<button type="button" onClick={onClose} className="inline-flex size-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Tutup">
						<X className="size-5" />
					</button>
				</div>
				<label className="mt-4 flex flex-col gap-1.5">
					<span className="text-[13px] font-semibold text-[#111]">Aktivitas</span>
					<MentionTextarea
						value={body}
						onChange={setBody}
						candidates={candidates}
						rows={4}
						maxLength={POST_BODY_MAX}
						placeholder="cth. Hari ini mendampingi klien menyusun laporan keuangan bulanan."
						className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
					/>
					<span className="text-xs text-slate-400">
						{body.trim().length}/{POST_BODY_MAX} · Ketik @ untuk menyebut pengguna
					</span>
				</label>
				<div className="mt-3">
					<input
						ref={inputRef}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						multiple
						className="hidden"
						onChange={event => {
							const picked = Array.from(event.target.files ?? []);
							event.target.value = '';
							if (picked.length === 0) return;
							const remaining = Math.max(0, POST_IMAGE_LIMIT - existing.length - files.length);
							if (remaining === 0) {
								toast.error(`Maksimal ${POST_IMAGE_LIMIT} gambar per posting.`);
								return;
							}
							setAdjustQueue(picked.slice(0, remaining));
						}}
					/>
					<button
						type="button"
						onClick={() => inputRef.current?.click()}
						className="inline-flex h-11 items-center gap-2 rounded-full border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
					>
						<ImagePlus className="size-4" />
						Unggah gambar
					</button>
					<p className="mt-1.5 text-xs text-slate-500">JPG, PNG, atau WebP. Maksimal 6 gambar, 5 MB per gambar.</p>
				</div>
				{existing.length + previews.length > 0 ? (
					<ul className="mt-4 grid grid-cols-3 gap-2">
						{existing.map(name => (
							<li key={name} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
								<img src={postImageUrl(editing!, name)} alt="" className="size-full object-contain" />
								<button
									type="button"
									onClick={() => setRemoved(current => [...current, name])}
									className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow"
									aria-label="Hapus gambar"
								>
									<X className="size-3.5" />
								</button>
							</li>
						))}
						{previews.map((url, index) => (
							<li key={url} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
								<img src={url} alt="" className="size-full object-cover" />
								<button
									type="button"
									onClick={() => setFiles(current => current.filter((_, i) => i !== index))}
									className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow"
									aria-label="Hapus gambar baru"
								>
									<X className="size-3.5" />
								</button>
							</li>
						))}
					</ul>
				) : null}
				{error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p> : null}
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">
						Batal
					</button>
					<button
						type="submit"
						disabled={saving}
						className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
					>
						{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
						{saving ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Terbitkan'}
					</button>
				</div>
			<ImageAdjustDialog
				queue={adjustQueue}
				aspect={1}
				title="Sesuaikan gambar"
				description="Atur posisi dan perbesar gambar agar tampil rapi pada postingan."
				onApply={result => {
					setFiles(current => [...current, result].slice(0, POST_IMAGE_LIMIT));
					setAdjustQueue(current => current.slice(1));
				}}
				onClose={() => setAdjustQueue([])}
			/>
			</form>
		</div>
	);
}

export function ActivityProvider({
	profile,
	children,
}: {
	profile: AkuntanProfile;
	children: React.ReactNode;
}) {
	const { user, isLoading } = useAuth();
	const [posts, setPosts] = useState<AccountantPost[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [composer, setComposer] = useState<AccountantPost | null | undefined>(undefined);

	useEffect(() => {
		let active = true;
		setLoading(true);
		listAccountantPosts(profile.id)
			.then(records => {
				if (active) setPosts(records);
			})
			.catch(() => {
				if (active) setError('Aktivitas belum dapat dimuat.');
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [profile.id]);

	const isOwner = !isLoading && !!user && user.id === profile.owner;

	const value = useMemo<ActivityContextValue>(
		() => ({
			profile,
			isOwner,
			posts,
			loading,
			error,
			openComposer: post => setComposer(post ?? null),
			removePost: async post => {
				await deleteAccountantPost(post.id);
				setPosts(current => current.filter(item => item.id !== post.id));
			},
		}),
		[profile, isOwner, posts, loading, error],
	);

	return (
		<ActivityContext.Provider value={value}>
			{children}
			{composer !== undefined && user ? (
				<Composer
					profileId={profile.id}
					ownerId={user.id}
					editing={composer}
					candidates={[{ id: profile.owner, name: profile.name }]}
					onClose={() => setComposer(undefined)}
					onSaved={(post, mode) => {
						setPosts(current =>
							mode === 'create'
								? [post, ...current]
								: current.map(item => (item.id === post.id ? post : item)),
						);
						setComposer(undefined);
					}}
				/>
			) : null}
		</ActivityContext.Provider>
	);
}

export function PostingButton() {
	const { isOwner, openComposer } = useActivity();
	if (!isOwner) return null;
	return (
		<button
			type="button"
			onClick={() => openComposer()}
			className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white shadow-soft-sm transition hover:bg-emerald-700 active:scale-[0.99]"
		>
			<Plus className="size-4" strokeWidth={2.25} />
			Posting
		</button>
	);
}

function formatCommentTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Asia/Jakarta',
	});
}

function ReplyComposer({
	commentAuthor,
	candidates,
	saving,
	error,
	onSubmit,
	onCancel,
}: {
	commentAuthor: string;
	candidates: MentionCandidate[];
	saving: boolean;
	error: string;
	onSubmit: (body: string, files: File[]) => void;
	onCancel: () => void;
}) {
	const [body, setBody] = useState('');
	const [files, setFiles] = useState<File[]>([]);
	const [previews, setPreviews] = useState<string[]>([]);
	const [adjustQueue, setAdjustQueue] = useState<File[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const urls = files.map(file => URL.createObjectURL(file));
		setPreviews(urls);
		return () => urls.forEach(url => URL.revokeObjectURL(url));
	}, [files]);

	return (
		<form
			onSubmit={event => {
				event.preventDefault();
				onSubmit(body, files);
			}}
			className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5"
		>
			<MentionTextarea
				value={body}
				onChange={setBody}
				candidates={candidates}
				rows={2}
				maxLength={REPLY_BODY_MAX}
				placeholder={`Balas ${commentAuthor || 'komentar ini'}…`}
				className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
			/>
			<div className="mt-1.5 flex items-center justify-between gap-2">
				<span className="text-xs text-slate-400">{body.trim().length}/{REPLY_BODY_MAX}</span>
				<input
					ref={inputRef}
					type="file"
					accept="image/jpeg,image/png,image/webp"
					multiple
					className="hidden"
					onChange={event => {
						const picked = Array.from(event.target.files ?? []);
						event.target.value = '';
						if (picked.length === 0) return;
						const remaining = Math.max(0, REPLY_IMAGE_LIMIT - files.length);
						if (remaining === 0) {
							toast.error(`Maksimal ${REPLY_IMAGE_LIMIT} gambar per balasan.`);
							return;
						}
						setAdjustQueue(picked.slice(0, remaining));
					}}
				/>
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
				>
					<ImagePlus className="size-3.5" />
					Gambar
				</button>
			</div>
			{previews.length > 0 ? (
				<ul className="mt-2 grid grid-cols-3 gap-1.5">
					{previews.map((url, index) => (
						<li key={url} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
							<img src={url} alt="" className="size-full object-cover" />
							<button
								type="button"
							onClick={() => setFiles(current => current.filter((_, i) => i !== index))}
								className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow"
								aria-label="Hapus gambar balasan"
							>
								<X className="size-3" />
							</button>
						</li>
					))}
				</ul>
			) : null}
			{error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
			<div className="mt-2 flex justify-end gap-2">
				<button
					type="button"
					onClick={onCancel}
						className="inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"
					>
					Batal
					</button>
				<button
					type="submit"
					disabled={saving}
					className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
				>
					{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
					Kirim balasan
					</button>
				</div>
			<ImageAdjustDialog
				queue={adjustQueue}
				aspect={1}
				title="Sesuaikan gambar balasan"
				description="Atur posisi dan perbesar gambar agar tampil rapi pada balasan."
				onApply={result => {
					setFiles(current => [...current, result].slice(0, REPLY_IMAGE_LIMIT));
					setAdjustQueue(current => current.slice(1));
				}}
				onClose={() => setAdjustQueue([])}
			/>
		</form>
	);
}

export function PostComments({
	postId,
	postOwner,
	variant = 'card',
	mentionCandidates = [],
}: {
	postId: string;
	postOwner: boolean;
	variant?: 'card' | 'panel';
	mentionCandidates?: MentionCandidate[];
}) {
	const { user, isAuthed, isLoading } = useAuth();
	const [comments, setComments] = useState<PostComment[]>([]);
	const [loading, setLoading] = useState(true);
	const [body, setBody] = useState('');
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const [replies, setReplies] = useState<Record<string, PostReply[]>>({});
	const [replyTo, setReplyTo] = useState<string | null>(null);
	const [replyError, setReplyError] = useState('');
	const [replySaving, setReplySaving] = useState(false);

	const commentLikeIds = comments.length > 0 ? comments.map(comment => comment.id) : null;
	const commentLikes = useLikeState('comment', commentLikeIds);
	const replyIds = useMemo(
		() => Object.values(replies).flat().map(reply => reply.id),
		[replies],
	);
	const replyLikes = useLikeState('reply', replyIds.length > 0 ? replyIds : null);
	const candidates = useMemo(
		() =>
			dedupeCandidates([
				...mentionCandidates,
				...comments.map(comment => ({ id: comment.owner, name: comment.author_name })),
				...Object.values(replies)
					.flat()
					.map(reply => ({ id: reply.owner, name: reply.author_name })),
			]),
		[mentionCandidates, comments, replies],
	);

	useEffect(() => {
		let active = true;
		listPostComments(postId)
			.then(records => {
				if (active) setComments(records);
			})
			.catch(() => {
				if (active) setError('Komentar belum dapat dimuat.');
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [postId]);

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		if (!user) return;
		const message = validateComment(body);
		setError(message ?? '');
		if (message) return;
		setSaving(true);
		try {
			const saved = await createPostComment({
				postId,
				ownerId: user.id,
				authorName: commentAuthorName(user as unknown as Record<string, unknown>),
				body,
			});
			setComments(current => [...current, saved]);
			setBody('');
		} catch {
			setError('Gagal mengirim komentar. Coba lagi.');
		} finally {
			setSaving(false);
		}
	}

	async function remove(comment: PostComment) {
		const previous = comments;
		setComments(current => current.filter(item => item.id !== comment.id));
		try {
			await deletePostComment(comment.id);
		} catch {
			setComments(previous);
			setError('Gagal menghapus komentar.');
		}
	}

	const commentIds = comments.map(comment => comment.id).join(',');
	useEffect(() => {
		let active = true;
		if (!commentIds) {
			setReplies({});
			return;
		}
		listCommentReplies(commentIds.split(','))
			.then(grouped => {
				if (active) setReplies(grouped);
			})
			.catch(() => {
				/* balasan gagal dimuat; komentar tetap tampil */
			});
		return () => {
			active = false;
		};
	}, [commentIds]);

	async function submitReply(commentId: string, replyBody: string, files: File[]) {
		if (!user) return;
		const message = validateReplyDraft(replyBody, files);
		setReplyError(message ?? '');
		if (message) return;
		setReplySaving(true);
		try {
			const saved = await createCommentReply({
				commentId,
				ownerId: user.id,
				authorName: commentAuthorName(user as unknown as Record<string, unknown>),
				body: replyBody,
				files,
			});
			setReplies(current => ({
				...current,
				[commentId]: [...(current[commentId] ?? []), saved],
			}));
			setReplyTo(null);
			setReplyError('');
		} catch {
			setReplyError('Gagal mengirim balasan. Periksa gambar dan teks, lalu coba lagi.');
		} finally {
			setReplySaving(false);
		}
	}

	async function removeReply(commentId: string, reply: PostReply) {
		const previous = replies[commentId] ?? [];
		setReplies(current => ({
			...current,
			[commentId]: (current[commentId] ?? []).filter(item => item.id !== reply.id),
		}));
		try {
			await deleteCommentReply(reply.id);
		} catch {
			setReplies(current => ({ ...current, [commentId]: previous }));
			setError('Gagal menghapus balasan.');
		}
	}

	const panel = variant === 'panel';
	const composer = isLoading ? null : isAuthed && user ? (
		<form onSubmit={submit} className={panel ? 'flex items-center gap-2' : 'mt-3 flex flex-col gap-2 sm:flex-row sm:items-end'}>
			<label className="min-w-0 flex-1">
				<span className="sr-only">Komentar</span>
				<MentionTextarea
					value={body}
					onChange={setBody}
					candidates={candidates}
					rows={panel ? 1 : 2}
					maxLength={COMMENT_BODY_MAX}
					placeholder="Tulis komentar…"
					ariaLabel="Komentar"
					popupPlacement={panel ? 'top' : 'bottom'}
					className={
						panel
							? 'max-h-24 min-h-10 w-full resize-none rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:bg-white'
							: 'w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
					}
				/>
			</label>
			<button
				type="submit"
				disabled={saving}
				className={
					panel
						? 'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60'
						: 'inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60'
				}
				aria-label="Kirim komentar"
			>
				{saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
				{panel ? null : 'Kirim'}
			</button>
		</form>
	) : (
		<p className={panel ? 'text-sm text-slate-500' : 'mt-3 text-sm text-slate-500'}>
			<Link to="/akuntan/masuk" className="font-semibold text-emerald-700 hover:underline">
				Masuk
			</Link>{' '}
			untuk menulis komentar atau memberi suka.
		</p>
	);

	return (
		<div id="komentar" className={panel ? 'flex min-h-0 flex-1 flex-col' : 'mt-4 border-t border-slate-100 pt-3'}>
			{panel ? null : (
				<p className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
					<MessageCircle className="size-4" />
					Komentar{loading ? '' : ` (${comments.length})`}
				</p>
			)}
			<div className={panel ? 'min-h-0 flex-1 overflow-y-auto' : undefined}>
				{loading ? <div className="mt-3 h-10 animate-pulse rounded-xl bg-slate-50" /> : null}
				{!loading && comments.length === 0 ? (
					<p className="mt-2 text-sm text-slate-500">Belum ada komentar.</p>
				) : null}
				<ul className="mt-2 flex flex-col gap-3">
					{comments.map(comment => {
						const canDelete = postOwner || (!!user && user.id === comment.owner);
						return (
							<li key={comment.id} className={panel ? 'pr-1' : 'rounded-xl bg-slate-50 px-3 py-2.5'}>
								<div className="flex items-start justify-between gap-2">
									<p className="min-w-0 text-sm">
										<span className="font-semibold text-[#111]">{comment.author_name || 'Pengguna'}</span>
										<span className="ml-2 text-xs text-slate-400">{formatCommentTime(comment.created)}</span>
									</p>
									{canDelete ? (
										<button
											type="button"
											onClick={() => remove(comment)}
											className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
										>
											<Trash2 className="size-3.5" />
											Hapus
										</button>
									) : null}
								</div>
								<MentionText
									text={comment.body}
									className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700"
								/>
								<div className="mt-1.5 flex items-center gap-1">
									<LikeButton
										count={commentLikes.counts[comment.id] ?? 0}
										liked={!!commentLikes.liked[comment.id]}
										busy={!!commentLikes.busy[comment.id]}
										onToggle={() => void commentLikes.toggle(comment.id)}
									/>
									{!isLoading && isAuthed && user ? (
										<button
											type="button"
											onClick={() => {
												setReplyTo(current => (current === comment.id ? null : comment.id));
												setReplyError('');
											}}
											className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
										>
											<Reply className="size-3.5" />
											Balas
										</button>
									) : null}
								</div>
								{replyTo === comment.id ? (
									<ReplyComposer
										commentAuthor={comment.author_name}
										candidates={candidates}
										saving={replySaving}
										error={replyError}
										onSubmit={(replyBody, files) => void submitReply(comment.id, replyBody, files)}
										onCancel={() => {
											setReplyTo(null);
											setReplyError('');
										}}
									/>
								) : null}
								{(replies[comment.id] ?? []).length > 0 ? (
									<ul className="mt-2 flex flex-col gap-2 border-l-2 border-emerald-100 pl-3">
										{(replies[comment.id] ?? []).map(reply => {
											const replyImages = replyImageNames(reply);
											const canDeleteReply =
												postOwner ||
												(!!user && (user.id === reply.owner || user.id === comment.owner));
											return (
												<li key={reply.id} className="rounded-lg bg-emerald-50/60 px-2.5 py-2">
													<div className="flex items-start justify-between gap-2">
														<p className="min-w-0 text-sm">
															<span className="font-semibold text-emerald-900">{reply.author_name || 'Pengguna'}</span>
															<span className="ml-2 text-xs text-slate-400">{formatCommentTime(reply.created)}</span>
														</p>
														{canDeleteReply ? (
															<button
																type="button"
																onClick={() => void removeReply(comment.id, reply)}
																className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
															>
																<Trash2 className="size-3" />
																Hapus
															</button>
														) : null}
													</div>
													{reply.body?.trim() ? (
														<MentionText
															text={reply.body}
															className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700"
														/>
													) : null}
													{replyImages.length > 0 ? (
														<ul className="mt-1.5 flex flex-col gap-1.5">
															{replyImages.map(name => (
																<li key={name} className="overflow-hidden rounded-lg bg-slate-100">
																	<img
																		src={replyImageUrl(reply, name)}
																		alt="Gambar balasan"
																		className="mx-auto max-h-64 w-full object-contain"
																	/>
																</li>
															))}
														</ul>
													) : null}
													<div className="mt-1">
														<LikeButton
															count={replyLikes.counts[reply.id] ?? 0}
															liked={!!replyLikes.liked[reply.id]}
															busy={!!replyLikes.busy[reply.id]}
															onToggle={() => void replyLikes.toggle(reply.id)}
														/>
													</div>
												</li>
											);
										})}
									</ul>
								) : null}
							</li>
						);
					})}
				</ul>
				{error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
				{panel ? null : composer}
			</div>
			{panel ? <div className="border-t border-slate-100 pt-3">{composer}</div> : null}
		</div>
	);
}

function PostCard({ post }: { post: AccountantPost }) {
	const { profile, isOwner, openComposer, removePost } = useActivity();
	const postLikes = useLikeState('post', [post.id]);
	const [confirming, setConfirming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState('');
	const images = postImageNames(post);

	async function confirmDelete() {
		setDeleting(true);
		setDeleteError('');
		try {
			await removePost(post);
		} catch {
			setDeleteError('Gagal menghapus posting.');
			setDeleting(false);
		}
	}

	return (
		<article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-5">
			<div className="flex items-start justify-between gap-3">
				<p className="text-sm font-semibold text-slate-500">{formatPostDate(post.created)}</p>
				{isOwner ? (
					<div className="flex shrink-0 gap-1">
						<button
							type="button"
							onClick={() => openComposer(post)}
							className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
						>
							<Pencil className="size-3.5" />
							Ubah
						</button>
						<button
							type="button"
							onClick={() => setConfirming(true)}
							className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
						>
							<Trash2 className="size-3.5" />
							Hapus
						</button>
					</div>
				) : null}
			</div>
			{post.body?.trim() ? (
				<MentionText
					text={post.body}
					className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-slate-800"
				/>
			) : null}
			{images.length === 1 ? (
				<ul className="mt-3 flex flex-col gap-2">
					<li className="overflow-hidden rounded-xl bg-slate-100">
						<img
							src={postImageUrl(post, images[0])}
							alt="Gambar aktivitas"
							className="mx-auto max-h-[36rem] w-full object-contain"
						/>
					</li>
			</ul>
			) : images.length > 1 ? (
				<ul
					className={`mt-3 grid gap-2 ${
						images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
					}`}
				>
					{images.map(name => (
						<li key={name} className="overflow-hidden rounded-xl bg-slate-100">
							<img
								src={postImageUrl(post, name)}
								alt="Gambar aktivitas"
								className="aspect-[4/3] w-full object-contain"
							/>
						</li>
					))}
				</ul>
			) : null}
			<div className="mt-3 flex items-center gap-1">
				<LikeButton
					count={postLikes.counts[post.id] ?? 0}
					liked={!!postLikes.liked[post.id]}
					busy={!!postLikes.busy[post.id]}
					onToggle={() => void postLikes.toggle(post.id)}
				/>
			</div>
			<PostComments
				postId={post.id}
				postOwner={isOwner}
				mentionCandidates={[{ id: profile.owner, name: profile.name }]}
			/>
			{confirming ? (
				<div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-3">
					<p className="text-sm font-medium text-red-700">Hapus posting ini? Tindakan ini tidak dapat dibatalkan.</p>
					{deleteError ? <p className="mt-1 text-xs text-red-600">{deleteError}</p> : null}
					<div className="mt-2 flex gap-2">
						<button
							type="button"
							disabled={deleting}
							onClick={confirmDelete}
							className="inline-flex h-9 items-center rounded-full bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
						>
							{deleting ? 'Menghapus…' : 'Ya, hapus'}
						</button>
						<button type="button" onClick={() => setConfirming(false)} className="inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold text-slate-600">
							Batal
						</button>
					</div>
				</div>
			) : null}
		</article>
	);
}

export function ActivityFeed() {
	const { posts, loading, error, isOwner } = useActivity();
	if (loading) {
		return <div className="mt-10 h-28 animate-pulse rounded-2xl bg-emerald-50" />;
	}
	if (error) {
		return <p className="mt-8 text-sm text-slate-500">{error}</p>;
	}
	if (posts.length === 0 && !isOwner) return null;

	return (
		<section className="mt-10">
			<h2 className="text-xl font-extrabold tracking-tight text-[#111]">Aktivitas harian</h2>
			{posts.length === 0 ? (
				<p className="mt-3 text-sm leading-relaxed text-slate-500">
					Belum ada posting. Gunakan tombol Posting untuk membagikan kegiatan harian.
				</p>
			) : (
				<div className="mt-4 flex flex-col gap-3">
					{posts.map(post => (
						<PostCard key={post.id} post={post} />
					))}
				</div>
			)}
		</section>
	);
}
