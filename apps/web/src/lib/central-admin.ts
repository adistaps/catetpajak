import pb from '@/lib/pocketbase-client';

/**
 * Client helpers for the central admin (admin pusat) panel.
 *
 * Every call carries the signed-in user's PocketBase token; the server routes
 * verify central-admin status themselves, so a regular company owner/admin is
 * rejected with 403 regardless of what the browser sends.
 */
export class CentralAdminApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'CentralAdminApiError';
		this.status = status;
	}
}

export type OwnerSubscription = {
	title: string;
	status: string;
	currentPeriodEnd: string;
} | null;

export interface CentralAdminCompanySummary {
	id: string;
	name: string;
	code: string;
	address: string;
	plan: string;
	access_status: 'active' | 'suspended';
	/** Kuota karyawan kustom Admin Pusat; null = pakai batas paket. */
	employee_quota: number | null;
	/** Jumlah karyawan terdaftar saat ini. */
	employee_count: number;
	/** Batas invoice bulanan kustom Admin Pusat; null = pakai batas paket. */
	invoice_quota: number | null;
	/** Jumlah invoice yang dibuat pada bulan berjalan. */
	invoice_count: number;
	/** Tanggal berakhir langganan yang ditetapkan Admin Pusat (YYYY-MM-DD). */
	subscription_end: string | null;
	created: string;
	owner: { id: string; name: string; email: string };
	memberCount: number;
	subscription: OwnerSubscription;
}

export interface CentralAdminCompanyDetail {
	company: {
		id: string;
		name: string;
		code: string;
		address: string;
		plan: string;
		access_status: 'active' | 'suspended';
		employee_quota: number | null;
		/** Tanggal berakhir langganan yang ditetapkan Admin Pusat (YYYY-MM-DD). */
		subscription_end: string | null;
		created: string;
		owner: { id: string; name: string; email: string };
	};
	members: {
		id: string;
		name: string;
		email: string;
		role: string;
		status: string;
		permissions: string[];
		can_edit: boolean;
		created: string;
	}[];
	stats: { employees: number; documents: number; accounts: number; entries: number };
	subscription: OwnerSubscription;
}

async function centralAdminRequest<T>(url: string, init: RequestInit): Promise<T> {
	const token = pb.authStore.token;
	if (!token) {
		throw new CentralAdminApiError('Sesi berakhir. Silakan masuk kembali.', 401);
	}

	// FormData bodies must let the browser set the multipart boundary itself.
	const isFormData = init.body instanceof FormData;

	const response = await fetch(url, {
		...init,
		credentials: 'same-origin',
		headers: {
			...(isFormData ? {} : { 'Content-Type': 'application/json' }),
			Authorization: `Bearer ${token}`,
			...(init.headers ?? {}),
		},
	});

	const data = (await response.json().catch(() => null)) as
		| (T & { error?: string; message?: string })
		| null;

	if (!response.ok) {
		const message =
			data?.error ?? data?.message ?? 'Permintaan ke server Admin Pusat gagal.';
		throw new CentralAdminApiError(message, response.status);
	}

	return data as T;
}

/** Semua perusahaan terdaftar beserta paket, status akses, dan langganan pemiliknya. */
export function fetchCentralAdminCompanies(): Promise<CentralAdminCompanySummary[]> {
	return centralAdminRequest<{ companies: CentralAdminCompanySummary[] }>(
		'/api/central-admin/companies',
		{ method: 'POST' },
	).then(data => data.companies);
}

/** Detail satu perusahaan: pengguna, role, dan statistik data. */
export function fetchCentralAdminCompanyDetail(id: string): Promise<CentralAdminCompanyDetail> {
	return centralAdminRequest<CentralAdminCompanyDetail>(
		`/api/central-admin/company/${encodeURIComponent(id)}`,
		{ method: 'POST' },
	);
}

