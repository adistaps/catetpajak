/// <reference path="../pb_data/types.d.ts" />

// Membuat field resignation_date dan status pada employee_offboardings
// tidak wajib diisi, agar catatan offboarding dapat dibuat dengan data
// minimal (perusahaan, pemilik, karyawan) dan dilengkapi kemudian.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("employee_offboardings");

    const resignation = col.fields.getByName("resignation_date");
    if (resignation) {
      resignation.required = false;
    }
    const status = col.fields.getByName("status");
    if (status) {
      status.required = false;
    }
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("employee_offboardings");

    const resignation = col.fields.getByName("resignation_date");
    if (resignation) {
      resignation.required = true;
    }
    const status = col.fields.getByName("status");
    if (status) {
      status.required = true;
    }
    app.save(col);
  },
);
