/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("documents");
    const existing = collection.fields.getByName("down_payment");
    if (existing) {
      if (existing.type === "number") return;
      collection.fields.removeByName("down_payment");
    }
    collection.fields.add(
      new NumberField({
        name: "down_payment",
        min: 0,
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("documents");
      collection.fields.removeByName("down_payment");
      app.save(collection);
    } catch (e) {
      if (String(e).includes("no rows in result set")) return;
      throw e;
    }
  },
);
