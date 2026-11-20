// apps/pocketbase/pb_migrations/1790922000_create_plan_prices.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId("plan_prices");
		} catch (_) {
			collection = new Collection({
				type: "base",
				name: "plan_prices",
				// Harga paket bersifat publik (ditampilkan di /plans dan halaman
				// langganan). Penulisan hanya melalui rute server Admin Pusat
				// (superuser), jadi create/update/delete ditolak dari klien.
				listRule: "",
				viewRule: "",
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: "plan",
						type: "select",
						required: true,
						maxSelect: 1,
						values: ["starter", "pro", "enterprise", "pencari_akuntan"],
					},
					// `required` sengaja tidak diaktifkan agar harga 0 (paket gratis
					// Starter) diterima — PocketBase menolak 0 pada number required.
					{ name: "price", type: "number", min: 0 },
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
					{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
				],
				indexes: [
					"CREATE UNIQUE INDEX idx_plan_prices_plan ON plan_prices (plan)",
				],
			});
			app.save(collection);
		}

		// Seed harga awal bila belum ada catatan. Starter gratis, Pro
		// Rp299.000, Enterprise Rp499.000, Pencari Akuntan Rp49.000.
		const existing = app.findRecordsByFilter("plan_prices", "id != ''", "created", 100, 0);
		if (existing.length === 0) {
			const seeds = [
				{ plan: "starter", price: 0 },
				{ plan: "pro", price: 299000 },
				{ plan: "enterprise", price: 499000 },
				{ plan: "pencari_akuntan", price: 49000 },
			];
			for (const seed of seeds) {
				const record = new Record(collection);
				record.set("plan", seed.plan);
				record.set("price", seed.price);
				app.save(record);
			}
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("plan_prices");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) {
				throw e;
			}
		}
	},
);
