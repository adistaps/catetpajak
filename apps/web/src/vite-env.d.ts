/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_VAPID_PUBLIC_KEY: string;
}
interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module 'web-push' {
	export interface PushSubscriptionLike {
		endpoint: string;
		keys?: { p256dh?: string; auth?: string };
	}
	export interface VapidKeys {
		publicKey: string;
		privateKey: string;
	}
	export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
	export function sendNotification(
		subscription: PushSubscriptionLike,
		payload: string | Buffer | null,
		options?: unknown,
	): Promise<unknown>;
	export function generateVAPIDKeys(): VapidKeys;
	const webpush: {
		setVapidDetails: typeof setVapidDetails;
		sendNotification: typeof sendNotification;
		generateVAPIDKeys: typeof generateVAPIDKeys;
	};
	export default webpush;
}

type HorizonsBannerAttrs = {
	src: string;
	'template-redirect-url': string;
	'template-main-text'?: string;
	'template-cta-text'?: string;
	'template-theme'?: string;
};

declare module 'virtual:horizons-banner' {
	export const bannerAttrs: HorizonsBannerAttrs | null;
	export const isDev: boolean;
}

declare module 'virtual:horizons-runtime';
declare module 'virtual:horizons-edit-mode';
declare module 'virtual:horizons-iframe-route-restoration';
declare module 'virtual:horizons-pocketbase-auth';
declare module 'virtual:session-journal-client';
