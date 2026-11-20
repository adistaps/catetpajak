/// <reference path="../pb_data/types.d.ts" />

// Koleksi pengajuan reimbursement (penggantian biaya) karyawan. Karyawan
// mengajukan dengan nominal, tanggal, keterangan, dan bukti struk/foto.
// Akuntan/admin berwenang meninjau, menyetujui/menolak, lalu memproses
// pembayaran dan mencatat jurnalnya. Aturan akses mengikuti pola
// employee_loans: pemilik perusahaan + anggota aktif dapat melihat dan
// mengelola data perusahaannya.

const COMPANY_RULE =
  "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))";

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const employees = app.findCollectionByNameOrId("employees");
    const users = app.findCollectionByNameOrId("users");
    const transactions = app.findCollectionByNameOrId("transactions");

    const collection = new Collection({
      type: "base",
      name: "reimbursements",
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
          name: "amount",
          type: "number",
          required: true,
          min: 1,
          onlyInt: false,
        },
        {
          name: "date",
          type: "date",
          required: true,
        },
        {
          name: "description",
          type: "text",
          required: true,
          max: 500,
        },
        {
          name: "proof",
          type: "file",
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
          protected: false,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "approved", "rejected", "paid"],
        },
        {
          name: "rejection_reason",
          type: "text",
          max: 500,
        },
        {
          name: "processed_by",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        },
        {
          name: "processed_date",
          type: "date",
        },
        {
          name: "paid_date",
          type: "date",
        },
        {
          name: "transaction",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: transactions.id,
          cascadeDelete: false,
        },
        {
          name: "status_history",
          type: "json",
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
        "CREATE INDEX idx_reimbursements_company ON reimbursements (company)",
        "CREATE INDEX idx_reimbursements_employee ON reimbursements (employee)",
        "CREATE INDEX idx_reimbursements_status ON reimbursements (status)",
      ],
    });
    app.save(collection);

    // Tambah relasi `reimbursement` ke transactions agar pengajuan reimbursement
    // tertaut ke transaksi Biaya-nya (opsional, tidak cascade — menghapus
    // transaksi tidak menghapus data reimbursement).
    const transactionsCol = app.findCollectionByNameOrId("transactions");
    if (!transactionsCol.fields.getByName("reimbursement")) {
      transactionsCol.fields.add(
        new RelationField({
          name: "reimbursement",
          required: false,
          maxSelect: 1,
          collectionId: collection.id,
          cascadeDelete: false,
        }),
      );
      app.save(transactionsCol);
    }
  },
  (app) => {
    try {
      const transactionsCol = app.findCollectionByNameOrId("transactions");
      const reimbField = transactionsCol.fields.getByName("reimbursement");
      if (reimbField) {
        transactionsCol.fields.remove(reimbField);
        app.save(transactionsCol);
      }
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      const collection = app.findCollectionByNameOrId("reimbursements");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
