/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		const users = app.findCollectionByNameOrId('users');
		const employees = app.findCollectionByNameOrId('employees');

		const payrollComponents = new Collection({
			type: 'base',
			name: 'payroll_components',
			listRule: "@request.auth.id != '' && @request.auth.id = owner",
			viewRule: "@request.auth.id != '' && @request.auth.id = owner",
			createRule: "@request.auth.id != ''",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
			fields: [
				{
					name: 'company',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: companies.id,
					cascadeDelete: true,
				},
				{ name: 'transaction_id', type: 'text', required: true, max: 40 },
				{
					name: 'type',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['Adjustment', 'Allowance', 'Deduction', 'Overtime'],
				},
				{ name: 'effective_date', type: 'date', required: true },
				{ name: 'end_date', type: 'date' },
				{ name: 'created_by_name', type: 'text', max: 120 },
				{ name: 'description', type: 'text', max: 500 },
				{ name: 'component_name', type: 'text', required: true, max: 160 },
				{ name: 'amount', type: 'number', min: 0 },
				{ name: 'employee_count', type: 'number', min: 0 },
				{
					name: 'employees',
					type: 'relation',
					maxSelect: 200,
					collectionId: employees.id,
					cascadeDelete: false,
				},
				{
					name: 'status',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['Active', 'Inactive', 'Draft'],
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
				'CREATE INDEX idx_payroll_components_company ON payroll_components (company)',
				'CREATE UNIQUE INDEX idx_payroll_components_txn ON payroll_components (company, transaction_id)',
			],
		});
		app.save(payrollComponents);
	},
	(app) => {
		try {
			const col = app.findCollectionByNameOrId('payroll_components');
			app.delete(col);
		} catch (e) {
			/* ignore */
		}
	},
);
