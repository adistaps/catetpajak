/// <reference path="../pb_data/types.d.ts" />

/**
 * Make companies list/view rules more reliable for ESS members.
 * Previous @collection join could fail to match in some list queries;
 * keep the same intent with an equivalent, explicit form and ensure
 * invited karyawan stay active.
 */
migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		// Member can list/view a company when they have an active membership row
		// linking their user id to this company id.
		const memberAccess =
			"(@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= id && @collection.company_members.status ?= 'active')";
		companies.listRule =
			"@request.auth.id != '' && (owner = @request.auth.id || " + memberAccess + ')';
		companies.viewRule =
			"@request.auth.id != '' && (owner = @request.auth.id || " + memberAccess + ')';
		app.save(companies);

		// Ensure any lingering invited karyawan are active (ESS needs company list).
		const members = app.findRecordsByFilter(
			'company_members',
			'role = "karyawan" && status = "invited"',
			'',
			500,
			0,
		);
		for (const record of members) {
			record.set('status', 'active');
			app.save(record);
		}
	},
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		const memberAccess =
			"(@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= id && @collection.company_members.status = 'active')";
		companies.listRule =
			"@request.auth.id != '' && (owner = @request.auth.id || " + memberAccess + ')';
		companies.viewRule =
			"@request.auth.id != '' && (owner = @request.auth.id || " + memberAccess + ')';
		app.save(companies);
	},
);
