/// <reference path="../pb_data/types.d.ts" />

// Membuat koleksi neo_bank_settings: pengaturan integrasi pencairan gaji via
// Neo Bank (Bank Neo Commerce) per perusahaan. Menyimpan akun sumber perusahaan
// dan status aktivasi. Kredensial API Neo Bank level platform disimpan sebagai
// Secrets (process.env) dan dibaca di server; koleksi ini hanya menyimpan
// konfigurasi sisi perusahaan (akun sumber + flag aktif).
//
// Akses mengikuti pola company-scoped: owner, pemilik perusahaan, atau anggota
// perusahaan berstatus active dapat membaca/mengubah. Hanya owner atau pemilik
// perusahaan yang dapat menghapus.
migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "neo_bank_settings",
      listRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))",
      viewRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))",
      createRule: "@request.auth.id != ''",
      updateRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))",
      deleteRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id)",
      fields: [
        {
          name: "company",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: companies.id,
          cascadeDelete: true,
        },
        { name: "enabled", type: "bool" },
        { name: "account_name", type: "text", max: 120 },
        { name: "account_number", type: "text", max: 40 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["not_configured", "pending_verification", "active"],
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
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("neo_bank_settings");
    app.delete(collection);
  },
);
