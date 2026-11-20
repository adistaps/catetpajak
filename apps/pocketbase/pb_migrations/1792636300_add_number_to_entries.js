/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("entries");

    // 1. Tambahkan field number jika belum ada (tanpa index dulu).
    if (!collection.fields.getByName("number")) {
      collection.fields.add(
        new TextField({
          name: "number",
          max: 60,
        }),
      );
    }
    app.save(collection);

    // 2. Backfill entri yang sudah ada tanpa nomor, per company, urut tanggal.
    //    Format: JU-YYYY-### (urutan menanjak per tahun per perusahaan).
    //    Dilakukan SEBELUM membuat index unik agar tidak ada duplikat (company, "").
    const all = app.findRecordsByFilter("entries", "1=1", "date,created", 100000, 0);

    const counters = {}; // `${company}__${year}` -> next seq

    for (const rec of all) {
      const existing = rec.getString("number");
      if (existing) {
        const m = existing.match(/^JU-(\d{4})-(\d+)$/);
        if (m) {
          const key = rec.getString("company") + "__" + m[1];
          const seq = parseInt(m[2], 10);
          if (!counters[key] || counters[key] <= seq) counters[key] = seq + 1;
        }
        continue;
      }

      const dateStr = rec.getString("date") || "";
      const year = dateStr.slice(0, 4) || String(new Date().getFullYear());
      const key = rec.getString("company") + "__" + year;
      const seq = counters[key] || 1;
      counters[key] = seq + 1;
      const padded = String(seq).padStart(3, "0");
      rec.set("number", `JU-${year}-${padded}`);
      app.save(rec);
    }

    // 3. Setelah semua entri memiliki nomor unik, tambahkan index unik.
    const indexes = collection.indexes || [];
    const uniqueIdx =
      "CREATE UNIQUE INDEX idx_entries_company_number ON entries (company, number)";
    if (!indexes.includes(uniqueIdx)) {
      indexes.push(uniqueIdx);
      collection.indexes = indexes;
      app.save(collection);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("entries");

    const indexes = (collection.indexes || []).filter(
      (idx) => idx !== "CREATE UNIQUE INDEX idx_entries_company_number ON entries (company, number)",
    );
    collection.indexes = indexes;

    if (collection.fields.getByName("number")) {
      collection.fields.removeByName("number");
    }
    app.save(collection);
  },
);
