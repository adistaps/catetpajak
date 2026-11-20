/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const col = app.findCollectionByNameOrId("company_members");
		const roleField = col.fields.getByName("role");
		roleField.values = [
			"pemilik",
			"admin",
			"akuntan",
			"finance",
			"hr",
			"pembaca",
			"custom",
			"karyawan",
			"kasir",
		];
		app.save(col);
	},
	(app) => {
		const col = app.findCollectionByNameOrId("company_members");
		const roleField = col.fields.getByName("role");
		roleField.values = [
			"pemilik",
			"admin",
			"akuntan",
			"finance",
			"hr",
			"pembaca",
			"custom",
			"karyawan",
		];
		app.save(col);
	},
);
