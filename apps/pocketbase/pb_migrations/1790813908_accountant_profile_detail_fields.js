// apps/pocketbase/pb_migrations/1790813908_accountant_profile_detail_fields.js
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");

		if (!collection.fields.getByName("headline")) {
			collection.fields.add(new TextField({ name: "headline", max: 240 }));
		}
		if (!collection.fields.getByName("service_mode")) {
			collection.fields.add(
				new SelectField({
					name: "service_mode",
					maxSelect: 1,
					values: ["online", "tatap_muka", "hybrid"],
				}),
			);
		}
		if (!collection.fields.getByName("meeting_location")) {
			collection.fields.add(new TextField({ name: "meeting_location", max: 200 }));
		}
		if (!collection.fields.getByName("strengths")) {
			collection.fields.add(new JSONField({ name: "strengths", maxSize: 20000 }));
		}
		if (!collection.fields.getByName("highlight")) {
			collection.fields.add(new TextField({ name: "highlight", max: 600 }));
		}

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("accountant_profiles");
		for (const name of ["headline", "service_mode", "meeting_location", "strengths", "highlight"]) {
			if (collection.fields.getByName(name)) collection.fields.removeByName(name);
		}
		app.save(collection);
	},
);
