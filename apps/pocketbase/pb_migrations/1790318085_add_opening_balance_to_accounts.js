/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("accounts");

		if (!collection.fields.getByName("opening_balance")) {
			collection.fields.add(
				new NumberField({
					name: "opening_balance",
					min: 0,
				}),
			);
		}

		if (!collection.fields.getByName("opening_balance_date")) {
			collection.fields.add(
				new DateField({
					name: "opening_balance_date",
					required: false,
				}),
			);
		}

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("accounts");
		collection.fields.removeByName("opening_balance");
		collection.fields.removeByName("opening_balance_date");
		app.save(collection);
	},
);
