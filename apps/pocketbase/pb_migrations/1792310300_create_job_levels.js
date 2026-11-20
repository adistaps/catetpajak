/// <reference path="../pb_data/types.d.ts" />

// Daftar Level Jabatan per perusahaan. Dikelola di Pengaturan → Kontak dan
// dipakai sebagai pilihan field Level Jabatan pada data karyawan serta
// sebagai target level pada pengaturan/pengajuan reimbursement. Setiap
// perusahaan hanya mengelola dan menggunakan levelnya sendiri (company-scoped).

const COMPANY_RULE =
  "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))";

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "job_levels",
      listRule: COMPANY_RULE,
      viewRule: COMPANY_RULE,
      createRule: "@request.auth.id != ''",
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
        { name: "name", type: "text", required: true, max: 120 },
        { name: "description", type: "text", max: 300 },
        { name: "sort", type: "number", required: false, onlyInt: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
      ],
      indexes: [
        "CREATE INDEX idx_job_levels_company ON job_levels (company)",
        "CREATE UNIQUE INDEX idx_job_levels_company_name ON job_levels (company, name)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("job_levels");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
