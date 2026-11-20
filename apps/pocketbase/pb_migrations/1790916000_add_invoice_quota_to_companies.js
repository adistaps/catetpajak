/// <reference path="../pb_data/types.d.ts" />

// Adds a nullable `invoice_quota` number field to `companies`.
// When set (> 0), it overrides the plan-based monthly invoice limit, letting
// Admin Pusat activate and tune a custom max-invoice-per-month quota per
// company. When null, the company falls back to its plan's default limit
// (Starter = 10/bulan, Pro/Enterprise = tanpa batas).
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('companies');

		if (collection.fields.getByName('invoice_quota')) return;

		collection.fields.add(
			new NumberField({
				name: 'invoice_quota',
				required: false,
				onlyInt: true,
				min: 0,
			}),
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('companies');
		collection.fields.removeByName('invoice_quota');
		app.save(collection);
	},
);