/** Perbarui paket, status akses, kuota karyawan, kuota invoice, dan/atau tanggal berakhir langganan perusahaan. */
export function updateCentralAdminCompany(
	id: string,
	updates: { plan?: string; access_status?: string; employee_quota?: number | null; invoice_quota?: number | null; subscription_end?: string | null },
): Promise<{ company: { id: string; plan: string; access_status: string; employee_quota: number | null; invoice_quota: number | null; subscription_end: string | null } }> {
	return centralAdminRequest<{ company: { id: string; plan: string; access_status: string; employee_quota: number | null; invoice_quota: number | null; subscription_end: string | null } }>(
		`/api/central-admin/company/${encodeURIComponent(id)}`,
		{ method: 'PATCH', body: JSON.stringify(updates) },
	);
}

export interface ManualPaymentSummary {
	id: string;
	seeker: { id: string; name: string; email: string };
	plan_title: string;
	amount_formatted: string;
	expected_amount: number;
	expected_amount_formatted: string;
	payment_method: string;
	bank: string;
	proof_url: string;
	payer_name: string;
	payer_email: string;
	payment_date: string;
	notes: string;
	status: string;
	period_start: string;
	period_end: string;
	verifier: { id: string; name: string; email: string } | null;
	verified_at: string;
	rejection_reason: string;
	auto_verified: boolean;
	verification_notes: string;
	created: string;
}

/** Daftar seluruh pembayaran manual Pencari Akuntan untuk verifikasi admin pusat. */
export function fetchCentralAdminManualPayments(): Promise<ManualPaymentSummary[]> {
	return centralAdminRequest<{ payments: ManualPaymentSummary[] }>(
		'/api/central-admin/manual-payments',
		{ method: 'POST' },
	).then(data => data.payments);
}

/** Verifikasi (aktifkan) pembayaran manual. */
export function verifyCentralAdminManualPayment(
	id: string,
	options: { period_days?: number } = {},
): Promise<{ payment: ManualPaymentSummary }> {
	return centralAdminRequest<{ payment: ManualPaymentSummary }>(
		'/api/central-admin/manual-payments',
		{ method: 'PATCH', body: JSON.stringify({ id, action: 'verify', ...options }) },
	);
}

/** Tolak pembayaran manual. */
export function rejectCentralAdminManualPayment(
	id: string,
	rejection_reason: string,
): Promise<{ payment: ManualPaymentSummary }> {
	return centralAdminRequest<{ payment: ManualPaymentSummary }>(
		'/api/central-admin/manual-payments',
		{ method: 'PATCH', body: JSON.stringify({ id, action: 'reject', rejection_reason }) },
	);
}

// ─── Pengguna (user management) ──────────────────────────────────────────────

export interface CentralAdminUserSummary {
	id: string;
	email: string;
	name: string;
	phone: string;
	phoneSource: 'akun' | 'profil' | null;
	verified: boolean;
	akuntan_role: string;
	isCentralAdmin: boolean;
	ownedCompanies: number;
	memberCompanies: number;
	created: string;
}

/** Semua pengguna terdaftar beserta role, status admin pusat, dan jumlah perusahaan. */
export function fetchCentralAdminUsers(): Promise<CentralAdminUserSummary[]> {
	return centralAdminRequest<{ users: CentralAdminUserSummary[] }>(
		'/api/central-admin/users',
		{ method: 'POST' },
	).then(data => data.users);
}

/** Tambah pengguna baru. */
export function createCentralAdminUser(input: {
	email: string;
	password: string;
	name: string;
}): Promise<{ user: { id: string; email: string; name: string; created: string } }> {
	return centralAdminRequest<{ user: { id: string; email: string; name: string; created: string } }>(
		'/api/central-admin/users',
		{ method: 'PATCH', body: JSON.stringify({ action: 'create', ...input }) },
	);
}

/** Undang pengguna ke back end (beri akses admin pusat). */
export function inviteCentralAdminUser(input: {
	email: string;
	name: string;
}): Promise<{
	user: { id: string; email: string; name: string; isCentralAdmin: boolean };
	temporaryPassword: string;
	createdUser: boolean;
	invitationSent: boolean;
}> {
	return centralAdminRequest<{
		user: { id: string; email: string; name: string; isCentralAdmin: boolean };
		temporaryPassword: string;
		createdUser: boolean;
		invitationSent: boolean;
	}>('/api/central-admin/users', {
		method: 'PATCH',
		body: JSON.stringify({ action: 'invite', ...input }),
	});
}

