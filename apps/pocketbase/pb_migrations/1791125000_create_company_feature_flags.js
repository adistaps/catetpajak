// apps/pocketbase/pb_migrations/1791125000_create_company_feature_flags.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId("company_feature_flags");
		} catch (_) {
			const companies = app.findCollectionByNameOrId("companies");
			collection = new Collection({
				type: "base",
				name: "company_feature_flags",
				// Status fitur per perusahaan bersifat publik (dibaca klien untuk
				// menyaring menu dan menjaga rute). Penulisan hanya melalui rute
				// server Admin Pusat (superuser).
				listRule: "",
				viewRule: "",
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: "company",
						type: "relation",
						required: true,
						maxSelect: 1,
						collectionId: companies.id,
						cascadeDelete: true,
					},
					{
						name: "feature",
						type: "select",
						required: true,
						maxSelect: 1,
						values: [
							"penjualan",
							"pembelian",
							"kas_bank",
							"aset",
							"biaya",
							"kontak",
							"produk",
							"akun",
							"jurnal",
							"laporan",
							"payroll",
							"karyawan",
							"pajak",
							"chat",
							"parent",
						],
					},
					// `required` tidak diaktifkan agar `false` (fitur nonaktif) diterima.
					{ name: "enabled", type: "bool" },
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
					{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
				],
				indexes: [
					"CREATE UNIQUE INDEX idx_company_feature_flags_unique ON company_feature_flags (company, feature)",
					"CREATE INDEX idx_company_feature_flags_company ON company_feature_flags (company)",
				],
			});
			app.save(collection);
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("company_feature_flags");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) {
				throw e;
			}
		}
	},
);
