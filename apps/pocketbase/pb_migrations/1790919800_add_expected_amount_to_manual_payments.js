// apps/pocketbase/pb_migrations/1790919800_add_expected_amount_to_manual_payments.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("pencari_manual_payments");

		// Nominal unik yang harus dibayar pelanggan untuk transaksi ini:
		// harga paket dasar + tiga digit acak di akhir (cth. 49000 + 145 = 49145).
		// Dipakai verifikasi otomatis: jika jumlah transfer pada bukti sama
		// persis dengan nominal ini (dan pemeriksaan lain lolos), langganan
		// diaktifkan otomatis tanpa approve manual Admin Pusat.
		if (!collection.fields.getByName("expected_amount")) {
			collection.fields.add(
				new NumberField({
					name: "expected_amount",
					required: false,
					min: 0,
					onlyInt: true,
				}),
			);
		}

		// Nominal unik terformat untuk ditampilkan (cth. "Rp49.145").
		if (!collection.fields.getByName("expected_amount_formatted")) {
			collection.fields.add(
				new TextField({
					name: "expected_amount_formatted",
					max: 40,
				}),
			);
		}

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("pencari_manual_payments");
		collection.fields.removeByName("expected_amount");
		collection.fields.removeByName("expected_amount_formatted");
		app.save(collection);
	},
);
