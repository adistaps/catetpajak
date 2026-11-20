import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Activity, ArrowLeft, ImagePlus, Loader2, Plus, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { getMyAkuntanProfile } from '@/lib/akuntan';
import { MentionTextarea } from '@/components/akuntan/mention-textarea';
import { ImageAdjustDialog } from '@/components/akuntan/image-adjust-dialog';
import {
	createAccountantPost,
	POST_BODY_MAX,
	POST_IMAGE_LIMIT,
	validateHighlightDraft,
	validatePostDraft,
	type PostKind,
} from '@/lib/accountant-posts';

type PageState =
	| { status: 'loading' }
	| { status: 'no-profile' }
	| { status: 'error' }
	| { status: 'ready'; profileId: string; ownerId: string; name: string };

/** Pilihan tujuan posting yang tampil sebelum formulir. */
const DESTINATIONS: {
	kind: PostKind;
	title: string;
	tagline: string;
	description: string;
	icon: typeof Store;
}[] = [
	{
		kind: 'hl_store',
		title: 'HL Store',
		tagline: 'Highlight di kartu Akuntan',
		description:
			'Tayangkan gambar sebagai konten Highlight pada kartu profil Anda di direktori Akuntan — cukup unggah satu atau beberapa gambar, tanpa teks.',
		icon: Store,
	},
	{
		kind: 'aktivitas',
		title: 'Aktivitas',
		tagline: 'Feed Activity publik',
		description:
			'Bagikan kegiatan harian Anda ke feed Activity publik — teks, gambar, atau keduanya.',
		icon: Activity,
	},
];

/**
 * Halaman buat posting — pengganti pop-up: pilih tujuan terlebih dahulu
 * (HL Store atau Aktivitas), lalu isi formulir. HL Store hanya menerima
 * gambar; Aktivitas tetap mendukung teks, mention, dan gambar.
 */
