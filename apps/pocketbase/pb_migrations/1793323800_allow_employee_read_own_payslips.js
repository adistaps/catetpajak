/// <reference path="../pb_data/types.d.ts" />

// Mengizinkan karyawan melihat slip gajinya sendiri melalui relasi
// employee.user. Sebelumnya payslips hanya bisa dibaca oleh owner (admin
// yang menjalankan payroll), sehingga karyawan tidak bisa mengakses slip
// gajinya di aplikasi karyawan. create/update/delete tetap owner-only
// agar karyawan tidak dapat mengubah atau menghapus slip gaji.
migrate(
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");

    // Owner (admin pembuat run) ATAU karyawan terkait (employee.user).
    payslips.listRule =
      "@request.auth.id != '' && (owner = @request.auth.id || employee.user = @request.auth.id)";
    payslips.viewRule =
      "@request.auth.id != '' && (owner = @request.auth.id || employee.user = @request.auth.id)";

    app.save(payslips);
  },
  (app) => {
    const payslips = app.findCollectionByNameOrId("payslips");
    payslips.listRule = "@request.auth.id != '' && @request.auth.id = owner";
    payslips.viewRule = "@request.auth.id != '' && @request.auth.id = owner";
    app.save(payslips);
  },
);
