/// <reference path="../pb_data/types.d.ts" />

// Koleksi `performance_cycles` menyimpan konfigurasi siklus Performance Review
// (purpose, time frame, periode kinerja & review, metode review, bobot,
// deduction score, dan aturan publish score). Mengikuti panduan PDF Mekari
// Talenta. Data terikat per perusahaan dengan aturan akses yang sama dengan
// koleksi management lainnya. Tidak ada penilaian atau publikasi otomatis —
// semua perubahan status dilakukan manual/eksplisit oleh pengguna.

const COMPANY_RULE =
  "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))";

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const employees = app.findCollectionByNameOrId("employees");
    const users = app.findCollectionByNameOrId("users");

    let collection;
    try {
      collection = app.findCollectionByNameOrId("performance_cycles");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "performance_cycles",
        listRule: COMPANY_RULE,
        viewRule: COMPANY_RULE,
        createRule: COMPANY_RULE,
        updateRule: COMPANY_RULE,
        deleteRule: COMPANY_RULE,
        fields: [
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          { name: "name", type: "text", required: true, max: 200 },
          {
            name: "purpose",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["performance", "competency", "evaluation"],
          },
// duplicate_from ditambahkan setelah koleksi tersimpan (self-reference).
          {
            name: "employee_selection",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["selected", "all"],
          },
          {
            name: "selected_employees",
            type: "relation",
            required: false,
            maxSelect: 0,
            collectionId: employees.id,
            cascadeDelete: false,
          },
          {
            name: "time_frame",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["custom", "monthly", "quarterly", "half_yearly", "yearly"],
          },
          { name: "performance_start", type: "date", required: true },
          { name: "performance_end", type: "date", required: true },
          { name: "review_start", type: "date", required: true },
          { name: "review_end", type: "date", required: true },
          { name: "extend_deadline", type: "bool" },
          { name: "repeat_cycle", type: "bool" },
          { name: "lock_edit", type: "bool" },
          { name: "methods", type: "json", maxSize: 5000000 },
          { name: "use_weight", type: "bool" },
          { name: "deduction", type: "json", maxSize: 5000000 },
          {
            name: "publish_score_after",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["complete_review", "review_period_end", "both"],
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["draft", "active", "completed", "archived"],
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
          "CREATE INDEX idx_performance_cycles_company ON performance_cycles (company)",
          "CREATE INDEX idx_performance_cycles_status ON performance_cycles (status)",
        ],
      });
      app.save(collection);
    }

    // Self-reference untuk duplicate_from (menunjuk ke performance_cycles sendiri).
    if (!collection.fields.getByName("duplicate_from")) {
      collection.fields.add(
        new RelationField({
          name: "duplicate_from",
          required: false,
          maxSelect: 1,
          collectionId: collection.id,
          cascadeDelete: false,
        }),
      );
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("performance_cycles");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
