import { Link } from 'react-router';
import { Heart, MapPin, Monitor, Share2, Sparkles, Star, UserRound } from 'lucide-react';
import {
	akuntanPhotoUrl,
	parseEducationEntries,
	parseStrengths,
	parseWorkHistoryEntries,
	SERVICE_MODE_LABELS,
	type AkuntanProfile,
	type WorkHistoryEntry,
} from '@/lib/akuntan';
import { ActivityFeed, ActivityProvider, PostingButton } from '@/components/akuntan/profile-posts';

const SERVICE_HINTS = [
	'Pembukuan',
	'Laporan keuangan',
	'Pajak tahunan',
	'PPh 21',
	'SPT',
	'e-Faktur',
	'Konsultasi UMKM',
	'Penggajian',
];

function serviceTags(profile: AkuntanProfile): string[] {
	const saved = parseStrengths(profile.strengths);
	if (saved.length > 0) return saved.slice(0, 5);
	const haystack = `${profile.description} ${profile.cv_name}`.toLowerCase();
	const matched = SERVICE_HINTS.filter(tag => haystack.includes(tag.toLowerCase()));
	if (matched.length > 0) return matched.slice(0, 5);
	return ['Jasa akuntan', profile.city ? `Berbasis ${profile.city}` : 'Indonesia'].filter(Boolean);
}

function formatBirthDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

function FactBlock({ title, body }: { title: string; body: string }) {
	if (!body.trim()) return null;
	return (
		<section className="mt-8">
			<h2 className="text-xl font-extrabold tracking-tight text-[#111]">{title}</h2>
			<p className="mt-3 max-w-3xl whitespace-pre-line text-[15.5px] leading-relaxed text-slate-700">{body}</p>
		</section>
	);
}

