/// <reference path="../pb_data/types.d.ts" />

// Pengumuman (Announcements) untuk portal Parent. Pengguna internal yang
// berwenang (pemilik/admin/anggota perusahaan) membuat & mengelola pengumuman.
// Parent hanya melihat pengumuman berstatus published yang ditujukan untuk
// perusahaan/siswa yang terhubung dengannya — isolasi antarperusahaan tetap
// terjaga. Pengumuman tanpa siswa tertentu ditujukan untuk seluruh siswa
// perusahaan; pengumuman dengan siswa tertentu hanya terlihat parent siswa itu.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const companies = app.findCollectionByNameOrId("companies");
    const students = app.findCollectionByNameOrId("students");

    // Pengguna internal: pemilik, admin, atau anggota aktif perusahaan.
    const manageRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";
    // Parent: hanya published, dan hanya untuk perusahaan tempat siswanya
    // berada (student = '') atau untuk siswa yang terhubung dengannya.
    const parentReadRule =
      "status = 'published' && ((student = '' && @collection.students.parent ?= @request.auth.id && @collection.students.company ?= company) || (student != '' && student.parent = @request.auth.id))";

    const collection = new Collection({
      type: "base",
      name: "announcements",
      listRule: `(${parentReadRule}) || (${manageRule})`,
      viewRule: `(${parentReadRule}) || (${manageRule})`,
      createRule: "@request.auth.id != ''",
      updateRule: manageRule,
      deleteRule: manageRule,
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "body", type: "text", required: true, max: 5000 },
        { name: "date", type: "date", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "published"],
        },
        {
          name: "company",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: companies.id,
          cascadeDelete: true,
        },
        {
          name: "student",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: students.id,
          cascadeDelete: false,
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
        "CREATE INDEX idx_announcements_company ON announcements (company)",
        "CREATE INDEX idx_announcements_status ON announcements (status)",
        "CREATE INDEX idx_announcements_date ON announcements (date)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("announcements");
      app.delete(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
