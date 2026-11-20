import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LANG, LANG_STORAGE_KEY, translate, type Lang } from '@/lib/i18n';

interface LanguageContextValue {
	lang: Lang;
	setLang: (lang: Lang) => void;
	t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
	lang: DEFAULT_LANG,
	setLang: () => {},
	t: (key) => key,
});

/**
 * Penyedia bahasa aplikasi. Bahasa disimpan di localStorage agar tetap berlaku
 * saat berpindah halaman atau masuk kembali. Atribut `<html lang>` diperbarui
 * agar pembaca layar dan mesin pencari membaca bahasa yang benar.
 *
 * Server merender dengan bahasa default (id); klien memuat pilihan tersimpan
 * setelah hidrasi — pola yang sama dengan sesi PocketBase.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
	const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
			if (stored === 'en' || stored === 'id') {
				setLangState(stored);
			}
		} catch {
			/* localStorage tidak tersedia — gunakan default */
		}
	}, []);

	useEffect(() => {
		document.documentElement.lang = lang;
	}, [lang]);

	const setLang = useCallback((next: Lang) => {
		setLangState(next);
		try {
			window.localStorage.setItem(LANG_STORAGE_KEY, next);
		} catch {
			/* abaikan kegagalan penyimpanan */
		}
	}, []);

	const t = useCallback(
		(key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
		[lang],
	);

	const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

	return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
	return useContext(LanguageContext);
}

export default useLanguage;
