/// <reference path="../pb_data/types.d.ts" />

// Pengaturan syarat pembayaran per perusahaan: persentase diskon, jumlah hari
// masa diskon, dan jumlah hari jatuh tempo (mis. 2/3 N/30). Satu pengaturan
// aktif per perusahaan. Nilai default mengikuti termin 2/3 N/30 yang sudah
// dipakai agar perilaku yang ada tetap konsisten. Tidak mengubah invoice atau
// riwayat lama secara retroaktif — pengaturan hanya menjadi default untuk
// invoice baru.
migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    const memberRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    let collection;
    try {
      collection = app.findCollectionByNameOrId("payment_terms_settings");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "payment_terms_settings",
        listRule: memberRule,
        viewRule: memberRule,
        createRule: "@request.auth.id != ''",
        updateRule: memberRule,
        deleteRule: memberRule,
        fields: [
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          { name: "discount_rate", type: "number", min: 0 },
          { name: "discount_days", type: "number", min: 0 },
          { name: "net_days", type: "number", min: 0 },
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
          "CREATE UNIQUE INDEX idx_payment_terms_settings_company ON payment_terms_settings (company)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("payment_terms_settings");
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
