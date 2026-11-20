/// <reference path="../pb_data/types.d.ts" />

// Pengaturan denda keterlambatan pembayaran per perusahaan: metode
// (persentase atau nominal tetap), nilai, dan status aktif. Satu pengaturan
// unik per perusahaan. Denda berlaku satu kali setelah jatuh tempo invoice.
// Tidak mengubah invoice atau riwayat pembayaran lama secara retroaktif —
// pengaturan hanya menjadi dasar perhitungan denda untuk invoice yang jatuh
// tempo ke depannya.
//
// Juga menambahkan akun "Pendapatan Denda" (kode 404, tipe pendapatan) untuk
// perusahaan yang sudah ada, agar denda yang diterima dapat diposting ke
// jurnal dengan benar. Perusahaan baru mendapatkan akun ini lewat
// DEFAULT_ACCOUNTS.
migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    // Aturan baca: pemilik, anggota company aktif, DAN parent yang memiliki
    // siswa di company tersebut (agar parent dapat melihat denda pada invoice
    // yang terhubung dengan siswanya). Tulis (create/update/delete) hanya
    // untuk pemilik & anggota company berwenang.
    const readRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active') || (@collection.students.parent ?= @request.auth.id && @collection.students.company ?= company))";
    const writeRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    let collection;
    try {
      collection = app.findCollectionByNameOrId("late_penalty_settings");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "late_penalty_settings",
        listRule: readRule,
        viewRule: readRule,
        createRule: "@request.auth.id != ''",
        updateRule: writeRule,
        deleteRule: writeRule,
        fields: [
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          {
            name: "method",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["percentage", "nominal"],
          },
          { name: "value", type: "number", min: 0 },
          { name: "is_active", type: "bool" },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_late_penalty_settings_company ON late_penalty_settings (company)",
        ],
      });
      app.save(collection);
    }

    // Seed akun "Pendapatan Denda" (404) untuk perusahaan yang belum memilikinya.
    const accounts = app.findCollectionByNameOrId("accounts");
    const existing = app.findRecordsByFilter(
      "accounts",
      "code = {:code} || name ~ {:nama}",
      "",
      500,
      0,
      { code: "404", nama: "Pendapatan Denda" },
    );
    const doneCompanies = new Set(existing.map((r) => r.get("company")));

    const allCompanies = app.findRecordsByFilter("companies", "id != ''", "", 500, 0);
    let created = 0;
    for (const company of allCompanies) {
      const companyId = company.get("id");
      if (doneCompanies.has(companyId)) continue;

      const owner = company.get("owner") || "";
      try {
        const record = new Record(accounts);
        record.set("company", companyId);
        record.set("code", "404");
        record.set("name", "Pendapatan Denda");
        record.set("type", "pendapatan");
        if (owner) record.set("owner", owner);
        app.save(record);
        created += 1;
      } catch (e) {
        console.log(`[seed late penalty account] skipped company ${companyId}: ${e.message}`);
      }
    }
    console.log(`[seed late penalty account] created ${created} accounts`);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("late_penalty_settings");
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
    // Tidak menghapus akun "Pendapatan Denda" yang mungkin sudah dipakai.
  },
);
