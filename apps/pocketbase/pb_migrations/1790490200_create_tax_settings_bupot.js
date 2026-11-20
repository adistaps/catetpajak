/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const companies = app.findCollectionByNameOrId("companies");
    const accounts = app.findCollectionByNameOrId("accounts");
    const users = app.findCollectionByNameOrId("users");
    const employees = app.findCollectionByNameOrId("employees");

    const memberRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

    // Pengaturan pajak per perusahaan: tarif PPN dan akun terkait.
    let taxSettings;
    try {
      taxSettings = app.findCollectionByNameOrId("tax_settings");
    } catch (_) {
      taxSettings = new Collection({
        type: "base",
        name: "tax_settings",
        listRule: memberRule,
        viewRule: memberRule,
        createRule: "@request.auth.id != ''",
        updateRule: memberRule,
        deleteRule: memberRule,
        fields: [
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          { name: "ppn_rate", type: "number", min: 0 },
          {
            name: "ppn_keluaran_account",
            type: "relation",
            maxSelect: 1,
            collectionId: accounts.id,
            cascadeDelete: false,
          },
          {
            name: "ppn_masukan_account",
            type: "relation",
            maxSelect: 1,
            collectionId: accounts.id,
            cascadeDelete: false,
          },
          {
            name: "bupot_account",
            type: "relation",
            maxSelect: 1,
            collectionId: accounts.id,
            cascadeDelete: false,
          },
          { name: "npwp", type: "text", max: 40 },
          {
            name: "pkp_status",
            type: "select",
            maxSelect: 1,
            values: ["pkp", "non_pkp"],
          },
          { name: "tax_office", type: "text", max: 120 },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_tax_settings_company ON tax_settings (company)",
        ],
      });
      app.save(taxSettings);
    }

    // Catatan bukti potong (bupot) PPh — bisa terkait karyawan atau pihak lain.
    try {
      app.findCollectionByNameOrId("bupot_records");
    } catch (_) {
      const bupot = new Collection({
        type: "base",
        name: "bupot_records",
        listRule: memberRule,
        viewRule: memberRule,
        createRule: "@request.auth.id != ''",
        updateRule: memberRule,
        deleteRule: memberRule,
        fields: [
          {
            name: "company",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
            cascadeDelete: true,
          },
          {
            name: "type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pph21", "pph22", "pph23", "pph4_2", "pph15", "pph26"],
          },
          { name: "masa_pajak", type: "text", max: 2 },
          { name: "tahun_pajak", type: "text", max: 4 },
          { name: "date", type: "date", required: true },
          { name: "partner", type: "text", max: 160 },
          { name: "npwp", type: "text", max: 40 },
          { name: "description", type: "text", max: 300 },
          { name: "dpp", type: "number", min: 0 },
          { name: "rate", type: "number", min: 0 },
          { name: "amount", type: "number", min: 0 },
          {
            name: "employee",
            type: "relation",
            maxSelect: 1,
            collectionId: employees.id,
            cascadeDelete: false,
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["draft", "reported"],
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_bupot_company ON bupot_records (company)",
          "CREATE INDEX idx_bupot_type ON bupot_records (type)",
          "CREATE INDEX idx_bupot_date ON bupot_records (date)",
        ],
      });
      app.save(bupot);
    }

    const accountsCol = app.findCollectionByNameOrId("accounts");
    const taxSettingsCol = app.findCollectionByNameOrId("tax_settings");

    // Tambah akun PPN default + pengaturan pajak default untuk perusahaan ada.
    const allCompanies = app.findRecordsByFilter("companies", "id != ''", "", 1000);
    for (const comp of allCompanies) {
      const compId = comp.id;
      const ownerId = comp.get("owner");

      // Cek apakah akun 207/208 sudah ada untuk perusahaan ini.
      const existing207 = app.findRecordsByFilter(
        "accounts",
        "company = '" + compId + "' && code = '207'",
      );
      const existing208 = app.findRecordsByFilter(
        "accounts",
        "company = '" + compId + "' && code = '208'",
      );

      let acct207Id = existing207.length ? existing207[0].id : "";
      let acct208Id = existing208.length ? existing208[0].id : "";

      if (!acct207Id) {
        const rec = new Record(accountsCol);
        rec.set("company", compId);
        rec.set("code", "207");
        rec.set("name", "PPN Keluaran");
        rec.set("type", "liabilitas");
        rec.set("owner", ownerId);
        app.save(rec);
        acct207Id = rec.id;
      }
      if (!acct208Id) {
        const rec = new Record(accountsCol);
        rec.set("company", compId);
        rec.set("code", "208");
        rec.set("name", "PPN Masukan");
        rec.set("type", "aset");
        rec.set("owner", ownerId);
        app.save(rec);
        acct208Id = rec.id;
      }

      // Akun Utang PPh 21 (205) untuk bupot.
      const existing205 = app.findRecordsByFilter(
        "accounts",
        "company = '" + compId + "' && code = '205'",
      );
      const acct205Id = existing205.length ? existing205[0].id : "";

      // Buat pengaturan pajak default bila belum ada.
      const hasSettings = app.findRecordsByFilter(
        "tax_settings",
        "company = '" + compId + "'",
      );
      if (hasSettings.length === 0) {
        const ts = new Record(taxSettingsCol);
        ts.set("company", compId);
        ts.set("ppn_rate", 11);
        ts.set("pkp_status", "pkp");
        if (acct207Id) ts.set("ppn_keluaran_account", acct207Id);
        if (acct208Id) ts.set("ppn_masukan_account", acct208Id);
        if (acct205Id) ts.set("bupot_account", acct205Id);
        ts.set("owner", ownerId);
        app.save(ts);
      }
    }
  },
  (app) => {
    for (const name of ["bupot_records", "tax_settings"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    }
    // Hapus akun PPN default yang dibuat migrasi ini.
    try {
      const ppnAccounts = app.findRecordsByFilter(
        "accounts",
        "code = '207' || code = '208'",
      );
      for (const rec of ppnAccounts) app.delete(rec);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
