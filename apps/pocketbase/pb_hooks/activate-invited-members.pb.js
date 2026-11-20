/// <reference path="../pb_data/types.d.ts" />

// Saat pengguna yang diundang menyelesaikan pengaturan kata sandi (klik tautan
// undangan / atur ulang kata sandi dan menetapkan sandi baru), PocketBase
// memperbarui field `tokenKey` pada record `users`. Hook ini mendeteksi
// perubahan tersebut dan mengaktifkan semua keanggotaan `company_members`
// berstatus "invited" milik pengguna tersebut, sehingga mereka otomatis masuk
// ke perusahaan yang mengundangnya dengan peran yang sudah ditetapkan.
//
// Hanya berlaku untuk koleksi `users` (undangan anggota perusahaan dan
// karyawan). Undangan Parent (koleksi `parents`) dan Admin Pusat
// (koleksi `central_admins`) tidak terdampak karena tidak membuat record
// `company_members`, sehingga tidak ada penugasan perusahaan yang salah.

onRecordAfterUpdateSuccess((e) => {
  const record = e.record;
  if (!record) {
    e.next();
    return;
  }

  const prev = record.original();
  const prevTokenKey = prev ? prev.getString("tokenKey") : "";
  const newTokenKey = record.getString("tokenKey");

  // Hanya reaksi bila tokenKey berubah (tanda kata sandi baru saja diatur).
  if (!newTokenKey || newTokenKey === prevTokenKey) {
    e.next();
    return;
  }

  const userId = record.id;
  const app = e.app;

  try {
    const pending = app.findRecordsByFilter(
      "company_members",
      "user = {:userId} && status = 'invited'",
      "",
      200,
      0,
      { userId },
    );

    if (pending.length === 0) {
      e.next();
      return;
    }

    for (const member of pending) {
      member.set("status", "active");
      app.save(member);
    }

    app.logger().info(
      "activated invited company memberships",
      "user",
      userId,
      "count",
      pending.length,
    );
  } catch (err) {
    app.logger().error("activate invited memberships failed", "error", err);
  }

  e.next();
}, "users");
