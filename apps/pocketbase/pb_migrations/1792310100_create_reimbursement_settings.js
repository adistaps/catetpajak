/// <reference path="../pb_data/types.d.ts" />

// Pengaturan reimbursement per perusahaan: jenis reimbursement, penugasan
// (semua karyawan / karyawan tertentu / per role), batas nominal, dan saat
// eligibility berlaku (langsung, setelah probation, atau setelah tanggal).
// Juga menambahkan relasi `setting` ke koleksi reimbursements (opsional, tidak
// cascade) dan `join_date` ke employees untuk perhitungan masa probation.

const COMPANY_RULE =
  "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))";

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const employees = app.findCollectionByNameOrId("employees");
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "reimbursement_settings",
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
        { name: "description", type: "text", max: 500 },
        {
          name: "amount_limit",
          type: "number",
          required: false,
          min: 0,
          onlyInt: false,
        },
        {
          name: "assignment_type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["all", "employees", "role"],
        },
        {
          name: "assigned_employees",
          type: "relation",
          required: false,
          maxSelect: 100,
          collectionId: employees.id,
          cascadeDelete: false,
        },
        {
          name: "assigned_roles",
          type: "select",
          required: false,
          maxSelect: 8,
          values: [
            "pemilik",
            "admin",
            "akuntan",
            "finance",
            "hr",
            "kasir",
            "karyawan",
            "pembaca",
          ],
        },
        {
          name: "eligibility_type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["immediate", "after_probation", "after_date"],
        },
        { name: "probation_months", type: "number", required: false, min: 0, onlyInt: true },
        { name: "effective_date", type: "date" },
        { name: "active", type: "bool" },
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
        "CREATE INDEX idx_reimbursement_settings_company ON reimbursement_settings (company)",
        "CREATE INDEX idx_reimbursement_settings_active ON reimbursement_settings (active)",
      ],
    });
    app.save(collection);

    // Tambah relasi `setting` ke reimbursements (opsional, tidak cascade).
    const reimbursementsCol = app.findCollectionByNameOrId("reimbursements");
    if (!reimbursementsCol.fields.getByName("setting")) {
      reimbursementsCol.fields.add(
        new RelationField({
          name: "setting",
          required: false,
          maxSelect: 1,
          collectionId: collection.id,
          cascadeDelete: false,
        }),
      );
      app.save(reimbursementsCol);
    }

    // Tambah `join_date` ke employees untuk perhitungan masa probation.
    const employeesCol = app.findCollectionByNameOrId("employees");
    if (!employeesCol.fields.getByName("join_date")) {
      employeesCol.fields.add(new DateField({ name: "join_date", required: false }));
      app.save(employeesCol);
    }
  },
  (app) => {
    try {
      const reimbursementsCol = app.findCollectionByNameOrId("reimbursements");
      const settingField = reimbursementsCol.fields.getByName("setting");
      if (settingField) {
        reimbursementsCol.fields.remove(settingField);
        app.save(reimbursementsCol);
      }
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      const employeesCol = app.findCollectionByNameOrId("employees");
      const joinField = employeesCol.fields.getByName("join_date");
      if (joinField) {
        employeesCol.fields.remove(joinField);
        app.save(employeesCol);
      }
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      const collection = app.findCollectionByNameOrId("reimbursement_settings");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
