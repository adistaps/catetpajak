/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("transactions");
    if (collection.fields.getByName("attachment")) return;
    collection.fields.add(
      new FileField({
        name: "attachment",
        maxSelect: 5,
        maxSize: 10485760,
        mimeTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "application/pdf",
        ],
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("transactions");
      collection.fields.removeByName("attachment");
      app.save(collection);
    } catch (e) {
      if (!String(e).includes("no rows in result set")) throw e;
    }
  },
);
