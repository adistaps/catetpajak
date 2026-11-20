/// <reference path="../pb_data/types.d.ts" />

// Pembayaran manual invoice oleh Parent. Parent mengunggah bukti transfer bank;
// pembayaran dicatat dengan status menunggu verifikasi. Admin Pusat memverifikasi
// melalui route server (superuser); setelah diverifikasi, invoice, transaksi,
// dan jurnal diperbarui. Parent hanya melihat pembayarannya sendiri.
migrate(
	(app) => {
		const parents = app.findCollectionByNameOrId("parents");
		const students = app.findCollectionByNameOrId("students");
		const documents = app.findCollectionByNameOrId("documents");
		const companies = app.findCollectionByNameOrId("companies");
		const users = app.findCollectionByNameOrId("users");

		const collection = new Collection({
			type: "base",
			name: "parent_invoice_payments",
			// Parent hanya melihat catatan pembayarannya sendiri. Pembuatan,
			// pembaruan, dan penghapusan hanya melalui route server (superuser)
			// setelah memvalidasi kepemilikan invoice.
			listRule: "@request.auth.id != '' && parent = @request.auth.id",
			viewRule: "@request.auth.id != '' && parent = @request.auth.id",
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{
					name: "parent",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: parents.id,
					cascadeDelete: true,
				},
				{
					name: "student",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: students.id,
					cascadeDelete: false,
				},
				{
					name: "invoice",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: documents.id,
					cascadeDelete: false,
				},
				{
					name: "company",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: companies.id,
					cascadeDelete: true,
				},
				{ name: "amount", type: "number", required: true, min: 0 },
				{
					name: "payment_method",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["transfer_bank"],
				},
				{ name: "bank", type: "text", max: 120 },
				{
					name: "proof",
					type: "file",
					maxSelect: 1,
					maxSize: 5242880,
					mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
					protected: true,
					thumbs: ["400x400"],
				},
				{ name: "payer_name", type: "text", max: 120 },
				{ name: "payment_date", type: "date" },
				{ name: "notes", type: "text", max: 500 },
				{
					name: "status",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["menunggu_verifikasi", "aktif", "ditolak"],
				},
				{
					name: "verifier",
					type: "relation",
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: false,
				},
				{ name: "verified_at", type: "date" },
				{ name: "rejection_reason", type: "text", max: 500 },
				{ name: "verification_notes", type: "text", max: 500 },
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_parent_invoice_payments_parent ON parent_invoice_payments (parent)",
				"CREATE INDEX idx_parent_invoice_payments_invoice ON parent_invoice_payments (invoice)",
				"CREATE INDEX idx_parent_invoice_payments_status ON parent_invoice_payments (status)",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("parent_invoice_payments");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
	},
);
