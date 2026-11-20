/// <reference path="../pb_data/types.d.ts" />

// Koleksi offboarding karyawan: mencatat proses keluar karyawan dan melacak
// langkah-langkah penyelesaian secara manual. Tidak menghapus akun/data
// karyawan, tidak mengubah payroll yang sudah ada, dan tidak menjalankan
// pembayaran. Aturan akses mengikuti pola reimbursements: pemilik perusahaan
// + anggota aktif dapat melihat dan mengelola data perusahaannya.

const COMPANY_RULE =
  "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))";

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const employees = app.findCollectionByNameOrId("employees");
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "employee_offboarding",
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
        {
          name: "employee",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: employees.id,
          cascadeDelete: true,
        },
        {
          name: "resignation_date",
          type: "date",
          required: true,
        },
        {
          name: "last_working_day",
          type: "date",
        },
        {
          name: "reason",
          type: "text",
          max: 500,
        },
        {
          name: "exit_interview",
          type: "bool",
        },
        {
          name: "handover",
          type: "bool",
        },
        {
          name: "asset_return",
          type: "bool",
        },
        {
          name: "documents_signed",
          type: "bool",
        },
        {
          name: "final_pay_settled",
          type: "bool",
        },
        {
          name: "access_revoked",
          type: "bool",
        },
        {
          name: "clearance_completed",
          type: "bool",
        },
        {
          name: "notes",
          type: "text",
          max: 1000,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["in_progress", "completed", "cancelled"],
        },
        {
          name: "completed_date",
          type: "date",
        },
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
        "CREATE INDEX idx_employee_offboarding_company ON employee_offboarding (company)",
        "CREATE INDEX idx_employee_offboarding_employee ON employee_offboarding (employee)",
        "CREATE INDEX idx_employee_offboarding_status ON employee_offboarding (status)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("employee_offboarding");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
