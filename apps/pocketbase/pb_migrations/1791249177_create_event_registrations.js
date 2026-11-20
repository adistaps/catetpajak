/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("event_registrations");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "event_registrations",
        listRule: null,
        viewRule: null,
        createRule: "",
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: "event_slug", type: "text", required: true, max: 80 },
          { name: "event_title", type: "text", required: true, max: 200 },
          { name: "name", type: "text", required: true, max: 120 },
          { name: "email", type: "email", required: true },
          { name: "phone", type: "text", required: true, max: 40 },
          { name: "company_name", type: "text", max: 160 },
          { name: "notes", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_event_registrations_slug ON event_registrations (event_slug)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("event_registrations");
      app.delete(collection);
    } catch (e) {
      if (String(e).includes("no rows in result set") || (e && e.message && e.message.includes("no rows in result set"))) {
        return;
      }
      throw e;
    }
  },
);
