/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("documents");

    if (!collection.fields.getByName("message")) {
      collection.fields.add(new TextField({ name: "message", max: 5000 }));
    }
    if (!collection.fields.getByName("memo")) {
      collection.fields.add(new TextField({ name: "memo", max: 5000 }));
    }
    if (!collection.fields.getByName("attachments")) {
      collection.fields.add(
        new FileField({
          name: "attachments",
          maxSelect: 5,
          maxSize: 10485760,
          mimeTypes: [
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/pdf",
            "image/jpeg",
            "image/png",
            "application/zip",
            "application/x-zip-compressed",
          ],
        }),
      );
    }
    if (!collection.fields.getByName("header_discount_value")) {
      collection.fields.add(new NumberField({ name: "header_discount_value", min: 0 }));
    }
    const modeField = collection.fields.getByName("header_discount_mode");
    if (modeField && modeField.type !== "select") {
      collection.fields.removeByName("header_discount_mode");
    }
    if (!collection.fields.getByName("header_discount_mode")) {
      collection.fields.add(
        new SelectField({
          name: "header_discount_mode",
          maxSelect: 1,
          values: ["percent", "amount"],
        }),
      );
    }

    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("documents");
      for (const name of [
        "message",
        "memo",
        "attachments",
        "header_discount_value",
        "header_discount_mode",
      ]) {
        if (collection.fields.getByName(name)) collection.fields.removeByName(name);
      }
      app.save(collection);
    } catch (e) {
      if (String(e).includes("no rows in result set")) return;
      throw e;
    }
  },
);
