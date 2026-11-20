#!/usr/bin/env node
/**
 * Membuat rahasia baru untuk server: kunci enkripsi PocketBase, password superuser, kunci VAPID.
 * Hasil hanya dicetak ke layar. Salin ke file .env di server, JANGAN di-commit.
 *
 * CATATAN: PB_ENCRYPTION_KEY harus tetap sama selamanya untuk database yang sama.
 * Simpan di tempat aman (password manager).
 */
import crypto from 'node:crypto';
import webpush from 'web-push';

const vapid = webpush.generateVAPIDKeys();
const lines = [
	'# --- dipakai PocketBase dan aplikasi web ---',
	`PB_SUPERUSER_EMAIL=admin@catetpajak.com`,
	`PB_SUPERUSER_PASSWORD=${crypto.randomBytes(18).toString('base64url')}`,
	`PB_ENCRYPTION_KEY=${crypto.randomBytes(16).toString('hex')}`,
	'',
	'# --- notifikasi push (apps/web/.env) ---',
	'VAPID_SUBJECT=mailto:info@catetpajak.com',
	`VAPID_PUBLIC_KEY=${vapid.publicKey}`,
	`VITE_VAPID_PUBLIC_KEY=${vapid.publicKey}`,
	`VAPID_PRIVATE_KEY=${vapid.privateKey}`,
	`INVOICE_PAY_SECRET=${crypto.randomBytes(32).toString('hex')}`,
];
console.log(lines.join('\n'));