/** Kirim ulang email undangan (tautan atur kata sandi) ke pengguna. */
export function resendCentralAdminInvitation(
	userId: string,
): Promise<{ ok: true; invitationSent: boolean }> {
	return centralAdminRequest<{ ok: true; invitationSent: boolean }>(
		'/api/central-admin/users',
		{ method: 'PATCH', body: JSON.stringify({ action: 'resend', id: userId }) },
	);
}

/** Hapus pengguna. */
export function deleteCentralAdminUser(id: string): Promise<{ ok: true; id: string }> {
	return centralAdminRequest<{ ok: true; id: string }>(
		'/api/central-admin/users',
		{ method: 'PATCH', body: JSON.stringify({ action: 'delete', id }) },
	);
}

// ─── Perusahaan (create / delete) ───────────────────────────────────────────

/** Tambah perusahaan baru. */
export function createCentralAdminCompany(input: {
	name: string;
	code?: string;
	address?: string;
	plan: string;
	ownerId: string;
}): Promise<{ company: { id: string; name: string; plan: string; access_status: string } }> {
	return centralAdminRequest<{ company: { id: string; name: string; plan: string; access_status: string } }>(
		'/api/central-admin/companies',
		{ method: 'PATCH', body: JSON.stringify({ action: 'create', ...input }) },
	);
}

/** Hapus perusahaan. */
export function deleteCentralAdminCompany(id: string): Promise<{ ok: true; id: string }> {
	return centralAdminRequest<{ ok: true; id: string }>(
		'/api/central-admin/companies',
		{ method: 'PATCH', body: JSON.stringify({ action: 'delete', id }) },
	);
}

// ─── Monitoring Transaksi ─────────────────────────────────────────────────────

export interface CentralAdminTransaction {
	id: string;
	company: { id: string; name: string; code: string };
	category: string;
	date: string;
	description: string;
	amount: number;
	partner: string;
	product: string;
	quantity: number;
	unit_price: number;
	tax_amount: number;
	debit_account: string;
	credit_account: string;
	created: string;
}

export interface CentralAdminTransactionSummary {
	total: number;
	totalAmount: number;
	byCategory: { category: string; label: string; count: number; amount: number }[];
	byCompany: { id: string; name: string; count: number; amount: number }[];
}

export interface CentralAdminTransactionsResponse {
	transactions: CentralAdminTransaction[];
	companies: { id: string; name: string; code: string }[];
	summary: CentralAdminTransactionSummary;
}

export type TransactionFilterInput = {
	companyId?: string;
	category?: string;
	dateFrom?: string;
	dateTo?: string;
	search?: string;
	produkOnly?: boolean;
	page?: number;
	perPage?: number;
};

/** Daftar seluruh transaksi keuangan lintas perusahaan untuk monitoring Admin Pusat. */
export function fetchCentralAdminTransactions(
	filter: TransactionFilterInput = {},
): Promise<CentralAdminTransactionsResponse> {
	return centralAdminRequest<CentralAdminTransactionsResponse>(
		'/api/central-admin/transactions',
		{ method: 'POST', body: JSON.stringify(filter) },
	);
}

// ─── Harga Paket ──────────────────────────────────────────────────────────────

export type CentralAdminPlanPrice = {
	plan: 'starter' | 'pro' | 'enterprise' | 'pencari_akuntan';
	price: number;
	label: string;
	period: string;
};

/** Daftar harga paket langganan yang dikelola Admin Pusat. */
export function fetchCentralAdminPlanPrices(): Promise<CentralAdminPlanPrice[]> {
	return centralAdminRequest<{ prices: CentralAdminPlanPrice[] }>(
		'/api/central-admin/plan-prices',
		{ method: 'POST' },
	).then(data => data.prices);
}

/** Perbarui harga satu paket langganan. */
export function updateCentralAdminPlanPrice(
	plan: string,
	price: number,
): Promise<{ price: CentralAdminPlanPrice }> {
	return centralAdminRequest<{ price: CentralAdminPlanPrice }>(
		'/api/central-admin/plan-prices',
		{ method: 'PATCH', body: JSON.stringify({ plan, price }) },
	);
}

