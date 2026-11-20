/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId("payroll_settings");

    if (!settings.fields.getByName("meal_allowance_method")) {
      settings.fields.add(
        new SelectField({
          name: "meal_allowance_method",
          maxSelect: 1,
          values: ["flat", "attendance"],
        }),
      );
    }

    if (!settings.fields.getByName("transport_allowance_method")) {
      settings.fields.add(
        new SelectField({
          name: "transport_allowance_method",
          maxSelect: 1,
          values: ["flat", "attendance"],
        }),
      );
    }

    app.save(settings);
  },
  (app) => {
    const settings = app.findCollectionByNameOrId("payroll_settings");
    if (settings.fields.getByName("meal_allowance_method")) {
      settings.fields.removeByName("meal_allowance_method");
    }
    if (settings.fields.getByName("transport_allowance_method")) {
      settings.fields.removeByName("transport_allowance_method");
    }
    app.save(settings);
  },
);
