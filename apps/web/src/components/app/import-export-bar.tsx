import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { readCsvFile } from '@/lib/import-export';
import { recordImportFailure } from '@/lib/app-notices';
import { cn } from '@/lib/utils';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/hooks/use-language';

interface ImportExportBarProps {
	/** Dipanggil saat tombol Export diklik. */
	onExport: () => void;
	/**
	 * Dipanggil saat file CSV diimpor. Menerima header dan baris data.
	 * Boleh melempar Error untuk menampilkan pesan gagal.
	 */
	onImport: (headers: string[], rows: string[][]) => Promise<void> | void;
	/** Label tombol import. */
	importLabel?: string;
	/** Tampilkan ikon pada tombol import. */
	showImportIcon?: boolean;
	importButtonLabel?: string;
	importButtonVariant?: 'default' | 'dropdown';
	/** Label tombol export. */
	exportLabel?: string;
	exportTone?: 'default' | 'purple';
	/** Gaya tombol yang mengikuti kontrol impor di halaman Penjualan atau daftar produk. */
	controlVariant?: 'default' | 'sales' | 'pill';
	/** Tampilkan tombol import (default true). */
	allowImport?: boolean;
	/** Pesan status (sukses/gagal) opsional dari parent. */
	status?: { type: 'ok' | 'error'; message: string } | null;
	/** Sedang sibuk memproses import. */
	busy?: boolean;
	className?: string;
}

export function ImportExportBar({
	onExport,
	onImport,
	importLabel,
	showImportIcon = true,
	importButtonLabel,
	importButtonVariant = 'default',
	exportLabel,
	exportTone = 'default',
	controlVariant = 'default',
	allowImport = true,
	status,
	busy,
	className,
}: ImportExportBarProps) {
	const { t } = useLanguage();
	const resolvedImportLabel = importLabel ?? t('io.import');
	const resolvedExportLabel = exportLabel ?? t('io.export');
	const inputRef = useRef<HTMLInputElement>(null);
	const [localBusy, setLocalBusy] = useState(false);
	const [localStatus, setLocalStatus] = useState<{ type: 'ok' | 'error'; message: string } | null>(null);

	const isBusy = busy || localBusy;
	const activeStatus = status ?? localStatus;
	const actionButtonStyle = controlVariant === 'sales'
		? 'rounded-md border border-border bg-card px-4 py-2 text-xs font-bold text-purple-700 transition-colors hover:bg-accent disabled:opacity-60'
		: controlVariant === 'pill'
			? 'min-h-11 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#7c3aed] shadow-sm transition-colors hover:bg-[#f5f3ff] disabled:opacity-60'
			: 'rounded-full border border-border bg-card px-4 py-2 text-xs font-bold transition-colors hover:bg-accent disabled:opacity-60';

	const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		setLocalBusy(true);
		setLocalStatus(null);
		try {
			const { headers, rows } = await readCsvFile(file);
			if (rows.length === 0) {
				throw new Error(t('io.empty'));
			}
			await onImport(headers, rows);
			setLocalStatus({ type: 'ok', message: t('io.imported', { count: rows.length }) });
		} catch (error) {
			const message = error instanceof Error ? error.message : t('io.failed');
			setLocalStatus({ type: 'error', message });
			recordImportFailure({ label: resolvedImportLabel, message });
		} finally {
			setLocalBusy(false);
		}
	};

	const triggerImport = () => {
		inputRef.current?.click();
	};

	if (importButtonVariant === 'dropdown' && allowImport) {
		return (
			<div className={cn('flex flex-wrap items-center gap-2', className)}>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							disabled={isBusy}
							className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-xs font-bold text-purple-700 transition-colors hover:bg-accent disabled:opacity-60"
						>
							{isBusy ? t('io.processing') : importButtonLabel ?? resolvedImportLabel}
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-44">
						<DropdownMenuItem
							onSelect={(event) => {
								event.preventDefault();
								triggerImport();
							}}
							className="min-h-10 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold"
						>
							<Upload className="size-4 text-primary" /> {t('io.import')}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={onExport}
							className={cn(
								'min-h-10 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold',
								exportTone === 'purple' && 'text-purple-700 focus:text-purple-800',
							)}
						>
							{t('io.export')}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<input
					ref={inputRef}
					type="file"
					accept=".csv,text/csv"
					className="hidden"
					onChange={handleFile}
				/>
				{activeStatus ? (
					<span
						className={cn(
							'text-xs font-semibold',
							activeStatus.type === 'ok' ? 'text-primary' : 'text-destructive',
						)}
					>
						{activeStatus.message}
					</span>
				) : null}
			</div>
		);
	}

	return (
		<div className={cn('flex flex-wrap items-center gap-2', className)}>
			{allowImport ? (
				<>
					<button
						type="button"
						disabled={isBusy}
						onClick={() => inputRef.current?.click()}
						className={cn('inline-flex items-center gap-1.5', actionButtonStyle)}
					>
						{showImportIcon ? <Upload className="size-3.5" /> : null}
						{isBusy ? t('io.processing') : importButtonLabel ?? resolvedImportLabel}
					</button>
					<input
						ref={inputRef}
						type="file"
						accept=".csv,text/csv"
						className="hidden"
						onChange={handleFile}
					/>
				</>
			) : null}
			<button
				type="button"
				disabled={isBusy}
				onClick={onExport}
				className={cn(
					'inline-flex items-center gap-1.5',
					actionButtonStyle,
					exportTone === 'purple' && 'text-purple-700',
				)}
			>
				{resolvedExportLabel}
			</button>
			{activeStatus ? (
				<span
					className={cn(
						'text-xs font-semibold',
						activeStatus.type === 'ok' ? 'text-primary' : 'text-destructive',
					)}
				>
					{activeStatus.message}
				</span>
			) : null}
		</div>
	);
}
