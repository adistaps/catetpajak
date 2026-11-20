/// <reference path="../pb_data/types.d.ts" />

// HANYA dimuat pada MODE IMPORT (PB_IMPORT_MODE=true, hooksDir = pb_import_hooks).
// Menggantikan seluruh hook produksi selama import supaya tidak ada email terkirim dan tidak ada data ganda.
// Menyediakan dua endpoint khusus superuser yang dipakai scripts/import-data.mjs:
//   GET  /api/import-support/ping                  -> penanda bahwa mode import aktif
//   POST /api/import-support/restore-timestamps    -> mengembalikan created/updated asli

routerAdd("GET", "/api/import-support/ping", (e) => {
  return e.json(200, { ok: true, mode: "import" });
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/import-support/restore-timestamps", (e) => {
  const info = e.requestInfo();
  const rows = (info.body && info.body.rows) || [];
  const known = {};
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r.c || "");
    if (!/^[A-Za-z0-9_]+$/.test(name)) { skipped++; continue; }
    if (known[name] === undefined) {
      try { $app.findCollectionByNameOrId(name); known[name] = true; } catch (err) { known[name] = false; }
    }
    if (!known[name]) { skipped++; continue; }

    const created = String(r.created || "");
    const upd = String(r.updated || "");
    if (created === "" && upd === "") { skipped++; continue; }

    const sets = [];
    const params = { id: String(r.id || "") };
    if (created !== "") { sets.push("created = {:created}"); params.created = created; }
    if (upd !== "") { sets.push("updated = {:updated}"); params.updated = upd; }

    $app.db()
      .newQuery("UPDATE {{" + name + "}} SET " + sets.join(", ") + " WHERE id = {:id}")
      .bind(params)
      .execute();
    updated++;
  }
  return e.json(200, { updated: updated, skipped: skipped });
}, $apis.requireSuperuserAuth());
