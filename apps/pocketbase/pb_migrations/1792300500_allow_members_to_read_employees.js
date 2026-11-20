/// <reference path="../pb_data/types.d.ts" />

// Akuntan dan anggota aktif perusahaan perlu membaca data karyawan agar dapat
// meninjau pengajuan pinjaman karyawan di menu Biaya (nama karyawan, dan
// penyelesaian pengajuan yang belum tercatat sebagai transaksi). Sebelumnya
// hanya pemilik atau akun karyawan itu sendiri yang dapat membacanya, sehingga
// akuntan tidak dapat menyelesaikan pengajuan tersebut.
// Penulisan (create/update/delete) tetap hanya untuk pemilik — data gaji tidak
// dapat diubah oleh anggota biasa.

const READ_RULE =
  "@request.auth.id != '' && (owner = @request.auth.id || user = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))";

const PREVIOUS_RULE =
  "@request.auth.id != '' && (@request.auth.id = owner || user = @request.auth.id)";

migrate(
  (app) => {
    const employees = app.findCollectionByNameOrId("employees");
    employees.listRule = READ_RULE;
    employees.viewRule = READ_RULE;
    app.save(employees);
  },
  (app) => {
    try {
      const employees = app.findCollectionByNameOrId("employees");
      employees.listRule = PREVIOUS_RULE;
      employees.viewRule = PREVIOUS_RULE;
      app.save(employees);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
