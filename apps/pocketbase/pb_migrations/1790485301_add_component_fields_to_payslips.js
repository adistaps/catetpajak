/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const col = app.findCollectionByNameOrId('payslips');
		col.fields.add(new NumberField({ name: 'component_allowance', min: 0 }));
		col.fields.add(new NumberField({ name: 'component_deduction', min: 0 }));
		app.save(col);
	},
	(app) => {
		const col = app.findCollectionByNameOrId('payslips');
		col.fields.removeByName('component_allowance');
		col.fields.removeByName('component_deduction');
		app.save(col);
	},
);
