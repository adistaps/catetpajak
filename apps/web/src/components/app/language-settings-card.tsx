import { Languages, Check } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { LANGUAGES, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Kartu pilihan bahasa pada bagian Perusahaan di Pengaturan.
 * Memakai mekanisme penyimpanan bahasa yang sudah ada (localStorage) sehingga
 * pilihan tetap berlaku saat berpindah halaman atau masuk kembali.
 */
export function LanguageSettingsCard() {
	const { lang, setLang } = useLanguage();

	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3 sm:px-5">
				<Languages className="size-4 text-primary" strokeWidth={1.75} />
				<h2 className="text-base font-bold tracking-tight text-foreground">Bahasa aplikasi</h2>
			</div>
			<div className="px-4 py-4 sm:px-5">
				<p className="text-sm text-muted-foreground">
					Pilih bahasa antarmuka Catet Pajak. Pilihan disimpan di perangkat ini dan tetap
					berlaku saat berpindah halaman atau masuk kembali. Data bisnis tidak diterjemahkan.
				</p>
				<div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Bahasa aplikasi">
					{LANGUAGES.map(option => {
						const isSelected = lang === option.code;
						return (
							<button
								key={option.code}
								type="button"
								role="radio"
								aria-checked={isSelected}
								onClick={() => setLang(option.code as Lang)}
								className={cn(
									'flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition-colors',
									isSelected
										? 'border-primary bg-accent/50 ring-1 ring-primary/30'
										: 'border-border bg-background hover:border-primary/40',
								)}
							>
								<span className="flex items-center gap-2.5">
									<span className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
										{option.short}
									</span>
									<span className="text-sm font-semibold text-foreground">{option.label}</span>
								</span>
								{isSelected ? <Check className="size-4 text-primary" strokeWidth={3} /> : null}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
