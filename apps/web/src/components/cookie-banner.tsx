import { useEffect, useState } from 'react';
import {
	acceptAllCookies,
	CookieConsentCategory,
	hasConsentDecision,
	isConsentGranted,
	onCookiePreferencesRequested,
	rejectOptionalCookies,
	saveConsent,
} from '@/lib/cookie-consent';

type Choices = { analytics: boolean; marketing: boolean; platformAnalytics: boolean };

export function CookieBanner() {
	const [open, setOpen] = useState(false);
	const [customizing, setCustomizing] = useState(false);
	const [choices, setChoices] = useState<Choices>({ analytics: false, marketing: false, platformAnalytics: false });

	useEffect(() => {
		setOpen(!hasConsentDecision());
		return onCookiePreferencesRequested(() => {
			setChoices({
				analytics: isConsentGranted(CookieConsentCategory.Analytics),
				marketing: isConsentGranted(CookieConsentCategory.Marketing),
				platformAnalytics: isConsentGranted(CookieConsentCategory.PlatformAnalytics),
			});
			setCustomizing(true);
			setOpen(true);
		});
	}, []);

	if (!open) return null;
	const options: { key: keyof Choices; title: string; description: string }[] = [
		{ key: 'analytics', title: 'Analitik', description: 'Membantu kami memahami statistik kunjungan situs.' },
		{ key: 'marketing', title: 'Pemasaran', description: 'Mengukur iklan dan membantu menyesuaikan iklan.' },
		{ key: 'platformAnalytics', title: 'Analitik platform', description: 'Hostinger menggunakan Amplitude untuk memahami dan meningkatkan toko dan checkout tanpa mengenali Anda secara langsung.' },
	];

	return (
		<section role="dialog" aria-label="Pengaturan cookie" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl rounded-2xl border border-emerald-100 bg-white p-4 text-slate-800 shadow-[0_12px_45px_rgba(15,35,25,0.22)] sm:p-5">
			<h2 className="text-base font-bold">Pilihan cookie</h2>
			<p className="mt-1 text-sm leading-relaxed text-slate-600">Kami menggunakan cookie yang diperlukan untuk menjalankan situs. Dengan izin Anda, cookie opsional membantu analitik dan pemasaran.</p>
			{customizing ? (
				<fieldset className="mt-3 space-y-3">
					<legend className="sr-only">Pilih kategori cookie opsional</legend>
					{options.map(option => (
						<label key={option.key} className="flex items-start gap-3 text-sm">
							<input type="checkbox" checked={choices[option.key]} onChange={event => setChoices(previous => ({ ...previous, [option.key]: event.target.checked }))} className="mt-1 size-4 accent-emerald-600" />
							<span><span className="block font-semibold">{option.title}</span><span className="text-xs text-slate-600">{option.description}</span></span>
						</label>
					))}
				</fieldset>
			) : null}
			<div className="mt-4 grid grid-cols-2 gap-2">
				<button type="button" onClick={() => { rejectOptionalCookies(); setOpen(false); }} className="min-h-11 rounded-lg border border-emerald-700 px-3 text-sm font-semibold text-emerald-800">Tolak opsional</button>
				<button type="button" onClick={() => { acceptAllCookies(); setOpen(false); }} className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white">Terima semua</button>
				<button type="button" onClick={() => { if (customizing) { saveConsent(choices); setOpen(false); } else setCustomizing(true); }} className="col-span-2 min-h-10 text-sm font-semibold text-emerald-800 underline underline-offset-2">{customizing ? 'Simpan pilihan' : 'Atur pilihan'}</button>
			</div>
		</section>
	);
}
