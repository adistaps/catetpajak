// apps/pocketbase/pb_migrations/1790812958_education_select_work_history_entries.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");

		// Simpan nilai pendidikan lama sebelum field teks diganti menjadi select.
		const profiles = app.findRecordsByFilter("accountant_profiles", 'id != ""');
		const previousEducation = new Map();
		for (const record of profiles) {
			previousEducation.set(record.id, String(record.get("education") || ""));
		}

		if (collection.fields.getByName("education")) {
			collection.fields.removeByName("education");
		}
		collection.fields.add(
			new SelectField({
				name: "education",
				maxSelect: 1,
				values: ["D3", "S1", "S2", "S3"],
			}),
		);

		if (!collection.fields.getByName("work_history_entries")) {
			collection.fields.add(
				new JSONField({ name: "work_history_entries", maxSize: 2000000 }),
			);
		}
		app.save(collection);

		// Petakan teks pendidikan lama ke tingkat terdekat; nilai tak cocok dibiarkan kosong.
		const mapEducation = (value) => {
			const text = String(value || "").toLowerCase();
			if (!text) return "";
			if (text.includes("d3") || text.includes("diploma")) return "D3";
			if (text.includes("s3") || text.includes("doktor") || text.includes("phd")) return "S3";
			if (text.includes("s2") || text.includes("magister") || text.includes("master")) return "S2";
			if (text.includes("s1") || text.includes("sarjana") || text.includes("bachelor")) return "S1";
			return "";
		};

		for (const record of profiles) {
			const mapped = mapEducation(previousEducation.get(record.id) || "");
			if (mapped) {
				record.set("education", mapped);
				app.save(record);
			}
		}
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");
		if (collection.fields.getByName("education")) {
			collection.fields.removeByName("education");
		}
		collection.fields.add(new TextField({ name: "education", max: 1500 }));
		if (collection.fields.getByName("work_history_entries")) {
			collection.fields.removeByName("work_history_entries");
		}
		app.save(collection);
	},
);
