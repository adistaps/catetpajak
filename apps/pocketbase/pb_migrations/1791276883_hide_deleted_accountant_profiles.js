/// <reference path="../pb_data/types.d.ts" />

// Direktori publik hanya menampilkan profil yang pemiliknya masih ada
// dan perannya Akuntan. Profil yatim, serta kartu lama "Adi Nurpermana"
// (Jakarta) yang tetap tampil setelah akun dihapus, dihapus di sini.
// Profil Akuntan lain tidak disentuh.

const STALE_NAMES = ["adi nurpermana", "adi nupermana"];

function norm(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function isStaleAdi(record) {
	const name = norm(record.get("name"));
	const cv = norm(record.get("cv_name"));
	const city = norm(record.get("city"));
	const matched = STALE_NAMES.some(function (label) {
		return name === label || cv === label || name.indexOf(label) !== -1 || cv.indexOf(label) !== -1;
	});
	if (!matched) return false;
	// Jangan menyentuh profil senama di kota lain.
	return city === "" || city.indexOf("jakarta") !== -1;
}

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
		// sudah terhapus
	}
}

function deleteRelated(app, collection, filter, profileId) {
	let rows = [];
	try {
		rows = app.findRecordsByFilter(collection, filter, "", 0, 0, { id: profileId });
	} catch (_) {
		return;
	}
	for (let i = 0; i < rows.length; i++) deleteQuiet(app, rows[i]);
}

migrate(
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		const ownerField = profiles.fields.getByName("owner");
		ownerField.cascadeDelete = true;
		// Tamu tetap boleh membaca, tetapi hanya profil Akuntan yang akunnya ada.
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

		let rows = [];
		try {
			rows = app.findRecordsByFilter("accountant_profiles", "id != ''");
		} catch (_) {
			rows = [];
		}

		const removed = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const ownerId = row.get("owner");
			if (!ownerMissing(app, ownerId) && !isStaleAdi(row)) continue;
			removed.push(row.get("id"));
			deleteRelated(app, "accountant_posts", "accountant = {:id}", row.get("id"));
			deleteRelated(app, "cv_requests", "accountant = {:id}", row.get("id"));
			deleteQuiet(app, row);
		}

		// Posting yang pemiliknya sudah tidak ada, tanpa menghapus posting akun lain.
		let posts = [];
		try {
			posts = app.findRecordsByFilter("accountant_posts", "id != ''");
		} catch (_) {
			posts = [];
		}
		for (let i = 0; i < posts.length; i++) {
			const post = posts[i];
			if (removed.indexOf(post.get("accountant")) !== -1 || ownerMissing(app, post.get("owner"))) {
				deleteQuiet(app, post);
			}
		}
	},
	(app) => {
		const profiles = app.findCollectionByNameOrId("accountant_profiles");
		profiles.listRule = "owner != '' && @collection.users.id ?= owner";
		profiles.viewRule = profiles.listRule;
		app.save(profiles);
	},
);
