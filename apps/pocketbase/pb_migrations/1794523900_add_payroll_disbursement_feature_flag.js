// apps/pocketbase/pb_migrations/1794523900_add_payroll_disbursement_feature_flag.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Tambah nilai `payroll_disbursement` ke select field `feature` pada
    // koleksi feature_flags dan company_feature_flags agar Admin Pusat dapat
    // mengaktifkan/menonaktifkan fitur pencairan gaji.
    const collectionNames = ["feature_flags", "company_feature_flags"];
    for (const name of collectionNames) {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(name);
      } catch (_) {
        continue;
      }
      const field = collection.fields.getByName("feature");
      if (field && Array.isArray(field.values) && !field.values.includes("payroll_disbursement")) {
        field.values = [...field.values, "payroll_disbursement"];
      }
      app.save(collection);
    }

    // Seed default global: fitur pencairan gaji aktif (mempertahankan fungsi
    // saat ini). Override per perusahaan mengikuti default global bila belum
    // diatur.
    const ffCollection = app.findCollectionByNameOrId("feature_flags");
    const existing = app.findRecordsByFilter(
      "feature_flags",
      "feature = 'payroll_disbursement'",
      "created",
      1,
      0,
    );
    if (existing.length === 0) {
      const record = new Record(ffCollection);
      record.set("feature", "payroll_disbursement");
      record.set("enabled", true);
      app.save(record);
    }
  },
  (app) => {
    // Hapus record seed default global. Nilai select dibiarkan agar tidak
    // mengganggu data override per perusahaan yang mungkin sudah ada.
    try {
      const existing = app.findRecordsByFilter(
        "feature_flags",
        "feature = 'payroll_disbursement'",
        "created",
        100,
        0,
      );
      for (const record of existing) {
        app.delete(record);
      }
    } catch (e) {
      if (!e.message.includes("no rows in result set")) {
        throw e;
      }
    }
  },
);
