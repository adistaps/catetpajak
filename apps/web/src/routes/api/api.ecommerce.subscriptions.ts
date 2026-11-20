/**
 * POST /api/ecommerce/subscriptions — the signed-in visitor's subscriptions.
 *
 * Call it from the browser through `getUserSubscriptions()` in
 * `@/api/ecommerce-subscriptions-api`, which attaches the PocketBase token.
 * Register this route in `src/routes.ts` or it answers 404.
 *
 * POST, not GET, even though it only reads: published sites edge-cache GET
 * responses by URL — including error responses — so one anonymous 401 on a
 * GET here would be cached and served to every signed-in subscriber for up
 * to a week. POST responses are never cached.
 */
import { apiError, json, withApi } from '@/lib/api.server';
import { getUserSubscriptions } from '@/lib/ecommerce-subscriptions.server';
import logger from '@/lib/logger.server';

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') {
		return apiError(405, 'Method not allowed');
	}

	try {
		return json({ subscriptions: await getUserSubscriptions({ request }) });
	} catch (error) {
		// Auth/validation responses (401, 403, ...) propagate to the client so it
		// can redirect to login or show the right status.
		if (error instanceof Response) {
			throw error;
		}

		// A transient store-API network failure ("fetch failed") must not crash the
		// subscriptions page. Return an empty list so the UI renders its normal
		// "no subscription" state and retries on the next poll or refresh, instead
		// of surfacing an opaque 500.
		const message = (error as Error)?.message ?? '';
		const isNetworkError = error instanceof TypeError || /fetch failed/i.test(message);
		if (isNetworkError) {
			logger.error('subscriptions lookup failed: store API unreachable', (error as Error)?.stack);
			return json({ subscriptions: [] });
		}

		throw error;
	}
});
