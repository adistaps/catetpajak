/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");
    const accounts = app.findCollectionByNameOrId("accounts");
    const entries = app.findCollectionByNameOrId("entries");

    // Aturan akses sama dengan koleksi milik perusahaan lainnya:
    // pemilik, pemilik perusahaan, atau anggota perusahaan aktif.
    const memberRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    // Aset tetap yang disusutkan
    const fixedAssets = new Collection({
      type: "base",
      name: "fixed_assets",
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
        { name: "name", type: "text", required: true, max: 160 },
        {
          name: "asset_account",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        },
        {
          name: "expense_account",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        },
        {
          name: "accum_dep_account",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        },
        { name: "acquisition_cost", type: "number", required: true, min: 0 },
        { name: "salvage_value", type: "number", min: 0 },
        { name: "acquisition_date", type: "date", required: true },
        {
          name: "method",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["straight_line", "reducing_balance", "production"],
        },
        { name: "useful_life", type: "number", min: 0 },
        { name: "rate", type: "number", min: 0 },
        { name: "production_capacity", type: "number", min: 0 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "fully_depreciated"],
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
      indexes: ["CREATE INDEX idx_fixed_assets_company ON fixed_assets (company)"],
    });
    app.save(fixedAssets);

    // Riwayat penyusutan per periode — setiap baris terkait dua baris jurnal.
    const depreciations = new Collection({
      type: "base",
      name: "depreciations",
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
        { name: "period_label", type: "text", max: 20 },
        { name: "amount", type: "number", required: true, min: 0 },
        {
          name: "method",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["straight_line", "reducing_balance", "production"],
        },
        { name: "units", type: "number", min: 0 },
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
        "CREATE INDEX idx_depreciations_company ON depreciations (company)",
        "CREATE INDEX idx_depreciations_asset ON depreciations (fixed_asset)",
      ],
    });
    app.save(depreciations);
  },
  (app) => {
    for (const name of ["depreciations", "fixed_assets"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    }
  },
);
