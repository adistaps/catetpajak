/// <reference path="../pb_data/types.d.ts" />

// Profil dan posting publik hanya tampil bila akun pemiliknya masih ada.
// Record yatim (pemilik sudah dihapus) dibersihkan, tanpa menyentuh profil lain.

function ownerMissing(app, ownerId) {
	if (!ownerId) return true;
	try {
		app.findRecordById("users", ownerId);
		return false;
	} catch (_) {
		return true;
	}
}

migrate(
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		profiles.listRule = "@collection.users.id ?= owner";
		profiles.viewRule = "@collection.users.id ?= owner";
		app.save(profiles);

		try {
			const posts = app.findCollectionByNameOrId("accountant_posts");
			posts.listRule =
				"@collection.users.id ?= owner && @collection.accountant_profiles.id ?= accountant";
			posts.viewRule = posts.listRule;
			app.save(posts);
		} catch (_) {
			// koleksi posting belum ada
		}

		let orphanProfiles = [];
		try {
			orphanProfiles = app.findRecordsByFilter("accountant_profiles", "id != ''");
		} catch (_) {
			orphanProfiles = [];
		}
		for (let i = 0; i < orphanProfiles.length; i++) {
			if (!ownerMissing(app, orphanProfiles[i].get("owner"))) continue;
			try {
				app.delete(orphanProfiles[i]);
			} catch (_) {
				// lanjut ke profil berikutnya
			}
		}

		let posts = [];
		try {
			posts = app.findRecordsByFilter("accountant_posts", "id != ''");
		} catch (_) {
			posts = [];
		}
		for (let i = 0; i < posts.length; i++) {
			const post = posts[i];
			const ownerGone = ownerMissing(app, post.get("owner"));
			let profileGone = !post.get("accountant");
			if (!profileGone) {
				try {
					app.findRecordById("accountant_profiles", post.get("accountant"));
				} catch (_) {
					profileGone = true;
				}
			}
			if (!ownerGone && !profileGone) continue;
			try {
				app.delete(post);
			} catch (_) {
				// sudah terhapus lewat cascade profil
			}
		}
	},
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		profiles.listRule = "";
		profiles.viewRule = "";
		app.save(profiles);
		try {
			const posts = app.findCollectionByNameOrId("accountant_posts");
			posts.listRule = "";
			posts.viewRule = "";
			app.save(posts);
		} catch (_) {
			// koleksi posting tidak ada
		}
	},
);
