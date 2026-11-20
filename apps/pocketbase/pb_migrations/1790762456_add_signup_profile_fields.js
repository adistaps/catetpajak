/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const names = ["phone", "company_name", "job_title", "employee_count"];
    for (const name of names) {
      if (!users.fields.getByName(name)) {
        users.fields.add(new TextField({ name, required: false, max: 160 }));
      }
    }
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    for (const name of ["phone", "company_name", "job_title", "employee_count"]) {
      try {
        users.fields.removeByName(name);
      } catch (_) {
        /* already gone */
      }
    }
    app.save(users);
  },
);
