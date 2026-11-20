/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const accounts = app.findCollectionByNameOrId("accounts");
    const users = app.findCollectionByNameOrId("users");

    const memberRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    let taxTypes;
    try {
      taxTypes = app.findCollectionByNameOrId("tax_types");
    } catch (_) {
      taxTypes = new Collection({
        type: "base",
        name: "tax_types",
        listRule: memberRule,
        viewRule: memberRule,
        createRule: "@request.auth.id != ''",
        updateRule: memberRule,
        deleteRule: memberRule,
        fields: [
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          { name: "name", type: "text", required: true, max: 80 },
          { name: "code", type: "text", max: 20 },
          { name: "rate", type: "number", min: 0 },
          {
            name: "kind",
            type: "select",
            maxSelect: 1,
            values: ["ppn", "pph", "lainnya"],
          },
          {
            name: "account",
            type: "relation",
            maxSelect: 1,
            collectionId: accounts.id,
            cascadeDelete: false,
          },
          { name: "is_active", type: "bool" },
          { name: "sort_order", type: "number", min: 0 },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_tax_types_company ON tax_types (company)",
          "CREATE UNIQUE INDEX idx_tax_types_company_name ON tax_types (company, name)",
        ],
      });
      app.save(taxTypes);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("tax_types");
      app.delete(collection);
    } catch (e) {
      if (String(e).includes("no rows")) return;
      throw e;
    }
  },
);
