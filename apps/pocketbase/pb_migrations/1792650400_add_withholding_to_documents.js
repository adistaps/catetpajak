/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("documents");
    const accounts = app.findCollectionByNameOrId("accounts");

    const accountField = collection.fields.getByName("withholding_account");
    if (accountField && accountField.type !== "relation") {
      collection.fields.removeByName("withholding_account");
    }
    if (!collection.fields.getByName("withholding_account")) {
      collection.fields.add(
        new RelationField({
          name: "withholding_account",
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        }),
      );
    }

    if (!collection.fields.getByName("withholding_value")) {
      collection.fields.add(
        new NumberField({
          name: "withholding_value",
          min: 0,
        }),
      );
    }

    const modeField = collection.fields.getByName("withholding_mode");
    if (modeField && modeField.type !== "select") {
      collection.fields.removeByName("withholding_mode");
    }
    if (!collection.fields.getByName("withholding_mode")) {
      collection.fields.add(
        new SelectField({
          name: "withholding_mode",
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
      collection.fields.removeByName("withholding_account");
      collection.fields.removeByName("withholding_value");
      collection.fields.removeByName("withholding_mode");
      app.save(collection);
    } catch (e) {
      if (String(e).includes("no rows in result set")) return;
      throw e;
    }
  },
);
