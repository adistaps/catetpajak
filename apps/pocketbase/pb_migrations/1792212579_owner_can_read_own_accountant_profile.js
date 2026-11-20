// apps/pocketbase/pb_migrations/1792212579_owner_can_read_own_accountant_profile.js
/// <reference path="../pb_data/types.d.ts" />

// Akar masalah: aturan list/view `accountant_profiles` hanya membuka profil
// bila `owner.akuntan_role = 'akuntan'`. Akun yang perannya kosong (mis. dibuat
// sebelum field peran ada) TIDAK dapat membaca profilnya sendiri, sehingga
// dasbor menampilkan formulir "Tambah Profil Akuntan" yang kosong seolah profil
// hilang — padahal recordnya ada. Percobaan membuat ulang pun gagal karena
// indeks unik `owner`.
//
// Perbaikan: pemilik SELALU dapat membaca profilnya sendiri, sedangkan direktori
// publik tetap hanya menampilkan profil milik akun Akuntan yang masih ada.
// Aturan posting mengikuti: penulis selalu dapat membaca postingnya sendiri.

migrate(
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		const publicRule =
			"owner != '' && @collection.users.id ?= owner && owner.akuntan_role = 'akuntan'";
		const ownerRule = "@request.auth.id != '' && @request.auth.id = owner";
		profiles.listRule = `${publicRule} || (${ownerRule})`;
		profiles.viewRule = profiles.listRule;
		app.save(profiles);

		let posts;
		try {
			posts = app.findCollectionByNameOrId("accountant_posts");
		} catch (_) {
			posts = null;
		}
		if (posts) {
			posts.listRule =
				"(owner != '' && owner.akuntan_role = 'akuntan' && @collection.accountant_profiles.id ?= accountant) || (@request.auth.id != '' && @request.auth.id = owner)";
			posts.viewRule = posts.listRule;
			app.save(posts);
		}
	},
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		profiles.listRule =
			"owner != '' && @collection.users.id ?= owner && owner.akuntan_role = 'akuntan'";
		profiles.viewRule = profiles.listRule;
		app.save(profiles);

		let posts;
		try {
			posts = app.findCollectionByNameOrId("accountant_posts");
		} catch (_) {
			posts = null;
		}
		if (posts) {
			posts.listRule =
				"owner != '' && owner.akuntan_role = 'akuntan' && @collection.accountant_profiles.id ?= accountant";
			posts.viewRule = posts.listRule;
			app.save(posts);
		}
	},
);
