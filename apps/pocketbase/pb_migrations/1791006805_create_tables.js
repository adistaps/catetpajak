/// <reference path="../pb_data/types.d.ts" />

// Daftar meja per perusahaan untuk pesanan makan di tempat (dine-in) di POS.
// Akses mengikuti pola kontak: pemilik, anggota company aktif, atau pemilik
// perusahaan dapat melihat; pemilik atau pemilik perusahaan dapat mengelola.
migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId("companies");
		const users = app.findCollectionByNameOrId("users");

		let collection;
		try {
			collection = app.findCollectionByNameOrId("tables");
		} catch (_) {
			collection = new Collection({
				type: "base",
				name: "tables",
				listRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				viewRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				createRule: "@request.auth.id != ''",
				updateRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id)",
				deleteRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id)",
				fields: [
					{
						name: "company",
						type: "relation",
						required: true,
						maxSelect: 1,
						collectionId: companies.id,
						cascadeDelete: true,
					},
					{ name: "name", type: "text", required: true, max: 60 },
					{ name: "capacity", type: "number", min: 0 },
					{ name: "sort_order", type: "number", min: 0 },
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
				indexes: ["CREATE INDEX idx_tables_company ON tables (company)"],
			});
			app.save(collection);
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("tables");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
	},
);
