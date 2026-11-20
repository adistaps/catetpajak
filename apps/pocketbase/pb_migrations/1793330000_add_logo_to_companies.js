/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("companies");
    collection.fields.add(
      new FileField({
        name: "logo",
        maxSelect: 1,
        maxSize: 2097152, // 2 MB
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
        thumbs: ["200x200", "400x400"],
        protected: false,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("companies");
    collection.fields.removeByName("logo");
    app.save(collection);
  },
);
