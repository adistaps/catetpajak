/**
 * Server-only helpers for the central admin (admin pusat) panel.
 *
 * The panel must read and manage EVERY company's record, which the signed-in
 * user's PocketBase rules deliberately forbid (data stays isolated per
 * company). So these endpoints authenticate the caller, verify they are a
 * central admin in the `central_admins` collection, and only then use the
 * superuser client. A regular company owner/admin never passes the guard.
 */
import { apiError } from '@/lib/api.server';
import { requireUserId } from '@/lib/ecommerce-subscriptions.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

/**
 * Verifies the caller's session and central-admin status.
 * Returns the caller's user id; throws 401/403 responses otherwise.
 */
export const requireCentralAdmin = async (request: Request): Promise<string> => {
	const userId = await requireUserId(request);

	const result = await pocketbaseAdmin.listRecords<{ id: string }>('central_admins', {
		page: 1,
		perPage: 1,
		filter: pocketbaseAdmin.filter('user = {:userId}', { userId }),
	});

	if (result.items.length === 0) {
		throw apiError(
			403,
			'Akses tidak diizinkan. Panel Admin Pusat hanya untuk admin pusat Catet Pajak.',
		);
	}

	return userId;
};

export type OwnerSubscriptionInfo = {
	title: string;
	status: string;
	currentPeriodEnd: string;
} | null;

const storeUrl = (path: string) =>
	`${process.env.ECOMMERCE_API_URL}/store/${process.env.ECOMMERCE_STORE_ID}${path}`;

const storeHeaders = () => ({
	'Accept': 'application/json',
	'Content-Type': 'application/json',
	'Authorization': `Bearer ${process.env.ECOMMERCE_API_KEY}`,
	...(process.env.PROXY_ENTRANCE_ID && { 'X-Proxy-Entrance-Id': process.env.PROXY_ENTRANCE_ID }),
});

/**
 * Best-effort lookup of the store subscription tied to a company owner.
 * Returns null when the owner never checked out or the store is unreachable —
 * the panel must keep working without it.
 */
export const getOwnerSubscriptionInfo = async (ownerId: string): Promise<OwnerSubscriptionInfo> => {
	if (!ownerId) return null;

	try {
		const manual = await pocketbaseAdmin.listRecords<{
			plan_title: string;
			status: string;
			period_end: string;
		}>('pencari_manual_payments', {
			filter: pocketbaseAdmin.filter('seeker = {:ownerId} && status = "aktif"', { ownerId }),
			sort: '-period_end',
			perPage: 10,
		});
		const today = new Date().toISOString().slice(0, 10);
		const activeManual = manual.items.find(
			item =>
				(item.plan_title === 'Pro' || item.plan_title === 'Enterprise') &&
				(!item.period_end || item.period_end >= today),
		);
		if (activeManual) {
			return {
				title: activeManual.plan_title,
				status: 'active',
				currentPeriodEnd: activeManual.period_end,
			};
		}
	} catch {
		// lanjut ke langganan toko
	}

	try {
		const query = new URLSearchParams({ external_id: ownerId });
		const response = await fetch(storeUrl(`/customers?${query.toString()}`), {
			method: 'GET',
			headers: storeHeaders(),
		});
		if (!response.ok) return null;

		const customer = (await response.json()) as {
			subscriptions?: { product_title: string; status: string; current_period_end: string }[];
		};

		const entitled = (customer.subscriptions ?? []).find(
			subscription => subscription.status === 'active' || subscription.status === 'trialing',
		);
		if (!entitled) return null;

		return {
			title: entitled.product_title,
			status: entitled.status,
			currentPeriodEnd: entitled.current_period_end,
		};
	} catch {
		return null;
	}
};
