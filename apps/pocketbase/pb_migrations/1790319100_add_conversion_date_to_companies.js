/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		if (!companies.fields.getByName('conversion_date')) {
			companies.fields.add(
				new DateField({
					name: 'conversion_date',
					required: false,
				}),
			);
		}
		app.save(companies);

		// Allow negative opening balances (contra / reverse side)
		const accounts = app.findCollectionByNameOrId('accounts');
		const opening = accounts.fields.getByName('opening_balance');
		if (opening) {
			opening.min = undefined;
			app.save(accounts);
		}
	},
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		companies.fields.removeByName('conversion_date');
		app.save(companies);

		const accounts = app.findCollectionByNameOrId('accounts');
		const opening = accounts.fields.getByName('opening_balance');
		if (opening) {
			opening.min = 0;
			app.save(accounts);
		}
	},
);
