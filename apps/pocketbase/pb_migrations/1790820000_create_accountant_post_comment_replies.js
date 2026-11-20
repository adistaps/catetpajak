// apps/pocketbase/pb_migrations/1790820000_create_accountant_post_comment_replies.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		try {
			app.findCollectionByNameOrId("accountant_post_comment_replies");
			return;
		} catch (_) {
			// belum ada
		}

		const users = app.findCollectionByNameOrId("users");
		const comments = app.findCollectionByNameOrId("accountant_post_comments");
		const collection = new Collection({
			type: "base",
			name: "accountant_post_comment_replies",
			// Balasan publik: siapa pun boleh membaca.
			// Hanya pengguna login yang boleh membalas atas nama dirinya.
			// Penghapusan: penulis balasan, penulis komentar, atau pemilik posting.
			listRule: "",
			viewRule: "",
			createRule:
				"@request.auth.id != '' && @request.auth.id = @request.body.owner && comment != ''",
			updateRule: null,
			deleteRule:
				"@request.auth.id != '' && (owner = @request.auth.id || comment.owner = @request.auth.id || comment.post.owner = @request.auth.id)",
			fields: [
				{
					name: "comment",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: comments.id,
					cascadeDelete: true,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "author_name", type: "text", required: true, max: 120 },
				{ name: "body", type: "text", max: 1000 },
				{
					name: "images",
					type: "file",
					maxSelect: 6,
					maxSize: 5242880,
					mimeTypes: ["image/jpeg", "image/png", "image/webp"],
					thumbs: ["400x400", "1200x900"],
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_comment_replies_comment ON accountant_post_comment_replies (comment)",
				"CREATE INDEX idx_comment_replies_created ON accountant_post_comment_replies (created)",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("accountant_post_comment_replies");
			app.delete(collection);
		} catch (e) {
			if (String(e).includes("no rows in result set")) return;
			throw e;
		}
	},
);
