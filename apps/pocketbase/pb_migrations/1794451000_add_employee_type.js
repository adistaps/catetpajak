/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field `employee_type` (jenis karyawan) ke koleksi employees.
// Pilihan: probation, kontrak, permanent, magang, freelance.
// Tidak mengubah proses payroll atau akses berbasis peran.

migrate(
  (app) => {
    const employees = app.findCollectionByNameOrId("employees");

    if (!employees.fields.getByName("employee_type")) {
      employees.fields.add(
        new SelectField({
          name: "employee_type",
          maxSelect: 1,
          values: ["probation", "kontrak", "permanent", "magang", "freelance"],
        }),
      );
      app.save(employees);
    }
  },
  (app) => {
    try {
      const employees = app.findCollectionByNameOrId("employees");
      const field = employees.fields.getByName("employee_type");
      if (field) {
        employees.fields.remove(field);
        app.save(employees);
      }
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
