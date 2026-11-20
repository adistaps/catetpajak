import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getAkuntanRole } from '@/lib/akuntan';
import {
	getUserSubscriptions,
	isSubscribedTo,
	isSubscriptionPending,
	waitForActiveSubscription,
	type EcommerceSubscription,
} from '@/api/ecommerce-subscriptions-api';
import {
	isManualPaymentActive,
	listMyManualPayments,
	subscribeMyManualPayments,
	type ManualPayment,
} from '@/lib/manual-payments';

/** Judul paket langganan Pencari Akuntan — harus cocok dengan product_title di toko. */
export const PENCARI_PLAN_TITLE = 'Pencari Akuntan';

/**
 * Status langganan Pencari Akuntan untuk pengguna yang sedang masuk. Hanya
 * memeriksa langganan untuk peran `pencari`; akun Akuntan dianggap sudah
 * berhak (tidak berbayar). Sesi PocketBase hanya ada di browser, jadi semua
 * pemeriksaan dijalankan di sisi klien.
 *
 * Akses langganan dapat diperoleh melalui dua jalur: checkout otomatis (store
 * subscription) atau pembayaran manual yang sudah diverifikasi admin pusat.
 */
export function usePencariSubscription() {
	const { user, isAuthed, isLoading } = useAuth();
	const role = getAkuntanRole(user);
	const [subscriptions, setSubscriptions] = useState<EcommerceSubscription[]>([]);
	const [manualPayments, setManualPayments] = useState<ManualPayment[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [polling, setPolling] = useState(false);

	useEffect(() => {
		if (isLoading || !isAuthed || role !== 'pencari') {
			setLoaded(true);
			return;
		}
		let cancelled = false;

		if (isSubscriptionPending()) {
			setPolling(true);
			waitForActiveSubscription({ onUpdate: setSubscriptions }).then(() => {
				if (cancelled) return;
				setPolling(false);
				setLoaded(true);
			});
		} else {
			getUserSubscriptions()
				.then(({ subscriptions: next }) => {
					if (!cancelled) setSubscriptions(next);
				})
				.catch(() => {})
				.finally(() => {
					if (!cancelled) setLoaded(true);
				});
		}

		const loadManual = () => {
			listMyManualPayments(user!.id)
				.then(items => {
					if (!cancelled) setManualPayments(items);
				})
				.catch(() => {});
		};
		loadManual();
		const unsubscribe = subscribeMyManualPayments(loadManual);

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [isLoading, isAuthed, role, user]);

	const activeManualPayment =
		manualPayments.find(item => isManualPaymentActive(item)) ?? null;
	const pendingManualPayment =
		manualPayments.find(item => item.status === 'menunggu_verifikasi') ?? null;

	const storeSubscribed = isSubscribedTo(subscriptions, PENCARI_PLAN_TITLE);
	const isSubscribed = role === 'pencari' ? storeSubscribed || Boolean(activeManualPayment) : true;

	return {
		isSubscribed,
		isLoading: !loaded || polling,
		role,
		subscriptions,
		activeManualPayment,
		pendingManualPayment,
		manualPayments,
	};
}
