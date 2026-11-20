/// <reference path="../pb_data/types.d.ts" />

// Menambahkan opsi "neo_bank" pada field disbursement_method payslips dan
// field disbursement_reference untuk menyimpan nomor referensi transfer dari
// Neo Bank. Tidak mengubah status pencairan yang sudah ada; nilai kosong pada
// disbursement_reference untuk slip lama.
migrate(
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");

    const method = payslips.fields.getByName("disbursement_method");
    if (method && !method.values.includes("neo_bank")) {
      method.values = ["transfer_bank", "tunai", "cek_giro", "lainnya", "neo_bank"];
    }

    if (!payslips.fields.getByName("disbursement_reference")) {
      payslips.fields.add(new TextField({ name: "disbursement_reference", max: 120 }));
    }

    app.save(payslips);
  },
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");

    const method = payslips.fields.getByName("disbursement_method");
    if (method) {
      method.values = ["transfer_bank", "tunai", "cek_giro", "lainnya"];
    }

    payslips.fields.removeByName("disbursement_reference");
    app.save(payslips);
  },
);
