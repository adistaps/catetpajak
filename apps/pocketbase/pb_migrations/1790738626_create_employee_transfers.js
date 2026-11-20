/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const companies = app.findCollectionByNameOrId("companies");
    const employees = app.findCollectionByNameOrId("employees");

    try {
      employees.fields.getByName("employee_code");
    } catch (_) {
      employees.fields.add(
        new TextField({
          name: "employee_code",
          required: false,
          max: 20,
        }),
      );
      app.save(employees);
    }

    const memberRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    const collection = new Collection({
      type: "base",
      name: "employee_transfers",
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
          name: "employee",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: employees.id,
          cascadeDelete: true,
        },
        { name: "employee_code", type: "text", max: 20 },
        { name: "employee_name", type: "text", required: true, max: 120 },
        {
          name: "transfer_type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["position", "status", "salary", "bank", "npwp", "ptkp", "other"],
        },
        { name: "from_value", type: "text", max: 200 },
        { name: "to_value", type: "text", required: true, max: 200 },
        { name: "notes", type: "text", max: 500 },
        { name: "created_date", type: "date", required: true },
        { name: "effective_date", type: "date", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "approved", "cancelled"],
        },
        {
          name: "attachment",
          type: "file",
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
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
        "CREATE INDEX idx_employee_transfers_company ON employee_transfers (company)",
        "CREATE INDEX idx_employee_transfers_employee ON employee_transfers (employee)",
        "CREATE INDEX idx_employee_transfers_status ON employee_transfers (status)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("employee_transfers");
      app.delete(collection);
    } catch (_) {
      /* already removed */
    }
    try {
      const employees = app.findCollectionByNameOrId("employees");
      employees.fields.removeByName("employee_code");
      app.save(employees);
    } catch (_) {
      /* field missing */
    }
  },
);
