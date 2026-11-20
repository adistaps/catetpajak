/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("event_registrations");

    // Izinkan pembaruan catatan oleh pendaftar (untuk mengunggah bukti bayar
    // setelah catatan pendaftaran dibuat). Pendaftaran event bersifat publik.
    collection.updateRule = "";

    collection.fields.add(
      new NumberField({ name: "quantity", min: 1 }),
    );
    collection.fields.add(
      new TextField({ name: "price_option", max: 60 }),
    );
    collection.fields.add(
      new NumberField({ name: "amount", min: 0 }),
    );
    collection.fields.add(
      new TextField({ name: "amount_formatted", max: 40 }),
    );
    collection.fields.add(
      new NumberField({ name: "expected_amount", min: 0 }),
    );
    collection.fields.add(
      new TextField({ name: "expected_amount_formatted", max: 40 }),
    );
    collection.fields.add(
      new TextField({ name: "bank", max: 60 }),
    );
    collection.fields.add(
      new FileField({
        name: "proof",
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      }),
    );
    collection.fields.add(
      new SelectField({
        name: "payment_status",
        values: ["menunggu_pembayaran", "menunggu_verifikasi", "lunas", "ditolak"],
      }),
    );
    collection.fields.add(
      new DateField({ name: "payment_date" }),
    );
    collection.fields.add(
      new TextField({ name: "verification_notes", max: 500 }),
    );

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("event_registrations");
    collection.updateRule = null;
    [
      "quantity",
      "price_option",
      "amount",
      "amount_formatted",
      "expected_amount",
      "expected_amount_formatted",
      "bank",
      "proof",
      "payment_status",
      "payment_date",
      "verification_notes",
    ].forEach((name) => {
      try {
        collection.fields.removeByName(name);
      } catch (_) {
        // abaikan bila tidak ada
      }
    });
    app.save(collection);
  },
);
