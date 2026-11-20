/// <reference path="../pb_data/types.d.ts" />

// Jadikan info@catetpajak.com admin pusat bila akunnya sudah terdaftar.
// Idempoten: tidak melakukan apa pun bila akun belum ada (hook
// central-admin-autogrant.pb.js yang akan memberikan status saat akun
// mendaftar) atau bila sudah menjadi admin pusat.

migrate(
  (app) => {
    const users = app.findRecordsByFilter(
      "users",
      "email = {:email}",
      "",
      1,
      0,
      { email: "info@catetpajak.com" },
    );
    if (users.length === 0) return;

    const existing = app.findRecordsByFilter(
      "central_admins",
      "user = {:userId}",
      "",
      1,
      0,
      { userId: users[0].id },
    );
    if (existing.length > 0) return;

    let label = "";
    try {
      label = users[0].getString("name");
    } catch (_) {
      label = "";
    }

    const collection = app.findCollectionByNameOrId("central_admins");
    const record = new Record(collection);
    record.set("user", users[0].id);
    record.set("name", label || "Admin Pusat Catet Pajak");
    record.set("notes", "Admin pusat untuk akun info@catetpajak.com.");
    app.save(record);
  },
  (app) => {
    const users = app.findRecordsByFilter(
      "users",
      "email = {:email}",
      "",
      1,
      0,
      { email: "info@catetpajak.com" },
    );
    if (users.length === 0) return;

    const admins = app.findRecordsByFilter(
      "central_admins",
      "user = {:userId}",
      "",
      1,
      0,
      { userId: users[0].id },
    );
    for (const admin of admins) {
      app.delete(admin);
    }
  },
);
