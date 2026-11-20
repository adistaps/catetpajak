import pb from '@/lib/pocketbase-client';
import {
	activeSubscription,
	getUserSubscriptions,
	type EcommerceSubscription,
} from '@/api/ecommerce-subscriptions-api';
import {
	isManualPaymentActive,
	listMyManualPayments,
	type ManualPayment,
} from '@/lib/manual-payments';

/** Masa uji coba gratis dalam hari sejak akun dibuat. */
export const TRIAL_DAYS = 30;

/** Judul paket berlangganan (harus cocok persis dengan product_title di toko). */
export const PLAN_TITLE = 'Pro';

/** Judul paket berlangganan aplikasi yang dapat dibayar manual. */
export const APP_PLAN_TITLES = ['Pro', 'Enterprise'];

export type TrialStatus = {
	/** Timestamp akhir uji coba (ms). */
	trialEnd: number;
	/** Sisa hari uji coba (minimal 0). */
	daysRemaining: number;
	/** True selama masa uji coba masih berjalan. */
	isTrialActive: boolean;
};

export type AccessState = {
	subscriptions: EcommerceSubscription[];
	trial: TrialStatus;
	active: EcommerceSubscription | null;
	/** Pembayaran manual aplikasi yang masih aktif (memberi akses Pro/Enterprise). */
	activeManualPayment: ManualPayment | null;
	/** Pembayaran manual aplikasi yang sedang menunggu verifikasi admin. */
	pendingManualPayment: ManualPayment | null;
	/**
	 * Tanggal berakhir langganan perusahaan yang ditetapkan Admin Pusat
	 * (YYYY-MM-DD) dan masih berlaku. Memberi akses sampai akhir hari tersebut.
	 */
	activeCompanySubscriptionEnd: string | null;
	/** True jika uji coba aktif, ada langganan otomatis, pembayaran manual aktif, ATAU tanggal berakhir langganan perusahaan masih berlaku. */
	hasAccess: boolean;
};

export function computeTrialStatus(created: string | undefined): TrialStatus {
	const createdMs = created ? new Date(created).getTime() : Date.now();
	const trialEnd = createdMs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
	const daysRemaining = Math.max(
		0,
		Math.ceil((trialEnd - Date.now()) / (24 * 60 * 60 * 1000)),
	);
	return { trialEnd, daysRemaining, isTrialActive: Date.now() < trialEnd };
}

/**
 * Memuat status langganan dan menghitung akses pengguna. Gagal jaringan/auth
 * diperlakukan sebagai "tidak ada langganan" — selama uji coba akses tetap
 * diberikan, setelahnya pengguna diarahkan ke halaman langganan.
 *
 * Akses aplikasi dapat diperoleh melalui empat jalur: uji coba 30 hari,
 * langganan otomatis (store subscription), pembayaran manual transfer bank
 * yang sudah diverifikasi admin pusat, ATAU tanggal berakhir langganan
 * perusahaan yang ditetapkan admin pusat dan masih berlaku.
 */
export async function loadAccessState(
	created: string | undefined,
	userId?: string,
): Promise<AccessState> {
	let subscriptions: EcommerceSubscription[] = [];
	// Sesi PocketBase hanya ada di browser. Saat logout, `user` berubah null dan
	// efek di status-icons memuat ulang — jangan kirim permintaan
	// `/api/ecommerce/subscriptions` dengan token yang sudah tidak valid, karena
	// itu memicu 401 yang dicatat sebagai error oleh runtime. Lewati pemanggilan
	// sepenuhnya saat tidak ada sesi yang valid.
	if (pb.authStore.isValid) {
		try {
			({ subscriptions } = await getUserSubscriptions());
		} catch {
			subscriptions = [];
		}
	}

	let manualPayments: ManualPayment[] = [];
	if (userId) {
		try {
			manualPayments = await listMyManualPayments(userId);
		} catch {
			manualPayments = [];
		}
	}

	const appManualPayments = manualPayments.filter(payment =>
		APP_PLAN_TITLES.includes(payment.plan_title),
	);
	const activeManualPayment =
		appManualPayments.find(payment => isManualPaymentActive(payment)) ?? null;
	const pendingManualPayment =
		appManualPayments.find(payment => payment.status === 'menunggu_verifikasi') ?? null;

	const trial = computeTrialStatus(created);
	const active = activeSubscription(subscriptions);
	const activeCompanySubscriptionEnd = await loadActiveCompanySubscriptionEnd();
	const hasAccess =
		trial.isTrialActive ||
		Boolean(active) ||
		Boolean(activeManualPayment) ||
		Boolean(activeCompanySubscriptionEnd);
	return {
		subscriptions,
		trial,
		active,
		activeManualPayment,
		pendingManualPayment,
		activeCompanySubscriptionEnd,
		hasAccess,
	};
}

/**
 * Tanggal berakhir langganan perusahaan (ditetapkan Admin Pusat) yang paling
 * jauh di masa depan dan masih berlaku, dari seluruh perusahaan yang dapat
 * diakses pengguna. Mengembalikan null bila tidak ada yang masih aktif.
 *
 * Aturan list/view koleksi `companies` sudah membatasi hasil ke perusahaan
 * milik pengguna atau tempat ia anggota aktif, sehingga tanggal ini benar-benar
 * milik perusahaan yang dapat diakses pengguna.
 */
async function loadActiveCompanySubscriptionEnd(): Promise<string | null> {
	try {
		const records = await pb.collection('companies').getFullList<{ subscription_end?: string }>({
			requestKey: null,
		});
		const now = Date.now();
		const valid = records
			.map(record => record.subscription_end)
			.filter((date): date is string => Boolean(date))
			.map(date => {
				// PocketBase menyimpan tanggal sebagai "YYYY-MM-DD HH:MM:SS.sssZ";
				// ambil bagian tanggal saja lalu bentuk akhir hari dalam UTC agar
				// perbandingan tidak gagal karena format datetime lengkap.
				const day = date.slice(0, 10);
				const end = new Date(`${day}T23:59:59.000Z`);
				return { date: day, endMs: Number.isNaN(end.getTime()) ? 0 : end.getTime() };
			})
			.filter(entry => entry.endMs >= now)
			.map(entry => entry.date)
			.sort((a, b) => (a < b ? 1 : -1));
		return valid[0] ?? null;
	} catch {
		return null;
	}
}
