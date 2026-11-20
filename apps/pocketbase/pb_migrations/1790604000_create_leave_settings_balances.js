/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId('companies');
		const users = app.findCollectionByNameOrId('users');
		const employees = app.findCollectionByNameOrId('employees');

		const memberRule =
			"@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status = 'active'))";

		// ---- leave_settings: kebijakan cuti per perusahaan (unik) ----
		const leaveSettings = new Collection({
			type: 'base',
			name: 'leave_settings',
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
				{ name: 'annual_quota', type: 'number', min: 0 },
				{ name: 'sick_quota', type: 'number', min: 0 },
				{ name: 'personal_quota', type: 'number', min: 0 },
				{ name: 'maternity_quota', type: 'number', min: 0 },
				{ name: 'unpaid_quota', type: 'number', min: 0 },
				{ name: 'require_attachment', type: 'bool' },
				{ name: 'auto_approve', type: 'bool' },
				{ name: 'carry_forward', type: 'bool' },
				{ name: 'year_start_month', type: 'number', min: 1, max: 12 },
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
				'CREATE UNIQUE INDEX idx_leave_settings_company ON leave_settings (company)',
			],
		});
		app.save(leaveSettings);

		// ---- leave_balances: hak cuti per karyawan per tahun ----
		const leaveBalances = new Collection({
			type: 'base',
			name: 'leave_balances',
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
				{ name: 'year', type: 'text', required: true, max: 4, min: 4 },
				{ name: 'annual_entitlement', type: 'number', min: 0 },
				{ name: 'annual_carry_forward', type: 'number', min: 0 },
				{ name: 'sick_entitlement', type: 'number', min: 0 },
				{ name: 'personal_entitlement', type: 'number', min: 0 },
				{ name: 'maternity_entitlement', type: 'number', min: 0 },
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
				'CREATE INDEX idx_leave_balances_company ON leave_balances (company)',
				'CREATE INDEX idx_leave_balances_employee ON leave_balances (employee)',
				'CREATE UNIQUE INDEX idx_leave_balances_unique ON leave_balances (company, employee, year)',
			],
		});
		app.save(leaveBalances);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('leave_settings'));
		} catch (e) {
			/* ignore */
		}
		try {
			app.delete(app.findCollectionByNameOrId('leave_balances'));
		} catch (e) {
			/* ignore */
		}
	},
);
