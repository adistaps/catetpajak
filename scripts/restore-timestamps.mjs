#!/usr/bin/env node
/**
 * Mengembalikan tanggal `created` dan `updated` asli setelah import.
 *
 * Kenapa perlu: PocketBase selalu mengisi `created`/`updated` dengan waktu saat record dibuat, sehingga
 * setelah import semua record terlihat dibuat hari ini. Dampak nyata: masa uji coba 30 hari tiap user
 * dihitung dari `created`, jadi tanpa langkah ini semua user mendapat uji coba baru.
 *
 * WAJIB: hentikan PocketBase dulu (database SQLite diubah langsung). Cadangan data.db dibuat otomatis.
 * Butuh Node 22.13+ (modul bawaan node:sqlite).
 *
 * Pemakaian:
 *   node scripts/restore-timestamps.mjs <folder-pb_data> [folder-data] [--dry-run]
 *   contoh: node scripts/restore-timestamps.mjs .local-data/pb_data import-data
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));
const pbData = path.resolve(positional[0] || '');
const dataDir = path.resolve(positional[1] || process.env.DATA_DIR || 'import-data');
const dbFile = path.join(pbData, 'data.db');

const fail = (m) => {
	console.error(`\nERROR: ${m}\n`);
	process.exit(1);
};
if (!positional[0]) fail('Pemakaian: node scripts/restore-timestamps.mjs <folder-pb_data> [folder-data] [--dry-run]');
if (!fs.existsSync(dbFile)) fail(`data.db tidak ditemukan di ${pbData}`);
if (fs.existsSync(path.join(pbData, 'data.db-wal')) && fs.statSync(path.join(pbData, 'data.db-wal')).size > 0) {
	console.warn('PERINGATAN: ada file data.db-wal yang tidak kosong. Pastikan PocketBase sudah dihentikan dengan benar.');
}

const walk = (dir, out = []) => {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (e.name !== 'uploads') walk(full, out);
		} else if (e.name.endsWith('.json') && !e.name.startsWith('import-report')) out.push(full);
	}
	return out;
};

const rows = new Map(); // "koleksi|id" -> {created, updated}
for (const f of walk(dataDir)) {
	const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
	for (const r of Array.isArray(parsed) ? parsed : [parsed]) {
		if (r?.collectionName && r?.id && (r.created || r.updated)) rows.set(`${r.collectionName}|${r.id}`, r);
	}
}
if (!rows.size) fail(`Tidak ada record bertanggal di ${dataDir}`);

if (!DRY) {
	const backup = `${dbFile}.bak-timestamps-${Date.now()}`;
	fs.copyFileSync(dbFile, backup);
	console.log(`Cadangan: ${backup}`);
}

const db = new DatabaseSync(dbFile);
const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name));
let updated = 0;
let missingTable = 0;
let missingRow = 0;

db.exec('BEGIN');
try {
	for (const [key, r] of rows) {
		const [col, id] = key.split('|');
		if (!tables.has(col)) {
			missingTable += 1;
			continue;
		}
		const cols = db.prepare(`PRAGMA table_info("${col}")`).all().map((c) => c.name);
		const sets = [];
		const vals = [];
		if (r.created && cols.includes('created')) {
			sets.push('created = ?');
			vals.push(r.created);
		}
		if (r.updated && cols.includes('updated')) {
			sets.push('updated = ?');
			vals.push(r.updated);
		}
		if (!sets.length) continue;
		const res = db.prepare(`UPDATE "${col}" SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
		if (res.changes) updated += 1;
		else missingRow += 1;
	}
	if (DRY) db.exec('ROLLBACK');
	else db.exec('COMMIT');
} catch (e) {
	db.exec('ROLLBACK');
	fail(`Gagal, perubahan dibatalkan: ${e.message}`);
}
db.close();

console.log(`${DRY ? '[dry-run] ' : ''}Tanggal dipulihkan: ${updated} record`);
if (missingRow) console.log(`  Tidak ditemukan di database (mis. record yang dilewati saat import): ${missingRow}`);
if (missingTable) console.log(`  Tabel tidak ada: ${missingTable}`);
