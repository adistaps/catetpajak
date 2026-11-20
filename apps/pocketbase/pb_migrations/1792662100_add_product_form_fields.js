/// <reference path="../pb_data/types.d.ts" />

/** Tambah isian formulir produk (barcode, kategori, deskripsi, tipe, akun, pajak). */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('products');
		const accounts = app.findCollectionByNameOrId('accounts');

		const nameField = collection.fields.getByName('name');
		if (nameField && nameField.max < 255) {
			nameField.max = 255;
		}

		const addText = (name, max) => {
			if (collection.fields.getByName(name)) return;
			collection.fields.add(new TextField({ name, max, required: false }));
		};
		const addBool = (name) => {
			if (collection.fields.getByName(name)) return;
			collection.fields.add(new BoolField({ name, required: false }));
		};
		const addRelation = (name) => {
			if (collection.fields.getByName(name)) return;
			collection.fields.add(
				new RelationField({
					name,
					collectionId: accounts.id,
					maxSelect: 1,
					required: false,
					cascadeDelete: false,
				}),
			);
		};

		addText('barcode', 80);
		addText('category', 120);
		addText('description', 6000);
		addText('buy_tax', 40);
		addText('sell_tax', 40);
		if (!collection.fields.getByName('product_type')) {
			collection.fields.add(
				new SelectField({
					name: 'product_type',
					maxSelect: 1,
					required: false,
					values: ['barang', 'jasa'],
				}),
			);
		}
		addBool('buy_enabled');
		addBool('sell_enabled');
		addRelation('purchase_account');
		addRelation('sales_account');

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('products');
		const names = [
			'barcode',
			'category',
			'description',
			'buy_tax',
			'sell_tax',
			'product_type',
			'buy_enabled',
			'sell_enabled',
			'purchase_account',
			'sales_account',
		];
		for (const name of names) {
			if (collection.fields.getByName(name)) {
				collection.fields.removeByName(name);
			}
		}
		const nameField = collection.fields.getByName('name');
		if (nameField) nameField.max = 120;
		app.save(collection);
	},
);
