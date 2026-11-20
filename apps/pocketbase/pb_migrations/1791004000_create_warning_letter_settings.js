/// <reference path="../pb_data/types.d.ts" />

// Pengaturan Surat Peringatan (SP) per perusahaan: daftar tahapan surat
// peringatan bertingkat berdasarkan hari keterlambatan invoice. Setiap
// tahapan memiliki rentang hari, level (mis. SP1/SP2/SP3), judul, dan
// pesan surat. Satu pengaturan unik per perusahaan. Pengaturan hanya
// menjadi dasar penentuan tahapan surat peringatan untuk invoice yang
// jatuh tempo ke depannya — tidak mengubah invoice atau riwayat
// pembayaran lama secara retroaktif.
migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    // Aturan baca: pemilik, anggota company aktif, DAN parent yang memiliki
    // siswa di company tersebut. Tulis hanya untuk pemilik & anggota
    // company berwenang.
    const readRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active') || (@collection.students.parent ?= @request.auth.id && @collection.students.company ?= company))";
    const writeRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    let collection;
    try {
      collection = app.findCollectionByNameOrId("warning_letter_settings");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "warning_letter_settings",
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
            name: "tiers",
            type: "json",
            maxSize: 2000000,
          },
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
          "CREATE UNIQUE INDEX idx_warning_letter_settings_company ON warning_letter_settings (company)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("warning_letter_settings");
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
