import pb from '@/lib/pocketbase-client';
import type { AppPermission } from '@/data/user-roles';

/** Paket langganan perusahaan. Perusahaan lama tanpa paket dianggap Starter. */
export type CompanyPlan = 'starter' | 'pro' | 'enterprise';

export function normalizePlan(plan?: string | null): CompanyPlan {
	return plan === 'pro' || plan === 'enterprise' ? plan : 'starter';
}

/**
 * Menu yang tidak termasuk paket. Pembatasan ini berlaku untuk semua role,
 * termasuk Pemilik/Admin — akses penuh mereka tetap dibatasi sesuai paket
 * perusahaan yang aktif.
 *
 * Menu `karyawan` (portal self-service ESS) sengaja tidak dibatasi agar akses
 * ESS karyawan tidak terputus saat perusahaan berada di paket Starter.
 */
const PLAN_EXCLUDED_MENUS: Record<CompanyPlan, AppPermission[]> = {
	starter: ['payroll', 'pajak'],
	pro: [],
	enterprise: [],
};

/** Apakah menu diizinkan oleh paket perusahaan. */
export function planAllowsMenu(plan: string | null | undefined, permission: AppPermission): boolean {
	return !PLAN_EXCLUDED_MENUS[normalizePlan(plan)].includes(permission);
}

/** Batas jumlah karyawan aktif per paket. */
export const PLAN_EMPLOYEE_LIMITS: Record<CompanyPlan, number> = {
	starter: 0,
	pro: 10,
	enterprise: 20,
};

export function planEmployeeLimit(plan?: string | null): number {
	return PLAN_EMPLOYEE_LIMITS[normalizePlan(plan)];
}

/**
 * Batas karyawan efektif: pakai kuota kustom Admin Pusat bila aktif (> 0),
 * jika tidak gunakan batas bawaan paket. Menerima objek Company agar pemanggil
 * tidak perlu mengingat urutan preferensi.
 */
export function effectiveEmployeeLimit(company?: {
	plan?: string | null;
	employee_quota?: number | null;
} | null): number {
	const custom = company?.employee_quota;
	if (typeof custom === 'number' && custom > 0) return custom;
	return planEmployeeLimit(company?.plan);
}

/** Apakah kuota kustom sedang aktif untuk perusahaan ini. */
export function hasCustomEmployeeQuota(company?: {
	employee_quota?: number | null;
} | null): boolean {
	return typeof company?.employee_quota === 'number' && (company.employee_quota as number) > 0;
}

/** Batas invoice per bulan; null berarti tanpa batas. */
export function planInvoiceMonthlyLimit(plan?: string | null): number | null {
	return normalizePlan(plan) === 'starter' ? 10 : null;
}

/**
 * Batas invoice bulanan efektif: pakai kuota kustom Admin Pusat bila aktif (> 0),
 * jika tidak gunakan batas bawaan paket. Menerima objek Company agar pemanggil
 * tidak perlu mengingat urutan preferensi.
 */
export function effectiveInvoiceMonthlyLimit(company?: {
	plan?: string | null;
	invoice_quota?: number | null;
} | null): number | null {
	const custom = company?.invoice_quota;
	if (typeof custom === 'number' && custom > 0) return custom;
	return planInvoiceMonthlyLimit(company?.plan);
}

/** Apakah kuota invoice kustom sedang aktif untuk perusahaan ini. */
export function hasCustomInvoiceQuota(company?: {
	invoice_quota?: number | null;
} | null): boolean {
	return typeof company?.invoice_quota === 'number' && (company.invoice_quota as number) > 0;
}

/** Jumlah dokumen berstage invoice perusahaan pada bulan berjalan. */
export async function countInvoicesThisMonth(companyId: string): Promise<number> {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
	const filter = pb.filter(
		'company = {:company} && stage = "invoice" && date >= {:start} && date <= {:end}',
		{
			company: companyId,
			start: `${year}-${month}-01`,
			end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
		},
	);
	const result = await pb.collection('documents').getList(1, 1, { filter });
	return result.totalItems ?? 0;
}

/** Pesan batas invoice untuk paket Starter atau kuota kustom Admin Pusat. */
export function invoiceLimitMessage(limit: number, isCustom = false): string {
	if (isCustom) {
		return `Kuota invoice bulanan perusahaan ini dibatasi maksimal ${limit} invoice per bulan. Hubungi Admin Pusat untuk menambah kuota.`;
	}
	return `Paket Starter dibatasi maksimal ${limit} invoice per bulan. Tingkatkan ke Pro untuk membuat invoice tanpa batas.`;
}

/** Pesan batas karyawan sesuai batas efektif (kuota kustom atau paket). */
export function employeeLimitMessage(limit: number): string {
	return `Kuota karyawan perusahaan ini dibatasi maksimal ${limit} karyawan aktif. Hubungi Admin Pusat untuk menambah kuota.`;
}
