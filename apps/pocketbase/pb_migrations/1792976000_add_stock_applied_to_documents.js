/// <reference path="../pb_data/types.d.ts" />

/** Tandai apakah stok produk sudah disesuaikan untuk invoice pembelian. */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('documents');
		if (!collection.fields.getByName('stock_applied')) {
			collection.fields.add(new BoolField({ name: 'stock_applied', required: false }));
		}
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('documents');
		if (collection.fields.getByName('stock_applied')) {
			collection.fields.removeByName('stock_applied');
		}
		app.save(collection);
	},
);
