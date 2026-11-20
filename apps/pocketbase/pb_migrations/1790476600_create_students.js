/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("students");
    } catch (_) {
      const companies = app.findCollectionByNameOrId("companies");
      const users = app.findCollectionByNameOrId("users");
      collection = new Collection({
        type: "base",
        name: "students",
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
          { name: "student_name", type: "text", required: true, max: 160 },
          { name: "student_id_number", type: "text", max: 80 },
          { name: "academic_year", type: "text", max: 40 },
          { name: "parents_name", type: "text", max: 160 },
          { name: "punishment", type: "text", max: 300 },
          { name: "school_program", type: "text", max: 120 },
          { name: "school_grade", type: "text", max: 80 },
          {
            name: "active_status",
            type: "select",
            maxSelect: 1,
            values: ["active", "inactive", "graduated", "withdrawn"],
          },
          { name: "virtual_account_number", type: "text", max: 80 },
          { name: "phone", type: "text", max: 40 },
          { name: "mobile", type: "text", max: 40 },
          { name: "email", type: "text", max: 120 },
          { name: "address", type: "text", max: 300 },
          { name: "notes", type: "text", max: 500 },
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
          "CREATE INDEX idx_students_company ON students (company)",
          "CREATE INDEX idx_students_id_number ON students (company, student_id_number)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("students"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