// ─── Rekening Bank ───────────────────────────────────────────────────────────

export type CentralAdminBankAccount = {
	id: string;
	bank_name: string;
	account_holder: string;
	account_number: string;
	is_active: boolean;
	sort: number;
};

/** Daftar seluruh rekening bank untuk pengelolaan Admin Pusat. */
export function fetchCentralAdminBankAccounts(): Promise<CentralAdminBankAccount[]> {
	return centralAdminRequest<{ accounts: CentralAdminBankAccount[] }>(
		'/api/central-admin/bank-accounts',
		{ method: 'POST' },
	).then(data => data.accounts);
}

/** Tambah rekening bank baru. */
export function createCentralAdminBankAccount(input: {
	bank_name: string;
	account_holder: string;
	account_number: string;
	is_active: boolean;
	sort?: number;
}): Promise<{ account: CentralAdminBankAccount }> {
	return centralAdminRequest<{ account: CentralAdminBankAccount }>(
		'/api/central-admin/bank-accounts',
		{ method: 'PATCH', body: JSON.stringify({ action: 'create', ...input }) },
	);
}

/** Ubah rekening bank. */
export function updateCentralAdminBankAccount(
	id: string,
	input: {
		bank_name?: string;
		account_holder?: string;
		account_number?: string;
		is_active?: boolean;
		sort?: number;
	},
): Promise<{ account: CentralAdminBankAccount }> {
	return centralAdminRequest<{ account: CentralAdminBankAccount }>(
		'/api/central-admin/bank-accounts',
		{ method: 'PATCH', body: JSON.stringify({ action: 'update', id, ...input }) },
	);
}

/** Hapus rekening bank. */
export function deleteCentralAdminBankAccount(id: string): Promise<{ ok: true; id: string }> {
	return centralAdminRequest<{ ok: true; id: string }>(
		'/api/central-admin/bank-accounts',
		{ method: 'PATCH', body: JSON.stringify({ action: 'delete', id }) },
	);
}

// ─── Pembayaran Invoice Parent ───────────────────────────────────────────────

export interface CentralAdminParentPayment {
	id: string;
	parent: { id: string; name: string; email: string };
	student: { id: string; student_name: string };
	invoice: { id: string; number: string; total: number; paid_amount: number };
	company: string;
	amount: number;
	payment_method: string;
	bank: string;
	proof_url: string;
	payer_name: string;
	payment_date: string;
	notes: string;
	status: string;
	verifier: { id: string; name: string; email: string } | null;
	verified_at: string;
	rejection_reason: string;
	verification_notes: string;
	created: string;
}

/** Daftar pembayaran manual invoice oleh Parent untuk verifikasi Admin Pusat. */
export function fetchCentralAdminParentPayments(): Promise<CentralAdminParentPayment[]> {
	return centralAdminRequest<{ payments: CentralAdminParentPayment[] }>(
		'/api/central-admin/parent-payments',
		{ method: 'POST' },
	).then(data => data.payments);
}

/** Verifikasi pembayaran invoice Parent (terapkan ke invoice). */
export function verifyCentralAdminParentPayment(
	id: string,
): Promise<{ payment: CentralAdminParentPayment }> {
	return centralAdminRequest<{ payment: CentralAdminParentPayment }>(
		'/api/central-admin/parent-payments',
		{ method: 'PATCH', body: JSON.stringify({ id, action: 'verify' }) },
	);
}

/** Tolak pembayaran invoice Parent. */
export function rejectCentralAdminParentPayment(
	id: string,
	rejection_reason: string,
): Promise<{ payment: CentralAdminParentPayment }> {
	return centralAdminRequest<{ payment: CentralAdminParentPayment }>(
		'/api/central-admin/parent-payments',
		{ method: 'PATCH', body: JSON.stringify({ id, action: 'reject', rejection_reason }) },
	);
}

// ─── Pengaturan SMTP ─────────────────────────────────────────────────────────

