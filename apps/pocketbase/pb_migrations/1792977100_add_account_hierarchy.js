/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('accounts');

		const code = collection.fields.getByName('code');
		if (code) code.max = 255;
		const name = collection.fields.getByName('name');
		if (name) name.max = 255;

		if (!collection.fields.getByName('parent')) {
			collection.fields.add(
				new RelationField({
					name: 'parent',
					required: false,
					maxSelect: 1,
					collectionId: collection.id,
					cascadeDelete: false,
				}),
			);
		}

		const header = collection.fields.getByName('is_header');
		if (header && header.type !== 'bool') {
			collection.fields.removeByName('is_header');
		}
		if (!collection.fields.getByName('is_header')) {
			collection.fields.add(
				new BoolField({
					name: 'is_header',
					required: false,
				}),
			);
		}

		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId('accounts');
			const code = collection.fields.getByName('code');
			if (code) code.max = 20;
			const name = collection.fields.getByName('name');
			if (name) name.max = 120;
			if (collection.fields.getByName('parent')) collection.fields.removeByName('parent');
			if (collection.fields.getByName('is_header')) collection.fields.removeByName('is_header');
			app.save(collection);
		} catch (error) {
			const message = error && error.message ? error.message : String(error);
			if (message.includes('no rows in result set')) return;
			throw error;
		}
	},
);
