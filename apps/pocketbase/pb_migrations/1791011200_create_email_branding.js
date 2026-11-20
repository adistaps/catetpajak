/// <reference path="../pb_data/types.d.ts" />

// Stores the sender profile image (logo) shown at the top of Catet Pajak
// outgoing emails. Public read so email clients can load the logo URL without
// auth; writes go only through the protected central-admin server API
// (superuser), so a regular company owner/admin cannot change it.
migrate(
	(app) => {
		const collection = new Collection({
			type: "base",
			name: "email_branding",
			// Public read: email clients fetch the logo anonymously.
			// Writes are server-only (null) — managed via Admin Pusat.
			listRule: "",
			viewRule: "",
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{
					name: "logo",
					type: "file",
					required: true,
					maxSelect: 1,
					maxSize: 2097152,
					mimeTypes: ["image/jpeg", "image/png", "image/webp"],
					thumbs: [],
					protected: false,
				},
				{ name: "alt_text", type: "text", max: 120 },
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
		});
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("email_branding");
		app.delete(collection);
	},
);
