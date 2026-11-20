/// <reference path="../pb_data/types.d.ts" />

// Menyimpan langganan Web Push per pengguna/parent agar panggilan masuk dapat
// dikirim ke perangkat meski browser ditutup (iOS PWA / desktop). Kunci VAPID
// ada di apps/web/.env; pengiriman push dilakukan oleh route /api/push-call.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("push_subscriptions");
    } catch (_) {
      const subs = new Collection({
        type: "base",
        name: "push_subscriptions",
        listRule:
          "@request.auth.id != '' && subscriber_id = @request.auth.id && subscriber_type = @request.auth.collectionName",
        viewRule:
          "@request.auth.id != '' && subscriber_id = @request.auth.id && subscriber_type = @request.auth.collectionName",
        createRule:
          "@request.auth.id != '' && subscriber_id = @request.auth.id && subscriber_type = @request.auth.collectionName",
        updateRule:
          "@request.auth.id != '' && subscriber_id = @request.auth.id && subscriber_type = @request.auth.collectionName",
        deleteRule:
          "@request.auth.id != '' && subscriber_id = @request.auth.id && subscriber_type = @request.auth.collectionName",
        fields: [
          { name: "endpoint", type: "text", required: true, max: 500 },
          { name: "p256dh", type: "text", required: true, max: 200 },
          { name: "auth_key", type: "text", required: true, max: 200 },
          { name: "subscriber_id", type: "text", required: true, max: 64 },
          {
            name: "subscriber_type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["users", "parents"],
          },
          { name: "device_label", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint)",
          "CREATE INDEX idx_push_subscriptions_subscriber ON push_subscriptions (subscriber_id, subscriber_type)",
        ],
      });
      app.save(subs);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("push_subscriptions"));
    } catch (_) {}
  },
);
