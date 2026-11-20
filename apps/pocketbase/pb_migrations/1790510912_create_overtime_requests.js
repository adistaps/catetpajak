/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		const users = app.findCollectionByNameOrId('users');
		const employees = app.findCollectionByNameOrId('employees');

		const memberRule =
			"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

		const overtimeRequests = new Collection({
			type: 'base',
			name: 'overtime_requests',
			listRule: memberRule,
			viewRule: memberRule,
			createRule: "@request.auth.id != ''",
			updateRule: memberRule,
			deleteRule: memberRule,
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
				{ name: 'requested_date', type: 'date', required: true },
				{ name: 'overtime_date', type: 'date', required: true },
				{ name: 'duration_minutes', type: 'number', min: 0, required: true },
				{
					name: 'compensation',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['paid_overtime', 'time_off', 'unpaid'],
				},
				{
					name: 'status',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['awaiting_approval', 'approved', 'rejected', 'cancelled'],
				},
				{ name: 'hourly_rate', type: 'number', min: 0 },
				{ name: 'amount', type: 'number', min: 0 },
				{ name: 'reason', type: 'text', max: 500 },
				{
					name: 'attachment',
					type: 'file',
					maxSelect: 1,
					maxSize: 5242880,
					mimeTypes: [
						'image/jpeg',
						'image/png',
						'image/webp',
						'application/pdf',
					],
				},
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
				'CREATE INDEX idx_overtime_requests_company ON overtime_requests (company)',
				'CREATE INDEX idx_overtime_requests_employee ON overtime_requests (employee)',
				'CREATE INDEX idx_overtime_requests_status ON overtime_requests (status)',
				'CREATE INDEX idx_overtime_requests_date ON overtime_requests (overtime_date)',
			],
		});
		app.save(overtimeRequests);

		const overtimeSettings = new Collection({
			type: 'base',
			name: 'overtime_settings',
			listRule: memberRule,
			viewRule: memberRule,
			createRule: "@request.auth.id != ''",
			updateRule: memberRule,
			deleteRule: memberRule,
			fields: [
				{
					name: 'company',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: companies.id,
					cascadeDelete: true,
				},
				{ name: 'weekday_multiplier', type: 'number', min: 0 },
				{ name: 'weekend_multiplier', type: 'number', min: 0 },
				{ name: 'holiday_multiplier', type: 'number', min: 0 },
				{ name: 'require_attachment', type: 'bool' },
				{ name: 'auto_approve', type: 'bool' },
				{ name: 'min_minutes', type: 'number', min: 0 },
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
				'CREATE UNIQUE INDEX idx_overtime_settings_company ON overtime_settings (company)',
			],
		});
		app.save(overtimeSettings);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('overtime_requests'));
		} catch (e) {
			/* ignore */
		}
		try {
			app.delete(app.findCollectionByNameOrId('overtime_settings'));
		} catch (e) {
			/* ignore */
		}
	},
);
