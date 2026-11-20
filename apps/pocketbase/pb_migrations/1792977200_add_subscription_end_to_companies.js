/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds `subscription_end` to `companies`: a date set by Admin Pusat that marks
 * the end of the subscription period granted to a company. The existing
 * subscription access check treats a future `subscription_end` as active
 * access, so a company (and its users) keep using the app until that date and
 * lose access after it.
 */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('companies');

		let existing = null;
		try {
			existing = collection.fields.getByName('subscription_end');
		} catch (_) {
			existing = null;
		}
		if (existing) return;

		collection.fields.add(
			new DateField({
				name: 'subscription_end',
				required: false,
			}),
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('companies');
		collection.fields.removeByName('subscription_end');
		app.save(collection);
	},
);
