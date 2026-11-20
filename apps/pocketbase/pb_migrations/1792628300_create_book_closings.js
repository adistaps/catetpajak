/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "book_closings",
      // Company-scoped: owner, company owner, or active company members.
      listRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))",
      viewRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))",
      // Only company owners or active members may record a closing.
      createRule:
        "@request.auth.id != '' && (company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))",
      updateRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))",
      deleteRule:
        "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))",
      fields: [
        {
          name: "company",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: companies.id,
          cascadeDelete: true,
        },
        { name: "closing_date", type: "date", required: true },
        { name: "total_revenue", type: "number" },
        { name: "total_expense", type: "number" },
        { name: "net_income", type: "number" },
        { name: "entries_created", type: "number" },
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
        "CREATE UNIQUE INDEX idx_book_closings_company_date ON book_closings (company, closing_date)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("book_closings");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        return;
      }
      throw e;
    }
  },
);
