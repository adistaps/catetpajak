/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("documents");
    const existing = collection.fields.getByName("due_date");
    if (existing) {
      if (existing.type === "date") return;
      collection.fields.removeByName("due_date");
    }
    collection.fields.add(
      new DateField({
        name: "due_date",
        required: false,
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("documents");
      collection.fields.removeByName("due_date");
      app.save(collection);
    } catch (e) {
      if (String(e).includes("no rows in result set")) return;
      throw e;
    }
  },
);
