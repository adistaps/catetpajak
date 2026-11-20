// apps/pocketbase/pb_migrations/1790813478_education_entries.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");

		if (!collection.fields.getByName("education_entries")) {
			collection.fields.add(
				new JSONField({ name: "education_entries", maxSize: 2000000 }),
			);
		}
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");
		if (collection.fields.getByName("education_entries")) {
			collection.fields.removeByName("education_entries");
		}
		app.save(collection);
	},
);
