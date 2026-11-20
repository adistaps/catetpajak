/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");
    const accounts = app.findCollectionByNameOrId("accounts");
    const entries = app.findCollectionByNameOrId("entries");
    const fixedAssets = app.findCollectionByNameOrId("fixed_assets");

    // Aturan akses sama dengan koleksi aset lainnya: pemilik, pemilik
    // perusahaan, atau anggota perusahaan aktif.
    const memberRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    // Riwayat revaluasi aset — setiap baris terkait dua baris jurnal
    // (debit/kredit akun aset & akun selisih revaluasi).
    const revaluations = new Collection({
      type: "base",
      name: "asset_revaluations",
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
        {
          name: "fixed_asset",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: fixedAssets.id,
          cascadeDelete: true,
        },
        { name: "date", type: "date", required: true },
        { name: "previous_value", type: "number", required: true, min: 0 },
        { name: "new_value", type: "number", required: true, min: 0 },
        // adjustment = new_value - previous_value (positif = naik, negatif = turun)
        { name: "adjustment", type: "number", required: true },
        {
          name: "revaluation_account",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        },
        {
          name: "debit_entry",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: entries.id,
          cascadeDelete: true,
        },
        {
          name: "credit_entry",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: entries.id,
          cascadeDelete: true,
        },
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
        "CREATE INDEX idx_asset_revaluations_company ON asset_revaluations (company)",
        "CREATE INDEX idx_asset_revaluations_asset ON asset_revaluations (fixed_asset)",
      ],
    });
    app.save(revaluations);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("asset_revaluations"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
