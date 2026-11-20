/// <reference path="../pb_data/types.d.ts" />

// Mengganti nama koleksi employee_offboarding -> employee_offboardings
// (bentuk jamak) agar konsisten dengan konvensi penamaan koleksi lain.
// Aturan akses, field, dan index dipertahankan; data yang sudah ada tetap utuh.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("employee_offboarding");
    col.name = "employee_offboardings";
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("employee_offboardings");
    col.name = "employee_offboarding";
    app.save(col);
  },
);
