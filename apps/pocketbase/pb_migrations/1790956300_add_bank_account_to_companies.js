/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("companies");

		const fieldsToAdd = [
			{ name: "bank_name", max: 80 },
			{ name: "account_holder", max: 120 },
			{ name: "account_number", max: 40 },
		];

		let changed = false;
		for (const spec of fieldsToAdd) {
			let existing = null;
			try {
				existing = collection.fields.getByName(spec.name);
			} catch (_) {
				existing = null;
			}
			if (existing) continue;
			collection.fields.add(
				new TextField({
					name: spec.name,
					max: spec.max,
					min: 0,
					required: false,
				}),
			);
			changed = true;
		}

		if (changed) app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("companies");
		collection.fields.removeByName("bank_name");
		collection.fields.removeByName("account_holder");
		collection.fields.removeByName("account_number");
		app.save(collection);
	},
);
