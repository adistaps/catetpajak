/// <reference path="../pb_data/types.d.ts" />

// Menambahkan kolom foto (image) pada produk agar dapat ditampilkan di POS.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("products");
		if (collection.fields.getByName("image")) return;
		collection.fields.add(
			new FileField({
				name: "image",
				maxSelect: 1,
				maxSize: 5242880,
				mimeTypes: ["image/jpeg", "image/png", "image/webp"],
				thumbs: ["200x200", "400x400"],
			}),
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("products");
		collection.fields.removeByName("image");
		app.save(collection);
	},
);
