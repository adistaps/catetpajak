// apps/pocketbase/pb_migrations/1792212580_restore_akuntan_role_from_profiles.js
/// <reference path="../pb_data/types.d.ts" />

// Perbaikan data: akun yang sudah memiliki profil akuntan jelas merupakan
// Akuntan. Bila perannya kosong (field peran baru ditambahkan setelah akun
// dibuat, atau pernah dicabut oleh alur lain), isi kembali menjadi "akuntan"
// agar akun diarahkan ke dasbor Akuntan dan profilnya kembali tampil.
//
// Hanya akun yang MEMILIKI profil dan perannya KOSONG yang disentuh. Akun
// dengan peran lain, akun tanpa profil, serta seluruh data perusahaan lain
// tidak diubah dan tidak dihapus.

migrate(
	(app) => {
		let profiles = [];
		try {
			profiles = app.findRecordsByFilter("accountant_profiles", "id != ''");
		} catch (_) {
			profiles = [];
		}

		for (let i = 0; i < profiles.length; i++) {
			const ownerId = profiles[i].get("owner");
			if (!ownerId) continue;

			let user;
			try {
				user = app.findRecordById("users", ownerId);
			} catch (_) {
				continue;
			}

			if ((user.getString("akuntan_role") || "").trim() !== "") continue;
			user.set("akuntan_role", "akuntan");
			app.save(user);
		}
	},
	(app) => {
		// Kembalikan hanya akun yang perannya "akuntan" dan memiliki profil,
		// tanpa menyentuh akun lain.
		let profiles = [];
		try {
			profiles = app.findRecordsByFilter("accountant_profiles", "id != ''");
		} catch (_) {
			profiles = [];
		}

		for (let i = 0; i < profiles.length; i++) {
			const ownerId = profiles[i].get("owner");
			if (!ownerId) continue;
			let user;
			try {
				user = app.findRecordById("users", ownerId);
			} catch (_) {
				continue;
			}
			if (user.getString("akuntan_role") !== "akuntan") continue;
			user.set("akuntan_role", "");
			app.save(user);
		}
	},
);
