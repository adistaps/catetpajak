/// <reference path="../pb_data/types.d.ts" />

// Adds a confirmation-email sentinel to event_registrations so the unpaid-invoice
// confirmation email is sent at most once per registration, even if the
// registrant clicks "Lanjutkan Pembayaran" repeatedly.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("event_registrations");

    collection.fields.add(
      new BoolField({ name: "confirmation_email_sent" }),
    );
    collection.fields.add(
      new DateField({ name: "confirmation_email_sent_at" }),
    );

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("event_registrations");
    ["confirmation_email_sent", "confirmation_email_sent_at"].forEach((name) => {
      try {
        collection.fields.removeByName(name);
      } catch (_) {
        // abaikan bila tidak ada
      }
    });
    app.save(collection);
  },
);
