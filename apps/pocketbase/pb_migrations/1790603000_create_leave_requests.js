/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		const users = app.findCollectionByNameOrId('users');
		const employees = app.findCollectionByNameOrId('employees');

		const memberRule =
			"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

		const leaveRequests = new Collection({
			type: 'base',
			name: 'leave_requests',
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
				{ name: 'start_date', type: 'date', required: true },
				{ name: 'end_date', type: 'date', required: true },
				{ name: 'days', type: 'number', min: 0 },
				{
					name: 'leave_type',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['annual', 'sick', 'personal', 'maternity', 'unpaid', 'other'],
				},
				{
					name: 'status',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['awaiting_approval', 'approved', 'rejected', 'cancelled'],
				},
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
				'CREATE INDEX idx_leave_requests_company ON leave_requests (company)',
				'CREATE INDEX idx_leave_requests_employee ON leave_requests (employee)',
				'CREATE INDEX idx_leave_requests_status ON leave_requests (status)',
				'CREATE INDEX idx_leave_requests_start ON leave_requests (start_date)',
			],
		});
		app.save(leaveRequests);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('leave_requests'));
		} catch (e) {
			/* ignore */
		}
	},
);
