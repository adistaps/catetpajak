/// <reference path="../pb_data/types.d.ts" />

// Menambahkan nilai status `sudah_dikirim` pada koleksi documents. Status ini
// dipakai untuk invoice penjualan yang sudah dikonversi menjadi pengiriman,
// sehingga daftar/detail invoice dapat menampilkan "Sudah Dikirim".
migrate(
  (app) => {
    const documents = app.findCollectionByNameOrId("documents");
    const statusField = documents.fields.getByName("status");
    if (statusField) {
      const existing = Array.isArray(statusField.values)
        ? statusField.values.slice()
        : [];
      if (!existing.includes("sudah_dikirim")) {
        existing.push("sudah_dikirim");
      }
      statusField.values = existing;
    }
    app.save(documents);
  },
  (app) => {
    const documents = app.findCollectionByNameOrId("documents");
    const statusField = documents.fields.getByName("status");
    if (statusField && Array.isArray(statusField.values)) {
      statusField.values = statusField.values.filter(
        (v) => v !== "sudah_dikirim",
      );
    }
    app.save(documents);
  },
);
