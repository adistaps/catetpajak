/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId('attendance_records');
		} catch (_) {
			const users = app.findCollectionByNameOrId('users');
			const companies = app.findCollectionByNameOrId('companies');
			const employees = app.findCollectionByNameOrId('employees');
			collection = new Collection({
				type: 'base',
				name: 'attendance_records',
				listRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				viewRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				createRule: "@request.auth.id != ''",
				updateRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				deleteRule:
					"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))",
				fields: [
					{
						name: 'company',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: companies.id,
						cascadeDelete: true,
					},
					{
						name: 'employee',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: employees.id,
						cascadeDelete: true,
					},
					{ name: 'date', type: 'date', required: true },
					{ name: 'shift', type: 'text', max: 40 },
					{ name: 'schedule_in', type: 'text', max: 10 },
					{ name: 'schedule_out', type: 'text', max: 10 },
					{ name: 'clock_in', type: 'text', max: 10 },
					{ name: 'clock_out', type: 'text', max: 10 },
					{
						name: 'attendance_code',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: [
							'on_time',
							'late_clock_in',
							'early_clock_out',
							'no_clock_out',
							'no_clock_in',
							'invalid',
							'absent',
							'day_off',
							'time_off',
						],
					},
					{ name: 'notes', type: 'text', max: 300 },
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
					'CREATE INDEX idx_attendance_company ON attendance_records (company)',
					'CREATE INDEX idx_attendance_employee ON attendance_records (employee)',
					'CREATE INDEX idx_attendance_date ON attendance_records (date)',
					'CREATE UNIQUE INDEX idx_attendance_emp_date ON attendance_records (company, employee, date)',
				],
			});
			app.save(collection);
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId('attendance_records');
			app.delete(collection);
		} catch (e) {
			if (String(e).includes('no rows in result set')) return;
			throw e;
		}
	},
);
