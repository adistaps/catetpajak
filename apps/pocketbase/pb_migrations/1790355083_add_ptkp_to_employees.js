/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const employees = app.findCollectionByNameOrId("employees");
		employees.fields.add(
			new SelectField({
				name: "ptkp_status",
				maxSelect: 1,
				values: ["TK0", "K0", "K1", "K2", "K3"],
			}),
		);
		employees.fields.add(
			new BoolField({
				name: "auto_calc",
			}),
		);
		app.save(employees);
	},
	(app) => {
		const employees = app.findCollectionByNameOrId("employees");
		const ptkp = employees.fields.getByName("ptkp_status");
		if (ptkp) employees.fields.remove(ptkp);
		const auto = employees.fields.getByName("auto_calc");
		if (auto) employees.fields.remove(auto);
		app.save(employees);
	},
);
