/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const companies = app.findCollectionByNameOrId("companies");
		const accounts = app.findCollectionByNameOrId("accounts");
		const users = app.findCollectionByNameOrId("users");

		// --- Karyawan ---------------------------------------------------------
		const employees = new Collection({
			type: "base",
			name: "employees",
			listRule: "@request.auth.id != '' && @request.auth.id = owner",
			viewRule: "@request.auth.id != '' && @request.auth.id = owner",
			createRule: "@request.auth.id != ''",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
			fields: [
				{
					name: "company",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: companies.id,
					cascadeDelete: true,
				},
				{ name: "name", type: "text", required: true, max: 120 },
				{ name: "position", type: "text", max: 120 },
				{ name: "npwp", type: "text", max: 40 },
				{ name: "bank_account", type: "text", max: 80 },
				{ name: "basic_salary", type: "number", min: 0 },
				{ name: "meal_allowance", type: "number", min: 0 },
				{ name: "transport_allowance", type: "number", min: 0 },
				{ name: "other_allowance", type: "number", min: 0 },
				{ name: "bpjs_tk", type: "number", min: 0 },
				{ name: "bpjs_kes", type: "number", min: 0 },
				{ name: "pph21", type: "number", min: 0 },
				{
					name: "status",
					type: "select",
					maxSelect: 1,
					values: ["aktif", "nonaktif"],
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: ["CREATE INDEX idx_employees_company ON employees (company)"],
		});
		app.save(employees);

		// --- Periode penggajian ----------------------------------------------
		const payrollRuns = new Collection({
			type: "base",
			name: "payroll_runs",
			listRule: "@request.auth.id != '' && @request.auth.id = owner",
			viewRule: "@request.auth.id != '' && @request.auth.id = owner",
			createRule: "@request.auth.id != ''",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
			fields: [
				{
					name: "company",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: companies.id,
					cascadeDelete: true,
				},
				{ name: "period", type: "text", required: true, max: 20 },
				{ name: "pay_date", type: "date", required: true },
				{ name: "description", type: "text", max: 300 },
				{ name: "total_gross", type: "number", min: 0 },
				{ name: "total_deductions", type: "number", min: 0 },
				{ name: "total_net", type: "number", min: 0 },
				{
					name: "status",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["draft", "posted"],
				},
				{
					name: "cash_account",
					type: "relation",
					maxSelect: 1,
					collectionId: accounts.id,
					cascadeDelete: false,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: ["CREATE INDEX idx_payroll_runs_company ON payroll_runs (company)"],
		});
		app.save(payrollRuns);

		// --- Slip gaji --------------------------------------------------------
		const payslips = new Collection({
			type: "base",
			name: "payslips",
			listRule: "@request.auth.id != '' && @request.auth.id = owner",
			viewRule: "@request.auth.id != '' && @request.auth.id = owner",
			createRule: "@request.auth.id != ''",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
			fields: [
				{
					name: "company",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: companies.id,
					cascadeDelete: true,
				},
				{
					name: "run",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: payrollRuns.id,
					cascadeDelete: true,
				},
				{
					name: "employee",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: employees.id,
					cascadeDelete: false,
				},
				{ name: "basic_salary", type: "number", min: 0 },
				{ name: "meal_allowance", type: "number", min: 0 },
				{ name: "transport_allowance", type: "number", min: 0 },
				{ name: "other_allowance", type: "number", min: 0 },
				{ name: "gross", type: "number", min: 0 },
				{ name: "bpjs_tk", type: "number", min: 0 },
				{ name: "bpjs_kes", type: "number", min: 0 },
				{ name: "pph21", type: "number", min: 0 },
				{ name: "total_deductions", type: "number", min: 0 },
				{ name: "net_pay", type: "number", min: 0 },
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_payslips_run ON payslips (run)",
				"CREATE INDEX idx_payslips_company ON payslips (company)",
			],
		});
		app.save(payslips);

		// Tautkan baris jurnal ke periode penggajian yang membuatnya (boleh kosong).
		// cascadeDelete: menghapus periode => menghapus baris jurnalnya.
		const entries = app.findCollectionByNameOrId("entries");
		entries.fields.add(
			new RelationField({
				name: "payroll_run",
				required: false,
				maxSelect: 1,
				collectionId: payrollRuns.id,
				cascadeDelete: true,
			}),
		);
		app.save(entries);

		// --- Seed akun payroll untuk perusahaan yang sudah ada ----------------
		const payrollAccounts = [
			{ code: "203", name: "Utang Gaji", type: "liabilitas" },
			{ code: "204", name: "Utang BPJS", type: "liabilitas" },
			{ code: "205", name: "Utang PPh 21", type: "liabilitas" },
		];
		const existingCompanies = app.findRecordsByFilter("companies", "id != ''", "", 0, 0);
		const accountsCollection = app.findCollectionByNameOrId("accounts");
		for (const company of existingCompanies) {
			for (const def of payrollAccounts) {
				const dupes = app.findRecordsByFilter(
					"accounts",
					"company = '" + company.id + "' && code = '" + def.code + "'",
					"",
					0,
					0,
				);
				if (dupes.length > 0) continue;
				const rec = new Record(accountsCollection);
				rec.set("company", company.id);
				rec.set("code", def.code);
				rec.set("name", def.name);
				rec.set("type", def.type);
				rec.set("owner", company.get("owner"));
				app.save(rec);
			}
		}
	},
	(app) => {
		try {
			const entries = app.findCollectionByNameOrId("entries");
			const field = entries.fields.getByName("payroll_run");
			if (field) {
				entries.fields.remove(field);
				app.save(entries);
			}
		} catch (e) {
			if (!e.message.includes("no rows in result set")) throw e;
		}
		for (const name of ["payslips", "payroll_runs", "employees"]) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (e) {
				if (e.message.includes("no rows in result set")) continue;
				throw e;
			}
		}
	},
);
