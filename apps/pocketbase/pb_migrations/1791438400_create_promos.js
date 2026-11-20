// apps/pocketbase/pb_migrations/1791438400_create_promos.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId("promos");
		} catch (_) {
			collection = new Collection({
				type: "base",
				name: "promos",
				// Daftar promo dibaca publik (dashboard memuatnya tanpa rute server).
				// Penulisan hanya melalui rute server Admin Pusat (superuser).
				listRule: "",
				viewRule: "",
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: "eyebrow", type: "text", max: 160 },
					{ name: "title", type: "text", required: true, max: 200 },
					{ name: "savings_prefix", type: "text", max: 60 },
					{ name: "savings_amount", type: "text", max: 60 },
					{ name: "description", type: "text", max: 400 },
					{ name: "promo_code", type: "text", max: 60 },
					{ name: "period_label", type: "text", max: 200 },
					{ name: "end_date", type: "date" },
					{ name: "banner_url", type: "url", max: 500 },
					{ name: "banner_alt", type: "text", max: 200 },
					{ name: "footer_note", type: "text", max: 600 },
					{ name: "details", type: "json" },
					{ name: "bonus_title", type: "text", max: 400 },
					{ name: "bonus_description", type: "text", max: 400 },
					// `required` tidak diaktifkan agar `false` (draft) diterima.
					{ name: "published", type: "bool" },
					// `required` tidak diaktifkan agar 0 diterima.
					{ name: "sort", type: "number" },
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
					{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
				],
				indexes: [
					"CREATE INDEX idx_promos_published ON promos (published)",
					"CREATE INDEX idx_promos_sort ON promos (sort)",
				],
			});
			app.save(collection);
		}

		// Seed promo BCA yang sudah ada agar dashboard tidak kosong.
		const existing = app.findRecordsByFilter("promos", "id != ''", "created", 100, 0);
		if (existing.length === 0) {
			const record = new Record(collection);
			record.set("eyebrow", "PAPER | ocean by BCA | VISA");
			record.set("title", "Bayar Supplier, Diskon 0,5%");
			record.set("savings_prefix", "Hemat hingga");
			record.set("savings_amount", "1,2 Juta!");
			record.set(
				"description",
				"Promo khusus pembayaran dengan BCA Visa Corporate Card melalui akses Paper di Ocean by BCA.",
			);
			record.set("promo_code", "BCAVICOR50");
			record.set("period_label", "Periode Promo: sampai 31 Desember 2026");
			record.set("end_date", "2026-12-31T23:59:59.000Z");
			record.set(
				"banner_url",
				"https://images.hostinger.com/ea537a69-2343-4521-b1d9-fecabf36d70d.png",
			);
			record.set(
				"banner_alt",
				"Ilustrasi pembayaran supplier dengan kartu korporat BCA Visa",
			);
			record.set(
				"footer_note",
				"Penawaran dari Paper di Ocean by BCA, bukan produk Catet Pajak. BCA berizin dan diawasi oleh Otoritas Jasa Keuangan & Bank Indonesia. BCA merupakan peserta penjaminan LPS bca.co.id.",
			);
			record.set("details", [
				"Diskon 0,5% untuk pembayaran supplier dengan BCA Visa Corporate Card.",
				"Penghematan yang ditampilkan hingga Rp1,2 juta.",
				"Gunakan kode BCAVICOR50. Berlaku sampai 31 Desember 2026.",
				"Informasi ini bersifat promosi pihak ketiga dan tidak mengubah data akuntansi Anda.",
			]);
			record.set(
				"bonus_title",
				"Dapatkan PAPER PLUS (biaya transaksi lebih murah 1,9% 1,5%) Dalam 3 bulan!",
			);
			record.set(
				"bonus_description",
				"Selesaikan misi dan nikmati benefitnya. Promo Paper by Ocean by BCA tetap berlaku sampai 31 Desember 2026.",
			);
			record.set("published", true);
			record.set("sort", 10);
			app.save(record);
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("promos");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) {
				throw e;
			}
		}
	},
);
