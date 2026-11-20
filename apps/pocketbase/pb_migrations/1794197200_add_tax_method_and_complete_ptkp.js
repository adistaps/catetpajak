/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const employees = app.findCollectionByNameOrId("employees");

    // Lengkapi opsi PTKP sesuai PP 55/2022 (TK/0–TK/3, K/0–K/3).
    const ptkp = employees.fields.getByName("ptkp_status");
    if (ptkp) {
      employees.fields.removeByName("ptkp_status");
    }
    employees.fields.add(
      new SelectField({
        name: "ptkp_status",
        maxSelect: 1,
        values: ["TK0", "TK1", "TK2", "TK3", "K0", "K1", "K2", "K3"],
      }),
    );

    // Tambahkan metode skema pajak penghasilan: Gross, Gross Up, Netto.
    if (!employees.fields.getByName("tax_method")) {
      employees.fields.add(
        new SelectField({
          name: "tax_method",
          maxSelect: 1,
          values: ["gross", "gross_up", "netto"],
        }),
      );
    }

    app.save(employees);

    // Catat metode skema pajak dan tunjangan pajak pada slip gaji.
    const payslips = app.findCollectionByNameOrId("payslips");
    if (!payslips.fields.getByName("tax_method")) {
      payslips.fields.add(
        new SelectField({
          name: "tax_method",
          maxSelect: 1,
          values: ["gross", "gross_up", "netto"],
        }),
      );
    }
    if (!payslips.fields.getByName("tax_allowance")) {
      payslips.fields.add(
        new NumberField({
          name: "tax_allowance",
          min: 0,
        }),
      );
    }
    app.save(payslips);

    // Isi default "gross" untuk karyawan yang sudah ada.
    const existing = app.findRecordsByFilter(
      "employees",
      "tax_method = '' || tax_method = null",
    );
    for (const rec of existing) {
      rec.set("tax_method", "gross");
      app.save(rec);
    }
  },
  (app) => {
    const employees = app.findCollectionByNameOrId("employees");

    // Kembalikan PTKP ke daftar semula.
    const ptkp = employees.fields.getByName("ptkp_status");
    if (ptkp) {
      employees.fields.removeByName("ptkp_status");
    }
    employees.fields.add(
      new SelectField({
        name: "ptkp_status",
        maxSelect: 1,
        values: ["TK0", "K0", "K1", "K2", "K3"],
      }),
    );

    const taxMethod = employees.fields.getByName("tax_method");
    if (taxMethod) {
      employees.fields.removeByName("tax_method");
    }
    app.save(employees);

    const payslips = app.findCollectionByNameOrId("payslips");
    const slipTaxMethod = payslips.fields.getByName("tax_method");
    if (slipTaxMethod) payslips.fields.removeByName("tax_method");
    const slipTaxAllowance = payslips.fields.getByName("tax_allowance");
    if (slipTaxAllowance) payslips.fields.removeByName("tax_allowance");
    app.save(payslips);
  },
);
