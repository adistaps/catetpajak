// apps/pocketbase/pb_migrations/1791998100_add_link_to_promos.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("promos");
		if (!collection.fields.getByName("link")) {
			collection.fields.add(
				new URLField({
					name: "link",
					required: false,
					max: 500,
				}),
			);
			app.save(collection);
		}
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("promos");
		collection.fields.removeByName("link");
		app.save(collection);
	},
);
