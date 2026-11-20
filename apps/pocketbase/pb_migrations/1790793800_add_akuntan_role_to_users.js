/// <reference path="../pb_data/types.d.ts" />

// Peran pengguna aplikasi Catet Akuntan: "akuntan" (menawarkan jasa,
// mengelola profil) atau "pencari" (mencari/menjelajah direktori).
// Field tidak required agar pengguna lama tetap valid. Nilainya tidak
// memberi hak istimewa apa pun, tetapi tetap dikunci agar tidak bisa
// diubah sendiri oleh pengguna setelah pendaftaran.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");

		if (!users.fields.getByName("akuntan_role")) {
			users.fields.add(
				new SelectField({
					name: "akuntan_role",
					maxSelect: 1,
					values: ["akuntan", "pencari"],
				}),
			);
		}

		users.updateRule =
			"(id = @request.auth.id && @request.body.akuntan_role:changed = false)";
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		try {
			users.fields.removeByName("akuntan_role");
		} catch (_) {
			/* already gone */
		}
		users.updateRule = "id = @request.auth.id";
		app.save(users);
	},
);
