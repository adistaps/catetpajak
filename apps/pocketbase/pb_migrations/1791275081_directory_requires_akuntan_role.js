/// <reference path="../pb_data/types.d.ts" />

// Direktori publik hanya menampilkan profil yang pemiliknya masih ada
// dan perannya Akuntan. Akun terhapus atau peran kosong/pencari tidak tampil.
// Tidak menghapus profil milik akun yang masih ada.

migrate(
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		profiles.listRule =
			"owner != '' && @collection.users.id ?= owner && owner.akuntan_role = 'akuntan'";
		profiles.viewRule = profiles.listRule;
		app.save(profiles);

		try {
			const posts = app.findCollectionByNameOrId("accountant_posts");
			posts.listRule =
				"owner != '' && owner.akuntan_role = 'akuntan' && @collection.accountant_profiles.id ?= accountant";
			posts.viewRule = posts.listRule;
			app.save(posts);
		} catch (_) {
			// koleksi posting belum ada
		}
	},
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
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
			// koleksi posting tidak ada
		}
	},
);
