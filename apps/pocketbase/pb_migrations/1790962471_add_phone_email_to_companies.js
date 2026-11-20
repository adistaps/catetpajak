/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("companies");

		if (!collection.fields.getByName("phone")) {
			collection.fields.add(
				new TextField({
					name: "phone",
					max: 40,
				}),
			);
		}

		if (!collection.fields.getByName("email")) {
			collection.fields.add(
				new EmailField({
					name: "email",
				}),
			);
		}

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("companies");
		collection.fields.removeByName("phone");
		collection.fields.removeByName("email");
		app.save(collection);
	},
);
