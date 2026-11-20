/// <reference path="../pb_data/types.d.ts" />

// Adds a nullable `employee_quota` number field to `companies`.
// When set (> 0), it overrides the plan-based employee limit, letting
// Admin Pusat activate and tune a custom max-employee quota per company.
// When null, the company falls back to its plan's default limit.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('companies');

		if (collection.fields.getByName('employee_quota')) return;

		collection.fields.add(
			new NumberField({
				name: 'employee_quota',
				required: false,
				onlyInt: true,
				min: 0,
			}),
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('companies');
		collection.fields.removeByName('employee_quota');
		app.save(collection);
	},
);
