// apps/pocketbase/pb_migrations/1790791925_create_accountant_profiles.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const collection = new Collection({
			type: "base",
			name: "accountant_profiles",
			// Direktori publik: siapa pun bisa melihat daftar akuntan,
			// tetapi hanya pemilik profil yang bisa membuat dan mengubah.
			listRule: "",
			viewRule: "",
			createRule:
				"@request.auth.id != '' && @request.auth.id = @request.body.owner",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
			fields: [
				{ name: "name", type: "text", required: true, max: 120 },
				{ name: "cv_name", type: "text", required: true, max: 160 },
				{ name: "city", type: "text", max: 80 },
				{ name: "phone", type: "text", max: 40 },
				{ name: "description", type: "text", max: 600 },
				{
					name: "photo",
					type: "file",
					maxSelect: 1,
					maxSize: 5242880,
					mimeTypes: ["image/jpeg", "image/png", "image/webp"],
					thumbs: ["400x400"],
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE UNIQUE INDEX idx_accountant_profiles_owner ON accountant_profiles (owner)",
				"CREATE INDEX idx_accountant_profiles_created ON accountant_profiles (created)",
			],
		});
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");
		app.delete(collection);
	},
);
