/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const companies = app.findCollectionByNameOrId("companies");
    const contacts = app.findCollectionByNameOrId("contacts");
    const accounts = app.findCollectionByNameOrId("accounts");
    const transactions = app.findCollectionByNameOrId("transactions");

    const companyRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    const collection = new Collection({
      type: "base",
      name: "documents",
      listRule: companyRule,
      viewRule: companyRule,
      createRule: "@request.auth.id != ''",
      updateRule: companyRule,
      deleteRule: companyRule,
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
          name: "direction",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["penjualan", "pembelian"],
        },
        {
          name: "stage",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["penawaran", "pemesanan", "invoice", "pengiriman", "pembayaran"],
        },
        { name: "number", type: "text", max: 40 },
        { name: "date", type: "date", required: true },
        {
          name: "contact",
          type: "relation",
          maxSelect: 1,
          collectionId: contacts.id,
          cascadeDelete: false,
        },
        { name: "partner", type: "text", max: 160 },
        { name: "description", type: "text", max: 400 },
        { name: "items", type: "json" },
        { name: "subtotal", type: "number" },
        { name: "discount_total", type: "number" },
        { name: "tax_total", type: "number" },
        { name: "total", type: "number" },
        { name: "paid_amount", type: "number" },
        {
          name: "debit_account",
          type: "relation",
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        },
        {
          name: "credit_account",
          type: "relation",
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        },
        {
          name: "transaction",
          type: "relation",
          maxSelect: 1,
          collectionId: transactions.id,
          cascadeDelete: true,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "confirmed", "cancelled"],
        },
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
        "CREATE INDEX idx_documents_company ON documents (company)",
        "CREATE INDEX idx_documents_stage ON documents (stage)",
        "CREATE INDEX idx_documents_direction ON documents (direction)",
      ],
    });
    app.save(collection);

    // Tambahkan self-reference source_document setelah koleksi tersimpan
    // agar collectionId valid (relasi ke documents itu sendiri).
    const saved = app.findCollectionByNameOrId("documents");
    if (!saved.fields.getByName("source_document")) {
      saved.fields.add(
        new RelationField({
          name: "source_document",
          maxSelect: 1,
          collectionId: saved.id,
          cascadeDelete: false,
        }),
      );
      app.save(saved);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("documents");
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
