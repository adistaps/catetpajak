/// <reference path="../pb_data/types.d.ts" />

// Menambahkan field `budget` (total alokasi/saldo per jenis reimbursement) ke
// koleksi reimbursement_settings. Berbeda dari `amount_limit` yang membatasi
// nominal satu pengajuan, `budget` adalah total saldo yang dialokasikan untuk
// jenis tersebut di seluruh perusahaan. Sisa saldo dihitung dari budget
// dikurangi total pengajuan yang belum ditolak (pending/approved/paid).
// 0 = tanpa pelacakan saldo (tidak terbatas). Pengajuan lama tidak berubah.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("reimbursement_settings");
    if (!collection.fields.getByName("budget")) {
      collection.fields.add(
        new NumberField({ name: "budget", required: false, min: 0, onlyInt: false }),
      );
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("reimbursement_settings");
      const field = collection.fields.getByName("budget");
      if (field) {
        collection.fields.remove(field);
        app.save(collection);
      }
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