function formatWorkMonth(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatWorkPeriod(entry: WorkHistoryEntry): string {
	const start = formatWorkMonth(entry.start_date);
	const end = entry.end_date ? formatWorkMonth(entry.end_date) : 'sekarang';
	if (!start && end === 'sekarang') return '';
	return [start, end].filter(Boolean).join(' – ');
}

function EducationHistory({ profile }: { profile: AkuntanProfile }) {
	const entries = parseEducationEntries(profile.education_entries);
	if (entries.length === 0) {
		return profile.education ? (
			<FactBlock title="Jenjang pendidikan" body={profile.education} />
		) : null;
	}
	return (
		<section className="mt-8">
			<h2 className="text-xl font-extrabold tracking-tight text-[#111]">Jenjang pendidikan</h2>
			<ol className="mt-4 flex flex-col gap-4">
				{entries.map((entry, index) => (
					<li key={index} className="rounded-2xl border border-slate-100 px-5 py-4">
						<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<p className="text-[16px] font-bold text-[#111]">{entry.university}</p>
							{entry.start_year ? (
								<p className="text-sm text-slate-500">Masuk {entry.start_year}</p>
							) : null}
						</div>
						<div className="mt-1 flex flex-wrap gap-2">
							{entry.level ? (
								<span className="rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-700">
									{entry.level}
								</span>
							) : null}
							{entry.major ? (
								<span className="rounded-full bg-slate-100 px-3 py-1 text-[13px] font-semibold text-slate-600">
									{entry.major}
								</span>
							) : null}
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}

function WorkHistory({ profile }: { profile: AkuntanProfile }) {
	const entries = parseWorkHistoryEntries(profile.work_history_entries);
	if (entries.length === 0) {
		return <FactBlock title="Riwayat pekerjaan" body={profile.work_history ?? ''} />;
	}
	return (
		<section className="mt-8">
			<h2 className="text-xl font-extrabold tracking-tight text-[#111]">Riwayat pekerjaan</h2>
			<ol className="mt-4 flex flex-col gap-4">
				{entries.map((entry, index) => (
					<li key={index} className="rounded-2xl border border-slate-100 px-5 py-4">
						<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<p className="text-[16px] font-bold text-[#111]">{entry.company}</p>
							{formatWorkPeriod(entry) ? (
								<p className="text-sm text-slate-500">{formatWorkPeriod(entry)}</p>
							) : null}
						</div>
						{entry.position ? (
							<p className="mt-1 text-sm font-semibold text-emerald-700">{entry.position}</p>
						) : null}
						{entry.description ? (
							<p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
								{entry.description}
							</p>
						) : null}
					</li>
				))}
			</ol>
		</section>
	);
}

function ProfileFacts({ profile }: { profile: AkuntanProfile }) {
	const rows = [
		{ label: 'Nama lengkap', value: profile.name },
		{ label: 'Nama', value: profile.cv_name },
		{ label: 'Tempat lahir', value: profile.birth_place },
		{
			label: 'Tanggal lahir',
			value: profile.birth_date ? formatBirthDate(profile.birth_date) : '',
		},
		{ label: 'Tempat tinggal', value: profile.residence },
		{ label: 'Domisili', value: profile.domicile },
		{ label: 'Kota layanan', value: profile.city },
	].filter(row => row.value && row.value.trim());

	return (
		<div>
			{rows.length > 0 ? (
				<section className="mt-10">
					<h2 className="text-xl font-extrabold tracking-tight text-[#111]">Data profil</h2>
					<dl className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
						{rows.map(row => (
							<div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline sm:gap-4">
								<dt className="text-sm text-slate-500">{row.label}</dt>
								<dd className="break-words text-[15px] font-semibold text-[#111]">{row.value}</dd>
							</div>
						))}
					</dl>
					{profile.birth_date ? (
						<p className="mt-2 text-xs text-slate-500">Tanggal lahir hanya terlihat oleh pemilik profil.</p>
					) : null}
				</section>
			) : null}
			<FactBlock title="Sertifikasi" body={profile.certifications ?? ''} />
			<EducationHistory profile={profile} />
			<WorkHistory profile={profile} />
		</div>
	);
}

function headline(profile: AkuntanProfile): string {
	if (profile.headline?.trim()) return profile.headline.trim();
	const first = profile.description
		.split(/(?<=[.!?])\s+/)
		.map(part => part.trim())
		.find(part => part.length > 40);
	if (first && first.length < 220) return first.replace(/[.!?]$/, '.');
	const place = profile.city ? ` di ${profile.city}` : '';
	return `${profile.name} dari ${profile.cv_name} siap membantu pembukuan dan pajak usaha Anda${place}.`;
}

export function ProfileDetail({ profile }: { profile: AkuntanProfile }) {
	const photo = akuntanPhotoUrl(profile);
	const tags = serviceTags(profile);
	const joined = new Date(profile.created);
	const year =
		Number.isNaN(joined.getTime()) ? null : joined.toLocaleDateString('id-ID', { year: 'numeric', timeZone: 'UTC' });

	return (
		<ActivityProvider profile={profile}>
		<div className="mx-auto grid max-w-6xl items-start gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
			<div className="order-2 min-w-0 lg:order-1">
				<Link to="/akuntan" className="text-sm font-semibold text-emerald-700 hover:underline">
					← Semua akuntan
				</Link>
				<div className="mt-5 flex flex-wrap gap-2">
					{tags.map(tag => (
						<span
							key={tag}
							className="rounded-full bg-emerald-50 px-3.5 py-1.5 text-[13px] font-semibold text-emerald-700"
						>
							{tag}
						</span>
					))}
				</div>
				<h1 className="mt-6 max-w-3xl text-[2rem] font-extrabold leading-[1.15] tracking-tight text-[#111] sm:text-[2.45rem]">
					{headline(profile)}
				</h1>

				<section className="mt-10">
					<h2 className="text-xl font-bold tracking-tight text-[#111]">Lokasi layanan</h2>
					<div className="mt-4 flex flex-col gap-3">
						<span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[#222]">
							<Monitor className="size-4" strokeWidth={1.75} />
							{SERVICE_MODE_LABELS[profile.service_mode] || 'Online'}
						</span>
						{profile.meeting_location?.trim() || profile.city ? (
							<p className="inline-flex items-start gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-[#222]">
								<MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" strokeWidth={1.75} />
								<span className="break-words">
									{profile.meeting_location?.trim() || `Di kota ${profile.city}`}
								</span>
							</p>
						) : (
							<p className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm text-slate-600">
								<MapPin className="size-4" strokeWidth={1.75} />
								Lokasi pertemuan belum dicantumkan
							</p>
						)}
					</div>
				</section>

				<section className="mt-8 rounded-[1.6rem] bg-[#f3f0ff] px-5 py-5 sm:px-6">
					<p className="flex items-center gap-2 text-lg font-bold text-violet-700">
						<Sparkles className="size-5" strokeWidth={1.75} />
						Profil terverifikasi direktori
					</p>
					<p className="mt-2 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
						{profile.highlight?.trim() ||
							`${profile.name} menayangkan profil atas nama ${profile.cv_name}${profile.city ? ` dan berbasis di ${profile.city}` : ''}. Minta nama untuk melihat kualifikasi lengkap sebelum memulai kerja sama pembukuan atau pajak.`}
					</p>
				</section>

				<section className="mt-10">
					<h2 className="text-2xl font-extrabold tracking-tight text-[#111]">Tentang {profile.name}</h2>
					<p className="mt-4 max-w-3xl whitespace-pre-line text-[15.5px] leading-relaxed text-slate-700">
						{profile.description ||
							`${profile.name} belum menambahkan deskripsi layanan.`}
					</p>
				</section>

				<ProfileFacts profile={profile} />
				<ActivityFeed />
			</div>

			<aside className="order-1 lg:sticky lg:top-24 lg:order-2">
				<div className="rounded-[1.6rem] border border-slate-100 bg-white px-6 pb-6 pt-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
					<div className="flex justify-end gap-3 text-slate-400">
						<Heart className="size-5" strokeWidth={1.75} aria-hidden />
						<Share2 className="size-5" strokeWidth={1.75} aria-hidden />
					</div>
					<div className="mx-auto mt-1 w-full max-w-[13.5rem] overflow-hidden rounded-2xl bg-[#e7f3ec]">
						{photo ? (
							<img
								src={photo}
								alt={`Foto ${profile.name}`}
								className="block h-auto w-full object-contain"
							/>
						) : (
							<div className="flex h-28 w-full items-center justify-center">
								<UserRound className="size-12 text-emerald-300" />
							</div>
						)}
					</div>
					<h2 className="mt-4 break-words text-center text-2xl font-extrabold leading-tight tracking-tight text-[#111]">{profile.name}</h2>
					<p className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-600">
						<Star className="size-4 fill-amber-400 text-amber-400" strokeWidth={1.5} />
						<span className="font-semibold">Profil publik</span>
						{year ? <span className="text-slate-400">· sejak {year}</span> : null}
					</p>

					<dl className="mt-6 space-y-3 text-[15px]">
						<div className="flex items-baseline justify-between gap-4">
							<dt className="shrink-0 text-slate-500">Nama</dt>
							<dd className="min-w-0 break-words text-right font-bold text-[#111]">{profile.cv_name}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="shrink-0 text-slate-500">Kota</dt>
							<dd className="min-w-0 break-words text-right font-bold text-[#111]">{profile.city || 'Belum diisi'}</dd>
						</div>
					</dl>

					<PostingButton />
					<p className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-center text-[13px] font-medium leading-relaxed text-emerald-800">
						Penghubungan dengan {profile.name} dilakukan melalui direktori Catet Akuntan.
					</p>
				</div>
			</aside>
		</div>
		</ActivityProvider>
	);
}
