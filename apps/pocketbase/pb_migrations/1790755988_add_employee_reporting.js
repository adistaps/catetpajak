/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const companies = app.findCollectionByNameOrId("companies");
    const employees = app.findCollectionByNameOrId("employees");

    const memberRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    let lines;
    try {
      lines = app.findCollectionByNameOrId("approval_lines");
    } catch (_) {
      lines = new Collection({
        type: "base",
        name: "approval_lines",
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
          { name: "name", type: "text", required: true, max: 120 },
          {
            name: "approvers",
            type: "relation",
            maxSelect: 8,
            collectionId: employees.id,
            cascadeDelete: false,
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
        indexes: ["CREATE INDEX idx_approval_lines_company ON approval_lines (company)"],
      });
      app.save(lines);
    }

    const hasField = (name) => {
      try {
        return Boolean(employees.fields.getByName(name));
      } catch (_) {
        return false;
      }
    };

    if (!hasField("manager")) {
      employees.fields.add(
        new RelationField({
          name: "manager",
          required: false,
          maxSelect: 1,
          collectionId: employees.id,
          cascadeDelete: false,
        }),
      );
    }
    if (!hasField("approval_line")) {
      employees.fields.add(
        new RelationField({
          name: "approval_line",
          required: false,
          maxSelect: 1,
          collectionId: lines.id,
          cascadeDelete: false,
        }),
      );
    }
    app.save(employees);
  },
  (app) => {
    try {
      const employees = app.findCollectionByNameOrId("employees");
      if (employees.fields.getByName("manager")) employees.fields.removeByName("manager");
      if (employees.fields.getByName("approval_line")) employees.fields.removeByName("approval_line");
      app.save(employees);
    } catch (_) {
      /* employees missing */
    }
    try {
      const lines = app.findCollectionByNameOrId("approval_lines");
      app.delete(lines);
    } catch (_) {
      /* already removed */
    }
  },
);
