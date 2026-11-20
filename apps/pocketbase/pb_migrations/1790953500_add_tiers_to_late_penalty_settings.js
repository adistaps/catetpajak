/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field `tiers` (JSON) pada pengaturan denda keterlambatan agar
// pengguna berwenang dapat menentukan beberapa rentang keterlambatan hari,
// masing-masing dengan metode (persentase/nominal) dan nilai sendiri.
// Contoh: hari ke-1–2 denda 5% atau Rp10.000; hari ke-3–5 denda 30% atau
// Rp50.000. Field `method`/`value` lama tetap dipertahankan sebagai fallback
// untuk catatan yang belum dimigrasikan ke `tiers`.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("late_penalty_settings");
    if (!collection.fields.getByName("tiers")) {
      collection.fields.add(
        new JSONField({
          name: "tiers",
          maxSize: 2000000,
        }),
      );
      app.save(collection);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("late_penalty_settings");
    if (collection.fields.getByName("tiers")) {
      collection.fields.removeByName("tiers");
      app.save(collection);
    }
  },
);
