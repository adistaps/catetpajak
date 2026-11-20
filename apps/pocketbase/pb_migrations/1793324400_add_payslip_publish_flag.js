/// <reference path="../pb_data/types.d.ts" />

// Menambahkan flag "published" pada payslips sehingga slip gaji yang dibuat
// setelah Running Payroll tetap tersembunyi dari aplikasi karyawan sampai
// admin menerbitkannya melalui tombol "Terbitkan Payslip".
//
// - payslips.published (bool, default false): karyawan hanya bisa membaca slip
//   miliknya jika published = true. Admin (owner) tetap dapat melihat semua
//   slip terlepas dari status terbit.
// - payroll_runs.payslips_published (bool, default false): penanda tampilan
//   di daftar periode penggajian.
//
// Slip dan periode yang sudah ada sebelum migrasi ini dianggap sudah
// diterbitkan agar payroll yang sudah berjalan tidak hilang dari aplikasi
// karyawan.
migrate(
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");
    payslips.fields.add(new BoolField({ name: "published" }));
    // Owner (admin) selalu boleh melihat; karyawan hanya jika sudah diterbitkan.
    payslips.listRule =
      "@request.auth.id != '' && (owner = @request.auth.id || (employee.user = @request.auth.id && published = true))";
    payslips.viewRule =
      "@request.auth.id != '' && (owner = @request.auth.id || (employee.user = @request.auth.id && published = true))";
    app.save(payslips);

    const runs = app.findCollectionByNameOrId("payroll_runs");
    runs.fields.add(new BoolField({ name: "payslips_published" }));
    app.save(runs);

    // Backfill: slip dan periode yang sudah ada dianggap sudah diterbitkan.
    let page = 1;
    for (;;) {
      const batch = app.findRecordsByFilter("payslips", "id != ''", "", page, 1000);
      if (!batch || batch.length === 0) break;
      for (const rec of batch) {
        rec.set("published", true);
        app.save(rec);
      }
      if (batch.length < 1000) break;
      page += 1;
    }

    let rpage = 1;
    for (;;) {
      const batch = app.findRecordsByFilter("payroll_runs", "id != ''", "", rpage, 1000);
      if (!batch || batch.length === 0) break;
      for (const rec of batch) {
        rec.set("payslips_published", true);
        app.save(rec);
      }
      if (batch.length < 1000) break;
      rpage += 1;
    }
  },
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");
    payslips.listRule =
      "@request.auth.id != '' && (owner = @request.auth.id || employee.user = @request.auth.id)";
    payslips.viewRule =
      "@request.auth.id != '' && (owner = @request.auth.id || employee.user = @request.auth.id)";
    payslips.fields.removeByName("published");
    app.save(payslips);

    const runs = app.findCollectionByNameOrId("payroll_runs");
    runs.fields.removeByName("payslips_published");
    app.save(runs);
  },
);
