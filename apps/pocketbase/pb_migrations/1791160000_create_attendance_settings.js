/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		const users = app.findCollectionByNameOrId('users');

		// attendance_settings — unique per company, stores the geofence config
		// used by Live Attendance (work location + radius for check-in/out).
		let settings;
		try {
			settings = app.findCollectionByNameOrId('attendance_settings');
		} catch (_) {
			settings = new Collection({
				type: 'base',
				name: 'attendance_settings',
				listRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				viewRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				createRule: '@request.auth.id != \'\'',
				updateRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				deleteRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id)",
				fields: [
					{
						name: 'company',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: companies.id,
						cascadeDelete: true,
					},
					{ name: 'geofence_enabled', type: 'bool' },
					{ name: 'work_latitude', type: 'number', min: -90, max: 90 },
					{ name: 'work_longitude', type: 'number', min: -180, max: 180 },
					{ name: 'geofence_radius', type: 'number', min: 1 },
					{
						name: 'owner',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_attendance_settings_company ON attendance_settings (company)',
				],
			});
			app.save(settings);
		}
	},
	(app) => {
		try {
			const settings = app.findCollectionByNameOrId('attendance_settings');
			app.delete(settings);
		} catch (e) {
			if (String(e).includes('no rows in result set')) return;
			throw e;
		}
	},
);
