import { Briefcase, Plus, Trash2 } from 'lucide-react';
import type { WorkHistoryEntry } from '@/lib/akuntan';

const fieldClass =
	'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const areaClass =
	'w-full resize-y rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const labelClass = 'text-[13px] font-semibold text-foreground';

const EMPTY_ENTRY: WorkHistoryEntry = {
	company: '',
	start_date: '',
	end_date: '',
	position: '',
	description: '',
};

/**
 * Editor riwayat pekerjaan profil akuntan: beberapa entri dengan nama
 * perusahaan, tanggal masuk/keluar, jabatan, dan deskripsi pekerjaan.
 */
export function WorkHistoryEditor({
	entries,
	onChange,
	errors,
}: {
	entries: WorkHistoryEntry[];
	onChange: (entries: WorkHistoryEntry[]) => void;
	errors: Record<string, string>;
}) {
	function update(index: number, patch: Partial<WorkHistoryEntry>) {
		onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
	}

	function addEntry() {
		onChange([...entries, { ...EMPTY_ENTRY }]);
	}

	function removeEntry(index: number) {
		onChange(entries.filter((_, i) => i !== index));
	}

	return (
		<div className="flex flex-col gap-4">
			{entries.length === 0 ? (
				<p className="rounded-xl border border-dashed border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
					Belum ada riwayat pekerjaan. Klik “Tambah pekerjaan” untuk mengisi pengalaman Anda.
				</p>
			) : null}
			{entries.map((entry, index) => (
				<div
					key={index}
					className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary/30 p-4 sm:p-5"
				>
					<div className="flex items-center justify-between gap-3">
						<p className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
							<Briefcase className="size-4 text-emerald-600" strokeWidth={1.75} />
							Pekerjaan {index + 1}
						</p>
						<button
							type="button"
							onClick={() => removeEntry(index)}
							className="inline-flex h-9 items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.98]"
						>
							<Trash2 className="size-3.5" strokeWidth={1.75} />
							Hapus
						</button>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>
								Nama perusahaan <span className="text-red-500">*</span>
							</span>
							<input
								value={entry.company}
								onChange={event => update(index, { company: event.target.value })}
								placeholder="cth. KAP Mitra Sejahtera"
								className={fieldClass}
								maxLength={160}
							/>
							{errors[`work_${index}_company`] ? (
								<span className="text-xs font-medium text-red-600">
									{errors[`work_${index}_company`]}
								</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>
								Jabatan <span className="text-red-500">*</span>
							</span>
							<input
								value={entry.position}
								onChange={event => update(index, { position: event.target.value })}
								placeholder="cth. Staf pajak"
								className={fieldClass}
								maxLength={120}
							/>
							{errors[`work_${index}_position`] ? (
								<span className="text-xs font-medium text-red-600">
									{errors[`work_${index}_position`]}
								</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>
								Tanggal masuk <span className="text-red-500">*</span>
							</span>
							<input
								type="date"
								value={entry.start_date}
								onChange={event => update(index, { start_date: event.target.value })}
								className={fieldClass}
							/>
							{errors[`work_${index}_start_date`] ? (
								<span className="text-xs font-medium text-red-600">
									{errors[`work_${index}_start_date`]}
								</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>Tanggal keluar</span>
							<input
								type="date"
								value={entry.end_date}
								onChange={event => update(index, { end_date: event.target.value })}
								className={fieldClass}
							/>
							{errors[`work_${index}_end_date`] ? (
								<span className="text-xs font-medium text-red-600">
									{errors[`work_${index}_end_date`]}
								</span>
							) : (
								<span className="text-xs leading-relaxed text-muted-foreground">
									Kosongkan bila masih bekerja di sini.
								</span>
							)}
						</label>
					</div>
					<label className="flex flex-col gap-1.5">
						<span className={labelClass}>Deskripsi pekerjaan</span>
						<textarea
							value={entry.description}
							onChange={event => update(index, { description: event.target.value })}
							placeholder="cth. Menyusun laporan pajak tahunan klien UMKM dan rekonsiliasi pembukuan."
							rows={3}
							maxLength={600}
							className={areaClass}
						/>
					</label>
				</div>
			))}
			<button
				type="button"
				onClick={addEntry}
				className="inline-flex h-11 w-fit items-center gap-2 rounded-full border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition hover:bg-accent active:scale-[0.99]"
			>
				<Plus className="size-4" strokeWidth={1.75} />
				Tambah pekerjaan
			</button>
		</div>
	);
}
