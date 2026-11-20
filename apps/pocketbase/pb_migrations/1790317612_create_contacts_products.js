/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    // Kontak: pemasok (supplier) & pelanggan (customer)
    const contacts = new Collection({
      type: "base",
      name: "contacts",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
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
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["supplier", "customer"],
        },
        { name: "code", type: "text", max: 20 },
        { name: "phone", type: "text", max: 40 },
        { name: "email", type: "text", max: 120 },
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
      indexes: ["CREATE INDEX idx_contacts_company ON contacts (company)"],
    });
    app.save(contacts);

    // Produk / persediaan
    const products = new Collection({
      type: "base",
      name: "products",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
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
        { name: "unit", type: "text", max: 20 },
        { name: "price", type: "number", min: 0 },
        { name: "cost", type: "number", min: 0 },
        { name: "stock", type: "number", min: 0 },
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
      indexes: ["CREATE INDEX idx_products_company ON products (company)"],
    });
    app.save(products);

    // Tambah relasi & kolom diskon/pajak pada transaksi
    const transactions = app.findCollectionByNameOrId("transactions");
    transactions.fields.add(
      new RelationField({
        name: "contact",
        required: false,
        maxSelect: 1,
        collectionId: contacts.id,
        cascadeDelete: false,
      }),
    );
    transactions.fields.add(
      new RelationField({
        name: "product",
        required: false,
        maxSelect: 1,
        collectionId: products.id,
        cascadeDelete: false,
      }),
    );
    transactions.fields.add(new NumberField({ name: "quantity", min: 0 }));
    transactions.fields.add(new NumberField({ name: "unit_price", min: 0 }));
    transactions.fields.add(new NumberField({ name: "discount", min: 0 }));
    transactions.fields.add(new NumberField({ name: "tax_rate", min: 0 }));
    transactions.fields.add(new NumberField({ name: "tax_amount", min: 0 }));
    app.save(transactions);
  },
  (app) => {
    try {
      const transactions = app.findCollectionByNameOrId("transactions");
      for (const fname of [
        "contact",
        "product",
        "quantity",
        "unit_price",
        "discount",
        "tax_rate",
        "tax_amount",
      ]) {
        const field = transactions.fields.getByName(fname);
        if (field) transactions.fields.remove(field);
      }
      app.save(transactions);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    for (const name of ["products", "contacts"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    }
  },
);