export function PostingPage() {
	const { user, isLoading } = useAuth();
	const navigate = useNavigate();
	const [state, setState] = useState<PageState>({ status: 'loading' });
	const [destination, setDestination] = useState<PostKind | null>(null);
	const [body, setBody] = useState('');
	const [files, setFiles] = useState<File[]>([]);
	const [previews, setPreviews] = useState<string[]>([]);
	const [adjustQueue, setAdjustQueue] = useState<File[]>([]);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let active = true;
		if (isLoading) return;
		if (!user) {
			if (active) setState({ status: 'no-profile' });
			return;
		}
		getMyAkuntanProfile(user.id)
			.then(profile => {
				if (!active) return;
				if (!profile) {
					setState({ status: 'no-profile' });
					return;
				}
				setState({
					status: 'ready',
					profileId: profile.id,
					ownerId: profile.owner,
					name: profile.name,
				});
			})
			.catch(() => {
				if (active) setState({ status: 'error' });
			});
		return () => {
			active = false;
		};
	}, [user, isLoading]);

	useEffect(() => {
		const urls = files.map(file => URL.createObjectURL(file));
		setPreviews(urls);
		return () => urls.forEach(url => URL.revokeObjectURL(url));
	}, [files]);

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		if (state.status !== 'ready' || !destination) return;
		const message =
			destination === 'hl_store'
				? validateHighlightDraft(files)
				: validatePostDraft(body, files.length, files);
		setError(message ?? '');
		if (message) return;
		setSaving(true);
		try {
			await createAccountantPost({
				accountantId: state.profileId,
				ownerId: state.ownerId,
				body: destination === 'hl_store' ? '' : body,
				files,
				kind: destination,
			});
			toast.success(
				destination === 'hl_store'
					? 'Highlight HL Store terbit pada kartu Akuntan Anda.'
					: 'Posting terbit.',
			);
			navigate(destination === 'hl_store' ? '/akuntan' : '/akuntan/activity');
		} catch {
			setError('Gagal menyimpan posting. Periksa gambar dan teks, lalu coba lagi.');
			setSaving(false);
		}
	}

	const destinationMeta = DESTINATIONS.find(item => item.kind === destination);

	return (
		<main className="mx-auto max-w-2xl px-5 py-8 md:px-8">
			<button
				type="button"
				onClick={() => navigate(-1)}
				className="inline-flex h-10 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-4 text-sm font-semibold text-[#12315a] shadow-soft-sm transition hover:bg-emerald-50"
			>
				<ArrowLeft className="size-4" strokeWidth={2} />
				Kembali
			</button>
			<h1 className="mt-5 text-3xl font-extrabold tracking-tight text-[#102a4c]">
				Buat posting
			</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Pilih tujuan posting terlebih dahulu, lalu bagikan konten Anda — bisa berupa
				teks, gambar, atau keduanya.
			</p>

			{state.status === 'loading' ? (
				<div className="mt-8 h-64 animate-pulse rounded-2xl bg-emerald-50" />
			) : null}
			{state.status === 'no-profile' ? (
				<div className="mt-8 rounded-2xl border border-emerald-200 bg-white p-6 shadow-soft-sm">
					<p className="text-sm font-semibold text-[#102a4c]">
						Anda belum memiliki profil akuntan.
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Lengkapi profil Anda terlebih dahulu sebelum membuat posting.
					</p>
					<Link
						to="/akuntan/dasbor"
						className="mt-4 inline-flex h-11 items-center rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-5 text-sm font-semibold text-white shadow-soft-sm hover:brightness-110"
					>
						Ke dasbor profil
					</Link>
				</div>
			) : null}
			{state.status === 'error' ? (
				<div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-6">
					<p className="text-sm font-medium text-red-700">
						Profil belum dapat dimuat. Coba muat ulang halaman.
					</p>
				</div>
			) : null}

			{state.status === 'ready' && !destination ? (
				<section className="mt-8" aria-label="Pilih tujuan posting">
					<h2 className="text-lg font-extrabold tracking-tight text-[#102a4c]">
						Pilih tujuan posting
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Ke mana posting ini akan ditayangkan?
					</p>
					<div className="mt-4 grid gap-4 sm:grid-cols-2">
						{DESTINATIONS.map(({ kind, title, tagline, description, icon: Icon }) => (
							<button
								key={kind}
								type="button"
								onClick={() => setDestination(kind)}
								className="flex flex-col items-start gap-3 rounded-2xl border border-emerald-100 bg-white p-5 text-left shadow-soft-sm transition hover:border-emerald-300 hover:bg-emerald-50/60 active:scale-[0.99]"
							>
								<span className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
									<Icon className="size-5" strokeWidth={1.9} />
								</span>
								<span>
									<span className="block text-base font-extrabold tracking-tight text-[#102a4c]">
										{title}
									</span>
									<span className="mt-0.5 block text-xs font-semibold text-emerald-700">
										{tagline}
									</span>
								</span>
								<span className="text-sm leading-relaxed text-muted-foreground">
									{description}
								</span>
								<span className="mt-1 inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-4 text-sm font-semibold text-white shadow-soft-sm">
									<Plus className="size-4" strokeWidth={2.25} />
									Buat posting {title}
								</span>
							</button>
						))}
					</div>
				</section>
			) : null}

			{state.status === 'ready' && destination && destinationMeta ? (
				<form onSubmit={submit} className="mt-8 rounded-2xl border border-emerald-100 bg-white p-5 shadow-soft-sm sm:p-6">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="inline-flex items-center gap-2 text-sm font-semibold text-[#102a4c]">
							<span className="inline-flex size-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
								<destinationMeta.icon className="size-4" strokeWidth={1.9} />
							</span>
							Tujuan: {destinationMeta.title}
							<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
								{destinationMeta.tagline}
							</span>
						</p>
						<button
							type="button"
							onClick={() => setDestination(null)}
							className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
						>
							<X className="size-3.5" />
							Ubah tujuan
						</button>
					</div>
					{destination === 'aktivitas' ? (
						<label className="mt-4 flex flex-col gap-1.5">
							<span className="text-[13px] font-semibold text-[#111]">Aktivitas</span>
							<MentionTextarea
								value={body}
								onChange={setBody}
								candidates={[{ id: state.ownerId, name: state.name }]}
								rows={5}
								maxLength={POST_BODY_MAX}
								placeholder="cth. Hari ini mendampingi klien menyusun laporan keuangan bulanan."
								className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
							/>
							<span className="text-xs text-slate-400">
								{body.trim().length}/{POST_BODY_MAX} · Ketik @ untuk menyebut pengguna
							</span>
						</label>
					) : (
						<p className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800">
							Highlight HL Store hanya menampilkan gambar — unggah minimal satu gambar
							di bawah, lalu terbitkan.
						</p>
					)}
					<div className="mt-4">
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
								const remaining = Math.max(0, POST_IMAGE_LIMIT - files.length);
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
						<p className="mt-1.5 text-xs text-slate-500">
							{destination === 'hl_store'
								? 'JPG, PNG, atau WebP. Maksimal 6 gambar, 5 MB per gambar — gambar saja, tanpa teks.'
								: 'JPG, PNG, atau WebP. Maksimal 6 gambar, 5 MB per gambar.'}
						</p>
					</div>
					{previews.length > 0 ? (
						<ul className="mt-4 grid grid-cols-3 gap-2">
							{previews.map((url, index) => (
								<li key={url} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
									<img src={url} alt={`Pratinjau gambar ${index + 1}`} className="size-full object-cover" />
									<button
										type="button"
										onClick={() => setFiles(current => current.filter((_, i) => i !== index))}
										className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow"
										aria-label={`Hapus gambar ${index + 1}`}
									>
										<X className="size-3.5" />
									</button>
								</li>
							))}
						</ul>
					) : null}
					{error ? (
						<p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
					) : null}
					<ImageAdjustDialog
						queue={adjustQueue}
						aspect={1}
						title="Sesuaikan gambar posting"
						description="Atur posisi dan perbesar gambar agar tampil rapi di feed Activity dan Highlight."
						onApply={result => {
							setFiles(current => [...current, result].slice(0, POST_IMAGE_LIMIT));
							setAdjustQueue(current => current.slice(1));
						}}
						onClose={() => setAdjustQueue([])}
					/>
					<div className="mt-5 flex justify-end gap-2">
						<Link
							to={destination === 'hl_store' ? '/akuntan' : '/akuntan/activity'}
							className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
						>
							Batal
						</Link>
						<button
							type="submit"
							disabled={saving}
							className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-5 text-sm font-semibold text-white shadow-soft-sm hover:brightness-110 disabled:opacity-60"
						>
							{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={2.25} />}
							{saving ? 'Menyimpan…' : 'Terbitkan'}
						</button>
					</div>
				</form>
			) : null}
		</main>
	);
}