export interface SmtpSettings {
	host: string;
	port: number;
	tls: boolean;
	username: string;
	enabled: boolean;
	senderAddress: string;
	senderName: string;
	/** Whether a password is already stored. The password itself is never returned. */
	passwordConfigured: boolean;
}

/** Baca pengaturan SMTP saat ini (kata sandi tidak pernah dikembalikan). */
export function fetchCentralAdminSmtpSettings(): Promise<SmtpSettings> {
	return centralAdminRequest<{ settings: SmtpSettings }>('/api/central-admin/smtp', {
		method: 'POST',
	}).then(data => data.settings);
}

/** Simpan pengaturan SMTP. Kosongkan `password` untuk mempertahankan yang lama. */
export function updateCentralAdminSmtpSettings(input: {
	host: string;
	port: number;
	tls: boolean;
	username: string;
	password?: string;
	senderAddress: string;
	senderName: string;
	enabled: boolean;
}): Promise<{ settings: SmtpSettings }> {
	return centralAdminRequest<{ settings: SmtpSettings }>('/api/central-admin/smtp', {
		method: 'PATCH',
		body: JSON.stringify({ action: 'save', ...input }),
	});
}

/** Kirim email uji coba untuk memverifikasi konfigurasi SMTP. */
export function testCentralAdminSmtp(
	to: string,
): Promise<{ ok: true; via?: string; sender?: string }> {
	return centralAdminRequest<{ ok: true; via?: string; sender?: string }>('/api/central-admin/smtp', {
		method: 'PATCH',
		body: JSON.stringify({ action: 'test', to }),
	});
}

// ─── Langganan Pencari Akuntan ───────────────────────────────────────────────

export interface CentralAdminSubscriptionUser {
	id: string;
	email: string;
	name: string;
	created: string;
	subscription: {
		status: string;
		period_start: string;
		period_end: string;
		method: string;
	} | null;
}

/** Daftar Pencari Akuntan beserta status langganan manual mereka. */
export function fetchCentralAdminSubscriptions(): Promise<CentralAdminSubscriptionUser[]> {
	return centralAdminRequest<{ users: CentralAdminSubscriptionUser[] }>(
		'/api/central-admin/subscriptions',
		{ method: 'POST' },
	).then(data => data.users);
}

/** Perpanjang jangka waktu langganan atau beri masa trial Pencari Akuntan. */
export function extendCentralAdminSubscription(input: {
	userId: string;
	days: number;
	action: 'extend' | 'grant_trial';
}): Promise<{
	subscription: { status: string; period_start: string; period_end: string };
}> {
	return centralAdminRequest<{
		subscription: { status: string; period_start: string; period_end: string };
	}>('/api/central-admin/subscriptions', {
		method: 'PATCH',
		body: JSON.stringify(input),
	});
}

// ─── Pengaturan Fitur (Feature Flags) ─────────────────────────────────────────

export type CentralAdminFeatureFlag = {
	feature: string;
	label: string;
	description: string;
	category: string;
	enabled: boolean;
	/** True bila perusahaan menetapkan override sendiri (bukan default global). */
	customized: boolean;
};

/** Daftar seluruh fitur beserta status aktif untuk dikelola Admin Pusat. */
export function fetchCentralAdminFeatureFlags(): Promise<CentralAdminFeatureFlag[]> {
	return centralAdminRequest<{ features: CentralAdminFeatureFlag[] }>(
		'/api/central-admin/feature-flags',
		{ method: 'POST' },
	).then(data => data.features);
}

/** Daftar status fitur yang sudah diselesaikan untuk sebuah perusahaan. */
export function fetchCentralAdminCompanyFeatureFlags(
	companyId: string,
): Promise<CentralAdminFeatureFlag[]> {
	return centralAdminRequest<{ features: CentralAdminFeatureFlag[] }>(
		'/api/central-admin/feature-flags',
		{ method: 'POST', body: JSON.stringify({ company: companyId }) },
	).then(data => data.features);
}

