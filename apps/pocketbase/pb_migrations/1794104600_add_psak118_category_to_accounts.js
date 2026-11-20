/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("accounts");

    const existing = collection.fields.getByName("psak118_category");
    if (existing) {
      if (existing.type === "select") return; // sudah ada dengan tipe yang benar
      collection.fields.removeByName("psak118_category");
    }

    // Kategori penyajian PSAK 118 untuk akun pendapatan/beban.
    // Opsional: kosong = pakai klasifikasi otomatis berdasarkan nama akun.
    // Pajak penghasilan dipisah sebagai kategori tersendiri sesuai PSAK 118.
    collection.fields.add(
      new SelectField({
        name: "psak118_category",
        maxSelect: 1,
        values: ["operasi", "investasi", "pendanaan", "pajak"],
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("accounts");
      collection.fields.removeByName("psak118_category");
      app.save(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("Collection accounts tidak ditemukan, lewati revert");
        return;
      }
      throw e;
    }
  },
);
