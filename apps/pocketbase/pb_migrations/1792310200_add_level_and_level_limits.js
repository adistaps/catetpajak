/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field `level` (tingkat/jabatan karyawan, mis. Manager, Staff)
// ke koleksi employees, dan field `level_limits` (JSON) ke reimbursement_settings
// untuk menyimpan batas nominal reimbursement per level karyawan. Batas umum
// `amount_limit` tetap dipakai sebagai default bila level karyawan tidak memiliki
// batas khusus.

migrate(
  (app) => {
    // Tambah `level` ke employees.
    const employeesCol = app.findCollectionByNameOrId("employees");
    if (!employeesCol.fields.getByName("level")) {
      employeesCol.fields.add(new TextField({ name: "level", required: false, max: 80 }));
      app.save(employeesCol);
    }

    // Tambah `level_limits` ke reimbursement_settings.
    const settingsCol = app.findCollectionByNameOrId("reimbursement_settings");
    if (!settingsCol.fields.getByName("level_limits")) {
      settingsCol.fields.add(new JSONField({ name: "level_limits", required: false }));
      app.save(settingsCol);
    }
  },
  (app) => {
    try {
      const employeesCol = app.findCollectionByNameOrId("employees");
      const levelField = employeesCol.fields.getByName("level");
      if (levelField) {
        employeesCol.fields.remove(levelField);
        app.save(employeesCol);
      }
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      const settingsCol = app.findCollectionByNameOrId("reimbursement_settings");
      const limitsField = settingsCol.fields.getByName("level_limits");
      if (limitsField) {
        settingsCol.fields.remove(limitsField);
        app.save(settingsCol);
      }
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
