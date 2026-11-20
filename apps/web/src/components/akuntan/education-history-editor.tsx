import { GraduationCap, Plus, Trash2 } from 'lucide-react';
import type { EducationEntry } from '@/lib/akuntan';

const fieldClass =
	'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-emerald-100';

const labelClass = 'text-[13px] font-semibold text-foreground';

const LEVELS = ['D3', 'S1', 'S2', 'S3'];

const EMPTY_ENTRY: EducationEntry = {
	level: '',
	start_year: '',
	university: '',
	major: '',
};

/**
 * Editor jenjang pendidikan profil akuntan: beberapa entri dengan jenjang
 * (D3/S1/S2/S3), tahun masuk, universitas, dan jurusan.
 */
export function EducationHistoryEditor({
	entries,
	onChange,
	errors,
}: {
	entries: EducationEntry[];
	onChange: (entries: EducationEntry[]) => void;
	errors: Record<string, string>;
}) {
	function update(index: number, patch: Partial<EducationEntry>) {
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
					Belum ada jenjang pendidikan. Klik “Tambah pendidikan” untuk mengisi riwayat pendidikan Anda.
				</p>
			) : null}
			{entries.map((entry, index) => (
				<div
					key={index}
					className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary/30 p-4 sm:p-5"
				>
					<div className="flex items-center justify-between gap-3">
						<p className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
							<GraduationCap className="size-4 text-emerald-600" strokeWidth={1.75} />
							Pendidikan {index + 1}
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
								Jenjang Pendidikan <span className="text-red-500">*</span>
							</span>
							<select
								value={entry.level}
								onChange={event => update(index, { level: event.target.value })}
								className={fieldClass}
							>
								<option value="">Pilih jenjang</option>
								{LEVELS.map(level => (
									<option key={level} value={level}>
										{level}
									</option>
								))}
							</select>
							{errors[`edu_${index}_level`] ? (
								<span className="text-xs font-medium text-red-600">
									{errors[`edu_${index}_level`]}
								</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>
								Tahun Masuk <span className="text-red-500">*</span>
							</span>
							<input
								type="number"
								inputMode="numeric"
								value={entry.start_year}
								onChange={event => update(index, { start_year: event.target.value.slice(0, 4) })}
								placeholder="cth. 2016"
								min={1900}
								max={new Date().getFullYear()}
								className={fieldClass}
							/>
							{errors[`edu_${index}_start_year`] ? (
								<span className="text-xs font-medium text-red-600">
									{errors[`edu_${index}_start_year`]}
								</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>
								Universitas <span className="text-red-500">*</span>
							</span>
							<input
								value={entry.university}
								onChange={event => update(index, { university: event.target.value })}
								placeholder="cth. Universitas Indonesia"
								className={fieldClass}
								maxLength={160}
							/>
							{errors[`edu_${index}_university`] ? (
								<span className="text-xs font-medium text-red-600">
									{errors[`edu_${index}_university`]}
								</span>
							) : null}
						</label>
						<label className="flex flex-col gap-1.5">
							<span className={labelClass}>
								Jurusan <span className="text-red-500">*</span>
							</span>
							<input
								value={entry.major}
								onChange={event => update(index, { major: event.target.value })}
								placeholder="cth. Akuntansi"
								className={fieldClass}
								maxLength={120}
							/>
							{errors[`edu_${index}_major`] ? (
								<span className="text-xs font-medium text-red-600">
									{errors[`edu_${index}_major`]}
								</span>
							) : null}
						</label>
					</div>
				</div>
			))}
			<button
				type="button"
				onClick={addEntry}
				className="inline-flex h-11 w-fit items-center gap-2 rounded-full border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition hover:bg-accent active:scale-[0.99]"
			>
				<Plus className="size-4" strokeWidth={1.75} />
				Tambah pendidikan
			</button>
		</div>
	);
}
