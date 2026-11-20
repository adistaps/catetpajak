/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const col = app.findCollectionByNameOrId('payroll_components');
		const field = col.fields.getByName('type');
		field.values = ['Adjustment', 'Allowance', 'Deduction', 'Overtime', 'Salary'];
		app.save(col);
	},
	(app) => {
		const col = app.findCollectionByNameOrId('payroll_components');
		const field = col.fields.getByName('type');
		field.values = ['Adjustment', 'Allowance', 'Deduction', 'Overtime'];
		app.save(col);
	},
);
