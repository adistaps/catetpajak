/// <reference path="../pb_data/types.d.ts" />

// Menambahkan nominal unik (expected_amount + formatted) serta status
// verifikasi otomatis (auto_verified, verification_notes) pada koleksi
// pembayaran manual invoice — baik `invoice_payments` (customer atas nama
// company) maupun `parent_invoice_payments` (Parent). Pola ini sama dengan
// pembelian paket: nominal unik tiga digit ditambahkan ke jumlah transfer
// agar verifikasi otomatis bukti transfer dapat mencocokkan jumlah persis.
// `invoice_payments` belum memiliki `verification_notes`, jadi ditambahkan;
// `parent_invoice_payments` sudah memilikinya.
migrate(
	(app) => {
		const addFields = (collectionName) => {
			const collection = app.findCollectionByNameOrId(collectionName);

			if (!collection.fields.getByName("expected_amount")) {
				collection.fields.add(
					new NumberField({
						name: "expected_amount",
						min: 0,
					}),
				);
			}
			if (!collection.fields.getByName("expected_amount_formatted")) {
				collection.fields.add(
					new TextField({
						name: "expected_amount_formatted",
						max: 60,
					}),
				);
			}
			if (!collection.fields.getByName("auto_verified")) {
				collection.fields.add(
					new BoolField({
						name: "auto_verified",
					}),
				);
			}
			if (!collection.fields.getByName("verification_notes")) {
				collection.fields.add(
					new TextField({
						name: "verification_notes",
						max: 500,
					}),
				);
			}
			app.save(collection);
		};

		addFields("invoice_payments");
		addFields("parent_invoice_payments");
	},
	(app) => {
		const removeFields = (collectionName) => {
			try {
				const collection = app.findCollectionByNameOrId(collectionName);
				["expected_amount", "expected_amount_formatted", "auto_verified", "verification_notes"].forEach(
					(name) => {
						if (collection.fields.getByName(name)) {
							collection.fields.removeByName(name);
						}
					},
				);
				app.save(collection);
			} catch (e) {
				if (!e.message.includes("no rows in result set")) throw e;
			}
		};
		// Hanya hapus verification_notes dari invoice_payments bila belum ada
		// sebelumnya (ditambahkan migrasi ini). parent_invoice_payments sudah
		// memilikinya sejak awal, jadi verification_notes-nya dipertahankan.
		try {
			const invoicePayments = app.findCollectionByNameOrId("invoice_payments");
			["expected_amount", "expected_amount_formatted", "auto_verified", "verification_notes"].forEach(
				(name) => {
					if (invoicePayments.fields.getByName(name)) {
						invoicePayments.fields.removeByName(name);
					}
				},
			);
			app.save(invoicePayments);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
		try {
			const parentPayments = app.findCollectionByNameOrId("parent_invoice_payments");
			["expected_amount", "expected_amount_formatted", "auto_verified"].forEach((name) => {
				if (parentPayments.fields.getByName(name)) {
					parentPayments.fields.removeByName(name);
				}
			});
			app.save(parentPayments);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
	},
);
