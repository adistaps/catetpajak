/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('attendance_records');

    // ESS karyawan must read/write their own attendance via employee.user.
    // Relying only on @collection.company_members often fails list/getFirst,
    // so create hits UNIQUE(company, employee, date) and clock-in shows error.
    const essOrMember =
      "@request.auth.id != '' && (" +
      'owner = @request.auth.id || ' +
      'company.owner = @request.auth.id || ' +
      'employee.user = @request.auth.id || ' +
      "(@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active')" +
      ')';

    collection.listRule = essOrMember;
    collection.viewRule = essOrMember;
    collection.createRule = "@request.auth.id != '' && @request.auth.id = @request.body.owner";
    collection.updateRule = essOrMember;
    collection.deleteRule =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id)";

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('attendance_records');
    const member =
      "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";
    collection.listRule = member;
    collection.viewRule = member;
    collection.createRule = "@request.auth.id != ''";
    collection.updateRule = member;
    collection.deleteRule = member;
    app.save(collection);
  },
);
