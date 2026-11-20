#!/usr/bin/env node
/**
 * Import data hasil ekspor JSON Hostinger Horizons ke PocketBase.
 *
 * PENTING: jalankan hanya saat PocketBase hidup TANPA hook
 * (lihat README-MIGRASI.md, bagian "Import data"). Hook akan mengirim email ke
 * user asli dan membuat data ganda. Script ini menolak jalan jika hook terdeteksi aktif.
 *
 * Pemakaian:
 *   node scripts/import-data.mjs [folder-data] [--dry-run] [--force]
 *
 * Env:
 *   PB_URL                  default http://127.0.0.1:8090
 *   PB_SUPERUSER_EMAIL      wajib
 *   PB_SUPERUSER_PASSWORD   wajib
 *   DATA_DIR                default ./import-data  (bisa juga argumen pertama)
 *   UPLOADS_DIR             default <DATA_DIR>/uploads (file upload hasil unduhan)
 *
 * Yang dilakukan:
 *  - urutan impor otomatis dari relasi wajib (users -> companies -> ... )
 *  - id record dipertahankan, sehingga relasi tetap cocok
 *  - relasi opsional yang menunjuk record yang belum dibuat ditunda lalu diisi di tahap ke-2
 *  - relasi yang menunjuk record yang sudah tidak ada ("yatim"):
 *      * ke akun (accounts)        -> dibuatkan akun placeholder dengan id yang sama
 *      * owner wajib               -> diganti pemilik perusahaan
 *      * wajib lainnya             -> record dilewati dan dicatat
 *      * opsional                  -> dikosongkan
 *  - password user TIDAK ada di ekspor: tiap user diberi password acak, wajib reset password
 *  - file upload dipasang jika ada di UPLOADS_DIR (dicocokkan lewat nama file)
 *  - laporan lengkap ditulis ke <DATA_DIR>/import-report.json
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const positional = args.filter((a) => !a.startsWith('--'));

const PB_URL = (process.env.PB_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const EMAIL = process.env.PB_SUPERUSER_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;
const DATA_DIR = path.resolve(positional[0] || process.env.DATA_DIR || 'import-data');
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads'));

const SKIP_KEYS = new Set(['id', 'collectionId', 'collectionName', 'expand']);
const EMPTY_SKIP_TYPES = new Set(['date', 'number', 'select', 'email', 'url', 'relation', 'file', 'autodate']);

const log = (...a) => console.log(...a);
const fail = (msg) => {
	console.error(`\nERROR: ${msg}\n`);
	process.exit(1);
};

if (!EMAIL || !PASSWORD) fail('Isi PB_SUPERUSER_EMAIL dan PB_SUPERUSER_PASSWORD dulu.');
if (!fs.existsSync(DATA_DIR)) fail(`Folder data tidak ditemukan: ${DATA_DIR}`);

// ---------------------------------------------------------------- muat data
const walk = (dir, out = []) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (path.resolve(full) === UPLOADS_DIR) continue;
			walk(full, out);
		} else out.push(full);
	}
	return out;
};

const data = new Map(); // collectionName -> Map(id -> record)
let filesRead = 0;
for (const file of walk(DATA_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('import-report.json'))) {
	let parsed;
	try {
		parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch (e) {
		fail(`File JSON rusak: ${file} (${e.message})`);
	}
	const items = Array.isArray(parsed) ? parsed : [parsed];
	for (const rec of items) {
		if (!rec || !rec.collectionName || !rec.id) continue;
		if (!data.has(rec.collectionName)) data.set(rec.collectionName, new Map());
		data.get(rec.collectionName).set(rec.id, rec); // id sama di dua file -> yang terakhir dipakai
	}
	filesRead += 1;
}
if (!data.size) fail('Tidak ada record yang terbaca dari folder data.');

// index file upload berdasarkan nama file
const uploadIndex = new Map();
if (fs.existsSync(UPLOADS_DIR)) {
	for (const f of walk(UPLOADS_DIR)) uploadIndex.set(path.basename(f), f);
}

// ---------------------------------------------------------------- koneksi
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

try {
	await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD);
} catch (e) {
	fail(`Gagal login superuser ke ${PB_URL}: ${e.message}`);
}

// cek hook: route buatan hook harus TIDAK ada
if (!FORCE) {
	const probe = await fetch(`${PB_URL}/api/loan-schedule/history`, { headers: { Authorization: pb.authStore.token } }).catch(() => null);
	if (probe && probe.status !== 404) {
		fail(
			'Hook PocketBase terdeteksi AKTIF. Import dihentikan agar tidak mengirim email ke user dan tidak membuat data ganda.\n' +
				'Jalankan PocketBase dengan hooksDir kosong (lihat README-MIGRASI.md), atau pakai --force jika Anda yakin.',
		);
	}
}

const collections = await pb.collections.getFullList();
const byName = new Map(collections.map((c) => [c.name, c]));
const byId = new Map(collections.map((c) => [c.id, c]));

const missingCols = [...data.keys()].filter((n) => !byName.has(n));
if (missingCols.length) log(`PERINGATAN: koleksi tidak ada di PocketBase, dilewati: ${missingCols.join(', ')}`);
const names = [...data.keys()].filter((n) => byName.has(n) && !n.startsWith('_'));

// ---------------------------------------------------------------- urutan impor
const relationFields = (colName) => byName.get(colName).fields.filter((f) => f.type === 'relation');
const requiredDeps = (n) => {
	const deps = new Set();
	for (const f of relationFields(n)) {
		const t = byId.get(f.collectionId)?.name;
		if (f.required && t && t !== n && names.includes(t)) deps.add(t);
	}
	return deps;
};
const order = [];
{
	const remaining = new Set(names);
	while (remaining.size) {
		const ready = [...remaining].filter((n) => [...requiredDeps(n)].every((d) => order.includes(d)));
		if (!ready.length) {
			log(`PERINGATAN: ada siklus relasi wajib antar ${[...remaining].join(', ')}; dilanjutkan seadanya.`);
			ready.push(...remaining);
		}
		ready.sort();
		for (const n of ready) {
			order.push(n);
			remaining.delete(n);
		}
	}
}
// users dan companies didahulukan agar stabil
for (const first of ['companies', 'users']) {
	const i = order.indexOf(first);
	if (i > 0) {
		order.splice(i, 1);
		order.unshift(first);
	}
}

// ---------------------------------------------------------------- laporan
const report = {
	startedAt: new Date().toISOString(),
	dryRun: DRY,
	pbUrl: PB_URL,
	filesRead,
	created: {},
	failed: [],
	skippedRecords: [],
	placeholderAccounts: [],
	ownerFallbacks: [],
	droppedRelations: {},
	deferredApplied: 0,
	deferredFailed: [],
	filesAttached: 0,
	filesMissing: [],
	usersNeedPasswordReset: 0,
	seedReplaced: [],
	countMismatch: [],
};
const bump = (obj, key) => (obj[key] = (obj[key] || 0) + 1);

// ---------------------------------------------------------------- util
const created = new Map(names.map((n) => [n, new Set()])); // id yang sudah ada di PB
const inData = (col, id) => data.get(col)?.has(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withRetry = async (fn) => {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await fn();
		} catch (e) {
			const status = e?.status;
			if (attempt < 6 && (status === 429 || status === 0 || status >= 500)) {
				await sleep(500 * attempt);
				continue;
			}
			throw e;
		}
	}
};

const describeError = (e) => {
	const d = e?.response?.data;
	if (d && Object.keys(d).length) return Object.entries(d).map(([k, v]) => `${k}: ${v.message || v.code}`).join('; ');
	return e?.message || String(e);
};

const firstUserId = () => [...created.get('users')][0];

// Migrasi PocketBase mengisi sebagian koleksi dengan data bawaan (id berbeda dari data live).
// Jika bentrok di kolom unik, data bawaan dihapus dan diganti data ekspor (data live menang).
const replaceSeedConflicts = async (colName, body, e) => {
	const data = e?.response?.data || {};
	let replaced = 0;
	for (const [field, info] of Object.entries(data)) {
		if (info?.code !== 'validation_not_unique') continue;
		const value = Array.isArray(body[field]) ? body[field][0] : body[field];
		if (typeof value !== 'string' || /["\\]/.test(value)) continue;
		const found = await withRetry(() => pb.collection(colName).getList(1, 5, { filter: `${field} = "${value}"` }));
		for (const item of found.items) {
			if (item.id === body.id || created.get(colName).has(item.id)) continue;
			await withRetry(() => pb.collection(colName).delete(item.id));
			report.seedReplaced.push({ collection: colName, field, value, removedSeedId: item.id, newId: body.id });
			replaced += 1;
		}
	}
	return replaced;
};

const companyOwnerFor = (companyId) => {
	const company = data.get('companies')?.get(companyId);
	if (company && created.get('users').has(company.owner)) return company.owner;
	return null;
};

const fallbackOwner = (rec, colName) => {
	const viaCompany = companyOwnerFor(rec.company);
	if (viaCompany) return viaCompany;
	if (colName === 'companies') {
		// cari anggota perusahaan ini yang usernya ada
		for (const m of data.get('company_members')?.values() || []) {
			if (m.company === rec.id && created.get('users').has(m.user)) return m.user;
		}
	}
	return firstUserId();
};

const placeholderFor = async (accountId, rec, fieldName, colName) => {
	if (created.get('accounts').has(accountId)) return true;
	const companyId = rec.company || (colName === 'companies' ? rec.id : null);
	if (!companyId || !created.get('companies').has(companyId)) return false;
	const owner = companyOwnerFor(companyId) || firstUserId();
	const body = {
		id: accountId,
		company: companyId,
		owner,
		code: `X-${accountId.slice(0, 6)}`,
		name: `Akun terhapus (dipulihkan ${accountId.slice(0, 6)})`,
		type: 'aset',
	};
	if (!DRY) {
		try {
			await withRetry(() => pb.collection('accounts').create(body));
		} catch (e) {
			report.failed.push({ collection: 'accounts', id: accountId, placeholder: true, error: describeError(e) });
			return false;
		}
	}
	created.get('accounts').add(accountId);
	report.placeholderAccounts.push({ id: accountId, company: companyId, firstReferencedBy: `${colName}.${fieldName}` });
	return true;
};

// ---------------------------------------------------------------- bangun body
const buildRecord = async (colName, rec, position) => {
	const col = byName.get(colName);
	const fieldsByName = new Map(col.fields.map((f) => [f.name, f]));
	const body = { id: rec.id };
	const deferred = {};
	const files = {};
	let skip = null;

	for (const [key, value] of Object.entries(rec)) {
		if (SKIP_KEYS.has(key)) continue;
		const f = fieldsByName.get(key);
		if (!f) continue;
		if (f.type === 'password' || f.name === 'tokenKey') continue;
		if (value === null || value === undefined) continue;
		if (value === '' && EMPTY_SKIP_TYPES.has(f.type)) continue;
		if (Array.isArray(value) && value.length === 0 && ['relation', 'file', 'select'].includes(f.type)) continue;

		if (f.type === 'file') {
			const wanted = Array.isArray(value) ? value : [value];
			const found = [];
			for (const name of wanted) {
				if (uploadIndex.has(name)) found.push(uploadIndex.get(name));
				else report.filesMissing.push({ collection: colName, id: rec.id, field: key, file: name });
			}
			if (found.length) files[key] = found;
			continue;
		}

		if (f.type === 'relation') {
			const target = byId.get(f.collectionId)?.name;
			const ids = (Array.isArray(value) ? value : [value]).filter(Boolean);
			const ok = [];
			const later = [];
			for (const id of ids) {
				if (target && created.get(target)?.has(id)) ok.push(id);
				else if (target && inData(target, id) && !position.failedIds.get(target)?.has(id)) later.push(id);
				else {
					// yatim: record tujuan sudah tidak ada
					if (target === 'accounts' && (await placeholderFor(id, rec, key, colName))) {
						ok.push(id);
					} else if (f.required && key === 'owner') {
						const o = fallbackOwner(rec, colName);
						if (o) {
							ok.push(o);
							report.ownerFallbacks.push({ collection: colName, id: rec.id, missingOwner: id, usedOwner: o });
						} else skip = `${key} -> ${id} (owner hilang, tidak ada pengganti)`;
					} else if (f.required) {
						skip = `${key} -> ${id} (relasi wajib ke ${target} yang tidak ada)`;
					} else {
						bump(report.droppedRelations, `${colName}.${key}`);
					}
				}
			}
			const single = f.maxSelect === 1;
			if (ok.length) body[key] = single ? ok[0] : ok;
			if (later.length) deferred[key] = single ? later[0] : later;
			continue;
		}

		body[key] = value;
	}

	if (col.type === 'auth') {
		const pw = crypto.randomBytes(24).toString('base64url');
		body.password = pw;
		body.passwordConfirm = pw;
	}

	return { body, deferred, files, skip };
};

const attachFiles = async (colName, id, files) => {
	const fd = new FormData();
	let count = 0;
	for (const [field, paths] of Object.entries(files)) {
		for (const p of paths) {
			fd.append(field, new File([fs.readFileSync(p)], path.basename(p)));
			count += 1;
		}
	}
	if (!count) return;
	if (!DRY) await withRetry(() => pb.collection(colName).update(id, fd));
	report.filesAttached += count;
};

// ---------------------------------------------------------------- jalankan
log(`\nImport ${DRY ? '(DRY-RUN, tidak menulis apa pun) ' : ''}ke ${PB_URL}`);
log(`Folder data : ${DATA_DIR}`);
log(`Folder file : ${UPLOADS_DIR} (${uploadIndex.size} file terindeks)`);
log(`Urutan      : ${order.join(' > ')}\n`);

const deferredAll = [];
const failedIds = new Map(names.map((n) => [n, new Set()]));
const position = { failedIds };

for (const colName of order) {
	const records = [...data.get(colName).values()];
	report.created[colName] = 0;
	// record yang menunjuk record sejenis (self-relation) tetap boleh: ditunda ke tahap 2
	for (const rec of records) {
		const { body, deferred, files, skip } = await buildRecord(colName, rec, position);
		if (skip) {
			report.skippedRecords.push({ collection: colName, id: rec.id, reason: skip });
			failedIds.get(colName).add(rec.id);
			continue;
		}
		try {
			if (!DRY) {
				try {
					await withRetry(() => pb.collection(colName).create(body));
				} catch (e) {
					if (!(await replaceSeedConflicts(colName, body, e))) throw e;
					await withRetry(() => pb.collection(colName).create(body));
				}
			}
			created.get(colName).add(rec.id);
			report.created[colName] += 1;
			if (colName === 'users') report.usersNeedPasswordReset += 1;
			if (Object.keys(deferred).length) deferredAll.push({ colName, id: rec.id, deferred });
			if (Object.keys(files).length) await attachFiles(colName, rec.id, files);
		} catch (e) {
			failedIds.get(colName).add(rec.id);
			report.failed.push({ collection: colName, id: rec.id, error: describeError(e) });
		}
	}
	log(`  ${colName.padEnd(28)} ${String(report.created[colName]).padStart(4)}/${records.length}`);
}

// tahap 2: relasi yang tertunda
for (const { colName, id, deferred } of deferredAll) {
	const patch = {};
	for (const [field, value] of Object.entries(deferred)) {
		const f = byName.get(colName).fields.find((x) => x.name === field);
		const target = byId.get(f.collectionId)?.name;
		const ids = (Array.isArray(value) ? value : [value]).filter((v) => created.get(target)?.has(v));
		if (ids.length) patch[field] = f.maxSelect === 1 ? ids[0] : ids;
		else bump(report.droppedRelations, `${colName}.${field}`);
	}
	if (!Object.keys(patch).length) continue;
	try {
		if (!DRY) await withRetry(() => pb.collection(colName).update(id, patch));
		report.deferredApplied += 1;
	} catch (e) {
		report.deferredFailed.push({ collection: colName, id, error: describeError(e) });
	}
}

// PocketBase mengisi created/updated dengan waktu import. Jika server dalam MODE IMPORT
// (hook pb_import_hooks aktif), tanggal asli dipulihkan otomatis lewat API khusus.
let timestampsRestored = false;
if (!DRY) {
	const ping = await fetch(`${PB_URL}/api/import-support/ping`, { headers: { Authorization: pb.authStore.token } }).catch(() => null);
	if (ping && ping.ok) {
		const rowsToRestore = [];
		for (const colName of order) {
			for (const id of created.get(colName)) {
				const rec = data.get(colName)?.get(id);
				if (rec && (rec.created || rec.updated)) rowsToRestore.push({ c: colName, id, created: rec.created, updated: rec.updated });
			}
		}
		let restored = 0;
		for (let i = 0; i < rowsToRestore.length; i += 150) {
			const res = await withRetry(async () => {
				const r = await fetch(`${PB_URL}/api/import-support/restore-timestamps`, {
					method: 'POST',
					headers: { Authorization: pb.authStore.token, 'Content-Type': 'application/json' },
					body: JSON.stringify({ rows: rowsToRestore.slice(i, i + 150) }),
				});
				if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
				return r.json();
			}).catch((e) => ({ updated: 0, error: e.message }));
			restored += res.updated || 0;
			if (res.error) report.failed.push({ collection: '(tanggal)', id: `batch ${i}`, error: res.error });
		}
		timestampsRestored = restored > 0;
		report.timestampsRestored = restored;
		log(`  Tanggal asli dipulihkan : ${restored} record (otomatis)`);
	}
}

// verifikasi jumlah record di PocketBase vs yang berhasil dibuat
if (!DRY) {
	for (const colName of order) {
		const total = (await withRetry(() => pb.collection(colName).getList(1, 1))).totalItems;
		const expected = created.get(colName).size;
		if (total !== expected) report.countMismatch.push({ collection: colName, inPocketBase: total, imported: expected, note: 'selisih = data bawaan migrasi yang tidak ada di ekspor' });
	}
}
report.finishedAt = new Date().toISOString();
const reportPath = path.join(DATA_DIR, DRY ? 'import-report.dry-run.json' : 'import-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const totalCreated = Object.values(report.created).reduce((a, b) => a + b, 0);
const totalData = [...data.values()].reduce((a, m) => a + m.size, 0);
log(`\nSELESAI${DRY ? ' (dry-run)' : ''}`);
log(`  Record dibuat           : ${totalCreated} dari ${totalData}`);
log(`  Akun placeholder        : ${report.placeholderAccounts.length}`);
log(`  Owner diganti           : ${report.ownerFallbacks.length}`);
log(`  Record dilewati         : ${report.skippedRecords.length}`);
log(`  Record gagal            : ${report.failed.length}`);
log(`  Relasi tertunda dipasang: ${report.deferredApplied} (gagal ${report.deferredFailed.length})`);
log(`  Relasi dikosongkan      : ${Object.values(report.droppedRelations).reduce((a, b) => a + b, 0)}`);
log(`  File terpasang / hilang : ${report.filesAttached} / ${report.filesMissing.length}`);
log(`  User perlu reset sandi  : ${report.usersNeedPasswordReset}`);
log(`  Data bawaan diganti     : ${report.seedReplaced.length}`);
if (report.countMismatch.length) log(`  Selisih jumlah (info)   : ${report.countMismatch.map((m) => `${m.collection} (${m.inPocketBase} vs ${m.imported})`).join(', ')}`);
log(`  Laporan                 : ${reportPath}\n`);
if (!DRY && !timestampsRestored) {
	log('LANGKAH BERIKUTNYA (wajib): PocketBase mengisi tanggal dibuat/diubah dengan waktu import.');
	log('Hentikan PocketBase, lalu jalankan: node scripts/restore-timestamps.mjs <folder-pb_data> <folder-data>');
	log('Tanpa ini masa uji coba 30 hari semua user dihitung ulang dari hari ini.\n');
}
if (report.failed.length) process.exitCode = 2;
