/** Pilihan paket langganan yang tersedia untuk perusahaan. */
export type PlanKey = 'starter' | 'pro' | 'enterprise';

export interface PlanOption {
	key: PlanKey;
	title: string;
	price: string;
	period: string;
	features: string[];
}

export const PLAN_OPTIONS: PlanOption[] = [
	{
		key: 'starter',
		title: 'Starter',
		price: 'Gratis',
		period: 'selamanya',
		features: ['Fitur akuntansi', 'Maksimal 10 invoice per bulan'],
	},
	{
		key: 'pro',
		title: 'Pro',
		price: 'Rp 299.000',
		period: 'per bulan',
		features: [
			'Akuntansi, pajak, dan payroll',
			'Maksimal 10 karyawan',
			'e-Bupot, PPh 21, dan laporan fiskal',
		],
	},
	{
		key: 'enterprise',
		title: 'Enterprise',
		price: 'Rp 499.000',
		period: 'per bulan',
		features: ['Semua fitur aplikasi', 'Maksimal 20 karyawan', 'Prioritas dukungan'],
	},
];

/** Label paket untuk ditampilkan; perusahaan lama tanpa paket dianggap Starter. */
export function planLabel(plan?: string | null): string {
	const option = PLAN_OPTIONS.find(item => item.key === plan);
	return option ? option.title : 'Starter';
}
