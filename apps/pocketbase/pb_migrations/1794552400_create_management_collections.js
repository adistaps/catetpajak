/// <reference path="../pb_data/types.d.ts" />

// Koleksi modul Management: Performance Management dan Training Development.
// Keduanya dicakup per perusahaan (company-scoped) dengan aturan akses yang
// sama dengan koleksi SDM lain (reimbursements/employee_loans): pemilik
// perusahaan + anggota aktif dapat melihat dan mengelola data perusahaannya.
// Data terisolasi antarperusahaan lewat relasi `company` dan rule akses.

const COMPANY_RULE =
  "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))";

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const employees = app.findCollectionByNameOrId("employees");
    const users = app.findCollectionByNameOrId("users");

    // ── performance_reviews ────────────────────────────────────────────────
    const performance = new Collection({
      type: "base",
      name: "performance_reviews",
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
        {
          name: "employee",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: employees.id,
          cascadeDelete: true,
        },
        { name: "title", type: "text", required: true, max: 200 },
        { name: "period", type: "text", required: true, max: 50 },
        { name: "review_date", type: "date", required: true },
        {
          name: "rating",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["1", "2", "3", "4", "5"],
        },
        { name: "goals", type: "text", max: 1000 },
        { name: "strengths", type: "text", max: 1000 },
        { name: "improvements", type: "text", max: 1000 },
        { name: "notes", type: "text", max: 1000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "completed"],
        },
        {
          name: "reviewer",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: users.id,
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
      indexes: [
        "CREATE INDEX idx_performance_reviews_company ON performance_reviews (company)",
        "CREATE INDEX idx_performance_reviews_employee ON performance_reviews (employee)",
        "CREATE INDEX idx_performance_reviews_status ON performance_reviews (status)",
      ],
    });
    app.save(performance);

    // ── trainings ──────────────────────────────────────────────────────────
    const trainings = new Collection({
      type: "base",
      name: "trainings",
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
        { name: "title", type: "text", required: true, max: 200 },
        { name: "description", type: "text", max: 1000 },
        {
          name: "category",
          type: "select",
          required: false,
          maxSelect: 1,
          values: [
            "onboarding",
            "technical",
            "soft_skill",
            "compliance",
            "leadership",
            "other",
          ],
        },
        { name: "start_date", type: "date" },
        { name: "end_date", type: "date" },
        { name: "trainer", type: "text", max: 200 },
        { name: "location", type: "text", max: 200 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["planned", "ongoing", "completed", "cancelled"],
        },
        {
          name: "participants",
          type: "relation",
          required: false,
          maxSelect: 0,
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
      indexes: [
        "CREATE INDEX idx_trainings_company ON trainings (company)",
        "CREATE INDEX idx_trainings_status ON trainings (status)",
      ],
    });
    app.save(trainings);
  },
  (app) => {
    for (const name of ["performance_reviews", "trainings"]) {
      try {
        const collection = app.findCollectionByNameOrId(name);
        app.delete(collection);
      } catch (e) {
        if (e.message.includes("no rows in result set")) continue;
        throw e;
      }
    }
  },
);
