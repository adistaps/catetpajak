/// <reference path="../pb_data/types.d.ts" />

// Syarat pembayaran invoice, mis. "2/3 N/30" (diskon 2% bila dibayar dalam 3
// hari, jatuh tempo 30 hari). Hanya bermakna untuk dokumen stage invoice.
// Disimpan sebagai teks agar fleksibel mengikuti notasi akuntansi standar.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("documents");

    if (!collection.fields.getByName("payment_terms")) {
      collection.fields.add(
        new TextField({
          name: "payment_terms",
          max: 20,
        }),
      );
      app.save(collection);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("documents");
    if (collection.fields.getByName("payment_terms")) {
      collection.fields.removeByName("payment_terms");
      app.save(collection);
    }
  },
);
