// apps/pocketbase/pb_migrations/1790814851_create_accountant_posts.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		try {
			app.findCollectionByNameOrId("accountant_posts");
			return;
		} catch (_) {
			// belum ada
		}

		const users = app.findCollectionByNameOrId("users");
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		const collection = new Collection({
			type: "base",
			name: "accountant_posts",
			// Aktivitas harian publik: siapa pun boleh membaca.
			// Hanya pemilik profil yang boleh membuat, mengubah, atau menghapus posting miliknya.
			listRule: "",
			viewRule: "",
			createRule:
				"@request.auth.id != '' && @request.auth.id = @request.body.owner && accountant.owner = @request.auth.id",
			updateRule:
				"@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && @request.body.accountant:changed = false",
			deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
			fields: [
				{
					name: "accountant",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: profiles.id,
					cascadeDelete: true,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "body", type: "text", max: 2000 },
				{
					name: "images",
					type: "file",
					maxSelect: 6,
					maxSize: 5242880,
					mimeTypes: ["image/jpeg", "image/png", "image/webp"],
					thumbs: ["400x400", "1200x900"],
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_accountant_posts_accountant ON accountant_posts (accountant)",
				"CREATE INDEX idx_accountant_posts_created ON accountant_posts (created)",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("accountant_posts");
			app.delete(collection);
		} catch (e) {
			if (String(e).includes("no rows in result set")) return;
			throw e;
		}
	},
);
