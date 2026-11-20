/// <reference path="../pb_data/types.d.ts" />

// Tanggal lahir dan lampiran CV hanya untuk pemilik profil.
// Pengunjung publik tetap melihat data profesional, tanpa berkas CV.
onRecordEnrich((e) => {
	const auth = e.requestInfo.auth;
	const owner = e.record.get("owner");
	const isOwner = !!auth && auth.id === owner;
	if (!isOwner) {
		e.record.hide("birth_date", "cv_file");
	}
	e.next();
}, "accountant_profiles");
