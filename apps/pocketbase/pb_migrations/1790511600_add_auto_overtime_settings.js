/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		// overtime_settings: add auto-overtime from attendance toggles + thresholds
		const settings = app.findCollectionByNameOrId('overtime_settings');

		if (!settings.fields.getByName('auto_overtime')) {
			settings.fields.add(new BoolField({ name: 'auto_overtime' }));
		}
		if (!settings.fields.getByName('overtime_before_minutes')) {
			settings.fields.add(new NumberField({ name: 'overtime_before_minutes', min: 0 }));
		}
		if (!settings.fields.getByName('overtime_after_minutes')) {
			settings.fields.add(new NumberField({ name: 'overtime_after_minutes', min: 0 }));
		}
		app.save(settings);

		// overtime_requests: mark attendance-generated requests so we can upsert
		const requests = app.findCollectionByNameOrId('overtime_requests');
		if (!requests.fields.getByName('auto_generated')) {
			requests.fields.add(new BoolField({ name: 'auto_generated' }));
		}
		app.save(requests);
	},
	(app) => {
		try {
			const settings = app.findCollectionByNameOrId('overtime_settings');
			settings.fields.removeByName('auto_overtime');
			settings.fields.removeByName('overtime_before_minutes');
			settings.fields.removeByName('overtime_after_minutes');
			app.save(settings);
		} catch (e) {
			if (!String(e).includes('no rows in result set')) throw e;
		}
		try {
			const requests = app.findCollectionByNameOrId('overtime_requests');
			requests.fields.removeByName('auto_generated');
			app.save(requests);
		} catch (e) {
			if (!String(e).includes('no rows in result set')) throw e;
		}
	},
);
