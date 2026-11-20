/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    // --- payroll_settings (unique per company) ---------------------------
    let settings;
    try {
      settings = app.findCollectionByNameOrId("payroll_settings");
    } catch (_) {
      settings = new Collection({
        type: "base",
        name: "payroll_settings",
        listRule:
          "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
        viewRule:
          "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
        createRule: "@request.auth.id != ''",
        updateRule:
          "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
        deleteRule:
          "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id)",
        fields: [
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          { name: "use_cutoff", type: "bool" },
          { name: "cutoff_start_day", type: "number", min: 1, max: 31 },
          { name: "cutoff_end_day", type: "number", min: 1, max: 31 },
          { name: "pay_day", type: "number", min: 1, max: 31 },
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
      });
      app.save(settings);
    }

    // --- add cutoff_start / cutoff_end to payroll_runs -------------------
    const runs = app.findCollectionByNameOrId("payroll_runs");
    if (!runs.fields.getByName("cutoff_start")) {
      runs.fields.add(new DateField({ name: "cutoff_start", required: false }));
    }
    if (!runs.fields.getByName("cutoff_end")) {
      runs.fields.add(new DateField({ name: "cutoff_end", required: false }));
    }
    app.save(runs);
  },
  (app) => {
    try {
      const settings = app.findCollectionByNameOrId("payroll_settings");
      app.delete(settings);
    } catch (_) {}
    try {
      const runs = app.findCollectionByNameOrId("payroll_runs");
      runs.fields.removeByName("cutoff_start");
      runs.fields.removeByName("cutoff_end");
      app.save(runs);
    } catch (_) {}
  },
);
