// apps/pocketbase/pb_migrations/1790917200_add_bank_and_verification_to_manual_payments.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("pencari_manual_payments");

		// Bank tujuan transfer yang dipilih pengguna (BCA / Mandiri). Dipakai
		// verifikasi otomatis untuk mencocokkan nama bank pada bukti transfer.
		if (!collection.fields.getByName("bank")) {
			collection.fields.add(
				new SelectField({
					name: "bank",
					required: false,
					maxSelect: 1,
					values: ["BCA", "Mandiri"],
				}),
			);
		}

		// Menandai apakah pembayaran ini sudah diverifikasi otomatis oleh sistem
		// (kecocokan jumlah + nama bank pada bukti). False berarti masih menunggu
		// verifikasi manual Admin Pusat.
		if (!collection.fields.getByName("auto_verified")) {
			collection.fields.add(new BoolField({ name: "auto_verified" }));
		}

		// Catatan hasil verifikasi otomatis: alasan jika gagal (cth. jumlah tidak
		// sesuai) atau konfirmasi jika berhasil.
		if (!collection.fields.getByName("verification_notes")) {
			collection.fields.add(new TextField({ name: "verification_notes", max: 500 }));
		}

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("pencari_manual_payments");
		collection.fields.removeByName("bank");
		collection.fields.removeByName("auto_verified");
		collection.fields.removeByName("verification_notes");
		app.save(collection);
	},
);
