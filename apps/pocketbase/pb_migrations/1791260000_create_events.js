// apps/pocketbase/pb_migrations/1791260000_create_events.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId("events");
		} catch (_) {
			collection = new Collection({
				type: "base",
				name: "events",
				// Daftar event dibaca publik (halaman /event memuatnya tanpa login).
				// Penulisan hanya melalui rute server Admin Pusat (superuser).
				listRule: "",
				viewRule: "",
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: "slug", type: "text", required: true, max: 120 },
					{ name: "badge", type: "text", max: 60 },
					{ name: "kicker", type: "text", max: 160 },
					{ name: "headline", type: "text", max: 300 },
					{ name: "title", type: "text", required: true, max: 200 },
					{ name: "topics", type: "json" },
					{ name: "speakers", type: "json" },
					{ name: "date_label", type: "text", required: true, max: 60 },
					{ name: "time_label", type: "text", max: 60 },
					{ name: "venue", type: "text", max: 200 },
					{
						name: "mode",
						type: "select",
						required: true,
						maxSelect: 1,
						values: ["onsite", "online"],
					},
					{
						name: "pricing",
						type: "select",
						required: true,
						maxSelect: 1,
						values: ["free", "paid"],
					},
					{ name: "price_note", type: "text", max: 160 },
					// `required` tidak diaktifkan agar 0 (event gratis) diterima.
					{ name: "price", type: "number", min: 0 },
					{
						name: "accent",
						type: "select",
						maxSelect: 1,
						values: ["navy", "cream", "maroon"],
					},
					// `required` tidak diaktifkan agar `false` (draft) diterima.
					{ name: "published", type: "bool" },
					{ name: "sort", type: "number" },
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
					{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
				],
				indexes: [
					"CREATE UNIQUE INDEX idx_events_slug ON events (slug)",
					"CREATE INDEX idx_events_published ON events (published)",
				],
			});
			app.save(collection);
		}

		// Seed event statis yang sudah ada agar halaman tidak kosong.
		const existing = app.findRecordsByFilter("events", "id != ''", "created", 100, 0);
		if (existing.length === 0) {
			const seeds = [
				{
					slug: "masterclass-ujian-kompetensi-pajak",
					badge: "Onsite Class",
					kicker: "Masterclass Persiapan Ujian Kompetensi",
					headline:
						"Perpajakan: Serial Belajar Akuntansi Pajak Secara Komprehensif",
					title: "Serial Belajar Akuntansi Pajak Secara Komprehensif",
					topics: [
						"Beda tetap dan beda waktu",
						"Aspek pajak atas aktiva tetap",
						"Aspek pajak atas pendapatan dan ekuitas",
						"Jurnal hak dan kewajiban perpajakan",
					],
					speakers: [
						{ name: "Rina Kartika", role: "Pemateri · Tax Lecturer" },
						{ name: "Budi Santoso", role: "Moderator" },
					],
					date_label: "Sab, 17 Okt 2026",
					time_label: "13.00 – 17.00 WIB",
					venue: "Ibis Budget, Menteng, Jakarta Pusat",
					mode: "onsite",
					pricing: "paid",
					price_note: "Early bird s.d. 10 Oktober",
					price: 499000,
					accent: "navy",
					published: true,
					sort: 10,
				},
				{
					slug: "per-12-coretax-replace",
					badge: "Kopdar Online",
					kicker: "Belajar & Diskusi Bareng",
					headline:
						"PER-12/PJ/2026: Perubahan atas PER-11/PJ/2025 yang membahas Goodbye “Delta”, kini Coretax",
					title:
						"PER-12/PJ/2026: Perubahan atas PER-11/PJ/2025 yang membahas Goodbye Delta",
					topics: [
						"Go through & unboxing PER-12/PJ/2026",
						"Poin-poin yang penting dari skema Delta ke Replace",
						"Saja pengaruh aturan ini ke depan",
					],
					speakers: [{ name: "Daniel William Legawa", role: "Founder Catet Pajak" }],
					date_label: "Jum, 2 Okt 2026",
					time_label: "19.00 – Selesai",
					venue: "Online Zoom Meeting",
					mode: "online",
					pricing: "free",
					price_note: "Termasuk materi & rekaman",
					price: 0,
					accent: "cream",
					published: true,
					sort: 20,
				},
				{
					slug: "global-minimum-tax-indonesia",
					badge: "Podcast Pajak",
					kicker: "Ngobrolin & Diskusi Bareng",
					headline:
						"Membahas Global Minimum Tax dan Perlakuanannya di Indonesia",
					title: "Ngobrolin & Diskusi Bareng: Membahas Global Minimum Tax",
					topics: [
						"Sosialisasi PMK 136 dan Pilar 2",
						"Panduan registrasi WP GloBE",
						"Diskusi & tanya jawab",
					],
					speakers: [
						{ name: "Rahal Mafluh A.", role: "Co-founder" },
						{ name: "Daniel William L.", role: "Founder" },
					],
					date_label: "Kam, 24 Sep 2026",
					time_label: "19.00 – Selesai",
					venue: "Online Zoom Meeting",
					mode: "online",
					pricing: "free",
					price_note: "All you can pay",
					price: 0,
					accent: "maroon",
					published: true,
					sort: 30,
				},
			];

			for (const seed of seeds) {
				const record = new Record(collection);
				record.set("slug", seed.slug);
				record.set("badge", seed.badge);
				record.set("kicker", seed.kicker);
				record.set("headline", seed.headline);
				record.set("title", seed.title);
				record.set("topics", seed.topics);
				record.set("speakers", seed.speakers);
				record.set("date_label", seed.date_label);
				record.set("time_label", seed.time_label);
				record.set("venue", seed.venue);
				record.set("mode", seed.mode);
				record.set("pricing", seed.pricing);
				record.set("price_note", seed.price_note);
				record.set("price", seed.price);
				record.set("accent", seed.accent);
				record.set("published", seed.published);
				record.set("sort", seed.sort);
				app.save(record);
			}
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("events");
			app.delete(collection);
		} catch (e) {
			if (!e.message.includes("no rows in result set")) {
				throw e;
			}
		}
	},
);
