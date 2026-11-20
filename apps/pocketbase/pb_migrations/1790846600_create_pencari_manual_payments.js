// apps/pocketbase/pb_migrations/1790846600_create_pencari_manual_payments.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const collection = new Collection({
			type: "base",
			name: "pencari_manual_payments",
			// Pencari hanya melihat catatan pembayarannya sendiri. Verifikasi
			// dilakukan admin pusat melalui route server (superuser), bukan dari
			// klien, sehingga update/delete ditolak untuk klien.
			listRule: "@request.auth.id != '' && seeker = @request.auth.id",
			viewRule: "@request.auth.id != '' && seeker = @request.auth.id",
			createRule: "@request.auth.id != '' && seeker = @request.auth.id",
			updateRule: null,
			deleteRule: null,
			fields: [
				{
					name: "seeker",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "plan_title", type: "text", required: true, max: 120 },
				{ name: "variant_id", type: "text", max: 120 },
				{ name: "amount_formatted", type: "text", required: true, max: 40 },
				{
					name: "payment_method",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["transfer_bank"],
				},
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
				{ name: "payer_email", type: "email", max: 160 },
				{ name: "payment_date", type: "date" },
				{ name: "notes", type: "text", max: 500 },
				{
					name: "status",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["menunggu_verifikasi", "aktif", "ditolak", "kedaluwarsa"],
				},
				{ name: "period_start", type: "date" },
				{ name: "period_end", type: "date" },
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
				"CREATE INDEX idx_manual_payments_seeker ON pencari_manual_payments (seeker)",
				"CREATE INDEX idx_manual_payments_status ON pencari_manual_payments (status)",
			],
		});
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("pencari_manual_payments");
		app.delete(collection);
	},
);
