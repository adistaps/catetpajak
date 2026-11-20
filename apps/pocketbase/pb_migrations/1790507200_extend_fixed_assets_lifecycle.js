/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const fixedAssets = app.findCollectionByNameOrId("fixed_assets");
    const transactions = app.findCollectionByNameOrId("transactions");
    const documents = app.findCollectionByNameOrId("documents");
    const products = app.findCollectionByNameOrId("products");

    const statusField = fixedAssets.fields.getByName("status");
    if (statusField) {
      statusField.values = ["pending", "active", "fully_depreciated", "sold", "disposed"];
      fixedAssets.fields.add(statusField);
    }

    const expenseField = fixedAssets.fields.getByName("expense_account");
    if (expenseField) {
      expenseField.required = false;
      fixedAssets.fields.add(expenseField);
    }
    const accumField = fixedAssets.fields.getByName("accum_dep_account");
    if (accumField) {
      accumField.required = false;
      fixedAssets.fields.add(accumField);
    }
    const assetAcctField = fixedAssets.fields.getByName("asset_account");
    if (assetAcctField) {
      assetAcctField.required = false;
      fixedAssets.fields.add(assetAcctField);
    }
    const methodField = fixedAssets.fields.getByName("method");
    if (methodField) {
      methodField.required = false;
      fixedAssets.fields.add(methodField);
    }

    if (!fixedAssets.fields.getByName("invoice_number")) {
      fixedAssets.fields.add(
        new TextField({ name: "invoice_number", required: false, max: 80 }),
      );
    }
    if (!fixedAssets.fields.getByName("source_transaction")) {
      fixedAssets.fields.add(
        new RelationField({
          name: "source_transaction",
          required: false,
          maxSelect: 1,
          collectionId: transactions.id,
          cascadeDelete: false,
        }),
      );
    }
    if (!fixedAssets.fields.getByName("source_document")) {
      fixedAssets.fields.add(
        new RelationField({
          name: "source_document",
          required: false,
          maxSelect: 1,
          collectionId: documents.id,
          cascadeDelete: false,
        }),
      );
    }
    if (!fixedAssets.fields.getByName("product")) {
      fixedAssets.fields.add(
        new RelationField({
          name: "product",
          required: false,
          maxSelect: 1,
          collectionId: products.id,
          cascadeDelete: false,
        }),
      );
    }
    if (!fixedAssets.fields.getByName("disposal_date")) {
      fixedAssets.fields.add(new DateField({ name: "disposal_date", required: false }));
    }
    if (!fixedAssets.fields.getByName("disposal_notes")) {
      fixedAssets.fields.add(
        new TextField({ name: "disposal_notes", required: false, max: 300 }),
      );
    }

    app.save(fixedAssets);
  },
  (app) => {
    const fixedAssets = app.findCollectionByNameOrId("fixed_assets");
    for (const name of [
      "invoice_number",
      "source_transaction",
      "source_document",
      "product",
      "disposal_date",
      "disposal_notes",
    ]) {
      const f = fixedAssets.fields.getByName(name);
      if (f) fixedAssets.fields.removeById(f.id);
    }
    const statusField = fixedAssets.fields.getByName("status");
    if (statusField) {
      statusField.values = ["active", "fully_depreciated"];
      fixedAssets.fields.add(statusField);
    }
    app.save(fixedAssets);
  },
);
