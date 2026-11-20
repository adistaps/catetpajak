// apps/pocketbase/pb_migrations/1790815200_create_accountant_post_comments.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		try {
			app.findCollectionByNameOrId("accountant_post_comments");
			return;
		} catch (_) {
			// belum ada
		}

		const users = app.findCollectionByNameOrId("users");
		const posts = app.findCollectionByNameOrId("accountant_posts");
		const collection = new Collection({
			type: "base",
			name: "accountant_post_comments",
			// Komentar publik: siapa pun boleh membaca.
			// Hanya pengguna yang login yang boleh menulis atas nama dirinya.
			// Penghapusan: penulis komentar atau pemilik posting.
			listRule: "",
			viewRule: "",
			createRule:
				"@request.auth.id != '' && @request.auth.id = @request.body.owner && post != ''",
			updateRule: null,
			deleteRule:
				"@request.auth.id != '' && (owner = @request.auth.id || post.owner = @request.auth.id)",
			fields: [
				{
					name: "post",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: posts.id,
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
				{ name: "body", type: "text", required: true, max: 1000 },
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_post_comments_post ON accountant_post_comments (post)",
				"CREATE INDEX idx_post_comments_created ON accountant_post_comments (created)",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("accountant_post_comments");
			app.delete(collection);
		} catch (e) {
			if (String(e).includes("no rows in result set")) return;
			throw e;
		}
	},
);
