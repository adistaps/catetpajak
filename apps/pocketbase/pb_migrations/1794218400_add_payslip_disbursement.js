/// <reference path="../pb_data/types.d.ts" />

// Menambahkan fitur disbursement (pencairan gaji) pada payslips:
// - disbursement_status: "pending" (belum dicairkan) / "paid" (sudah dicairkan)
// - disbursement_date: tanggal pencairan/pembayaran ke karyawan
// - disbursement_notes: catatan pembayaran
// - disbursed_by: pengguna yang menandai pencairan
//
// Status pencairan terpisah dari publikasi payslip: slip bisa diterbitkan ke
// karyawan tanpa otomatis dianggap sudah dibayar. Admin menandai slip sebagai
// sudah dicairkan secara manual setelah melakukan transfer/pembayaran — tidak
// ada transfer uang otomatis. Slip yang sudah ada sebelum migrasi ini dianggap
// "pending" (belum dicairkan). Aturan akses tetap owner-only untuk tulis.
migrate(
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");

    if (!payslips.fields.getByName("disbursement_status")) {
      payslips.fields.add(
        new SelectField({
          name: "disbursement_status",
          maxSelect: 1,
          values: ["pending", "paid"],
        }),
      );
    }
    if (!payslips.fields.getByName("disbursement_date")) {
      payslips.fields.add(new DateField({ name: "disbursement_date" }));
    }
    if (!payslips.fields.getByName("disbursement_notes")) {
      payslips.fields.add(new TextField({ name: "disbursement_notes", max: 500 }));
    }
    if (!payslips.fields.getByName("disbursed_by")) {
      payslips.fields.add(
        new RelationField({
          name: "disbursed_by",
          maxSelect: 1,
          collectionId: "_pb_users_auth_",
          cascadeDelete: false,
        }),
      );
    }
    app.save(payslips);

    // Backfill: slip yang sudah ada dianggap belum dicairkan.
    let page = 1;
    for (;;) {
      const batch = app.findRecordsByFilter("payslips", "id != ''", "", page, 1000);
      if (!batch || batch.length === 0) break;
      for (const rec of batch) {
        rec.set("disbursement_status", "pending");
        app.save(rec);
      }
      if (batch.length < 1000) break;
      page += 1;
    }
  },
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");
    payslips.fields.removeByName("disbursement_status");
    payslips.fields.removeByName("disbursement_date");
    payslips.fields.removeByName("disbursement_notes");
    payslips.fields.removeByName("disbursed_by");
    app.save(payslips);
  },
);
