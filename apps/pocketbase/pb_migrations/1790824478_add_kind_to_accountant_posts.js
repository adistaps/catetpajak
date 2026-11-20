// apps/pocketbase/pb_migrations/1790824478_add_kind_to_accountant_posts.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_posts");
		if (collection.fields.getByName("kind")) return;

		// Tujuan posting: "aktivitas" untuk feed Activity, "hl_store" untuk
		// Highlight pada kartu Akuntan. Tidak wajib — posting lama tanpa nilai
		// dianggap aktivitas oleh aplikasi.
		collection.fields.add(
			new SelectField({
				name: "kind",
				maxSelect: 1,
				values: ["aktivitas", "hl_store"],
			}),
		);
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("accountant_posts");
			collection.fields.removeByName("kind");
			app.save(collection);
		} catch (e) {
			if (String(e).includes("no rows in result set")) return;
			throw e;
		}
	},
);
