/// <reference path="../pb_data/types.d.ts" />

// Menambahkan relasi meja (table) opsional pada dokumen agar pesanan dine-in
// di POS dapat menyimpan informasi meja pada invoice penjualan.
migrate(
	(app) => {
		const tables = app.findCollectionByNameOrId("tables");
		const collection = app.findCollectionByNameOrId("documents");
		if (collection.fields.getByName("table")) return;
		collection.fields.add(
			new RelationField({
				name: "table",
				required: false,
				maxSelect: 1,
				collectionId: tables.id,
				cascadeDelete: false,
			}),
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("documents");
		collection.fields.removeByName("table");
		app.save(collection);
	},
);
