// apps/pocketbase/pb_migrations/1790812238_add_accountant_profile_bio.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");

		const addText = (name, max) => {
			if (collection.fields.getByName(name)) return;
			collection.fields.add(new TextField({ name, max }));
		};

		addText("birth_place", 80);
		addText("residence", 160);
		addText("domicile", 80);
		addText("certifications", 800);
		addText("education", 1500);
		addText("work_history", 2000);

		if (!collection.fields.getByName("birth_date")) {
			collection.fields.add(new DateField({ name: "birth_date" }));
		}

		const existingFile = collection.fields.getByName("cv_file");
		if (existingFile && existingFile.type !== "file") {
			collection.fields.removeByName("cv_file");
		}
		if (!collection.fields.getByName("cv_file")) {
			collection.fields.add(
				new FileField({
					name: "cv_file",
					maxSelect: 1,
					maxSize: 8388608,
					mimeTypes: [
						"application/pdf",
						"application/msword",
						"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
						"image/jpeg",
						"image/png",
						"image/webp",
					],
					protected: true,
				}),
			);
		}

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");
		for (const name of [
			"birth_place",
			"birth_date",
			"residence",
			"domicile",
			"certifications",
			"education",
			"work_history",
			"cv_file",
		]) {
			if (collection.fields.getByName(name)) collection.fields.removeByName(name);
		}
		app.save(collection);
	},
);
