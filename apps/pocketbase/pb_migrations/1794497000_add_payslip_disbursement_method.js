/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field disbursement_method pada payslips untuk mencatat metode
// pencairan gaji (transfer bank, tunai, cek/giro, atau lainnya). Status
// pencairan tetap terpisah dari publikasi payslip dan tidak memicu transfer
// otomatis. Slip yang sudah ada sebelum migrasi ini memiliki nilai kosong
// (metode belum dicatat); backfill tidak mengubah status pencairan yang ada.
migrate(
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");

    if (!payslips.fields.getByName("disbursement_method")) {
      payslips.fields.add(
        new SelectField({
          name: "disbursement_method",
          maxSelect: 1,
          values: ["transfer_bank", "tunai", "cek_giro", "lainnya"],
        }),
      );
    }
    app.save(payslips);
  },
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");
    payslips.fields.removeByName("disbursement_method");
    app.save(payslips);
  },
);
