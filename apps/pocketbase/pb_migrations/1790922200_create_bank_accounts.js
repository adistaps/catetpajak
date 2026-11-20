// apps/pocketbase/pb_migrations/1790922200_create_bank_accounts.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId("bank_accounts");
		} catch (_) {
			collection = new Collection({
				type: "base",
				name: "bank_accounts",
				// Informasi rekening ditampilkan kepada pelanggan saat membayar
				// manual, jadi baca bersifat publik. Penulisan hanya melalui
				// rute server Admin Pusat (superuser).
				listRule: "",
				viewRule: "",
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: "bank_name", type: "text", required: true, max: 120 },
					{ name: "account_holder", type: "text", required: true, max: 160 },
					{ name: "account_number", type: "text", required: true, max: 40 },
					// `required` sengaja tidak diaktifkan agar false (nonaktif) diterima.
					{ name: "is_active", type: "bool" },
					{ name: "sort", type: "number" },
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
					{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
				],
				indexes: [
					"CREATE INDEX idx_bank_accounts_active ON bank_accounts (is_active)",
				],
			});
			app.save(collection);
		}

		// Tidak ada seed: nomor rekening tidak diisi otomatis. Admin Pusat
		// mengatur informasi rekening melalui panel Harga/Rekening.
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("bank_accounts");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) {
				throw e;
			}
		}
	},
);
