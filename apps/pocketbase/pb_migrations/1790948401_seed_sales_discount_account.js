/// <reference path="../pb_data/types.d.ts" />

// Menambahkan akun "Potongan Penjualan" (kode 403, tipe pendapatan) untuk
// perusahaan yang sudah ada namun belum memilikinya, agar diskon syarat
// pembayaran (cth. 2/3 N/30) dapat diposting ke jurnal dengan benar.
// Perusahaan baru mendapatkan akun ini lewat DEFAULT_ACCOUNTS.
migrate(
  (app) => {
    const accounts = app.findCollectionByNameOrId("accounts");

    const existing = app.findRecordsByFilter(
      "accounts",
      "code = {:code} || name ~ {:potongan} || name ~ {:diskon}",
      "",
      500,
      0,
      { code: "403", potongan: "Potongan Penjualan", diskon: "Diskon Penjualan" },
    );
    const doneCompanies = new Set(existing.map((r) => r.get("company")));

    const allCompanies = app.findRecordsByFilter("companies", "id != ''", "", 500, 0);
    let created = 0;
    for (const company of allCompanies) {
      const companyId = company.get("id");
      if (doneCompanies.has(companyId)) continue;

      const owner = company.get("owner") || "";
      try {
        const record = new Record(accounts);
        record.set("company", companyId);
        record.set("code", "403");
        record.set("name", "Potongan Penjualan");
        record.set("type", "pendapatan");
        if (owner) record.set("owner", owner);
        app.save(record);
        created += 1;
      } catch (e) {
        console.log(`[seed sales discount account] skipped company ${companyId}: ${e.message}`);
      }
    }
    console.log(`[seed sales discount account] created ${created} accounts`);
  },
  (app) => {
    // Tidak menghapus akun yang mungkin sudah digunakan oleh transaksi.
    const records = app.findRecordsByFilter(
      "accounts",
      "code = {:code} && name = {:name}",
      "",
      500,
      0,
      { code: "403", name: "Potongan Penjualan" },
    );
    for (const record of records) {
      try {
        app.delete(record);
      } catch (_) {
        /* akun mungkin sudah memiliki entri — biarkan */
      }
    }
  },
);
