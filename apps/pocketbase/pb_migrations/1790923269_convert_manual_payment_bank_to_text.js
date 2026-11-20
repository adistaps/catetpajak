// apps/pocketbase/pb_migrations/1790923269_convert_manual_payment_bank_to_text.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Pilihan bank pada pembayaran manual mengikuti rekening aktif Admin Pusat
 * (nama bebas, misalnya "Bank Central Asia"), bukan daftar tetap BCA/Mandiri.
 * SelectField menolak nama di luar values dengan "Invalid value". Ubah ke
 * teks agar nama rekening yang dipilih tersimpan dan dipakai verifikasi.
 */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("pencari_manual_payments");
		const field = collection.fields.getByName("bank");
		if (!field) {
			collection.fields.add(new TextField({ name: "bank", max: 160 }));
			app.save(collection);
			return;
		}
		if (field.type === "text") {
			field.max = 160;
			app.save(collection);
			return;
		}

		const records = app.findRecordsByFilter("pencari_manual_payments", "id != ''");
		const preserved = records.map((record) => ({
			id: record.id,
			bank: String(record.get("bank") || ""),
		}));

		collection.fields.removeByName("bank");
		collection.fields.add(new TextField({ name: "bank", max: 160 }));
		app.save(collection);

		for (const item of preserved) {
			if (!item.bank) continue;
			try {
				const record = app.findRecordById("pencari_manual_payments", item.id);
				record.set("bank", item.bank);
				app.save(record);
			} catch (_) {
				// Catatan yang sudah tidak ada dilewati.
			}
		}
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("pencari_manual_payments");
		const records = app.findRecordsByFilter("pencari_manual_payments", "id != ''");
		const preserved = records.map((record) => ({
			id: record.id,
			bank: String(record.get("bank") || ""),
		}));

		if (collection.fields.getByName("bank")) {
			collection.fields.removeByName("bank");
		}
		collection.fields.add(
			new SelectField({
				name: "bank",
				required: false,
				maxSelect: 1,
				values: ["BCA", "Mandiri"],
			}),
		);
		app.save(collection);

		for (const item of preserved) {
			if (item.bank !== "BCA" && item.bank !== "Mandiri") continue;
			try {
				const record = app.findRecordById("pencari_manual_payments", item.id);
				record.set("bank", item.bank);
				app.save(record);
			} catch (_) {
				// abaikan
			}
		}
	},
);