/** Aktifkan atau nonaktifkan satu fitur (default global). */
export function updateCentralAdminFeatureFlag(
	feature: string,
	enabled: boolean,
): Promise<{ feature: string; label: string; enabled: boolean }> {
	return centralAdminRequest<{ feature: { feature: string; label: string; enabled: boolean } }>(
		'/api/central-admin/feature-flags',
		{ method: 'PATCH', body: JSON.stringify({ feature, enabled }) },
	).then(data => data.feature);
}

/** Aktifkan atau nonaktifkan satu fitur untuk perusahaan tertentu. */
export function updateCentralAdminCompanyFeatureFlag(
	companyId: string,
	feature: string,
	enabled: boolean,
): Promise<{ feature: string; label: string; enabled: boolean; customized: boolean }> {
	return centralAdminRequest<{ feature: { feature: string; label: string; enabled: boolean; customized: boolean } }>(
		'/api/central-admin/feature-flags',
		{ method: 'PATCH', body: JSON.stringify({ company: companyId, feature, enabled }) },
	).then(data => data.feature);
}

/** Hapus override per perusahaan agar fitur kembali memakai default global. */
export function resetCentralAdminCompanyFeatureFlag(
	companyId: string,
	feature: string,
): Promise<{ feature: string; label: string; enabled: boolean; customized: boolean }> {
	return centralAdminRequest<{ feature: { feature: string; label: string; enabled: boolean; customized: boolean } }>(
		'/api/central-admin/feature-flags',
		{ method: 'PATCH', body: JSON.stringify({ company: companyId, feature, reset: true }) },
	).then(data => data.feature);
}

// ─── Event (manajemen webinar) ───────────────────────────────────────────────

export interface CentralAdminEvent {
	id: string;
	slug: string;
	badge: string;
	kicker: string;
	headline: string;
	title: string;
	topics: string[];
	speakers: { name: string; role: string }[];
	dateLabel: string;
	timeLabel: string;
	venue: string;
	mode: 'onsite' | 'online';
	pricing: 'free' | 'paid';
	priceNote: string;
	price: number;
	accent: 'navy' | 'cream' | 'maroon';
	published: boolean;
	sort: number;
	created: string;
	updated: string;
	registrationCount: number;
}

export type CentralAdminEventInput = {
	slug: string;
	badge: string;
	kicker: string;
	headline: string;
	title: string;
	topics: string[];
	speakers: { name: string; role: string }[];
	date_label: string;
	time_label: string;
	venue: string;
	mode: 'onsite' | 'online';
	pricing: 'free' | 'paid';
	price_note: string;
	price: number;
	accent: 'navy' | 'cream' | 'maroon';
	published: boolean;
	sort: number;
};

/** Daftar seluruh event (termasuk yang belum dipublikasikan). */
export function fetchCentralAdminEvents(): Promise<CentralAdminEvent[]> {
	return centralAdminRequest<{ events: CentralAdminEvent[] }>(
		'/api/central-admin/events',
		{ method: 'POST' },
	).then(data => data.events);
}

/** Tambah event baru. */
export function createCentralAdminEvent(
	input: CentralAdminEventInput,
): Promise<{ event: CentralAdminEvent }> {
	return centralAdminRequest<{ event: CentralAdminEvent }>('/api/central-admin/events', {
		method: 'PATCH',
		body: JSON.stringify({ action: 'create', ...input }),
	});
}

/** Perbarui event (termasuk publish/unpublish dan ubah harga). */
export function updateCentralAdminEvent(
	id: string,
	input: Partial<CentralAdminEventInput>,
): Promise<{ event: CentralAdminEvent }> {
	return centralAdminRequest<{ event: CentralAdminEvent }>(
		'/api/central-admin/events',
		{ method: 'PATCH', body: JSON.stringify({ action: 'update', id, ...input }) },
	);
}

/** Hapus event. */
export function deleteCentralAdminEvent(id: string): Promise<{ ok: true; id: string }> {
	return centralAdminRequest<{ ok: true; id: string }>('/api/central-admin/events', {
		method: 'PATCH',
		body: JSON.stringify({ action: 'delete', id }),
	});
}

// ─── Peserta Event ────────────────────────────────────────────────────────────

