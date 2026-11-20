/// <reference path="../pb_data/types.d.ts" />

// Pengaturan metode persediaan untuk produk yang monitor stoknya aktif.
// Satu pengaturan unik per perusahaan. Pilihan metode: FIFO, Average
// (rata-rata berbobot), Reducing Balance (saldo menurun), dan Produksi per
// Unit. Metode ini dipakai sebagai dasar perhitungan nilai persediaan dan
// HPP/jurnal COGS pada invoice penjualan untuk produk persediaan.
// Tidak mengubah transaksi atau jurnal lama secara retroaktif — metode hanya
// menjadi dasar perhitungan HPP untuk invoice yang dibuat setelahnya.
migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    // Aturan akses sama dengan pengaturan denda: baca untuk pemilik, anggota
    // company aktif, dan parent yang memiliki siswa di company; tulis hanya
    // untuk pemilik & anggota company berwenang. Isolasi antarperusahaan
    // dijaga oleh relasi company + aturan ini.
    const readRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active') || (@collection.students.parent ?= @request.auth.id && @collection.students.company ?= company))";
    const writeRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    let collection;
    try {
      collection = app.findCollectionByNameOrId("inventory_settings");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "inventory_settings",
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
            values: [
              "fifo",
              "average",
              "reducing_balance",
              "production_per_unit",
            ],
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
          "CREATE UNIQUE INDEX idx_inventory_settings_company ON inventory_settings (company)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("inventory_settings");
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
