// apps/pocketbase/pb_migrations/1791091000_create_feature_flags.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId("feature_flags");
		} catch (_) {
			collection = new Collection({
				type: "base",
				name: "feature_flags",
				// Status fitur bersifat publik (dibaca klien untuk menyaring menu
				// dan menjaga rute). Penulisan hanya melalui rute server Admin
				// Pusat (superuser), jadi create/update/delete ditolak dari klien.
				listRule: "",
				viewRule: "",
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
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
					"CREATE UNIQUE INDEX idx_feature_flags_feature ON feature_flags (feature)",
				],
			});
			app.save(collection);
		}

		// Seed semua fitur aktif (default mempertahankan fungsi saat ini).
		const existing = app.findRecordsByFilter(
			"feature_flags",
			"id != ''",
			"created",
			100,
			0,
		);
		if (existing.length === 0) {
			const seeds = [
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
			];
			for (const feature of seeds) {
				const record = new Record(collection);
				record.set("feature", feature);
				record.set("enabled", true);
				app.save(record);
			}
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("feature_flags");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) {
				throw e;
			}
		}
	},
);
