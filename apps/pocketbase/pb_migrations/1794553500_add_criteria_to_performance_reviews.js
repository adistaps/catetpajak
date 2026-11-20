/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field `criteria` (JSON) pada performance_reviews untuk penilaian
// multi-kriteria (kualitas, produktivitas, kehadiran, kerja tim, dll.) dan
// menjadikan `period` opsional agar penilaian tetap bisa disimpan tanpa label
// periode — tanggal penilaian tetap menjadi acuan utama.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("performance_reviews");

    // period opsional
    const periodField = collection.fields.getByName("period");
    if (periodField) {
      periodField.required = false;
    }

    // criteria: array of { key, rating, comment }
    if (!collection.fields.getByName("criteria")) {
      collection.fields.add(
        new JSONField({ name: "criteria", maxSize: 2000000 }),
      );
    }

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("performance_reviews");
    const periodField = collection.fields.getByName("period");
    if (periodField) {
      periodField.required = true;
    }
    const criteriaField = collection.fields.getByName("criteria");
    if (criteriaField) {
      collection.fields.removeByName("criteria");
    }
    app.save(collection);
  },
);
