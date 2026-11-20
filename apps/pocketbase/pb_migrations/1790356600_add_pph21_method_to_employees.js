/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const employees = app.findCollectionByNameOrId("employees");
		employees.fields.add(
			new SelectField({
				name: "pph21_method",
				maxSelect: 1,
				values: ["annual", "ter"],
			}),
		);
		app.save(employees);

		// Isi default "annual" untuk karyawan yang sudah ada.
		const existing = app.findRecordsByFilter(
			"employees",
			"pph21_method = '' || pph21_method = null",
		);
		for (const rec of existing) {
			rec.set("pph21_method", "annual");
			app.save(rec);
		}
	},
	(app) => {
		const employees = app.findCollectionByNameOrId("employees");
		const method = employees.fields.getByName("pph21_method");
		if (method) employees.fields.remove(method);
		app.save(employees);
	},
);
