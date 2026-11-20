import pb from '@/lib/pocketbase-client';
import { parsePaymentTerms } from '@/lib/payment-terms';

/** Pengaturan syarat pembayaran per perusahaan. */
export interface PaymentTermsSettings {
	id: string;
	company: string;
	discount_rate: number;
	discount_days: number;
	net_days: number;
	is_active: boolean;
	owner: string;
	created: string;
	updated: string;
}

/** Nilai awal sesuai termin 2/3 N/30 yang sudah dipakai. */
export const DEFAULT_PAYMENT_TERMS = {
	discount_rate: 2,
	discount_days: 3,
	net_days: 30,
};

/** Menyusun notasi syarat pembayaran, mis. "2/3 N/30". */
export function buildPaymentTermsNotation(input: {
	discount_rate: number;
	discount_days: number;
	net_days: number;
}): string {
	const rate = Number(input.discount_rate) || 0;
	const discDays = Number(input.discount_days) || 0;
	const netDays = Number(input.net_days) || 0;
	if (rate <= 0) return '';
	return `${rate}/${discDays} N/${netDays}`;
}

const settingsInFlight = new Map<string, Promise<PaymentTermsSettings>>();

/** Ambil atau buat pengaturan syarat pembayaran untuk perusahaan aktif. */
export async function getOrCreatePaymentTermsSettings(
	companyId: string,
	ownerId: string,
): Promise<PaymentTermsSettings> {
	const existing = settingsInFlight.get(companyId);
	if (existing) return existing;

	const promise = (async () => {
		const filter = pb.filter('company = {:c}', { c: companyId });
		try {
			return await pb
				.collection('payment_terms_settings')
				.getFirstListItem<PaymentTermsSettings>(filter);
		} catch {
			try {
				return await pb.collection('payment_terms_settings').create<PaymentTermsSettings>(
					{
						company: companyId,
						...DEFAULT_PAYMENT_TERMS,
						is_active: true,
						owner: ownerId,
					},
					{ requestKey: `payment-terms-settings-${companyId}` },
				);
			} catch {
				// Race: permintaan paralel membuat record yang sama (company unik).
				return pb
					.collection('payment_terms_settings')
					.getFirstListItem<PaymentTermsSettings>(filter);
			}
		}
	})();

	settingsInFlight.set(companyId, promise);
	promise.finally(() => {
		if (settingsInFlight.get(companyId) === promise) {
			settingsInFlight.delete(companyId);
		}
	});
	return promise;
}

/** Simpan pengaturan syarat pembayaran. */
export async function savePaymentTermsSettings(
	id: string,
	data: {
		discount_rate: number;
		discount_days: number;
		net_days: number;
		is_active: boolean;
	},
): Promise<PaymentTermsSettings> {
	return pb.collection('payment_terms_settings').update<PaymentTermsSettings>(id, data);
}

/** Notasi aktif untuk dipakai pada invoice baru (string kosong bila nonaktif). */
export function activeTermsNotation(settings: PaymentTermsSettings | null): string {
	if (!settings || settings.is_active === false) return '';
	const notation = buildPaymentTermsNotation(settings);
	return parsePaymentTerms(notation) ? notation : '';
}
