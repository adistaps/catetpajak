/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("entries");
		if (!collection.fields.getByName("group")) {
			collection.fields.add(
				new TextField({
					name: "group",
					max: 40,
				}),
			);
			app.save(collection);
		}
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("entries");
		if (collection.fields.getByName("group")) {
			collection.fields.removeByName("group");
			app.save(collection);
		}
	},
);
