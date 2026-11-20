/// <reference path="../pb_data/types.d.ts" />

/** Pantau stok: produk persediaan + akun mapping persediaan. */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('products');
		const accounts = app.findCollectionByNameOrId('accounts');

		if (!collection.fields.getByName('track_stock')) {
			collection.fields.add(new BoolField({ name: 'track_stock' }));
		}
		if (!collection.fields.getByName('inventory_account')) {
			collection.fields.add(
				new RelationField({
					name: 'inventory_account',
					collectionId: accounts.id,
					maxSelect: 1,
					required: false,
					cascadeDelete: false,
				}),
			);
		}
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('products');
		if (collection.fields.getByName('inventory_account')) {
			collection.fields.removeByName('inventory_account');
		}
		if (collection.fields.getByName('track_stock')) {
			collection.fields.removeByName('track_stock');
		}
		app.save(collection);
	},
);
