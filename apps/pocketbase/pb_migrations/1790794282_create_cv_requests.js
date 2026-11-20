// apps/pocketbase/pb_migrations/1790794282_create_cv_requests.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		const collection = new Collection({
			type: "base",
			name: "cv_requests",
			// Permintaan CV: pencari hanya melihat permintaannya sendiri,
			// akuntan (pemilik profil) hanya melihat permintaan ke profilnya.
			listRule:
				"@request.auth.id != '' && (seeker = @request.auth.id || accountant.owner = @request.auth.id)",
			viewRule:
				"@request.auth.id != '' && (seeker = @request.auth.id || accountant.owner = @request.auth.id)",
			createRule: "@request.auth.id != '' && seeker = @request.auth.id",
			updateRule:
				"@request.auth.id != '' && accountant.owner = @request.auth.id",
			deleteRule:
				"@request.auth.id != '' && (seeker = @request.auth.id || accountant.owner = @request.auth.id)",
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
					name: "seeker",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "name", type: "text", required: true, max: 120 },
				{ name: "email", type: "email", required: true, max: 160 },
				{ name: "phone", type: "text", max: 40 },
				{ name: "company_name", type: "text", max: 160 },
				{ name: "message", type: "text", max: 1000 },
				{
					name: "status",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["baru", "diproses", "selesai"],
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_cv_requests_accountant ON cv_requests (accountant)",
				"CREATE INDEX idx_cv_requests_seeker ON cv_requests (seeker)",
				"CREATE INDEX idx_cv_requests_status ON cv_requests (status)",
			],
		});
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("cv_requests");
		app.delete(collection);
	},
);
