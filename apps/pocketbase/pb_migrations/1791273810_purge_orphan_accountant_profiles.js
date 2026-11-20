/// <reference path="../pb_data/types.d.ts" />

// Data lama: profil publik yang akun pemiliknya sudah dihapus ikut dihapus.
// Profil yang pemiliknya masih ada tidak disentuh.

function ownerMissing(app, ownerId) {
	if (!ownerId) return true;
	try {
		app.findRecordById("users", ownerId);
		return false;
	} catch (_) {
		return true;
	}
}

function deleteQuiet(app, record) {
	try {
		app.delete(record);
	} catch (_) {
		// sudah terhapus lewat cascade
	}
}

migrate(
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		const ownerField = profiles.fields.getByName("owner");
		ownerField.cascadeDelete = true;
		profiles.listRule = "owner != '' && @collection.users.id ?= owner";
		profiles.viewRule = profiles.listRule;
		app.save(profiles);

		try {
			const posts = app.findCollectionByNameOrId("accountant_posts");
			posts.listRule =
				"owner != '' && @collection.users.id ?= owner && @collection.accountant_profiles.id ?= accountant";
			posts.viewRule = posts.listRule;
			app.save(posts);
		} catch (_) {
			// koleksi posting belum ada
		}

		let rows = [];
		try {
			rows = app.findRecordsByFilter("accountant_profiles", "id != ''");
		} catch (_) {
			rows = [];
		}
		for (let i = 0; i < rows.length; i++) {
			if (!ownerMissing(app, rows[i].get("owner"))) continue;
			deleteQuiet(app, rows[i]);
		}

		let posts = [];
		try {
			posts = app.findRecordsByFilter("accountant_posts", "id != ''");
		} catch (_) {
			posts = [];
		}
		for (let i = 0; i < posts.length; i++) {
			const post = posts[i];
			if (!ownerMissing(app, post.get("owner"))) {
				const accountantId = post.get("accountant");
				if (!accountantId) {
					deleteQuiet(app, post);
					continue;
				}
				try {
					app.findRecordById("accountant_profiles", accountantId);
					continue;
				} catch (_) {
					deleteQuiet(app, post);
					continue;
				}
			}
			deleteQuiet(app, post);
		}
	},
	(app) => {
		// Pembersihan data yatim tidak bisa dikembalikan. Aturan daftar
		// dikembalikan ke versi sebelumnya yang sudah menyaring pemilik.
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		profiles.listRule = "@collection.users.id ?= owner";
		profiles.viewRule = profiles.listRule;
		app.save(profiles);
	},
);
