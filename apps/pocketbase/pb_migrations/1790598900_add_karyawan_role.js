/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1) company_members: tambah nilai "karyawan" pada select role & permissions
    const members = app.findCollectionByNameOrId("company_members");

    const roleField = members.fields.getByName("role");
    if (roleField && Array.isArray(roleField.values) && !roleField.values.includes("karyawan")) {
      roleField.values = [...roleField.values, "karyawan"];
    }

    const permsField = members.fields.getByName("permissions");
    if (permsField && Array.isArray(permsField.values) && !permsField.values.includes("karyawan")) {
      permsField.values = [...permsField.values, "karyawan"];
    }
    app.save(members);

    // 2) employees: tambah relation `user` ke users + perbolehkan user terkait
    //    melihat record karyawannya sendiri (self-service portal).
    const employees = app.findCollectionByNameOrId("employees");
    const users = app.findCollectionByNameOrId("users");
    if (!employees.fields.getByName("user")) {
      employees.fields.add(
        new RelationField({
          name: "user",
          required: false,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        }),
      );
    }
    // Owner tetap bisa akses; user terkait (karyawan) juga bisa melihat record-nya.
    employees.listRule =
      "@request.auth.id != '' && (@request.auth.id = owner || user = @request.auth.id)";
    employees.viewRule =
      "@request.auth.id != '' && (@request.auth.id = owner || user = @request.auth.id)";
    // create/update/delete tetap owner-only (admin pengelola).
    app.save(employees);

    // 3) employee_loans: tambah status "pending" untuk pengajuan pinjaman karyawan.
    const loans = app.findCollectionByNameOrId("employee_loans");
    const loanStatus = loans.fields.getByName("status");
    if (loanStatus && Array.isArray(loanStatus.values) && !loanStatus.values.includes("pending")) {
      loanStatus.values = ["pending", ...loanStatus.values];
    }
    app.save(loans);
  },
  (app) => {
    const members = app.findCollectionByNameOrId("company_members");
    const roleField = members.fields.getByName("role");
    if (roleField && Array.isArray(roleField.values)) {
      roleField.values = roleField.values.filter((v) => v !== "karyawan");
    }
    const permsField = members.fields.getByName("permissions");
    if (permsField && Array.isArray(permsField.values)) {
      permsField.values = permsField.values.filter((v) => v !== "karyawan");
    }
    app.save(members);

    const employees = app.findCollectionByNameOrId("employees");
    employees.listRule = "@request.auth.id != '' && @request.auth.id = owner";
    employees.viewRule = "@request.auth.id != '' && @request.auth.id = owner";
    if (employees.fields.getByName("user")) {
      employees.fields.removeByName("user");
    }
    app.save(employees);

    const loans = app.findCollectionByNameOrId("employee_loans");
    const loanStatus = loans.fields.getByName("status");
    if (loanStatus && Array.isArray(loanStatus.values)) {
      loanStatus.values = loanStatus.values.filter((v) => v !== "pending");
    }
    app.save(loans);
  },
);
