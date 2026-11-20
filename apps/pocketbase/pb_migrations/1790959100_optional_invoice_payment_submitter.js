/// <reference path="../pb_data/types.d.ts" />

// Pelanggan yang membuka tautan pembayaran dari email bukan pengguna aplikasi.
// submitted_by tetap diisi bila pengaju adalah anggota perusahaan, tetapi tidak
// wajib untuk pembayaran yang masuk dari tautan publik.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("invoice_payments");
		const field = collection.fields.getByName("submitted_by");
		field.required = false;
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("invoice_payments");
		const field = collection.fields.getByName("submitted_by");
		field.required = true;
		app.save(collection);
	},
);
