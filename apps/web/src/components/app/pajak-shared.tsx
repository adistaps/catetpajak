import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/accounting';

const NUMBER_FMT = new Intl.NumberFormat('id-ID');

export function parseNumber(text: string): number {
	const cleaned = (text || '').replace(/[^\d]/g, '');
	return cleaned ? Number(cleaned) : 0;
}

export function formatInput(value: number): string {
	return value ? NUMBER_FMT.format(value) : '';
}

export function pad2(n: number) {
	return String(n).padStart(2, '0');
}

export function todayIsoDate() {
	const d = new Date();
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatIdDate(iso: string) {
	if (!iso) return '—';
	const [y, m, day] = iso.split('-');
	if (!y || !m || !day) return iso;
	return `${day}/${m}/${y}`;
}

/** Kode objek pajak PPh 21 umum untuk gaji/upah. */
export const KODE_OBJEK_GAJI = '21-100-01';

export const TABLE_HEADERS = [
	'Masa Pajak',
	'Tahun Pajak',
	'Status Pegawai',
	'NPWP/NIK/TIN',
	'Nomor Passport',
	'Status',
	'Posisi',
	'Sertifikat/Fasilitas',
	'Kode Objek Pajak',
	'Penghasilan Kotor',
	'Tarif',
	'ID TKU',
	'Tgl Pemotongan',
] as const;

export interface WithholdingRow {
	id: string;
	employeeId: string;
	name: string;
	masaPajak: string;
	tahunPajak: string;
	statusPegawai: string;
	npwpNikTin: string;
	nomorPassport: string;
	status: string;
	posisi: string;
	sertifikatFasilitas: string;
	kodeObjekPajak: string;
	penghasilanKotor: number;
	tarif: number;
	tarifLabel: string;
	idTku: string;
	tglPemotongan: string;
	pph21: number;
	/** Status PTKP karyawan (mis. "TK0") untuk kolom Status lampiran e-Bupot. */
	ptkpStatus: string;
	/** Jenis karyawan; "freelance" tidak memakai TER melainkan Pasal 17. */
	employeeType?: string;
	/** Asal nilai PPh 21: aktual (slip gaji posted), draf (slip belum diterbitkan), estimasi (dihitung dari data karyawan). */
	source: 'aktual' | 'draf' | 'estimasi';
}

export interface InputState {
	bruto: string;
	bpjsBase: string;
	tunjanganJabatan: string;
	honorarium: string;
}

export const EMPTY_INPUT: InputState = {
	bruto: '',
	bpjsBase: '',
	tunjanganJabatan: '',
	honorarium: '',
};

export const PRESETS: Array<{ label: string; bruto: number; bpjs: number }> = [
	{ label: 'UMR / Staff', bruto: 4_500_000, bpjs: 4_500_000 },
	{ label: 'Supervisor', bruto: 8_000_000, bpjs: 8_000_000 },
	{ label: 'Manajer', bruto: 15_000_000, bpjs: 10_547_400 },
	{ label: 'Direktur', bruto: 30_000_000, bpjs: 10_547_400 },
];

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
			{children}
		</label>
	);
}

export function SummaryCell({
	label,
	value,
	tone = 'default',
}: {
	label: string;
	value: string;
	tone?: 'default' | 'primary' | 'warn';
}) {
	return (
		<div
			className={cn(
				'px-5 py-4',
				tone === 'primary' && 'bg-primary/5',
				tone === 'warn' && 'bg-amber-50/60',
			)}
		>
			<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
			<p
				className={cn(
					'mt-1 text-lg font-bold tracking-tight',
					tone === 'primary' && 'text-primary',
					tone === 'warn' && 'text-amber-700',
					tone === 'default' && 'text-foreground',
				)}
			>
				{value}
			</p>
		</div>
	);
}

export function Row({
	label,
	value,
	strong,
	total,
}: {
	label: React.ReactNode;
	value: number;
	strong?: boolean;
	total?: boolean;
}) {
	return (
		<div
			className={cn(
				'flex items-start justify-between gap-4 py-2.5',
				total && 'border-t-2 border-primary/20 pt-3',
			)}
		>
			<div className={cn('text-sm', strong ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
				{label}
			</div>
			<div
				className={cn(
					'shrink-0 text-sm tabular-nums',
					strong || total ? 'font-bold text-foreground' : 'font-medium text-foreground',
					total && 'text-primary',
				)}
			>
				{formatRupiah(value)}
			</div>
		</div>
	);
}

export function MethodCard({
	title,
	category,
	tax,
	rate,
	active,
	onSelect,
}: {
	title: string;
	category: string;
	tax: number;
	rate: number;
	active: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				'rounded-2xl border p-4 text-left transition-all',
				active
					? 'border-primary bg-primary/5 shadow-soft-sm ring-2 ring-primary/20'
					: 'border-border bg-background hover:border-primary/30 hover:bg-secondary/40',
			)}
		>
			<p className="text-sm font-bold text-foreground">{title}</p>
			<p className="mt-0.5 text-[11px] text-muted-foreground">{category}</p>
			<p className="mt-3 text-xl font-bold tracking-tight text-primary">{formatRupiah(tax)}</p>
			<p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
				Efektif {(rate * 100).toFixed(2)}% · per bulan
			</p>
		</button>
	);
}
