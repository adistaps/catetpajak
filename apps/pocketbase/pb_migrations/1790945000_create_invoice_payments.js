/// <reference path="../pb_data/types.d.ts" />

// Pembayaran manual transfer bank oleh customer untuk invoice penjualan.
// Company user mencatat pembayaran (atas nama customer) beserta bukti transfer;
// pembayaran berstatus menunggu verifikasi lalu disetujui/ditolak oleh pengguna
// berwenang di company tersebut melalui rute server. Saat disetujui, invoice,
// transaksi, dan jurnal diperbarui (sama seperti alur pembayaran parent).
// Akses baca dibatasi per company; tulis hanya lewat rute server (superuser).
migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId("companies");
		const documents = app.findCollectionByNameOrId("documents");
		const contacts = app.findCollectionByNameOrId("contacts");
		const users = app.findCollectionByNameOrId("users");

		const collection = new Collection({
			type: "base",
			name: "invoice_payments",
			listRule:
				"@request.auth.id != '' && (company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
			viewRule:
				"@request.auth.id != '' && (company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
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
					name: "invoice",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: documents.id,
					cascadeDelete: false,
				},
				{
					name: "contact",
					type: "relation",
					maxSelect: 1,
					collectionId: contacts.id,
					cascadeDelete: false,
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
					name: "submitted_by",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: false,
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
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_invoice_payments_company ON invoice_payments (company)",
				"CREATE INDEX idx_invoice_payments_invoice ON invoice_payments (invoice)",
				"CREATE INDEX idx_invoice_payments_status ON invoice_payments (status)",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("invoice_payments");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
	},
);
