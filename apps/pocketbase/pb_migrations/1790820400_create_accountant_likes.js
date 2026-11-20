// apps/pocketbase/pb_migrations/1790820400_create_accountant_likes.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		try {
			app.findCollectionByNameOrId("accountant_likes");
			return;
		} catch (_) {
			// belum ada
		}

		const users = app.findCollectionByNameOrId("users");
		const posts = app.findCollectionByNameOrId("accountant_posts");
		const comments = app.findCollectionByNameOrId("accountant_post_comments");
		const replies = app.findCollectionByNameOrId("accountant_post_comment_replies");
		const collection = new Collection({
			type: "base",
			name: "accountant_likes",
			// Like publik: siapa pun boleh membaca jumlah like.
			// Hanya pengguna login yang boleh menyukai atas nama dirinya,
			// dan hanya pemilik like yang boleh menghapus like-nya sendiri.
			listRule: "",
			viewRule: "",
			createRule:
				"@request.auth.id != '' && @request.auth.id = @request.body.owner && (post != '' || comment != '' || reply != '')",
			updateRule: null,
			deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
			fields: [
				{
					name: "post",
					type: "relation",
					maxSelect: 1,
					collectionId: posts.id,
					cascadeDelete: true,
				},
				{
					name: "comment",
					type: "relation",
					maxSelect: 1,
					collectionId: comments.id,
					cascadeDelete: true,
				},
				{
					name: "reply",
					type: "relation",
					maxSelect: 1,
					collectionId: replies.id,
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
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_likes_post ON accountant_likes (post)",
				"CREATE INDEX idx_likes_comment ON accountant_likes (comment)",
				"CREATE INDEX idx_likes_reply ON accountant_likes (reply)",
				// Satu pengguna hanya boleh satu like per item (indeks unik parsial
				// karena relasi yang tidak diisi disimpan sebagai string kosong).
				"CREATE UNIQUE INDEX idx_likes_owner_post ON accountant_likes (owner, post) WHERE post != ''",
				"CREATE UNIQUE INDEX idx_likes_owner_comment ON accountant_likes (owner, comment) WHERE comment != ''",
				"CREATE UNIQUE INDEX idx_likes_owner_reply ON accountant_likes (owner, reply) WHERE reply != ''",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("accountant_likes");
			app.delete(collection);
		} catch (e) {
			if (String(e).includes("no rows in result set")) return;
			throw e;
		}
	},
);
