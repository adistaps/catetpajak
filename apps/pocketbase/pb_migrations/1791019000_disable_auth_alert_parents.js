/// <reference path="../pb_data/types.d.ts" />

// Nonaktifkan auth alert (email "login dari lokasi baru") untuk koleksi
// `parents`, menyamakan konfigurasi dengan `users` dan `_superusers` yang
// sudah lebih dulu dimatikan. Dengan SMTP platform yang masih nonaktif, pengiriman
// email auth alert melalui hook `onMailerSend` (builder-mailer relay) dapat gagal
// secara sinkron dan menyebabkan permintaan login parent gagal/tertahan. Mematikan
// auth alert mengembalikan login parent ke alur biasa tanpa mengurangi isolasi
// data atau pemeriksaan akses lain.
migrate(
	(app) => {
		const parents = app.findCollectionByNameOrId('parents');
		parents.authAlert = {
			enabled: false,
		};
		app.save(parents);
	},
	(app) => {
		const parents = app.findCollectionByNameOrId('parents');
		parents.authAlert = {
			enabled: true,
		};
		app.save(parents);
	},
);
