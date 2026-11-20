/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("transactions");
    collection.fields.add(
      new JSONField({
        name: "expense_detail",
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("transactions");
    collection.fields.removeByName("expense_detail");
    app.save(collection);
  },
);
