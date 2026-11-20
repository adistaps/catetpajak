#!/usr/bin/env node
/**
 * Aktifkan pengiriman email (SMTP) di PocketBase.
 * Di Hostinger Horizons email dikirim lewat relay platform; di server sendiri
 * relay itu tidak ada, jadi SMTP WAJIB diaktifkan agar email verifikasi
 * dan reset password terkirim.
 *
 * Env wajib : PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD, SMTP_PASSWORD
 * Env opsi  : PB_URL (http://127.0.0.1:8090), SMTP_HOST (smtp.hostinger.com), SMTP_PORT (465),
 *             SMTP_USERNAME (info@catetpajak.com), SMTP_TLS (true), SENDER_ADDRESS, SENDER_NAME,
 *             APP_URL (mis. https://catetpajak.com, dipakai untuk tautan di email)
 *
 * Pemakaian: node scripts/configure-smtp.mjs [--test alamat@email.com]
 */
import PocketBase from 'pocketbase';

const env = process.env;
const need = ['PB_SUPERUSER_EMAIL', 'PB_SUPERUSER_PASSWORD', 'SMTP_PASSWORD'].filter((k) => !env[k]);
if (need.length) {
	console.error(`Isi dulu env: ${need.join(', ')}`);
	process.exit(1);
}

const testIdx = process.argv.indexOf('--test');
const testTo = testIdx > -1 ? process.argv[testIdx + 1] : null;

const pb = new PocketBase((env.PB_URL || 'http://127.0.0.1:8090').replace(/\/$/, ''));
await pb.collection('_superusers').authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const username = env.SMTP_USERNAME || 'info@catetpajak.com';
const settings = {
	smtp: {
		enabled: true,
		host: env.SMTP_HOST || 'smtp.hostinger.com',
		port: Number(env.SMTP_PORT || 465),
		username,
		password: env.SMTP_PASSWORD,
		tls: (env.SMTP_TLS ?? 'true') !== 'false',
	},
	meta: {
		senderAddress: env.SENDER_ADDRESS || username,
		senderName: env.SENDER_NAME || 'Catet Pajak',
	},
};
if (env.APP_URL) settings.meta.appURL = env.APP_URL.replace(/\/$/, '');

await pb.settings.update(settings);
console.log(`SMTP aktif: ${settings.smtp.host}:${settings.smtp.port} (${username})`);

if (testTo) {
	try {
		await pb.settings.testEmail('users', testTo, 'verification');
		console.log(`Email uji terkirim ke ${testTo}. Cek inbox (dan folder spam).`);
	} catch (e) {
		console.error(`Email uji GAGAL: ${e.message}`);
		process.exit(2);
	}
}
