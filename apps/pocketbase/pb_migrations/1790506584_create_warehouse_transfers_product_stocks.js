/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");
    const products = app.findCollectionByNameOrId("products");
    const warehouses = app.findCollectionByNameOrId("warehouses");

    const memberRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    // Stok per produk per gudang (rincian persediaan per lokasi)
    const productStocks = new Collection({
      type: "base",
      name: "product_stocks",
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
        {
          name: "product",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: products.id,
          cascadeDelete: true,
        },
        {
          name: "warehouse",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: warehouses.id,
          cascadeDelete: true,
        },
        { name: "quantity", type: "number" },
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
        "CREATE INDEX idx_product_stocks_company ON product_stocks (company)",
        "CREATE INDEX idx_product_stocks_product ON product_stocks (product)",
        "CREATE INDEX idx_product_stocks_warehouse ON product_stocks (warehouse)",
        "CREATE UNIQUE INDEX idx_product_stocks_unique ON product_stocks (company, product, warehouse)",
      ],
    });
    app.save(productStocks);

    // Transfer gudang (perpindahan stok antar gudang)
    const warehouseTransfers = new Collection({
      type: "base",
      name: "warehouse_transfers",
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
        {
          name: "from_warehouse",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: warehouses.id,
          cascadeDelete: false,
        },
        {
          name: "to_warehouse",
          type: "relation",
          required: true,
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
        // items: JSON array of { product, product_name, quantity }
        { name: "items", type: "json", maxSize: 5000000 },
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
        "CREATE INDEX idx_warehouse_transfers_company ON warehouse_transfers (company)",
        "CREATE INDEX idx_warehouse_transfers_date ON warehouse_transfers (date)",
        "CREATE INDEX idx_warehouse_transfers_status ON warehouse_transfers (status)",
      ],
    });
    app.save(warehouseTransfers);

    // Tambahkan relasi gudang ke transaksi & dokumen (integrasi penjualan/pembelian)
    const transactions = app.findCollectionByNameOrId("transactions");
    transactions.fields.add(
      new RelationField({
        name: "warehouse",
        required: false,
        maxSelect: 1,
        collectionId: warehouses.id,
        cascadeDelete: false,
      }),
    );
    app.save(transactions);

    const documents = app.findCollectionByNameOrId("documents");
    documents.fields.add(
      new RelationField({
        name: "warehouse",
        required: false,
        maxSelect: 1,
        collectionId: warehouses.id,
        cascadeDelete: false,
      }),
    );
    app.save(documents);
  },
  (app) => {
    // Hapus relasi warehouse dari transactions & documents
    try {
      const transactions = app.findCollectionByNameOrId("transactions");
      transactions.fields.removeByName("warehouse");
      app.save(transactions);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      const documents = app.findCollectionByNameOrId("documents");
      documents.fields.removeByName("warehouse");
      app.save(documents);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    for (const name of ["warehouse_transfers", "product_stocks"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    }
  },
);