export interface CentralAdminEventRegistration {
	id: string;
	name: string;
	email: string;
	phone: string;
	company_name: string;
	notes: string;
	quantity: number;
	price_option: string;
	amount: number;
	amount_formatted: string;
	expected_amount: number;
	expected_amount_formatted: string;
	bank: string;
	proof_url: string;
	payment_status: string;
	payment_date: string;
	verification_notes: string;
	confirmation_email_sent: boolean;
	confirmation_email_sent_at: string;
	created: string;
}

/** Daftar peserta untuk satu event (berdasarkan slug). Hanya Admin Pusat. */
export function fetchCentralAdminEventRegistrations(
	eventSlug: string,
): Promise<CentralAdminEventRegistration[]> {
	return centralAdminRequest<{ registrations: CentralAdminEventRegistration[] }>(
		'/api/central-admin/event-registrations',
		{ method: 'POST', body: JSON.stringify({ eventSlug }) },
	).then(data => data.registrations);
}

// ─── Promo Terbaru (dashboard) ────────────────────────────────────────────────

export interface CentralAdminPromo {
	id: string;
	imageUrl: string;
	link: string;
	published: boolean;
	sort: number;
	created: string;
}

export type CentralAdminPromoInput = {
	image?: File | null;
	link?: string;
};

/** Daftar seluruh promo untuk pengelolaan Admin Pusat. */
export function fetchCentralAdminPromos(): Promise<CentralAdminPromo[]> {
	return centralAdminRequest<{ promos: CentralAdminPromo[] }>(
		'/api/central-admin/promos',
		{ method: 'POST' },
	).then((data) => data.promos);
}

/** Unggah gambar promo baru — otomatis terbit (published). */
export function createCentralAdminPromo(
	input: CentralAdminPromoInput,
): Promise<{ promo: CentralAdminPromo }> {
	const form = new FormData();
	form.append('action', 'create');
	if (input.image) form.append('image', input.image);
	if (typeof input.link === 'string') form.append('link', input.link);
	return centralAdminRequest<{ promo: CentralAdminPromo }>('/api/central-admin/promos', {
		method: 'PATCH',
		body: form,
	});
}

/** Ganti gambar promo — tetap terbit (published). */
export function updateCentralAdminPromo(
	id: string,
	input: CentralAdminPromoInput,
): Promise<{ promo: CentralAdminPromo }> {
	const form = new FormData();
	form.append('action', 'update');
	form.append('id', id);
	if (input.image) form.append('image', input.image);
	if (typeof input.link === 'string') form.append('link', input.link);
	return centralAdminRequest<{ promo: CentralAdminPromo }>(
		'/api/central-admin/promos',
		{ method: 'PATCH', body: form },
	);
}

/** Hapus promo. */
export function deleteCentralAdminPromo(id: string): Promise<{ ok: true; id: string }> {
	return centralAdminRequest<{ ok: true; id: string }>('/api/central-admin/promos', {
		method: 'DELETE',
		body: JSON.stringify({ id }),
	});
}

// ─── Gambar Profil Email ─────────────────────────────────────────────────────

export interface EmailBranding {
	logoUrl: string;
	altText: string;
	updated: string;
}

/** Baca gambar profil email saat ini (null bila belum ada). */
export function fetchEmailBranding(): Promise<{ branding: EmailBranding | null }> {
	return centralAdminRequest<{ branding: EmailBranding | null }>(
		'/api/central-admin/email-branding',
		{ method: 'POST' },
	);
}

/** Unggah/ganti gambar profil email. */
export function uploadEmailBranding(file: File, altText: string): Promise<{ branding: EmailBranding }> {
	const form = new FormData();
	form.append('logo', file);
	form.append('altText', altText);
	return centralAdminRequest<{ branding: EmailBranding }>(
		'/api/central-admin/email-branding',
		{ method: 'PATCH', body: form },
	);
}

/** Hapus gambar profil email. */
export function deleteEmailBranding(): Promise<{ ok: true }> {
	return centralAdminRequest<{ ok: true }>('/api/central-admin/email-branding', {
		method: 'DELETE',
	});
}

