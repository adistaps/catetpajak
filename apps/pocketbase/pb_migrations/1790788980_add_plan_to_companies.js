/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("companies");

		let existing = null;
		try {
			existing = collection.fields.getByName("plan");
		} catch (_) {
			existing = null;
		}
		if (existing) return;

		collection.fields.add(
			new SelectField({
				name: "plan",
				maxSelect: 1,
				values: ["starter", "pro", "enterprise"],
			}),
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("companies");
		collection.fields.removeByName("plan");
		app.save(collection);
	},
);
