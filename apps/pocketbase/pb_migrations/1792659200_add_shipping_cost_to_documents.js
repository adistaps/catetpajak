/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("documents");

    const existing = collection.fields.getByName("shipping_cost");
    if (existing) {
      if (existing.type === "number") return;
      collection.fields.removeByName("shipping_cost");
    }

    collection.fields.add(
      new NumberField({
        name: "shipping_cost",
        min: 0,
        onlyInt: false,
        required: false,
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("documents");
      collection.fields.removeByName("shipping_cost");
      app.save(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("Collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
