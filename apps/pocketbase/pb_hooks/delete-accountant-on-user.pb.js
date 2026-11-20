/// <reference path="../pb_data/types.d.ts" />

// Saat akun users dihapus, profil publik Catet Akuntan milik akun itu
// (dan posting serta permintaan CV yang menempel padanya) ikut dihapus.
// Hanya record dengan owner/seeker = akun yang dihapus. Data perusahaan
// dan profil pengguna lain tidak disentuh.

function purgeAccountantData(e) {
	// Helper harus berada di dalam callback: PocketBase JSVM menjalankan setiap
	// hook dalam scope terisolasi, sehingga binding level file tidak terlihat.
	function deleteMatching(collection, filter) {
		let records = [];
		try {
			records = e.app.findRecordsByFilter(collection, filter, "", 0, 0, { id: e.record.id });
		} catch (_) {
			return;
		}
		for (let i = 0; i < records.length; i++) {
			try {
				e.app.delete(records[i]);
			} catch (err) {
				const message = String(err);
				if (message.indexOf("no rows") !== -1 || message.indexOf("not found") !== -1) continue;
				throw err;
			}
		}
	}

	deleteMatching("accountant_posts", "owner = {:id}");
	deleteMatching("accountant_profiles", "owner = {:id}");
	deleteMatching("cv_requests", "seeker = {:id}");
	e.next();
}

// Request hook menutup penghapusan lewat API. Record hook menutup
// penghapusan lewat app.delete (migrasi / hook lain) yang tidak memicu request.
onRecordDeleteRequest(purgeAccountantData, "users");
onRecordDelete(purgeAccountantData, "users");
