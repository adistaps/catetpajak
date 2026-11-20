// apps/pocketbase/pb_migrations/1791438900_add_image_to_promos.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("promos");
		collection.fields.add(
			new FileField({
				name: "image",
				maxSelect: 1,
				maxSize: 5242880, // 5 MB
				mimeTypes: ["image/jpeg", "image/png", "image/webp"],
				thumbs: [],
				protected: false,
			}),
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("promos");
		collection.fields.removeByName("image");
		app.save(collection);
	},
);
