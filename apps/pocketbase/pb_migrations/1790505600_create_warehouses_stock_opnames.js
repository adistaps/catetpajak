/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");
    const products = app.findCollectionByNameOrId("products");

    // Gudang (warehouse)
    const warehouses = new Collection({
      type: "base",
      name: "warehouses",
      listRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
      viewRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
      createRule: "@request.auth.id != ''",
      updateRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
      deleteRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
      fields: [
        {
          name: "company",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: companies.id,
          cascadeDelete: true,
        },
        { name: "name", type: "text", required: true, max: 120 },
        { name: "code", type: "text", max: 20 },
        { name: "address", type: "text", max: 300 },
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
      indexes: ["CREATE INDEX idx_warehouses_company ON warehouses (company)"],
    });
    app.save(warehouses);

    // Stock opname (stock taking / inventory adjustment)
    const stockOpnames = new Collection({
      type: "base",
      name: "stock_opnames",
      listRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
      viewRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
      createRule: "@request.auth.id != ''",
      updateRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
      deleteRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
      fields: [
        {
          name: "company",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: companies.id,
          cascadeDelete: true,
        },
        {
          name: "warehouse",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: warehouses.id,
          cascadeDelete: false,
        },
        { name: "number", type: "text", max: 40 },
        { name: "date", type: "date", required: true },
        { name: "description", type: "text", max: 300 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "posted"],
        },
        // items: JSON array of { product, product_name, system_stock, actual_stock, difference }
        { name: "items", type: "json", maxSize: 5000000 },
        { name: "total_difference", type: "number" },
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
        "CREATE INDEX idx_stock_opnames_company ON stock_opnames (company)",
        "CREATE INDEX idx_stock_opnames_warehouse ON stock_opnames (warehouse)",
        "CREATE INDEX idx_stock_opnames_status ON stock_opnames (status)",
      ],
    });
    app.save(stockOpnames);
  },
  (app) => {
    for (const name of ["stock_opnames", "warehouses"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    }
  },
);
