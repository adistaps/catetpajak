/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("documents");
    const accounts = app.findCollectionByNameOrId("accounts");

    const existing = collection.fields.getByName("down_payment_account");
    if (existing) {
      if (existing.type === "relation") return;
      collection.fields.removeByName("down_payment_account");
    }

    collection.fields.add(
      new RelationField({
        name: "down_payment_account",
        maxSelect: 1,
        collectionId: accounts.id,
        cascadeDelete: false,
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("documents");
      collection.fields.removeByName("down_payment_account");
      app.save(collection);
    } catch (e) {
      if (String(e).includes("no rows in result set")) return;
      throw e;
    }
  },
);
